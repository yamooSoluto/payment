import { NextRequest, NextResponse } from 'next/server';
import { getAdminFromRequest, hasPermission } from '@/lib/admin-auth';
import { initializeFirebaseAdmin } from '@/lib/firebase-admin';

// GET: 회원 목록 조회
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

    // 회원(tenants) 조회
    let query = db.collection('tenants').orderBy('createdAt', 'desc');

    // 상태 필터
    if (status === 'active') {
      query = db.collection('tenants')
        .where('subscriptionStatus', '==', 'active')
        .orderBy('createdAt', 'desc');
    } else if (status === 'canceled') {
      query = db.collection('tenants')
        .where('subscriptionStatus', '==', 'canceled')
        .orderBy('createdAt', 'desc');
    } else if (status === 'trial') {
      query = db.collection('tenants')
        .where('subscriptionStatus', '==', 'trial')
        .orderBy('createdAt', 'desc');
    }

    const snapshot = await query.get();

    interface MemberData {
      id: string;
      businessName?: string;
      ownerName?: string;
      email?: string;
      phone?: string;
      planId?: string;
      subscriptionStatus?: string;
      createdAt: string | null;
      updatedAt: string | null;
      subscriptionStartDate: string | null;
      subscriptionEndDate: string | null;
      trialEndDate: string | null;
      [key: string]: unknown;
    }

    let members: MemberData[] = snapshot.docs.map(doc => {
      const data = doc.data();
      const subscription = data.subscription || {};

      return {
        id: doc.id,
        ...data,
        // brandName을 businessName으로도 매핑
        businessName: data.businessName || data.brandName || '',
        ownerName: data.ownerName || data.name || '',
        email: data.email || '',
        phone: data.phone || '',
        // subscription 객체 내의 plan과 status도 확인
        planId: data.planId || subscription.plan || '',
        subscriptionStatus: data.subscriptionStatus || subscription.status || '',
        createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() || null,
        subscriptionStartDate: data.subscriptionStartDate?.toDate?.()?.toISOString()
          || subscription.startedAt?.toDate?.()?.toISOString() || null,
        subscriptionEndDate: data.subscriptionEndDate?.toDate?.()?.toISOString()
          || subscription.renewsAt?.toDate?.()?.toISOString() || null,
        trialEndDate: data.trialEndDate?.toDate?.()?.toISOString() || null,
      };
    });

    // 검색 필터 (클라이언트 사이드 - Firestore 제한으로 인해)
    if (search) {
      const searchLower = search.toLowerCase();
      members = members.filter(m => {
        const businessName = (m.businessName || '').toLowerCase();
        const ownerName = (m.ownerName || '').toLowerCase();
        const email = (m.email || '').toLowerCase();
        const phone = m.phone || '';

        return businessName.includes(searchLower) ||
          ownerName.includes(searchLower) ||
          email.includes(searchLower) ||
          phone.includes(search);
      });
    }

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
    const { email, businessName, ownerName, phone, planId, subscriptionStatus } = body;

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
      businessName: businessName || '',
      brandName: businessName || '',
      ownerName: ownerName || '',
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
