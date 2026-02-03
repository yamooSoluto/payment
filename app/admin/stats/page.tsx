'use client';

import { useState, useEffect } from 'react';
import useSWR from 'swr';
import { useSearchParams, useRouter } from 'next/navigation';
import { StatsUpSquare, Calendar, CreditCards, Timer, Group, HomeSimpleDoor, ChatBubble } from 'iconoir-react';
import Spinner from '@/components/admin/Spinner';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  ComposedChart,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

// 탭 타입
type TabType = 'revenue' | 'subscription' | 'member' | 'tenant' | 'cs';

// 기간 타입
type PeriodType = 'thisMonth' | 'month' | 'quarter' | 'half' | 'year' | 'custom';

// 매출 통계 타입
interface RevenueStats {
  summary: {
    totalRevenue: number;
    periodRevenue: number;
    refundAmount: number;
    refundRate: number;
    completedCount: number;
    avgOrderValue: number;
  };
  trend: {
    labels: string[];
    revenue: number[];
    refunds: number[];
  };
  byPlan: { plan: string; planName: string; amount: number; count: number }[];
  byStatus: { status: string; statusName: string; amount: number; count: number }[];
}

// 구독 통계 타입
interface SubscriptionStats {
  summary: {
    total: number;
    active: number;
    trial: number;
    canceled: number;
    expired: number;
    mrr: number;
    firstSubscription: number;
  };
  trend: {
    labels: string[];
    newSubscriptions: number[];
    cancellations: number[];
    activeCount: number[];
  };
  byPlan: { plan: string; planName: string; count: number }[];
  byStatus: { status: string; statusName: string; count: number }[];
}

// 회원 통계 타입
interface MemberStats {
  summary: {
    total: number;
    subscribingMembers: number;
    newSignups: number;
  };
  trend: {
    labels: string[];
    signups: number[];
    totalCount: number[];
  };
  byGroup: { group: string; groupName: string; count: number }[];
}

// 매장 통계 타입
interface TenantStats {
  summary: {
    total: number;
    subscribing: number;
    newTenants: number;
  };
  trend: {
    labels: string[];
    totalCount: number[];
    subscribingCount: number[];
    newTenants: number[];
  };
  byPlan: { plan: string; planName: string; count: number }[];
  byIndustry: { industry: string; count: number }[];
}

// 차트 색상
const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

const tabs = [
  { id: 'revenue' as TabType, name: '매출', icon: CreditCards },
  { id: 'subscription' as TabType, name: '구독', icon: Timer },
  { id: 'member' as TabType, name: '회원', icon: Group },
  { id: 'tenant' as TabType, name: '매장', icon: HomeSimpleDoor },
  { id: 'cs' as TabType, name: 'CS', icon: ChatBubble },
];

const periods = [
  { id: 'thisMonth' as PeriodType, name: '이번달' },
  { id: 'month' as PeriodType, name: '최근 1개월' },
  { id: 'quarter' as PeriodType, name: '최근 3개월' },
  { id: 'half' as PeriodType, name: '최근 6개월' },
  { id: 'year' as PeriodType, name: '최근 1년' },
  { id: 'custom' as PeriodType, name: '직접 입력' },
];

// 숫자 포맷
const formatNumber = (num: number) => num.toLocaleString('ko-KR');
const formatCurrency = (num: number) => `${num.toLocaleString('ko-KR')}원`;

// 추이 데이터에서 연도 목록 추출
function getYearsFromLabels(labels: string[]): string[] {
  const years = [...new Set(labels.map(l => l.split('.')[0]))];
  return years.sort((a, b) => b.localeCompare(a));
}

// 추이 데이터 연도별 필터링 + 1~12월 모두 표시
function filterTrendByYear<T extends { name: string }>(data: T[], year: string): (Omit<T, 'name'> & { name: string; month: string })[] {
  const dataMap = new Map(data.filter(d => d.name.startsWith(year)).map(d => [d.name, d]));
  return Array.from({ length: 12 }, (_, i) => {
    const key = `${year}.${String(i + 1).padStart(2, '0')}`;
    const existing = dataMap.get(key);
    if (existing) return { ...existing, month: `${i + 1}월` };
    const empty = Object.fromEntries(Object.keys(data[0] || {}).map(k => [k, k === 'name' ? key : 0])) as T;
    return { ...empty, name: key, month: `${i + 1}월` };
  });
}

