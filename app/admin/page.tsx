'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';

// --- TYPE DEFINITIONS ---
interface DashboardStats {
  totalMembers: number;
  activeSubscriptions: number;
  monthlyRevenue: number;
  newSignups: number;
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
    <div className="rounded-2xl border border-white/10 bg-black/30 px-4 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/60">{label}</p>
      <div className="mt-4 flex items-center gap-4">
        <div className="relative h-16 w-16 flex-shrink-0">
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: `conic-gradient(${tone} 0deg ${degrees}deg, rgba(255,255,255,0.12) ${degrees}deg 360deg)`,
            }}
          />
          <div className="absolute inset-2 rounded-full border border-white/10 bg-[#0b0b0b]" />
          <div className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-white">
            {Math.round(clamped * 100)}%
          </div>
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-white">{value}</p>
          <p className="text-xs text-white/60">{caption}</p>
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
    <div className="rounded-2xl border border-white/10 bg-black/30 px-4 py-4">
      <div className="grid grid-cols-[1fr_auto] items-start gap-3">
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/60">{label}</p>
          <p className="text-2xl font-semibold text-white">{value}</p>
          <p className="text-xs text-white/60">{description}</p>
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
            className="mt-2 flex items-center justify-between text-[10px] text-white/40"
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
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [trend, setTrend] = useState<DashboardTrend | null>(null);
  const [activityFeed, setActivityFeed] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboardData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/dashboard/stats');
      if (!response.ok) throw new Error('데이터를 불러오는데 실패했습니다.');

      const data = await response.json();
      setStats(data.stats);
      setTrend(data.trend || null);

      const payments: ActivityItem[] = (data.recentPayments || []).map((p: RecentPayment) => ({ ...p, type: 'payment' as const }));
      const signups: ActivityItem[] = (data.recentSignups || []).map((s: RecentSignup) => ({ ...s, type: 'signup' as const }));

      const combinedFeed = [...payments, ...signups]
        .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime())
        .slice(0, 10);

      setActivityFeed(combinedFeed);
    } catch (err) {
      console.error('Dashboard fetch error:', err);
      setError(err instanceof Error ? err.message : '알 수 없는 오류');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  if (loading) return <DashboardSkeleton />;
  if (error) return <ErrorState onRetry={fetchDashboardData} message={error} />;

  const totalMembers = stats?.totalMembers || 0;
  const activeSubscriptions = stats?.activeSubscriptions || 0;
  const monthlyRevenue = stats?.monthlyRevenue || 0;
  const newSignups = stats?.newSignups || 0;
  const activeRate = totalMembers > 0 ? Math.round((activeSubscriptions / totalMembers) * 100) : 0;
  const trendMonths = trend?.months?.length === 3 ? trend.months : getRecentMonthLabels();
  const revenueTrend = trend?.revenue?.length === 3 ? trend.revenue : [monthlyRevenue, monthlyRevenue, monthlyRevenue];
  const memberTrend = trend?.signups?.length === 3 ? trend.signups : [newSignups, newSignups, newSignups];

  return (
    <div className="relative space-y-8">
      <div className="pointer-events-none absolute -right-10 -top-20 h-52 w-52 rounded-full bg-yamoo-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute left-10 top-48 h-64 w-64 rounded-full bg-[#ff5e9a]/10 blur-3xl" />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_360px] xl:grid-rows-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm xl:order-2 xl:row-span-2 xl:h-full">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 py-5">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">활동 흐름</h2>
              <p className="text-sm text-slate-500">결제와 신규 가입 흐름을 실시간으로 추적합니다.</p>
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
                  ? item.memberInfo?.businessName || '회원사'
                  : item.businessName || '신규 회원사';
                const title = isPayment ? `${displayName} 결제 완료` : `${displayName} 신규 가입`;
                const detail = isPayment ? `${formatCurrency(item.amount)} 결제` : '신규 가입';

                return (
                  <li key={`${item.id}-${item.type}`} className="relative px-6 py-4">
                    <span
                      className={`absolute left-0 top-0 h-full w-1 ${
                        isPayment ? 'bg-yamoo-primary' : 'bg-[#2fadff]'
                      }`}
                    />
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-slate-900">{title}</p>
                        <p className="text-xs text-slate-500">{detail}</p>
                        {isPayment && item.plan && (
                          <p className="text-xs text-slate-500">플랜 {item.plan}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-400">
                        <span className="rounded-full border border-slate-200 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.2em]">
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

        <section className="relative overflow-hidden rounded-[28px] border border-black bg-[#0b0b0b] text-white shadow-[0_18px_40px_rgba(0,0,0,0.25)] xl:order-1 xl:row-span-2 xl:h-full">
          <div
            className="absolute inset-0 opacity-50"
            style={{
              background:
                'linear-gradient(120deg, rgba(255,191,3,0.3) 0%, rgba(255,94,154,0.18) 45%, rgba(0,0,0,0) 80%)',
            }}
          />
          <div className="relative flex h-full flex-col gap-6 px-6 py-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Image src="/yamoo_white_cut.png" alt="YAMOO" width={96} height={30} />
                <span className="text-xs font-semibold uppercase tracking-[0.3em] text-yamoo-primary">
                  요약
                </span>
              </div>
              <button
                onClick={fetchDashboardData}
                className="rounded-full border border-white/15 px-3 py-1 text-xs font-semibold text-white/80 transition hover:border-yamoo-primary hover:text-yamoo-primary"
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
                value={`${formatNumber(newSignups)}건`}
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

        <section className="rounded-[28px] border border-slate-200 bg-white px-6 py-6 shadow-sm xl:order-3 xl:h-full">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">구독 상태</h2>
            </div>
            <span className="rounded-full bg-yamoo-primary px-3 py-1 text-xs font-semibold text-gray-900">
              {activeRate}% 유지
            </span>
          </div>
          <div className="mt-6 space-y-5">
            <div>
              <div className="flex items-center justify-between text-sm text-slate-700">
                <span>활성 구독</span>
                <span className="text-base font-semibold text-slate-900">{formatNumber(activeSubscriptions)}건</span>
              </div>
              <div className="mt-3 h-2 rounded-full bg-slate-100">
                <div
                  className="h-2 rounded-full bg-yamoo-primary"
                  style={{ width: `${Math.min(activeRate, 100)}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-slate-500">전체 {formatNumber(totalMembers)}곳 중 활성 유지</p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-2xl border border-slate-100 bg-[#fff9e5] px-4 py-3">
                <p className="text-slate-500">신규 가입</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{formatNumber(newSignups)}건</p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                <p className="text-slate-500">파트너 규모</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{formatNumber(totalMembers)}곳</p>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-black bg-[#0b0b0b] px-6 py-6 text-white shadow-[0_18px_40px_rgba(0,0,0,0.25)] xl:order-4 xl:h-full">
          <h2 className="text-lg font-semibold">운영 바로가기</h2>
          <p className="mt-1 text-sm text-white/70">핵심 운영 액션을 빠르게 실행하세요.</p>
          <div className="mt-5 space-y-4 text-sm">
            <Link
              href="/admin/members/new"
              className="group flex items-start gap-4 border-b border-white/10 pb-4 transition hover:text-yamoo-primary"
            >
              <span className="text-xs font-semibold text-yamoo-primary">01</span>
              <div className="flex-1">
                <p className="font-semibold">새 회원 등록</p>
                <p className="text-xs text-white/60">파트너 정보를 입력하고 바로 온보딩합니다.</p>
              </div>
              <span className="text-xs uppercase tracking-[0.2em] text-white/50">이동</span>
            </Link>
            <Link
              href="/admin/notifications"
              className="group flex items-start gap-4 border-b border-white/10 pb-4 transition hover:text-yamoo-primary"
            >
              <span className="text-xs font-semibold text-yamoo-primary">02</span>
              <div className="flex-1">
                <p className="font-semibold">공지/안내 발송</p>
                <p className="text-xs text-white/60">공지 사항과 업데이트 안내를 전달합니다.</p>
              </div>
              <span className="text-xs uppercase tracking-[0.2em] text-white/50">발송</span>
            </Link>
            <Link
              href="/admin/plans"
              className="group flex items-start gap-4 border-b border-white/10 pb-4 transition hover:text-yamoo-primary"
            >
              <span className="text-xs font-semibold text-yamoo-primary">03</span>
              <div className="flex-1">
                <p className="font-semibold">요금제 구성</p>
                <p className="text-xs text-white/60">가격과 혜택을 전략적으로 조정합니다.</p>
              </div>
              <span className="text-xs uppercase tracking-[0.2em] text-white/50">설정</span>
            </Link>
            <Link
              href="/admin/settings"
              className="group flex items-start gap-4 pb-2 transition hover:text-yamoo-primary"
            >
              <span className="text-xs font-semibold text-yamoo-primary">04</span>
              <div className="flex-1">
                <p className="font-semibold">서비스 정책</p>
                <p className="text-xs text-white/60">권한, 결제, 운영 정책을 관리합니다.</p>
              </div>
              <span className="text-xs uppercase tracking-[0.2em] text-white/50">관리</span>
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
      <div className="h-[560px] rounded-[28px] border border-black bg-slate-900 xl:row-span-2" />
      <div className="h-60 rounded-[28px] border border-slate-200 bg-white" />
      <div className="h-60 rounded-[28px] border border-black bg-slate-900" />
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
