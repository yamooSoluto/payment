'use client';

import { useMemo } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import Image from 'next/image';

// --- TYPE DEFINITIONS ---
interface DashboardStats {
  totalMembers: number;
  activeSubscriptions: number;
  monthlyRevenue: number;
  newSignups: number;
  newTenants?: number;
  totalTenants?: number;
}

interface RecentPayment {
  id: string;
  email: string;
  amount: number;
  plan: string;
  status: string;
  createdAt: string | null;
  memberInfo: { businessName: string; ownerName: string } | null;
}

interface RecentSignup {
  id: string;
  email: string;
  businessName: string;
  ownerName: string;
  createdAt: string | null;
}

type ActivityItem = (RecentPayment & { type: 'payment' }) | (RecentSignup & { type: 'signup' });

interface DashboardTrend {
  months: string[];
  revenue: number[];
  signups: number[];
}

const numberFormatter = new Intl.NumberFormat('ko-KR');

const formatNumber = (value: number) => numberFormatter.format(value);
const formatCurrency = (value: number) => `₩${numberFormatter.format(value)}`;

// --- HELPER FUNCTIONS ---
function getRecentMonthLabels(): string[] {
  const now = new Date();
  return [2, 1, 0].map((offset) => {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    return `${date.getMonth() + 1}월`;
  });
}

function timeAgo(dateString: string | null): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
  let interval = seconds / 31536000;
  if (interval > 1) return Math.floor(interval) + '년 전';
  interval = seconds / 2592000;
  if (interval > 1) return Math.floor(interval) + '달 전';
  interval = seconds / 86400;
  if (interval > 1) return Math.floor(interval) + '일 전';
  interval = seconds / 3600;
  if (interval > 1) return Math.floor(interval) + '시간 전';
  interval = seconds / 60;
  if (interval > 1) return Math.floor(interval) + '분 전';
  return '방금 전';
}

const MetricRing = ({
  label,
  value,
  progress,
  caption,
  tone,
}: {
  label: string;
  value: string;
  progress: number;
  caption: string;
  tone: string;
}) => {
  const clamped = Math.min(Math.max(progress, 0), 1);
  const degrees = Math.round(clamped * 360);

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <div className="mt-4 flex items-center gap-4">
        <div className="relative h-16 w-16 flex-shrink-0">
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: `conic-gradient(${tone} 0deg ${degrees}deg, rgba(0,0,0,0.06) ${degrees}deg 360deg)`,
            }}
          />
          <div className="absolute inset-2 rounded-full border border-slate-200 bg-white" />
          <div className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-slate-900">
            {Math.round(clamped * 100)}%
          </div>
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-slate-900">{value}</p>
          <p className="text-xs text-slate-500">{caption}</p>
        </div>
      </div>
    </div>
  );
};

