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

// 구독 상태명 매핑
const statusNames: Record<string, string> = {
  active: '활성',
  trial: '체험',
  canceled: '취소',
  expired: '만료',
  pending: '대기',
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

    // 구독 데이터 조회
    const subscriptionsSnapshot = await db.collection('subscriptions').get();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allSubscriptions: any[] = subscriptionsSnapshot.docs.map(doc => ({
      ...doc.data(),
      id: doc.id,
    }));

    // 플랜 데이터 조회 (MRR 계산용)
    const plansSnapshot = await db.collection('plans').get();
    const plansMap: Record<string, { price: number; name: string }> = {};
    plansSnapshot.docs.forEach(doc => {
      const data = doc.data();
      plansMap[doc.id] = {
        price: data.price || 0,
        name: data.name || doc.id,
      };
    });

    // 상태별 집계
    const total = allSubscriptions.length;
    const active = allSubscriptions.filter(s => s.status === 'active').length;
    const trial = allSubscriptions.filter(s => s.status === 'trial').length;
    const canceled = allSubscriptions.filter(s => s.status === 'canceled').length;
    const expired = allSubscriptions.filter(s => s.status === 'expired').length;

    // MRR 계산 (활성 구독의 월간 반복 매출)
    const mrr = allSubscriptions
      .filter(s => s.status === 'active')
      .reduce((sum, s) => {
        const plan = plansMap[s.planId];
        return sum + (plan?.price || 0);
      }, 0);

    // 기간 내 신규 구독
    const periodNewSubscriptions = allSubscriptions.filter(s => {
      const createdAt = s.createdAt?.toDate?.() || (s.createdAt ? new Date(s.createdAt) : null);
      return createdAt && createdAt >= start && createdAt <= end;
    });

    // 기간 내 취소된 구독
    const periodCancellations = allSubscriptions.filter(s => {
      const canceledAt = s.canceledAt?.toDate?.() || (s.canceledAt ? new Date(s.canceledAt) : null);
      return canceledAt && canceledAt >= start && canceledAt <= end;
    });

    // 월별 추이
    const labels = getMonthlyLabels(start, end);
    const newByMonth: Record<string, number> = {};
    const canceledByMonth: Record<string, number> = {};

    labels.forEach(label => {
      newByMonth[label] = 0;
      canceledByMonth[label] = 0;
    });

    periodNewSubscriptions.forEach(s => {
      const createdAt = s.createdAt?.toDate?.() || (s.createdAt ? new Date(s.createdAt) : null);
      if (createdAt) {
        const label = `${createdAt.getFullYear()}.${String(createdAt.getMonth() + 1).padStart(2, '0')}`;
        if (newByMonth[label] !== undefined) {
          newByMonth[label] += 1;
        }
      }
    });

    periodCancellations.forEach(s => {
      const canceledAt = s.canceledAt?.toDate?.() || (s.canceledAt ? new Date(s.canceledAt) : null);
      if (canceledAt) {
        const label = `${canceledAt.getFullYear()}.${String(canceledAt.getMonth() + 1).padStart(2, '0')}`;
        if (canceledByMonth[label] !== undefined) {
          canceledByMonth[label] += 1;
        }
      }
    });

    // 플랜별 분포
    const byPlanMap: Record<string, number> = {};
    allSubscriptions.forEach(s => {
      const planId = s.planId || 'unknown';
      byPlanMap[planId] = (byPlanMap[planId] || 0) + 1;
    });

    const byPlan = Object.entries(byPlanMap).map(([plan, count]) => ({
      plan,
      planName: plansMap[plan]?.name || planNames[plan] || plan,
      count,
    })).sort((a, b) => b.count - a.count);

    // 상태별 분포
    const byStatusMap: Record<string, number> = {};
    allSubscriptions.forEach(s => {
      const status = s.status || 'pending';
      byStatusMap[status] = (byStatusMap[status] || 0) + 1;
    });

    const byStatus = Object.entries(byStatusMap).map(([status, count]) => ({
      status,
      statusName: statusNames[status] || status,
      count,
    })).sort((a, b) => b.count - a.count);

    return NextResponse.json({
      summary: {
        total,
        active,
        trial,
        canceled,
        expired,
        mrr,
      },
      trend: {
        labels,
        newSubscriptions: labels.map(l => newByMonth[l] || 0),
        cancellations: labels.map(l => canceledByMonth[l] || 0),
      },
      byPlan,
      byStatus,
    });
  } catch (error) {
    console.error('Get subscription stats error:', error);
    return NextResponse.json(
      { error: '구독 통계를 불러오는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
