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

// 날짜 파싱 헬퍼 (Firestore Timestamp, Date, string 대응)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseDate(value: any): Date | null {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  // Firestore Timestamp-like object with _seconds
  if (value._seconds != null) return new Date(value._seconds * 1000);
  return null;
}

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

    // 구독 데이터 조회 (구독 상태 파악용)
    const subscriptionsSnapshot = await db.collection('subscriptions').get();
    const subscriptionMap = new Map<string, { status: string; plan: string }>();
    subscriptionsSnapshot.docs.forEach(doc => {
      const data = doc.data();
      const tenantId = data.tenantId || doc.id;
      subscriptionMap.set(tenantId, {
        status: data.status || 'none',
        plan: data.plan || '',
      });
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allTenants: any[] = tenantsSnapshot.docs
      .filter(doc => !doc.data().deleted)
      .map(doc => {
        const data = doc.data();
        const tenantId = data.tenantId || doc.id;
        const sub = subscriptionMap.get(tenantId);
        return {
          ...data,
          id: doc.id,
          _subscriptionStatus: sub?.status || data.subscription?.status || 'none',
          _plan: sub?.plan || data.plan || data.subscription?.plan || 'unknown',
        };
      });

    // 플랜 데이터 조회
    const plansSnapshot = await db.collection('plans').get();
    const plansMap: Record<string, string> = {};
    plansSnapshot.docs.forEach(doc => {
      plansMap[doc.id] = doc.data().name || doc.id;
    });

    // 디버그: 첫 번째 테넌트의 날짜 필드 확인
    if (allTenants.length > 0) {
      const rawData = tenantsSnapshot.docs.find(d => !d.data().deleted)?.data();
      console.log('[tenant-stats-debug]', {
        hasCreatedAt: !!rawData?.createdAt,
        createdAtType: rawData?.createdAt ? Object.getPrototypeOf(rawData.createdAt)?.constructor?.name : 'undefined',
        createdAtValue: rawData?.createdAt?.toDate?.() || String(rawData?.createdAt),
        allKeys: Object.keys(rawData || {}),
      });
    }

    // 전체 매장 수
    const total = allTenants.length;

    // 상태별 매장 수
    const subscribingStatuses = ['active', 'trial', 'past_due'];
    const subscribing = allTenants.filter(t => subscribingStatuses.includes(t._subscriptionStatus)).length;

    // 기간 내 신규 매장 (tenants.createdAt 사용)
    const periodNewTenants = allTenants.filter(t => {
      const createdAt = parseDate(t.createdAt);
      return createdAt && createdAt >= start && createdAt <= end;
    });
    const newTenants = periodNewTenants.length;

    // 월별 신규 매장 추이 (전체 기간, tenants.createdAt 사용)
    let trendStart = new Date();
    allTenants.forEach(t => {
      const createdAt = parseDate(t.createdAt);
      if (createdAt && createdAt < trendStart) trendStart = createdAt;
    });
    const labels = getMonthlyLabels(trendStart, new Date());
    const newByMonth: Record<string, number> = {};

    labels.forEach(label => {
      newByMonth[label] = 0;
    });

    allTenants.forEach(t => {
      const createdAt = parseDate(t.createdAt);
      if (createdAt) {
        const label = `${createdAt.getFullYear()}.${String(createdAt.getMonth() + 1).padStart(2, '0')}`;
        if (newByMonth[label] !== undefined) {
          newByMonth[label] += 1;
        }
      }
    });

    // 월말 기준 전체 매장 수 (tenants.createdAt) / 구독 매장 수 (subscriptions.status)
    const totalByMonth: Record<string, number> = {};
    const subscribingByMonth: Record<string, number> = {};
    labels.forEach(label => {
      const [y, m] = label.split('.').map(Number);
      const monthEnd = new Date(y, m, 0, 23, 59, 59, 999);
      totalByMonth[label] = allTenants.filter(t => {
        const createdAt = parseDate(t.createdAt);
        return createdAt && createdAt <= monthEnd;
      }).length;
      subscribingByMonth[label] = allTenants.filter(t => {
        const createdAt = parseDate(t.createdAt);
        if (!createdAt || createdAt > monthEnd) return false;
        return subscribingStatuses.includes(t._subscriptionStatus);
      }).length;
    });

    // 플랜별 분포
    const byPlanMap: Record<string, number> = {};
    allTenants.forEach(t => {
      byPlanMap[t._plan] = (byPlanMap[t._plan] || 0) + 1;
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
        subscribing,
        newTenants,
      },
      trend: {
        labels,
        totalCount: labels.map(l => totalByMonth[l] || 0),
        subscribingCount: labels.map(l => subscribingByMonth[l] || 0),
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
