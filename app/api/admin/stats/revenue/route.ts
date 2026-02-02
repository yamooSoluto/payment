import { NextRequest, NextResponse } from 'next/server';
import { getAdminFromRequest, hasPermission } from '@/lib/admin-auth';
import { initializeFirebaseAdmin } from '@/lib/firebase-admin';

// 플랜명 매핑
const planNames: Record<string, string> = {
  basic: 'Basic',
  business: 'Business',
  enterprise: 'Enterprise',
  unknown: '미지정',
};

// 결제 상태명 매핑
const statusNames: Record<string, string> = {
  done: '결제',
  pending: '대기',
  failed: '실패',
  refunded: '환불',
};

// 기간 계산
function getPeriodDates(period: string, startDate?: string, endDate?: string) {
  let start: Date;
  let end: Date = new Date();
  end.setHours(23, 59, 59, 999);

  if (startDate && endDate) {
    start = new Date(startDate);
    end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
  } else {
    start = new Date();
    switch (period) {
      case 'thisMonth':
        start.setDate(1);
        break;
      case 'quarter':
        start.setMonth(start.getMonth() - 3);
        break;
      case 'half':
        start.setMonth(start.getMonth() - 6);
        break;
      case 'year':
        start.setFullYear(start.getFullYear() - 1);
        break;
      case 'month':
      default:
        start.setMonth(start.getMonth() - 1);
        break;
    }
  }
  start.setHours(0, 0, 0, 0);

  return { start, end };
}

// 월별 라벨 생성
function getMonthlyLabels(start: Date, end: Date): string[] {
  const labels: string[] = [];
  const current = new Date(start);
  current.setDate(1);

  while (current <= end) {
    labels.push(`${current.getFullYear()}.${String(current.getMonth() + 1).padStart(2, '0')}`);
    current.setMonth(current.getMonth() + 1);
  }

  return labels;
}

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
    const period = searchParams.get('period') || 'month';
    const startDate = searchParams.get('startDate') || undefined;
    const endDate = searchParams.get('endDate') || undefined;

    const { start, end } = getPeriodDates(period, startDate, endDate);

    // 전체 결제 데이터 조회
    const paymentsSnapshot = await db.collection('payments').get();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allPayments: any[] = paymentsSnapshot.docs.map(doc => ({
      ...doc.data(),
      id: doc.id,
    }));

    // 기간 내 결제
    const periodPayments = allPayments.filter(p => {
      const paidAt = p.paidAt?.toDate?.() || (p.paidAt ? new Date(p.paidAt) : null);
      return paidAt && paidAt >= start && paidAt <= end;
    });

    // 완료된 결제 (charge 거래 중 done 상태)
    const completedPayments = allPayments.filter(p => p.status === 'done' && p.transactionType !== 'refund');
    const periodCompletedPayments = periodPayments.filter(p => p.status === 'done' && p.transactionType !== 'refund');

    // 환불된 결제 (refund 거래)
    const refundedPayments = allPayments.filter(p => p.transactionType === 'refund');
    const periodRefundedPayments = periodPayments.filter(p => p.transactionType === 'refund');

    // 총 매출
    const totalRevenue = completedPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const periodRevenue = periodCompletedPayments.reduce((sum, p) => sum + (p.amount || 0), 0);

    // 환불액 (음수로 저장되어 있을 수 있으므로 절대값으로 처리)
    const refundAmount = periodRefundedPayments.reduce((sum, p) => sum + Math.abs(p.amount || 0), 0);

    // 환불률
    const totalPeriodAmount = periodRevenue + refundAmount;
    const refundRate = totalPeriodAmount > 0 ? (refundAmount / totalPeriodAmount) * 100 : 0;

    // 평균 결제액
    const avgOrderValue = periodCompletedPayments.length > 0
      ? periodRevenue / periodCompletedPayments.length
      : 0;

    // 월별 추이 (전체 기간)
    let trendStart = new Date();
    allPayments.forEach(p => {
      const paidAt = p.paidAt?.toDate?.() || (p.paidAt ? new Date(p.paidAt) : null);
      if (paidAt && paidAt < trendStart) trendStart = paidAt;
    });
    const labels = getMonthlyLabels(trendStart, new Date());
    const revenueByMonth: Record<string, number> = {};
    const refundsByMonth: Record<string, number> = {};

    labels.forEach(label => {
      revenueByMonth[label] = 0;
      refundsByMonth[label] = 0;
    });

    completedPayments.forEach(p => {
      const paidAt = p.paidAt?.toDate?.() || (p.paidAt ? new Date(p.paidAt) : null);
      if (paidAt) {
        const label = `${paidAt.getFullYear()}.${String(paidAt.getMonth() + 1).padStart(2, '0')}`;
        if (revenueByMonth[label] !== undefined) {
          revenueByMonth[label] += p.amount || 0;
        }
      }
    });

    refundedPayments.forEach(p => {
      const paidAt = p.paidAt?.toDate?.() || (p.paidAt ? new Date(p.paidAt) : null);
      if (paidAt) {
        const label = `${paidAt.getFullYear()}.${String(paidAt.getMonth() + 1).padStart(2, '0')}`;
        if (refundsByMonth[label] !== undefined) {
          refundsByMonth[label] += Math.abs(p.amount || 0);
        }
      }
    });

    // 플랜별 매출
    const byPlanMap: Record<string, { amount: number; count: number }> = {};
    periodCompletedPayments.forEach(p => {
      const planId = p.plan || p.planId || 'unknown';
      if (!byPlanMap[planId]) {
        byPlanMap[planId] = { amount: 0, count: 0 };
      }
      byPlanMap[planId].amount += p.amount || 0;
      byPlanMap[planId].count += 1;
    });

    const byPlan = Object.entries(byPlanMap).map(([plan, data]) => ({
      plan,
      planName: planNames[plan] || plan,
      amount: data.amount,
      count: data.count,
    })).sort((a, b) => b.amount - a.amount);

    // 결제 상태별 (환불은 transactionType으로 구분)
    const byStatusMap: Record<string, { amount: number; count: number }> = {};
    periodPayments.forEach(p => {
      const label = p.transactionType === 'refund' ? 'refunded' : (p.status || 'pending');
      if (!byStatusMap[label]) {
        byStatusMap[label] = { amount: 0, count: 0 };
      }
      byStatusMap[label].amount += Math.abs(p.amount || 0);
      byStatusMap[label].count += 1;
    });

    const byStatus = Object.entries(byStatusMap).map(([status, data]) => ({
      status,
      statusName: statusNames[status] || status,
      amount: data.amount,
      count: data.count,
    })).sort((a, b) => b.count - a.count);

    return NextResponse.json({
      summary: {
        totalRevenue,
        periodRevenue,
        refundAmount,
        refundRate,
        completedCount: periodCompletedPayments.length,
        avgOrderValue: Math.round(avgOrderValue),
      },
      trend: {
        labels,
        revenue: labels.map(l => revenueByMonth[l] || 0),
        refunds: labels.map(l => refundsByMonth[l] || 0),
      },
      byPlan,
      byStatus,
    });
  } catch (error) {
    console.error('Get revenue stats error:', error);
    return NextResponse.json(
      { error: '매출 통계를 불러오는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
