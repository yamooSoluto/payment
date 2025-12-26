import { NextRequest, NextResponse } from 'next/server';
import { getAdminFromRequest, hasPermission } from '@/lib/admin-auth';
import { initializeFirebaseAdmin } from '@/lib/firebase-admin';

// GET: 통계 데이터 조회
export async function GET(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);

    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(admin, 'stats:read')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const db = initializeFirebaseAdmin();
    if (!db) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || 'month'; // week, month, year
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    // 기간 설정
    let start: Date;
    let end: Date = new Date();

    if (startDate && endDate) {
      start = new Date(startDate);
      end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
    } else {
      switch (period) {
        case 'week':
          start = new Date();
          start.setDate(start.getDate() - 7);
          break;
        case 'year':
          start = new Date();
          start.setFullYear(start.getFullYear() - 1);
          break;
        case 'month':
        default:
          start = new Date();
          start.setMonth(start.getMonth() - 1);
          break;
      }
    }

    // 전체 회원 수
    const tenantsSnapshot = await db.collection('tenants').get();
    const totalMembers = tenantsSnapshot.size;

    // 상태별 회원 수
    const activeMembers = tenantsSnapshot.docs.filter(
      doc => doc.data().subscriptionStatus === 'active'
    ).length;
    const trialMembers = tenantsSnapshot.docs.filter(
      doc => doc.data().subscriptionStatus === 'trial'
    ).length;
    const canceledMembers = tenantsSnapshot.docs.filter(
      doc => doc.data().subscriptionStatus === 'canceled'
    ).length;

    // 기간 내 신규 가입
    const newSignups = tenantsSnapshot.docs.filter(doc => {
      const createdAt = doc.data().createdAt?.toDate?.();
      return createdAt && createdAt >= start && createdAt <= end;
    }).length;

    // 결제 데이터
    const paymentsSnapshot = await db.collection('payments')
      .where('status', '==', 'completed')
      .get();

    // 전체 매출
    const totalRevenue = paymentsSnapshot.docs.reduce(
      (sum, doc) => sum + (doc.data().amount || 0),
      0
    );

    // 기간 내 매출
    const periodPayments = paymentsSnapshot.docs.filter(doc => {
      const paidAt = doc.data().paidAt?.toDate?.();
      return paidAt && paidAt >= start && paidAt <= end;
    });
    const periodRevenue = periodPayments.reduce(
      (sum, doc) => sum + (doc.data().amount || 0),
      0
    );

    // 일별 통계 (차트용)
    const dailyStats: { date: string; signups: number; revenue: number }[] = [];
    const currentDate = new Date(start);

    while (currentDate <= end) {
      const dateStr = currentDate.toISOString().split('T')[0];
      const dayStart = new Date(dateStr);
      const dayEnd = new Date(dateStr);
      dayEnd.setHours(23, 59, 59, 999);

      const daySignups = tenantsSnapshot.docs.filter(doc => {
        const createdAt = doc.data().createdAt?.toDate?.();
        return createdAt && createdAt >= dayStart && createdAt <= dayEnd;
      }).length;

      const dayRevenue = paymentsSnapshot.docs
        .filter(doc => {
          const paidAt = doc.data().paidAt?.toDate?.();
          return paidAt && paidAt >= dayStart && paidAt <= dayEnd;
        })
        .reduce((sum, doc) => sum + (doc.data().amount || 0), 0);

      dailyStats.push({
        date: dateStr,
        signups: daySignups,
        revenue: dayRevenue,
      });

      currentDate.setDate(currentDate.getDate() + 1);
    }

    // 플랜별 분포
    const planDistribution: Record<string, number> = {};
    tenantsSnapshot.docs.forEach(doc => {
      const planId = doc.data().planId || 'unknown';
      planDistribution[planId] = (planDistribution[planId] || 0) + 1;
    });

    return NextResponse.json({
      summary: {
        totalMembers,
        activeMembers,
        trialMembers,
        canceledMembers,
        newSignups,
        totalRevenue,
        periodRevenue,
      },
      dailyStats,
      planDistribution,
      period: {
        start: start.toISOString(),
        end: end.toISOString(),
      },
    });
  } catch (error) {
    console.error('Get stats error:', error);
    return NextResponse.json(
      { error: '통계를 불러오는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
