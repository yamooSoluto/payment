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
    if (!db) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
    }

    // 이번 달 시작일과 끝일
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    // 병렬로 데이터 조회
    const [
      tenantsSnapshot,
      subscriptionsSnapshot,
      paymentsSnapshot,
    ] = await Promise.all([
      db.collection('tenants').get(),
      db.collection('subscriptions').where('status', '==', 'active').get(),
      db.collection('payments').orderBy('createdAt', 'desc').get(),
    ]);

    // 전체 회원 수
    const totalMembers = tenantsSnapshot.size;

    // 활성 구독 수
    const activeSubscriptions = subscriptionsSnapshot.size;

    // 이번 달 매출 계산 (completed/done 상태, 양수 금액만)
    let monthlyRevenue = 0;
    let newSignups = 0;

    // 이번 달 신규 가입 수 계산
    tenantsSnapshot.docs.forEach((doc) => {
      const data = doc.data();
      const createdAt = data.createdAt?.toDate?.();
      if (createdAt && createdAt >= startOfMonth && createdAt <= endOfMonth) {
        newSignups++;
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
      if (
        createdAt &&
        createdAt >= startOfMonth &&
        createdAt <= endOfMonth &&
        (status === 'completed' || status === 'done') &&
        amount > 0
      ) {
        monthlyRevenue += amount;
      }

      // 최근 결제 5건 수집 (양수 금액만)
      if (recentPayments.length < 5 && amount > 0 && (status === 'completed' || status === 'done')) {
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
        try {
          const tenantSnapshot = await db.collection('tenants')
            .where('email', '==', payment.email)
            .limit(1)
            .get();

          if (!tenantSnapshot.empty) {
            const tenantData = tenantSnapshot.docs[0].data();
            tenantInfoCache.set(payment.email, {
              businessName: tenantData?.brandName || tenantData?.businessName || '',
              ownerName: tenantData?.ownerName || tenantData?.name || '',
            });
          }
        } catch {
          // 조회 실패 시 무시
        }
      }
      payment.memberInfo = tenantInfoCache.get(payment.email) || null;
    }

    // 최근 가입 5건
    const recentSignups: Array<{
      id: string;
      email: string;
      businessName: string;
      ownerName: string;
      createdAt: string | null;
    }> = [];

    const sortedTenants = tenantsSnapshot.docs
      .map((doc) => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate?.() || null,
      }))
      .filter((t) => t.createdAt)
      .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0))
      .slice(0, 5);

    for (const tenant of sortedTenants) {
      recentSignups.push({
        id: tenant.id,
        email: (tenant as { email?: string }).email || '',
        businessName: (tenant as { brandName?: string; businessName?: string }).brandName ||
                      (tenant as { brandName?: string; businessName?: string }).businessName || '',
        ownerName: (tenant as { ownerName?: string; name?: string }).ownerName ||
                   (tenant as { ownerName?: string; name?: string }).name || '',
        createdAt: tenant.createdAt?.toISOString() || null,
      });
    }

    return NextResponse.json({
      stats: {
        totalMembers,
        activeSubscriptions,
        monthlyRevenue,
        newSignups,
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