// StatCard 컴포넌트
function StatCard({
  label,
  value,
  suffix = '',
}: {
  label: string;
  value: number | string;
  suffix?: string;
}) {
  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
      <span className="text-sm text-gray-500">{label}</span>
      <p className="text-2xl font-bold text-gray-900 mt-1">
        {typeof value === 'number' ? formatNumber(value) : value}{suffix}
      </p>
    </div>
  );
}


export default function StatsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // URL에서 탭 상태 읽기
  const tabFromUrl = searchParams.get('tab') as TabType | null;
  const validTabs: TabType[] = ['revenue', 'subscription', 'member', 'tenant', 'cs'];
  const initialTab = tabFromUrl && validTabs.includes(tabFromUrl) ? tabFromUrl : 'revenue';

  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  const [period, setPeriod] = useState<PeriodType>('thisMonth');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [trendYear, setTrendYear] = useState(new Date().getFullYear().toString());
  // 탭 변경 시 URL 업데이트
  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    const newParams = new URLSearchParams(searchParams.toString());
    newParams.set('tab', tab);
    router.replace(`?${newParams.toString()}`, { scroll: false });
  };

  // SWR: Stats
  const statsEndpoint = activeTab === 'subscription' ? 'subscriptions' : activeTab === 'member' ? 'members' : activeTab === 'tenant' ? 'tenants' : 'revenue';
  const statsParamsStr = (() => {
    const params = new URLSearchParams({ period });
    if (period === 'custom' && startDate && endDate) {
      params.set('startDate', startDate);
      params.set('endDate', endDate);
    }
    return params.toString();
  })();
  const statsSwrKey = activeTab === 'cs' ? null : `/api/admin/stats/${statsEndpoint}?${statsParamsStr}`;
  const { data: statsData, isLoading: loading, mutate: mutateStats } = useSWR(
    statsSwrKey
  );

  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const renderSmartPieLabel = (props: any) => {
    const { cx, cy, midAngle, innerRadius, outerRadius, percent, name } = props;
    const isLarge = percent >= 0.25;
    const RADIAN = Math.PI / 180;

    if (isLarge) {
      // Inside label
      const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
      const x = cx + radius * Math.cos(-midAngle * RADIAN);
      const y = cy + radius * Math.sin(-midAngle * RADIAN);

      return (
        <text
          x={x}
          y={y}
          fill="#fff"
          textAnchor="middle"
          dominantBaseline="central"
          style={{ fontSize: window.innerWidth < 640 ? '10px' : '12px', fontWeight: 'bold', pointerEvents: 'none' }}
        >
          <tspan x={x} dy="-0.6em">{name}</tspan>
          <tspan x={x} dy="1.2em">{`${(percent * 100).toFixed(0)}%`}</tspan>
        </text>
      );
    }

    // Outside label
    const { x, y, cx: centerX } = props;
    return (
      <text
        x={x}
        y={y}
        fill="#666"
        textAnchor={x > centerX ? 'start' : 'end'}
        dominantBaseline="central"
        style={{ fontSize: '12px' }}
      >
        {`${name} ${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  const renderCustomLabelLine = (props: any) => {
    if (props.percent >= 0.25) return <></>;
    const { points, stroke } = props;
    return (
      <polyline
        stroke={stroke || "#666"}
        fill="none"
        points={points.map((p: any) => `${p.x},${p.y}`).join(' ')}
      />
    );
  };

  const revenueData: RevenueStats | null = activeTab === 'revenue' ? statsData : null;
  const subscriptionData: SubscriptionStats | null = activeTab === 'subscription' ? statsData : null;
  const memberData: MemberStats | null = activeTab === 'member' ? statsData : null;
  const tenantData: TenantStats | null = activeTab === 'tenant' ? statsData : null;

  // 매출 탭 렌더링
  const renderRevenueTab = () => {
    if (!revenueData) return null;

    const trendData = revenueData.trend.labels.map((label, index) => ({
      name: label,
      순매출: revenueData.trend.revenue[index] - revenueData.trend.refunds[index],
    }));

    return (
      <div className="space-y-6">
        {/* 요약 카드 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <StatCard label="순매출" value={formatCurrency(revenueData.summary.periodRevenue - revenueData.summary.refundAmount)} />
          <StatCard label="결제 건수" value={revenueData.summary.completedCount} suffix="건" />
        </div>

        {/* 플랜별 / 상태별 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 플랜별 매출 (세로 막대 차트) */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <h3 className="text-lg font-semibold mb-4">플랜별 매출</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={revenueData.byPlan}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="planName" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${(v / 10000).toFixed(0)}만`} width={isMobile ? 30 : 60} />
                <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                <Bar dataKey="amount" name="매출" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={60} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* 결제 상태별 */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <h3 className="text-lg font-semibold mb-4">결제 상태별 현황</h3>
            <div className="space-y-4">
              {revenueData.byStatus.map((item, index) => {
                const total = revenueData.byStatus.reduce((sum, s) => sum + s.count, 0);
                const percentage = total > 0 ? (item.count / total) * 100 : 0;
                return (
                  <div key={item.status}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium">{item.statusName}</span>
                      <span className="text-gray-500">{item.count}건 ({formatCurrency(item.amount)})</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${percentage}%`, backgroundColor: COLORS[index % COLORS.length] }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* 매출 추이 차트 */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">매출 추이</h3>
            <select
              value={trendYear}
              onChange={(e) => setTrendYear(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-600"
            >
              {getYearsFromLabels(revenueData.trend.labels).map(y => (
                <option key={y} value={y}>{y}년</option>
              ))}
            </select>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={filterTrendByYear(trendData, trendYear)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${(v / 10000).toFixed(0)}만`} width={isMobile ? 30 : 60} />
              <Tooltip formatter={(value) => formatCurrency(Number(value))} />
              <Line type="linear" dataKey="순매출" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* 매출 상세 테이블 */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h3 className="text-lg font-semibold mb-4">매출 상세</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500">
                  <th className="text-center py-2 font-medium">기간</th>
                  <th className="text-center py-2 font-medium">매출</th>
                  <th className="text-center py-2 font-medium">환불</th>
                  <th className="text-center py-2 font-medium">순매출</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const yearMap = new Map<string, { revenue: number; refunds: number; months: { label: string; month: string; revenue: number; refunds: number }[] }>();
                  revenueData.trend.labels.forEach((label, i) => {
                    const year = label.split('.')[0];
                    const month = `${Number(label.split('.')[1])}월`;
                    if (!yearMap.has(year)) yearMap.set(year, { revenue: 0, refunds: 0, months: [] });
                    const entry = yearMap.get(year)!;
                    const rev = revenueData.trend.revenue[i] || 0;
                    const ref = revenueData.trend.refunds[i] || 0;
                    entry.revenue += rev;
                    entry.refunds += ref;
                    entry.months.push({ label, month, revenue: rev, refunds: ref });
                  });
                  const years = [...yearMap.entries()].sort((a, b) => b[0].localeCompare(a[0]));
                  return years.map(([year, data]) => (
                    <>
                      <tr key={year} className="bg-gray-50 font-semibold border-b border-gray-100">
                        <td className="text-center py-2.5">{year}년</td>
                        <td className="text-center py-2.5">{formatCurrency(data.revenue)}</td>
                        <td className="text-center py-2.5 text-red-500">{formatCurrency(data.refunds)}</td>
                        <td className="text-center py-2.5">{formatCurrency(data.revenue - data.refunds)}</td>
                      </tr>
                      {data.months.map(m => (
                        <tr key={m.label} className="border-b border-gray-50 text-gray-600">
                          <td className="text-center py-2">{m.month}</td>
                          <td className="text-center py-2">{formatCurrency(m.revenue)}</td>
                          <td className="text-center py-2 text-red-400">{m.refunds > 0 ? formatCurrency(m.refunds) : '-'}</td>
                          <td className="text-center py-2">{formatCurrency(m.revenue - m.refunds)}</td>
                        </tr>
                      ))}
                    </>
                  ));
                })()}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  // 구독 탭 렌더링
  const renderSubscriptionTab = () => {
    if (!subscriptionData) return null;

    const trendData = subscriptionData.trend.labels.map((label, index) => ({
      name: label,
      활성: subscriptionData.trend.activeCount[index],
      신규: subscriptionData.trend.newSubscriptions[index],
      해지: subscriptionData.trend.cancellations[index],
    }));

    return (
      <div className="space-y-6">
        {/* 요약 카드 */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard label="구독중" value={subscriptionData.summary.active} suffix="건" />
          <StatCard label="체험중" value={subscriptionData.summary.trial} suffix="건" />
          <StatCard label="첫 구독" value={subscriptionData.summary.firstSubscription} suffix="건" />
        </div>

        {/* 플랜별 / 상태별 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 플랜별 구독 */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <h3 className="text-lg font-semibold mb-4">플랜별 분포</h3>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={subscriptionData.byPlan}
                  dataKey="count"
                  nameKey="planName"
                  cx="50%"
                  cy="50%"
                  innerRadius={isMobile ? 15 : 40}
                  outerRadius={isMobile ? 70 : 80}
                  label={renderSmartPieLabel}
                  labelLine={renderCustomLabelLine}
                >
                  {subscriptionData.byPlan.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-4 border-t border-gray-200">
              {subscriptionData.byPlan.map((item, index) => {
                const total = subscriptionData.byPlan.reduce((sum, s) => sum + s.count, 0);
                const percentage = total > 0 ? (item.count / total) * 100 : 0;
                return (
                  <div key={item.plan} className="flex items-center text-sm py-2.5 border-b border-gray-100">
                    <div className="flex items-center gap-2 w-1/3">
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                      <span className="font-medium">{item.planName}</span>
                    </div>
                    <span className="w-1/3 text-gray-600">{item.count}건</span>
                    <span className="w-1/3 text-gray-500">{percentage.toFixed(1)}%</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 상태별 구독 */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <h3 className="text-lg font-semibold mb-4">상태별 분포</h3>
            <div className="space-y-4">
              {subscriptionData.byStatus.map((item, index) => {
                const total = subscriptionData.byStatus.reduce((sum, s) => sum + s.count, 0);
                const percentage = total > 0 ? (item.count / total) * 100 : 0;
                return (
                  <div key={item.status}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium">{item.statusName}</span>
                      <span className="text-gray-500">{item.count}건 ({percentage.toFixed(1)}%)</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${percentage}%`, backgroundColor: COLORS[index % COLORS.length] }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* 구독 추이 차트 */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-semibold">구독 추이</h3>
            <select
              value={trendYear}
              onChange={(e) => setTrendYear(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-600"
            >
              {getYearsFromLabels(subscriptionData.trend.labels).map(y => (
                <option key={y} value={y}>{y}년</option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm text-gray-400 mb-4">
            <span><span className="inline-block w-3 h-3 rounded-sm bg-blue-500 opacity-70 align-middle mr-1" />활성: 월말 기준 구독 수</span>
            <span><span className="inline-block w-3 h-0.5 bg-emerald-500 align-middle mr-1" />신규: 월별 신규 구독</span>
            <span><span className="inline-block w-3 h-0.5 bg-red-500 align-middle mr-1" />해지: 월별 해지 구독</span>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={filterTrendByYear(trendData, trendYear)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} width={isMobile ? 30 : 60} />
              <Tooltip />
              <Bar dataKey="활성" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={60} opacity={0.7} />
              <Line type="linear" dataKey="신규" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} />
              <Line type="linear" dataKey="해지" stroke="#ef4444" strokeWidth={2} dot={{ r: 4 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  };

  // 회원 탭 렌더링
  const renderMemberTab = () => {
    if (!memberData) return null;

    const trendData = memberData.trend.labels.map((label, index) => ({
      name: label,
      전체: memberData.trend.totalCount?.[index] ?? 0,
      신규: memberData.trend.signups[index],
    }));

    return (
      <div className="space-y-6">
        {/* 요약 카드 */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard label="전체 회원" value={memberData.summary.total} suffix="명" />
          <StatCard label="구독 회원" value={memberData.summary.subscribingMembers} suffix="명" />
          <StatCard label="신규 가입" value={memberData.summary.newSignups} suffix="명" />
        </div>

        {/* 그룹별 / 구독별 분포 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <h3 className="text-lg font-semibold mb-4">그룹별 분포</h3>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie
                  data={memberData.byGroup.map(g => ({ name: g.groupName, value: g.count }))}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={isMobile ? 15 : 40}
                  outerRadius={isMobile ? 70 : 70}
                  label={renderSmartPieLabel}
                  labelLine={renderCustomLabelLine}
                >
                  {memberData.byGroup.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-4 border-t border-gray-200">
              {memberData.byGroup.map((item, index) => {
                const total = memberData.byGroup.reduce((sum, g) => sum + g.count, 0);
                const percentage = total > 0 ? (item.count / total) * 100 : 0;
                return (
                  <div key={item.group} className="flex items-center text-sm py-2.5 border-b border-gray-100">
                    <div className="flex items-center gap-2 w-1/3">
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                      <span className="font-medium">{item.groupName}</span>
                    </div>
                    <span className="w-1/3 text-gray-600">{item.count}명</span>
                    <span className="w-1/3 text-gray-500">{percentage.toFixed(1)}%</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <h3 className="text-lg font-semibold mb-4">구독별 분포</h3>
            {(() => {
              const subscribing = memberData.summary.subscribingMembers;
              const nonSubscribing = memberData.summary.total - subscribing;
              const subPct = memberData.summary.total > 0 ? (subscribing / memberData.summary.total) * 100 : 0;
              const nonPct = memberData.summary.total > 0 ? (nonSubscribing / memberData.summary.total) * 100 : 0;
              return (
                <div className="space-y-6">
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie
                        data={[
                          { name: '구독', value: subscribing },
                          { name: '미구독', value: nonSubscribing },
                        ]}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={isMobile ? 15 : 40}
                        outerRadius={isMobile ? 70 : 70}
                        label={renderSmartPieLabel}
                        labelLine={renderCustomLabelLine}
                      >
                        <Cell fill="#3b82f6" />
                        <Cell fill="#94a3b8" />
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="border-t border-gray-200">
                    <div className="flex items-center text-sm py-2.5 border-b border-gray-100">
                      <div className="flex items-center gap-2 w-1/3">
                        <div className="w-3 h-3 rounded-full bg-blue-500" />
                        <span className="font-medium">구독</span>
                      </div>
                      <span className="w-1/3 text-gray-600">{subscribing}명</span>
                      <span className="w-1/3 text-gray-500">{subPct.toFixed(1)}%</span>
                    </div>
                    <div className="flex items-center text-sm py-2.5 border-b border-gray-100">
                      <div className="flex items-center gap-2 w-1/3">
                        <div className="w-3 h-3 rounded-full bg-slate-400" />
                        <span className="font-medium">미구독</span>
                      </div>
                      <span className="w-1/3 text-gray-600">{nonSubscribing}명</span>
                      <span className="w-1/3 text-gray-500">{nonPct.toFixed(1)}%</span>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>

        {/* 회원수 추이 차트 */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-semibold">회원수 추이</h3>
            <select
              value={trendYear}
              onChange={(e) => setTrendYear(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-600"
            >
              {getYearsFromLabels(memberData.trend.labels).map(y => (
                <option key={y} value={y}>{y}년</option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm text-gray-400 mb-4">
            <span><span className="inline-block w-3 h-3 rounded-sm bg-blue-500 opacity-70 align-middle mr-1" />전체: 월말 기준 누적 회원 수</span>
            <span><span className="inline-block w-3 h-0.5 bg-emerald-500 align-middle mr-1" />신규: 월별 신규 가입</span>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={filterTrendByYear(trendData, trendYear)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} width={isMobile ? 30 : 60} />
              <Tooltip />
              <Bar dataKey="전체" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={60} opacity={0.7} />
              <Line type="linear" dataKey="신규" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  };

  // 매장 탭 렌더링
  const renderTenantTab = () => {
    if (!tenantData) return null;

    const trendData = tenantData.trend.labels.map((label, index) => ({
      name: label,
      전체: tenantData.trend.totalCount?.[index] ?? 0,
      구독: tenantData.trend.subscribingCount?.[index] ?? 0,
      신규: tenantData.trend.newTenants?.[index] ?? 0,
    }));

    return (
      <div className="space-y-6">
        {/* 요약 카드 */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard label="전체 매장" value={tenantData.summary.total} suffix="개" />
          <StatCard label="구독 매장" value={tenantData.summary.subscribing} suffix="개" />
          <StatCard label="신규 매장" value={tenantData.summary.newTenants} suffix="개" />
        </div>

        {/* 플랜별 / 업종별 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 플랜별 분포 */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <h3 className="text-lg font-semibold mb-4">플랜별 분포</h3>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={tenantData.byPlan}
                  dataKey="count"
                  nameKey="planName"
                  cx="50%"
                  cy="50%"
                  innerRadius={isMobile ? 15 : 40}
                  outerRadius={isMobile ? 70 : 80}
                  label={renderSmartPieLabel}
                  labelLine={renderCustomLabelLine}
                >
                  {tenantData.byPlan.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-4 space-y-2">
              {tenantData.byPlan.map((item, index) => (
                <div key={item.plan} className="flex justify-between items-center text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                    <span>{item.planName}</span>
                  </div>
                  <span className="text-gray-500">{item.count}개</span>
                </div>
              ))}
            </div>
          </div>

          {/* 업종별 분포 */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <h3 className="text-lg font-semibold mb-4">업종별 분포</h3>
            <div className="space-y-4">
              {tenantData.byIndustry.map((item, index) => {
                const total = tenantData.byIndustry.reduce((sum, i) => sum + i.count, 0);
                const percentage = total > 0 ? (item.count / total) * 100 : 0;
                return (
                  <div key={item.industry}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium">{item.industry}</span>
                      <span className="text-gray-500">{item.count}개 ({percentage.toFixed(1)}%)</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${percentage}%`, backgroundColor: COLORS[index % COLORS.length] }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* 매장 추이 차트 */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-semibold">매장 추이</h3>
            <select
              value={trendYear}
              onChange={(e) => setTrendYear(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-600"
            >
              {getYearsFromLabels(tenantData.trend.labels).map(y => (
                <option key={y} value={y}>{y}년</option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm text-gray-400 mb-4">
            <span><span className="inline-block w-3 h-3 rounded-sm bg-blue-500 opacity-70 align-middle mr-1" />전체: 월말 기준 누적 매장 수</span>
            <span><span className="inline-block w-3 h-0.5 bg-emerald-500 align-middle mr-1" />구독: 구독중 매장 수</span>
            <span><span className="inline-block w-3 h-0.5 bg-amber-500 align-middle mr-1 border-t border-dashed border-amber-500" />신규: 월별 신규 등록</span>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={filterTrendByYear(trendData, trendYear)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} width={isMobile ? 30 : 60} />
              <Tooltip />
              <Bar dataKey="전체" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={60} opacity={0.7} />
              <Line type="linear" dataKey="구독" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} />
              <Line type="linear" dataKey="신규" stroke="#f59e0b" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 4 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  };

  // CS 탭 렌더링
  const renderCSTab = () => {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center text-gray-400">
          <ChatBubble className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>준비중입니다</p>
        </div>
      </div>
    );
  };

  const renderTabContent = () => {
    if (loading && activeTab !== 'cs') {
      return (
        <div className="flex items-center justify-center py-20">
          <Spinner size="md" />
        </div>
      );
    }

    switch (activeTab) {
      case 'revenue':
        return renderRevenueTab();
      case 'subscription':
        return renderSubscriptionTab();
      case 'member':
        return renderMemberTab();
      case 'tenant':
        return renderTenantTab();
      case 'cs':
        return renderCSTab();
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* 헤더 + 기간 필터 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <StatsUpSquare className="w-8 h-8 text-blue-600 shrink-0" />
          <h1 className="text-2xl font-bold text-gray-900">통계</h1>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <select
            value={period}
            onChange={(e) => {
              setPeriod(e.target.value as PeriodType);
              if (e.target.value !== 'custom') {
                setStartDate('');
                setEndDate('');
              }
            }}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-full sm:w-auto"
          >
            {periods.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          {period === 'custom' && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-gray-400">~</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={mutateStats}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
              >
                조회
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 탭 네비게이션 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="flex border-b border-gray-100 overflow-x-auto overflow-y-hidden scrollbar-hide touch-pan-x">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`flex items-center gap-2 px-4 sm:px-6 py-4 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap flex-none ${activeTab === tab.id
                  ? 'text-blue-600 border-blue-600'
                  : 'text-gray-500 border-transparent hover:text-gray-700'
                  }`}
              >
                <Icon className="w-5 h-5" />
                {tab.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* 탭 콘텐츠 */}
      {renderTabContent()}
    </div>
  );
}
