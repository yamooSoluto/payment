import { NextRequest, NextResponse } from 'next/server';
import { getAdminFromRequest, hasPermission } from '@/lib/admin-auth';
import { initializeFirebaseAdmin } from '@/lib/firebase-admin';

// GET: 대시보드 통계 조회
export async function GET(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);

    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(admin, 'dashboard:read')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const db = initializeFirebaseAdmin();
    // ... (중략) ...

    if (!db) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
    }

    // 이번 달 시작일과 끝일
    const now = new Date();
    const monthKeys: string[] = [];
    const monthLabels: string[] = [];
    for (let i = 2; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      monthKeys.push(key);
      monthLabels.push(`${date.getMonth() + 1}월`);
    }
    const monthIndex = new Map(monthKeys.map((key, idx) => [key, idx]));
    const revenueTrend = Array(monthKeys.length).fill(0);
    const signupTrend = Array(monthKeys.length).fill(0);

    const getMonthKey = (date: Date) =>
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

    // 병렬로 데이터 조회

    const [
      usersSnapshot,
      tenantsSnapshot,
      subscriptionsSnapshot,
      paymentsSnapshot,
    ] = await Promise.all([
      db.collection('users').get(),
      db.collection('tenants').get(),
      db.collection('subscriptions').where('status', '==', 'active').get(),
      db.collection('payments').orderBy('createdAt', 'desc').get(),
    ]);

    console.log('--- DEBUG: Users Collection ---');
    console.log(`Total documents found: ${usersSnapshot.size}`);
    usersSnapshot.docs.forEach((doc) => {
      console.log(`- ID: ${doc.id}, Email: ${doc.data().email}, Name: ${doc.data().name}`);
    });
    console.log('-------------------------------');

    // 전체 회원 수 (users 기준)
    const totalMembers = usersSnapshot.size;
    // 전체 매장 수 (tenants 기준)
    const totalTenants = tenantsSnapshot.size;

    // 활성 구독 수
    const activeSubscriptions = subscriptionsSnapshot.size;

    // 이번 달 매출 계산 (completed/done 상태, 양수 금액만)
    let monthlyRevenue = 0;
    let newSignups = 0; // 신규 가입 (User)
    let newTenants = 0; // 신규 매장 (Tenant)

    // 이번 달 신규 가입 수 계산 (users 기준)
    usersSnapshot.docs.forEach((doc) => {
      const data = doc.data();
      const createdAt = data.createdAt?.toDate?.();
      if (createdAt) {
        const key = getMonthKey(createdAt);
        const idx = monthIndex.get(key);
        if (idx !== undefined) {
          signupTrend[idx] += 1;
        }
      }
    });

    // 이번 달 신규 매장 수 계산 (tenants 기준)
    tenantsSnapshot.docs.forEach((doc) => {
      const data = doc.data();
      const createdAt = data.createdAt?.toDate?.();
      if (createdAt) {
        const key = getMonthKey(createdAt);
        // 이번 달(마지막 인덱스)인지 확인
        if (key === monthKeys[monthKeys.length - 1]) {
          newTenants += 1;
        }
      }
    });

    // 이번 달 매출 계산
    const recentPayments: Array<{
      id: string;
      email: string;
      amount: number;
      plan: string;
      status: string;
      createdAt: string | null;
      memberInfo: { businessName: string; ownerName: string } | null;
    }> = [];

    paymentsSnapshot.docs.forEach((doc) => {
      const data = doc.data();
      const createdAt = data.createdAt?.toDate?.();
      const amount = data.amount || 0;
      const status = data.status;

      // 이번 달 완료된 결제의 양수 금액 합산
      if (createdAt && status === 'done' && amount > 0) {
        const key = getMonthKey(createdAt);
        const idx = monthIndex.get(key);
        if (idx !== undefined) {
          revenueTrend[idx] += amount;
        }
      }

      // 최근 결제 5건 수집 (양수 금액만)
      if (recentPayments.length < 5 && amount > 0 && status === 'done') {
        recentPayments.push({
          id: doc.id,
          email: data.email || '',
          amount,
          plan: data.plan || '',
          status,
          createdAt: createdAt?.toISOString() || null,
          memberInfo: null, // 나중에 채움
        });
      }
    });

    // 최근 결제의 회원 정보 조회
    const tenantInfoCache = new Map<string, { businessName: string; ownerName: string }>();
    for (const payment of recentPayments) {
      if (payment.email && !tenantInfoCache.has(payment.email)) {
        // 이미 tenantsSnapshot을 가져왔으므로 거기서 찾을 수도 있지만, 
        // 쿼리 효율을 위해 기존 캐시 로직 유지 (또는 tenantsSnapshot.docs.find로 최적화 가능)
        // 여기서는 간단히 tenantsSnapshot을 활용하여 최적화
        const foundTenant = tenantsSnapshot.docs.find(t => t.data().email === payment.email);
        if (foundTenant) {
          const tenantData = foundTenant.data();
          tenantInfoCache.set(payment.email, {
            businessName: tenantData.brandName || tenantData.businessName || '',
            ownerName: tenantData.ownerName || tenantData.name || '',
          });
        }
      }
      payment.memberInfo = tenantInfoCache.get(payment.email) || null;
    }

    // 최근 가입 5건 (users 기준)
    const recentSignups: Array<{
      id: string;
      email: string;
      businessName: string;
      ownerName: string;
      createdAt: string | null;
    }> = [];

    const sortedUsers = usersSnapshot.docs
      .map((doc) => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate?.() || null,
      }))
      .filter((u) => u.createdAt)
      .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0))
      .slice(0, 5);

    for (const user of sortedUsers) {
      // User 데이터 타입 안전 처리
      const userData = user as { email?: string; name?: string; businessName?: string };
      recentSignups.push({
        id: user.id,
        email: userData.email || '',
        businessName: userData.businessName || userData.name || '신규 회원',
        ownerName: userData.name || '',
        createdAt: user.createdAt?.toISOString() || null,
      });
    }

    monthlyRevenue = revenueTrend[revenueTrend.length - 1] || 0;
    newSignups = signupTrend[signupTrend.length - 1] || 0;

    return NextResponse.json({
      stats: {
        totalMembers,
        totalTenants,
        activeSubscriptions,
        monthlyRevenue,
        newSignups,
        newTenants,
      },
      trend: {
        months: monthLabels,
        revenue: revenueTrend,
        signups: signupTrend,
      },
      recentPayments,
      recentSignups,
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    return NextResponse.json(
      { error: '대시보드 데이터를 불러오는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
