import { NextRequest, NextResponse } from 'next/server';
import { getAdminFromRequest, hasPermission } from '@/lib/admin-auth';
import { initializeFirebaseAdmin } from '@/lib/firebase-admin';

// 회원 그룹명 매핑
const groupNames: Record<string, string> = {
  general: '일반',
  internal: '내부',
  vip: 'VIP',
  premium: '프리미엄',
  partner: '파트너',
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

    // 회원 데이터 조회
    const usersSnapshot = await db.collection('users').get();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allUsers: any[] = usersSnapshot.docs.map(doc => ({
      ...doc.data(),
      id: doc.id,
    }));

    // 구독 데이터 조회 (구독 회원 확인용)
    const subscriptionsSnapshot = await db.collection('subscriptions').get();
    const subscribingStatuses = ['active', 'trial', 'pending_cancel'];
    const subscribingUserIds = new Set(
      subscriptionsSnapshot.docs
        .filter(doc => subscribingStatuses.includes(doc.data().status))
        .map(doc => doc.data().userId)
    );

    // 디버그: 구독 회원 매칭 확인
    const allSubStatuses = subscriptionsSnapshot.docs.map(doc => doc.data().status);
    const allSubUserIds = subscriptionsSnapshot.docs.map(doc => doc.data().userId);
    const userDocIds = allUsers.map(u => u.id).slice(0, 5);
    console.log('[member-stats-debug]', {
      totalSubscriptions: subscriptionsSnapshot.docs.length,
      statuses: [...new Set(allSubStatuses)],
      subscribingCount: subscribingUserIds.size,
      subscribingUserIdsSample: [...subscribingUserIds].slice(0, 3),
      userDocIdsSample: userDocIds,
    });

    // 전체 회원 수
    const total = allUsers.length;

    // 활성 회원 (최근 30일 내 로그인)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const active = allUsers.filter(u => {
      const lastLogin = u.lastLoginAt?.toDate?.() || (u.lastLoginAt ? new Date(u.lastLoginAt) : null);
      return lastLogin && lastLogin >= thirtyDaysAgo;
    }).length;

    // 기간 내 신규 가입
    const periodNewUsers = allUsers.filter(u => {
      const createdAt = u.createdAt?.toDate?.() || (u.createdAt ? new Date(u.createdAt) : null);
      return createdAt && createdAt >= start && createdAt <= end;
    });
    const newSignups = periodNewUsers.length;

    // 구독 회원 (구독중/체험중/해지예정) - users.userId와 subscriptions.userId 매칭
    const subscribingMembers = allUsers.filter(u => subscribingUserIds.has(u.userId)).length;

    // 월별 가입 추이 (전체 기간)
    let trendStart = new Date();
    allUsers.forEach(u => {
      const createdAt = u.createdAt?.toDate?.() || (u.createdAt ? new Date(u.createdAt) : null);
      if (createdAt && createdAt < trendStart) trendStart = createdAt;
    });
    const labels = getMonthlyLabels(trendStart, new Date());
    const signupsByMonth: Record<string, number> = {};

    labels.forEach(label => {
      signupsByMonth[label] = 0;
    });

    allUsers.forEach(u => {
      const createdAt = u.createdAt?.toDate?.() || (u.createdAt ? new Date(u.createdAt) : null);
      if (createdAt) {
        const label = `${createdAt.getFullYear()}.${String(createdAt.getMonth() + 1).padStart(2, '0')}`;
        if (signupsByMonth[label] !== undefined) {
          signupsByMonth[label] += 1;
        }
      }
    });

    // 월말 기준 전체 회원 수
    const totalByMonth: Record<string, number> = {};
    labels.forEach(label => {
      const [y, m] = label.split('.').map(Number);
      const monthEnd = new Date(y, m, 0, 23, 59, 59, 999);
      totalByMonth[label] = allUsers.filter(u => {
        const createdAt = u.createdAt?.toDate?.() || (u.createdAt ? new Date(u.createdAt) : null);
        return createdAt && createdAt <= monthEnd;
      }).length;
    });

    // 그룹별 분포
    const byGroupMap: Record<string, number> = {};
    allUsers.forEach(u => {
      const group = u.group || u.memberGroup || 'general';
      byGroupMap[group] = (byGroupMap[group] || 0) + 1;
    });

    const byGroup = Object.entries(byGroupMap).map(([group, count]) => ({
      group,
      groupName: groupNames[group] || group,
      count,
    })).sort((a, b) => b.count - a.count);

    return NextResponse.json({
      summary: {
        total,
        subscribingMembers,
        newSignups,
      },
      trend: {
        labels,
        signups: labels.map(l => signupsByMonth[l] || 0),
        totalCount: labels.map(l => totalByMonth[l] || 0),
      },
      byGroup,
    });
  } catch (error) {
    console.error('Get member stats error:', error);
    return NextResponse.json(
      { error: '회원 통계를 불러오는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
