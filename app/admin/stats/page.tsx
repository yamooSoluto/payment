'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { StatsUpSquare, Calendar, CreditCards, Timer, Group, HomeSimpleDoor, ChatBubble } from 'iconoir-react';
import Spinner from '@/components/admin/Spinner';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
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
  };
  trend: {
    labels: string[];
    newSubscriptions: number[];
    cancellations: number[];
  };
  byPlan: { plan: string; planName: string; count: number }[];
  byStatus: { status: string; statusName: string; count: number }[];
}

// 회원 통계 타입
interface MemberStats {
  summary: {
    total: number;
    active: number;
    newSignups: number;
    withSubscription: number;
  };
  trend: {
    labels: string[];
    signups: number[];
  };
  byGroup: { group: string; groupName: string; count: number }[];
}

// 매장 통계 타입
interface TenantStats {
  summary: {
    total: number;
    active: number;
    trial: number;
    canceled: number;
    newTenants: number;
  };
  trend: {
    labels: string[];
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
  const [loading, setLoading] = useState(true);

  // 탭 변경 시 URL 업데이트
  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    const newParams = new URLSearchParams(searchParams.toString());
    newParams.set('tab', tab);
    router.replace(`?${newParams.toString()}`, { scroll: false });
  };

  // 각 탭별 데이터
  const [revenueData, setRevenueData] = useState<RevenueStats | null>(null);
  const [subscriptionData, setSubscriptionData] = useState<SubscriptionStats | null>(null);
  const [memberData, setMemberData] = useState<MemberStats | null>(null);
  const [tenantData, setTenantData] = useState<TenantStats | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ period });
      if (period === 'custom' && startDate && endDate) {
        params.set('startDate', startDate);
        params.set('endDate', endDate);
      }

      const endpoint = `/api/admin/stats/${activeTab === 'subscription' ? 'subscriptions' : activeTab === 'member' ? 'members' : activeTab === 'tenant' ? 'tenants' : 'revenue'}`;
      const response = await fetch(`${endpoint}?${params}`);

      if (response.ok) {
        const result = await response.json();
        switch (activeTab) {
          case 'revenue':
            setRevenueData(result);
            break;
          case 'subscription':
            setSubscriptionData(result);
            break;
          case 'member':
            setMemberData(result);
            break;
          case 'tenant':
            setTenantData(result);
            break;
        }
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    } finally {
      setLoading(false);
    }
  }, [activeTab, period, startDate, endDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 매출 탭 렌더링
  const renderRevenueTab = () => {
    if (!revenueData) return null;

    const trendData = revenueData.trend.labels.map((label, index) => ({
      name: label,
      매출: revenueData.trend.revenue[index],
      환불: revenueData.trend.refunds[index],
    }));

    return (
      <div className="space-y-6">
        {/* 요약 카드 */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard label="매출" value={formatCurrency(revenueData.summary.periodRevenue)} />
          <StatCard label="결제 건수" value={revenueData.summary.completedCount} suffix="건" />
          <StatCard label="환불액" value={formatCurrency(revenueData.summary.refundAmount)} />
        </div>

        {/* 플랜별 / 상태별 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 플랜별 매출 (세로 막대 차트) */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <h3 className="text-lg font-semibold mb-4">플랜별 매출</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={revenueData.byPlan} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis type="number" tick={{ fontSize: 12 }} tickFormatter={(v) => `${(v / 10000).toFixed(0)}만`} />
                <YAxis type="category" dataKey="planName" tick={{ fontSize: 12 }} width={80} />
                <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                <Bar dataKey="amount" fill="#3b82f6" radius={[0, 4, 4, 0]} />
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
          <h3 className="text-lg font-semibold mb-4">매출 추이</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${(v / 10000).toFixed(0)}만`} />
              <Tooltip formatter={(value) => formatCurrency(Number(value))} />
              <Legend />
              <Bar dataKey="매출" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="환불" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  };

  // 구독 탭 렌더링
  const renderSubscriptionTab = () => {
    if (!subscriptionData) return null;

    const trendData = subscriptionData.trend.labels.map((label, index) => ({
      name: label,
      신규: subscriptionData.trend.newSubscriptions[index],
      취소: subscriptionData.trend.cancellations[index],
    }));

    return (
      <div className="space-y-6">
        {/* 요약 카드 */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <StatCard label="전체 구독" value={subscriptionData.summary.total} suffix="건" />
          <StatCard label="활성 구독" value={subscriptionData.summary.active} suffix="건" />
          <StatCard label="체험중" value={subscriptionData.summary.trial} suffix="건" />
          <StatCard label="취소" value={subscriptionData.summary.canceled} suffix="건" />
          <StatCard label="만료" value={subscriptionData.summary.expired} suffix="건" />
          <StatCard label="MRR" value={formatCurrency(subscriptionData.summary.mrr)} />
        </div>

        {/* 구독 추이 차트 */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h3 className="text-lg font-semibold mb-4">구독 추이</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="신규" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} />
              <Line type="monotone" dataKey="취소" stroke="#ef4444" strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
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
                  outerRadius={80}
                  label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
                >
                  {subscriptionData.byPlan.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-4 space-y-2">
              {subscriptionData.byPlan.map((item, index) => (
                <div key={item.plan} className="flex justify-between items-center text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                    <span>{item.planName}</span>
                  </div>
                  <span className="text-gray-500">{item.count}건</span>
                </div>
              ))}
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
      </div>
    );
  };

  // 회원 탭 렌더링
  const renderMemberTab = () => {
    if (!memberData) return null;

    const trendData = memberData.trend.labels.map((label, index) => ({
      name: label,
      가입: memberData.trend.signups[index],
    }));

    return (
      <div className="space-y-6">
        {/* 요약 카드 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="전체 회원" value={memberData.summary.total} suffix="명" />
          <StatCard label="활성 회원" value={memberData.summary.active} suffix="명" />
          <StatCard label="신규 가입" value={memberData.summary.newSignups} suffix="명" />
          <StatCard label="구독 보유" value={memberData.summary.withSubscription} suffix="명" />
        </div>

        {/* 가입 추이 차트 */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h3 className="text-lg font-semibold mb-4">가입 추이</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="가입" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* 그룹별 분포 */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h3 className="text-lg font-semibold mb-4">그룹별 분포</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {memberData.byGroup.map((item, index) => {
              const total = memberData.byGroup.reduce((sum, g) => sum + g.count, 0);
              const percentage = total > 0 ? (item.count / total) * 100 : 0;
              return (
                <div key={item.group} className="text-center p-4 bg-gray-50 rounded-lg">
                  <div className="w-8 h-8 mx-auto mb-2 rounded-full flex items-center justify-center" style={{ backgroundColor: COLORS[index % COLORS.length] + '20' }}>
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                  </div>
                  <p className="text-xl font-bold text-gray-900">{item.count}명</p>
                  <p className="text-sm text-gray-500">{item.groupName}</p>
                  <p className="text-xs text-gray-400">{percentage.toFixed(1)}%</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  // 매장 탭 렌더링
  const renderTenantTab = () => {
    if (!tenantData) return null;

    const trendData = tenantData.trend.labels.map((label, index) => ({
      name: label,
      신규: tenantData.trend.newTenants[index],
    }));

    return (
      <div className="space-y-6">
        {/* 요약 카드 */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <StatCard label="전체 매장" value={tenantData.summary.total} suffix="개" />
          <StatCard label="활성 매장" value={tenantData.summary.active} suffix="개" />
          <StatCard label="체험중" value={tenantData.summary.trial} suffix="개" />
          <StatCard label="취소" value={tenantData.summary.canceled} suffix="개" />
          <StatCard label="신규 매장" value={tenantData.summary.newTenants} suffix="개" />
        </div>

        {/* 신규 매장 추이 차트 */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h3 className="text-lg font-semibold mb-4">신규 매장 추이</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="신규" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
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
                  outerRadius={80}
                  label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
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
                onClick={fetchData}
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
        <div className="flex border-b border-gray-100 overflow-x-auto scrollbar-hide">
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
