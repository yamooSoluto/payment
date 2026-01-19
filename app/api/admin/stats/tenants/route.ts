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

    // 매장(테넌트) 데이터 조회
    const tenantsSnapshot = await db.collection('tenants').get();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allTenants: any[] = tenantsSnapshot.docs.map(doc => ({
      ...doc.data(),
      id: doc.id,
    }));

    // 플랜 데이터 조회
    const plansSnapshot = await db.collection('plans').get();
    const plansMap: Record<string, string> = {};
    plansSnapshot.docs.forEach(doc => {
      plansMap[doc.id] = doc.data().name || doc.id;
    });

    // 전체 매장 수
    const total = allTenants.length;

    // 상태별 매장 수
    const active = allTenants.filter(t => t.subscriptionStatus === 'active').length;
    const trial = allTenants.filter(t => t.subscriptionStatus === 'trial').length;
    const canceled = allTenants.filter(t => t.subscriptionStatus === 'canceled').length;

    // 기간 내 신규 매장
    const periodNewTenants = allTenants.filter(t => {
      const createdAt = t.createdAt?.toDate?.() || (t.createdAt ? new Date(t.createdAt) : null);
      return createdAt && createdAt >= start && createdAt <= end;
    });
    const newTenants = periodNewTenants.length;

    // 월별 신규 매장 추이
    const labels = getMonthlyLabels(start, end);
    const newByMonth: Record<string, number> = {};

    labels.forEach(label => {
      newByMonth[label] = 0;
    });

    periodNewTenants.forEach(t => {
      const createdAt = t.createdAt?.toDate?.() || (t.createdAt ? new Date(t.createdAt) : null);
      if (createdAt) {
        const label = `${createdAt.getFullYear()}.${String(createdAt.getMonth() + 1).padStart(2, '0')}`;
        if (newByMonth[label] !== undefined) {
          newByMonth[label] += 1;
        }
      }
    });

    // 플랜별 분포
    const byPlanMap: Record<string, number> = {};
    allTenants.forEach(t => {
      const planId = t.planId || 'unknown';
      byPlanMap[planId] = (byPlanMap[planId] || 0) + 1;
    });

    const byPlan = Object.entries(byPlanMap).map(([plan, count]) => ({
      plan,
      planName: plansMap[plan] || planNames[plan] || plan,
      count,
    })).sort((a, b) => b.count - a.count);

    // 업종별 분포
    const byIndustryMap: Record<string, number> = {};
    allTenants.forEach(t => {
      const industry = t.industry || t.businessType || '미지정';
      byIndustryMap[industry] = (byIndustryMap[industry] || 0) + 1;
    });

    const byIndustry = Object.entries(byIndustryMap).map(([industry, count]) => ({
      industry,
      count,
    })).sort((a, b) => b.count - a.count);

    return NextResponse.json({
      summary: {
        total,
        active,
        trial,
        canceled,
        newTenants,
      },
      trend: {
        labels,
        newTenants: labels.map(l => newByMonth[l] || 0),
      },
      byPlan,
      byIndustry,
    });
  } catch (error) {
    console.error('Get tenant stats error:', error);
    return NextResponse.json(
      { error: '매장 통계를 불러오는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