const TrendCard = ({
  label,
  value,
  description,
  months,
  values,
  tone,
}: {
  label: string;
  value: string;
  description: string;
  months: string[];
  values: number[];
  tone: string;
}) => {
  const safeValues = values.length ? values : [0, 0, 0];
  const maxValue = Math.max(...safeValues, 1);
  const minValue = Math.min(...safeValues, 0);
  const range = maxValue - minValue || 1;
  const width = 140;
  const height = 44;

  const pointCoords = safeValues.map((point, index) => {
    const x = (index / Math.max(safeValues.length - 1, 1)) * width;
    const y = height - ((point - minValue) / range) * height;
    return { x, y };
  });
  const points = pointCoords.map(({ x, y }) => `${x},${y}`);
  const lastPoint = pointCoords[pointCoords.length - 1] || { x: width, y: height };

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md">
      <div className="grid grid-cols-[1fr_auto] items-start gap-3">
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</p>
          <p className="text-2xl font-semibold text-slate-900">{value}</p>
          <p className="text-xs text-slate-500">{description}</p>
        </div>
        <div className="flex flex-col items-end pt-1">
          <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block">
            <polyline
              points={points.join(' ')}
              fill="none"
              stroke={tone}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx={lastPoint.x} cy={lastPoint.y} r="3" fill={tone} />
          </svg>
          <div
            className="mt-2 flex items-center justify-between text-[10px] text-slate-400"
            style={{ width }}
          >
            {months.map((month) => (
              <span key={month} className="text-center">
                {month}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// --- MAIN DASHBOARD COMPONENT ---
export default function AdminDashboard() {
  const { data, isLoading: loading, error, mutate } = useSWR('/api/admin/dashboard/stats');

  const stats: DashboardStats | null = data?.stats || null;
  const trend: DashboardTrend | null = data?.trend || null;

  const activityFeed = useMemo<ActivityItem[]>(() => {
    if (!data) return [];
    const payments: ActivityItem[] = (data.recentPayments || []).map((p: RecentPayment) => ({ ...p, type: 'payment' as const }));
    const signups: ActivityItem[] = (data.recentSignups || []).map((s: RecentSignup) => ({ ...s, type: 'signup' as const }));
    return [...payments, ...signups]
      .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime())
      .slice(0, 10);
  }, [data]);

  if (loading) return <DashboardSkeleton />;
  if (error) return <ErrorState onRetry={() => mutate()} message={error instanceof Error ? error.message : '알 수 없는 오류'} />;

  const totalMembers = stats?.totalMembers || 0;
  const activeSubscriptions = stats?.activeSubscriptions || 0;
  const monthlyRevenue = stats?.monthlyRevenue || 0;
  const newSignups = stats?.newSignups || 0;
  const newTenants = stats?.newTenants || 0; // 추가
  const totalTenants = stats?.totalTenants || 0; // 추가
  const activeRate = totalTenants > 0 ? Math.round((activeSubscriptions / totalTenants) * 100) : 0;
  const trendMonths = trend?.months?.length === 3 ? trend.months : getRecentMonthLabels();
  const revenueTrend = trend?.revenue?.length === 3 ? trend.revenue : [monthlyRevenue, monthlyRevenue, monthlyRevenue];
  const memberTrend = trend?.signups?.length === 3 ? trend.signups : [newSignups, newSignups, newSignups];

  return (
    <div className="relative space-y-8 overflow-hidden">
      <div className="pointer-events-none absolute -right-10 -top-20 h-52 w-52 rounded-full bg-yamoo-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute left-10 top-48 h-64 w-64 rounded-full bg-[#ff5e9a]/10 blur-3xl" />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_360px] xl:grid-rows-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="order-3 overflow-hidden rounded-[28px] border border-white/20 bg-white/70 shadow-[0_8px_32px_rgba(0,0,0,0.08)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_12px_40px_rgba(0,0,0,0.12)] xl:order-2 xl:row-span-2 xl:h-full">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 py-5">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">최근 현황</h2>
            </div>
            <span className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
              {activityFeed.length}건
            </span>
          </header>
          {activityFeed.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-slate-500">
              아직 기록된 활동이 없습니다. 새 결제나 가입이 발생하면 바로 반영됩니다.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {activityFeed.map((item) => {
                const isPayment = item.type === 'payment';
                const displayName = isPayment
                  ? item.memberInfo?.businessName || '매장'
                  : item.businessName || item.ownerName || '회원';
                const actionText = isPayment ? '결제 완료' : '신규 가입';

                return (
                  <li key={`${item.id}-${item.type}`} className="relative px-6 py-4">
                    <span
                      className={`absolute left-0 top-0 h-full w-1 ${isPayment ? 'bg-yamoo-primary' : 'bg-[#2fadff]'
                        }`}
                    />
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-slate-900">
                          <span className="font-bold">{displayName}</span>
                          <span className="text-slate-400 mx-1">-</span>
                          {actionText}
                        </p>
                        {isPayment && (
                          <p className="text-xs text-slate-500">{formatCurrency(item.amount)} · {item.plan || 'basic'}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-400">
                        <span className="rounded-full border border-slate-300 px-2 py-1 text-[10px] font-semibold text-slate-600">
                          {isPayment ? '결제' : '가입'}
                        </span>
                        <span>{timeAgo(item.createdAt)}</span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="order-1 relative overflow-hidden rounded-[28px] border border-white/20 bg-white/70 shadow-[0_8px_32px_rgba(0,0,0,0.08)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_12px_40px_rgba(0,0,0,0.12)] xl:order-1 xl:row-span-2 xl:h-full">
          <div className="relative flex h-full flex-col gap-6 px-6 py-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Image src="/yamoo_favi.png" alt="YAMOO Icon" width={32} height={32} />
                <Image src="/yamoo_black_1.png" alt="YAMOO" width={96} height={30} />
              </div>
              <button
                onClick={() => mutate()}
                className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-yamoo-primary hover:text-yamoo-primary"
              >
                새로고침
              </button>
            </div>
            <div className="space-y-4">
              <TrendCard
                label="매출"
                value={formatCurrency(monthlyRevenue)}
                description="이번 달 누적"
                months={trendMonths}
                values={revenueTrend}
                tone="#ffbf03"
              />
              <TrendCard
                label="회원"
                value={`${formatNumber(newSignups)}명`}
                description="이번 달 신규"
                months={trendMonths}
                values={memberTrend}
                tone="#2fadff"
              />
              <MetricRing
                label="구독율"
                value={`${activeRate}%`}
                progress={activeRate / 100}
                caption="목표 100%"
                tone="#ff5e9a"
              />
            </div>
          </div>
        </section>

        <section className="order-2 rounded-[28px] border border-white/20 bg-white/70 px-6 py-6 shadow-[0_8px_32px_rgba(0,0,0,0.08)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_12px_40px_rgba(0,0,0,0.12)] xl:order-3 xl:h-full">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">구독 상태</h2>
            </div>
            <span className="rounded-full bg-yamoo-primary px-3 py-1 text-xs font-semibold text-gray-900">
              {activeRate}%
            </span>
          </div>
          <div className="mt-6 space-y-5">
            <div>
              <div className="flex items-center justify-between text-sm text-slate-700">
                <span>구독중 매장수</span>
                <span className="text-base font-semibold text-slate-900">{formatNumber(activeSubscriptions)}개 / {formatNumber(totalTenants)}개</span>
              </div>
              <div className="mt-3 h-2 rounded-full bg-slate-100">
                <div
                  className="h-2 rounded-full bg-yamoo-primary"
                  style={{ width: `${Math.min(activeRate, 100)}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-slate-500">전체 매장 중 구독중인 매장수</p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-2xl border border-slate-100 bg-[#fff9e5] px-4 py-3">
                <p className="text-slate-500">신규 가입</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{formatNumber(newSignups)}명</p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-[#fff9e5] px-4 py-3">
                <p className="text-slate-500">전체 회원수</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{formatNumber(totalMembers)}명</p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-[#e5f0ff] px-4 py-3">
                <p className="text-slate-500">신규 매장</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{formatNumber(newTenants)}개</p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-[#e5f0ff] px-4 py-3">
                <p className="text-slate-500">전체 매장수</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{formatNumber(totalTenants)}개</p>
              </div>
            </div>
          </div>
        </section>

        <section className="order-4 rounded-[28px] border border-white/20 bg-white/70 px-6 py-6 shadow-[0_8px_32px_rgba(0,0,0,0.08)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_12px_40px_rgba(0,0,0,0.12)] xl:order-4 xl:h-full">
          <h2 className="text-lg font-semibold text-slate-900">바로가기</h2>
          <div className="mt-5 space-y-4 text-sm">
            <Link
              href="/admin/members"
              className="group flex items-start gap-4 border-b border-slate-100 pb-4 transition hover:text-yamoo-primary"
            >
              <span className="text-xs font-semibold text-yamoo-primary">01</span>
              <div className="flex-1">
                <p className="font-semibold text-slate-900">회원</p>
                <p className="text-xs text-slate-500">회원 추가, 수정, 삭제</p>
              </div>
              <span className="text-xs uppercase tracking-[0.2em] text-slate-400">이동</span>
            </Link>
            <Link
              href="/admin/tenants"
              className="group flex items-start gap-4 border-b border-slate-100 pb-4 transition hover:text-yamoo-primary"
            >
              <span className="text-xs font-semibold text-yamoo-primary">02</span>
              <div className="flex-1">
                <p className="font-semibold text-slate-900">매장 관리</p>
                <p className="text-xs text-slate-500">매장 추가, 수정, 삭제</p>
              </div>
              <span className="text-xs uppercase tracking-[0.2em] text-slate-400">이동</span>
            </Link>
            <Link
              href="/admin/orders"
              className="group flex items-start gap-4 border-b border-slate-100 pb-4 transition hover:text-yamoo-primary"
            >
              <span className="text-xs font-semibold text-yamoo-primary">03</span>
              <div className="flex-1">
                <p className="font-semibold text-slate-900">결제 관리</p>
                <p className="text-xs text-slate-500">상세 내역, 환불</p>
              </div>
              <span className="text-xs uppercase tracking-[0.2em] text-slate-400">이동</span>
            </Link>
            <Link
              href="/admin/subscriptions"
              className="group flex items-start gap-4 pb-2 transition hover:text-yamoo-primary"
            >
              <span className="text-xs font-semibold text-yamoo-primary">04</span>
              <div className="flex-1">
                <p className="font-semibold text-slate-900">구독 관리</p>
                <p className="text-xs text-slate-500">구독하기, 수정, 해지</p>
              </div>
              <span className="text-xs uppercase tracking-[0.2em] text-slate-400">이동</span>
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}

// --- SKELETON & ERROR COMPONENTS ---
const DashboardSkeleton = () => (
  <div className="space-y-8 animate-pulse">
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_360px] xl:grid-rows-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="h-[560px] rounded-[28px] border border-slate-200 bg-white xl:row-span-2" />
      <div className="h-[560px] rounded-[28px] border border-slate-200 bg-white xl:row-span-2" />
      <div className="h-60 rounded-[28px] border border-slate-200 bg-white" />
      <div className="h-60 rounded-[28px] border border-slate-200 bg-white" />
    </div>
  </div>
);

const ErrorState = ({ onRetry, message }: { onRetry: () => void; message: string }) => (
  <div className="py-12 text-center">
    <div className="mx-auto max-w-md space-y-4 rounded-[28px] border border-red-200 bg-red-50 p-8 shadow-sm">
      <h1 className="text-xl font-bold text-red-800">대시보드를 불러오지 못했습니다</h1>
      <p className="text-sm text-red-700">{message}</p>
      <button
        onClick={onRetry}
        className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
      >
        다시 시도
      </button>
    </div>
  </div>
);
