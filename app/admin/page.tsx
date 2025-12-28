'use client';

import { useState, useEffect } from 'react';
import { Group, Cart, CreditCard, GraphUp, RefreshDouble } from 'iconoir-react';

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

function StatCard({
  title,
  value,
  icon: Icon,
  color,
  suffix = '',
}: {
  title: string;
  value: number | string;
  icon: React.ElementType;
  color: string;
  suffix?: string;
}) {
  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500 mb-1">{title}</p>
          <p className="text-2xl font-bold text-gray-900">
            {typeof value === 'number' ? value.toLocaleString() : value}
            {suffix && <span className="text-lg font-normal text-gray-500">{suffix}</span>}
          </p>
        </div>
        <div className={`w-12 h-12 ${color} rounded-lg flex items-center justify-center`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
      </div>
    </div>
  );
}

function getPlanName(plan: string) {
  const names: Record<string, string> = {
    trial: 'Trial',
    basic: 'Basic',
    business: 'Business',
    enterprise: 'Enterprise',
  };
  return names[plan] || plan || '-';
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleDateString('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentPayments, setRecentPayments] = useState<RecentPayment[]>([]);
  const [recentSignups, setRecentSignups] = useState<RecentSignup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboardData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/dashboard/stats');
      if (!response.ok) {
        throw new Error('데이터를 불러오는데 실패했습니다.');
      }
      const data = await response.json();
      setStats(data.stats);
      setRecentPayments(data.recentPayments || []);
      setRecentSignups(data.recentSignups || []);
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

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">대시보드</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-1/2 mb-4"></div>
              <div className="h-8 bg-gray-200 rounded w-3/4"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">대시보드</h1>
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={fetchDashboardData}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            다시 시도
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">대시보드</h1>
          <button
            onClick={fetchDashboardData}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            title="새로고침"
          >
            <RefreshDouble className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <p className="text-sm text-gray-500">
          마지막 업데이트: {new Date().toLocaleString('ko-KR')}
        </p>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="전체 회원"
          value={stats?.totalMembers || 0}
          icon={Group}
          color="bg-blue-500"
          suffix="명"
        />
        <StatCard
          title="활성 구독"
          value={stats?.activeSubscriptions || 0}
          icon={Cart}
          color="bg-green-500"
          suffix="건"
        />
        <StatCard
          title="이번 달 매출"
          value={stats?.monthlyRevenue || 0}
          icon={CreditCard}
          color="bg-purple-500"
          suffix="원"
        />
        <StatCard
          title="신규 가입 (이번 달)"
          value={stats?.newSignups || 0}
          icon={GraphUp}
          color="bg-orange-500"
          suffix="명"
        />
      </div>

      {/* 최근 결제 / 최근 가입 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 최근 결제 */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">최근 결제</h2>
          {recentPayments.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-4">최근 결제 내역이 없습니다.</p>
          ) : (
            <div className="space-y-3">
              {recentPayments.map((payment) => (
                <div
                  key={payment.id}
                  className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {payment.memberInfo?.ownerName && payment.memberInfo?.businessName
                        ? `${payment.memberInfo.ownerName}/${payment.memberInfo.businessName}`
                        : payment.memberInfo?.ownerName || payment.memberInfo?.businessName || payment.email || '-'}
                    </p>
                    <p className="text-xs text-gray-500">
                      {getPlanName(payment.plan)} · {formatDate(payment.createdAt)}
                    </p>
                  </div>
                  <div className="text-right ml-4">
                    <p className="text-sm font-semibold text-gray-900">
                      {payment.amount.toLocaleString()}원
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 최근 가입 */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">최근 가입</h2>
          {recentSignups.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-4">최근 가입 내역이 없습니다.</p>
          ) : (
            <div className="space-y-3">
              {recentSignups.map((signup) => (
                <div
                  key={signup.id}
                  className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {signup.ownerName && signup.businessName
                        ? `${signup.ownerName}/${signup.businessName}`
                        : signup.ownerName || signup.businessName || '-'}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {signup.email || '-'}
                    </p>
                  </div>
                  <div className="text-right ml-4">
                    <p className="text-xs text-gray-500">
                      {formatDate(signup.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
