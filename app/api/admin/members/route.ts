import { NextRequest, NextResponse } from 'next/server';
import { getAdminFromRequest, hasPermission } from '@/lib/admin-auth';
import { initializeFirebaseAdmin, getAdminAuth } from '@/lib/firebase-admin';
import { generateUniqueUserId } from '@/lib/user-utils';
import { addAdminLog } from '@/lib/admin-log';

// GET: 회원 목록 조회 (users 컬렉션 기반)
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
    const status = searchParams.get('status') || 'active'; // 'active' | 'deleted'

    interface TenantInfo {
      tenantId: string;
      brandName: string;
      plan: string;
      status: string;
    }

    interface MemberData {
      id: string;
      email: string;
      name: string;
      phone: string;
      group: string;
      tenants: TenantInfo[];
      tenantCount: number;
      createdAt: string | null;
      totalPaymentAmount: number;
    }

    // 1~4. 모든 컬렉션 병렬 조회
    const [usersSnapshot, tenantsSnapshot, subscriptionsSnapshot, paymentsSnapshot] = await Promise.all([
      db.collection('users').get(),
      db.collection('tenants').get(),
      db.collection('subscriptions').get(),
      db.collection('payments').get(),
    ]);

    // 구독 정보 맵
    const subscriptionMap = new Map<string, { plan: string; status: string }>();
    subscriptionsSnapshot.docs.forEach((doc) => {
      const data = doc.data();
      subscriptionMap.set(doc.id, {
        plan: data?.plan || '',
        status: data?.status || '',
      });
    });

    // 결제 금액 맵
    const paymentsByEmail = new Map<string, number>();
    paymentsSnapshot.docs.forEach(doc => {
      const data = doc.data();
      const email = data.email || '';
      if (!email) return;

      if (data.status === 'completed' || data.status === 'done' || data.status === 'refunded') {
        const amount = data.amount || 0;
        paymentsByEmail.set(email, (paymentsByEmail.get(email) || 0) + amount);
      }
    });

    // tenants를 이메일로 그룹화
    const tenantsByEmail = new Map<string, TenantInfo[]>();
    tenantsSnapshot.docs.forEach(doc => {
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

      if (tenantsByEmail.has(email)) {
        tenantsByEmail.get(email)!.push(tenantInfo);
      } else {
        tenantsByEmail.set(email, [tenantInfo]);
      }
    });

    // 6. users 컬렉션 기반으로 회원 목록 생성 (status에 따라 필터링)
    let members: MemberData[] = usersSnapshot.docs
      .filter(doc => {
        const data = doc.data();
        if (status === 'deleted') return data.deleted === true;
        return !data.deleted;
      })
      .map(doc => {
        const data = doc.data();
        const email = doc.id; // users 컬렉션은 email을 doc ID로 사용
        const tenants = tenantsByEmail.get(email) || [];

        return {
          id: encodeURIComponent(email),
          email,
          name: data.name || '',
          phone: data.phone || '',
          group: data.group || 'normal',
          tenants,
          tenantCount: tenants.length,
          createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
          totalPaymentAmount: paymentsByEmail.get(email) || 0,
          ...(status === 'deleted' && {
            deletedAt: data.deletedAt?.toDate?.()?.toISOString() || null,
            retentionEndDate: data.retentionEndDate?.toDate?.()?.toISOString() || null,
            retentionReason: data.retentionReason || '',
          }),
        };
      });

    // 검색 필터 (회원 정보만: 이름, 이메일, 연락처)
    if (search) {
      const searchLower = search.toLowerCase();
      members = members.filter(m => {
        const name = (m.name || '').toLowerCase();
        const email = (m.email || '').toLowerCase();
        const phone = (m.phone || '').toLowerCase();

        return name.includes(searchLower) ||
          email.includes(searchLower) ||
          phone.includes(searchLower);
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
    const auth = getAdminAuth();

    if (!db || !auth) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
    }

    const body = await request.json();
    const { email, password, name, phone, group } = body;

    if (!email) {
      return NextResponse.json(
        { error: '이메일은 필수입니다.' },
        { status: 400 }
      );
    }

    if (!password) {
      return NextResponse.json(
        { error: '비밀번호는 필수입니다.' },
        { status: 400 }
      );
    }

    // Firebase Auth 이메일 중복 확인
    try {
      await auth.getUserByEmail(email);
      // 사용자가 존재하면 중복
      return NextResponse.json(
        { error: '이미 등록된 이메일입니다.' },
        { status: 400 }
      );
    } catch (error: unknown) {
      // auth/user-not-found 에러면 정상 (신규 사용자)
      if (!(error && typeof error === 'object' && 'code' in error && error.code === 'auth/user-not-found')) {
        throw error;
      }
    }

    // 연락처 중복 확인 (입력된 경우만)
    if (phone) {
      const existingPhone = await db.collection('users')
        .where('phone', '==', phone)
        .limit(1)
        .get();

      if (!existingPhone.empty) {
        return NextResponse.json(
          { error: '이미 등록된 연락처입니다.' },
          { status: 400 }
        );
      }
    }

    // Firebase Auth 사용자 생성
    await auth.createUser({
      email,
      password,
      displayName: name || undefined,
    });

    const now = new Date();

    // userId 생성
    const userId = await generateUniqueUserId(db);

    // users 컬렉션에 저장
    await db.collection('users').doc(email).set({
      userId,
      email,
      name: name || '',
      phone: phone || '',
      group: group || 'normal',
      provider: 'email',
      createdAt: now,
      updatedAt: now,
      createdBy: admin.adminId,
    });

    // 관리자 로그 기록
    await addAdminLog(db, admin, {
      action: 'member_create',
      email,
      phone: phone || null,
      userId,
      details: {
        name: name || '',
        phone: phone || '',
        group: group || 'normal',
      },
    });

    return NextResponse.json({
      success: true,
      email,
    });
  } catch (error) {
    console.error('Create member error:', error);
    return NextResponse.json(
      { error: '회원을 등록하는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
