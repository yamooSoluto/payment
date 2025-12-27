import { NextRequest, NextResponse } from 'next/server';
import { getAdminFromRequest, hasPermission } from '@/lib/admin-auth';
import { initializeFirebaseAdmin } from '@/lib/firebase-admin';

// GET: 회원 목록 조회 (이메일 기준으로 그룹화)
export async function GET(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);

    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(admin, 'members:read')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const db = initializeFirebaseAdmin();
    if (!db) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || ''; // active, canceled, trial

    // 모든 tenants 조회
    const snapshot = await db.collection('tenants').orderBy('createdAt', 'desc').get();

    // 구독 정보 조회
    const tenantIds = snapshot.docs.map(doc => doc.data().tenantId || doc.id);
    const subscriptionRefs = tenantIds.map(id => db.collection('subscriptions').doc(id));
    const subscriptionDocs = subscriptionRefs.length > 0 ? await db.getAll(...subscriptionRefs) : [];

    const subscriptionMap = new Map<string, { plan: string; status: string }>();
    subscriptionDocs.forEach((doc) => {
      if (doc.exists) {
        const data = doc.data();
        subscriptionMap.set(doc.id, {
          plan: data?.plan || '',
          status: data?.status || '',
        });
      }
    });

    // 이메일별로 그룹화
    interface TenantInfo {
      tenantId: string;
      brandName: string;
      plan: string;
      status: string;
    }

    interface MemberData {
      id: string;  // email을 ID로 사용 (URL 인코딩됨)
      email: string;
      name: string;
      phone: string;
      tenants: TenantInfo[];
      tenantCount: number;
      createdAt: string | null;
    }

    const memberMap = new Map<string, MemberData>();

    snapshot.docs.forEach(doc => {
      const data = doc.data();
      const email = data.email || '';
      if (!email) return;

      const tenantId = data.tenantId || doc.id;
      const subscription = subscriptionMap.get(tenantId);

      const tenantInfo: TenantInfo = {
        tenantId,
        brandName: data.brandName || data.businessName || '이름 없음',
        plan: subscription?.plan || data.planId || '',
        status: subscription?.status || data.subscriptionStatus || '',
      };

      if (memberMap.has(email)) {
        const member = memberMap.get(email)!;
        member.tenants.push(tenantInfo);
        member.tenantCount = member.tenants.length;
      } else {
        memberMap.set(email, {
          id: encodeURIComponent(email),  // URL-safe ID
          email,
          name: data.name || data.ownerName || '',
          phone: data.phone || '',
          tenants: [tenantInfo],
          tenantCount: 1,
          createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
        });
      }
    });

    let members = Array.from(memberMap.values());

    // 상태 필터
    if (status) {
      members = members.filter(m =>
        m.tenants.some(t => t.status === status)
      );
    }

    // 검색 필터
    if (search) {
      const searchLower = search.toLowerCase();
      members = members.filter(m => {
        const name = (m.name || '').toLowerCase();
        const email = (m.email || '').toLowerCase();
        const phone = m.phone || '';
        const brandNames = m.tenants.map(t => t.brandName.toLowerCase()).join(' ');

        return name.includes(searchLower) ||
          email.includes(searchLower) ||
          phone.includes(search) ||
          brandNames.includes(searchLower);
      });
    }

    // 생성일 기준 정렬 (최신순)
    members.sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime;
    });

    // 페이지네이션
    const total = members.length;
    const totalPages = Math.ceil(total / limit);
    const startIndex = (page - 1) * limit;
    const paginatedMembers = members.slice(startIndex, startIndex + limit);

    return NextResponse.json({
      members: paginatedMembers,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    });
  } catch (error) {
    console.error('Get members error:', error);
    return NextResponse.json(
      { error: '회원 목록을 불러오는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// POST: 회원 수동 등록
export async function POST(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);

    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(admin, 'members:write')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const db = initializeFirebaseAdmin();
    if (!db) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
    }

    const body = await request.json();
    const { email, brandName, name, phone, planId, subscriptionStatus } = body;

    if (!email) {
      return NextResponse.json(
        { error: '이메일은 필수입니다.' },
        { status: 400 }
      );
    }

    // 이메일 중복 확인
    const existingSnapshot = await db.collection('tenants')
      .where('email', '==', email)
      .get();

    if (!existingSnapshot.empty) {
      return NextResponse.json(
        { error: '이미 등록된 이메일입니다.' },
        { status: 400 }
      );
    }

    const now = new Date();
    const tenantId = `tenant_${Date.now()}`;

    // 회원 생성
    const docRef = await db.collection('tenants').add({
      tenantId,
      email,
      brandName: brandName || '',
      name: name || '',
      phone: phone || '',
      planId: planId || '',
      subscriptionStatus: subscriptionStatus || 'trial',
      createdAt: now,
      updatedAt: now,
      createdBy: admin.adminId,
      isManualRegistration: true,
    });

    // 구독 정보도 함께 생성 (필요한 경우)
    if (planId && subscriptionStatus === 'active') {
      const trialEndDate = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000); // 14일 후
      await db.collection('subscriptions').doc(tenantId).set({
        email,
        plan: planId,
        status: subscriptionStatus,
        currentPeriodStart: now,
        currentPeriodEnd: trialEndDate,
        createdAt: now,
        updatedAt: now,
      });
    }

    return NextResponse.json({
      success: true,
      id: docRef.id,
      tenantId,
    });
  } catch (error) {
    console.error('Create member error:', error);
    return NextResponse.json(
      { error: '회원을 등록하는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
