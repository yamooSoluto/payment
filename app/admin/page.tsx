'use client';

import { useState, useEffect } from 'react';
import { Users, ShoppingCart, CreditCard, TrendingUp } from 'lucide-react';

interface DashboardStats {
  totalMembers: number;
  activeSubscriptions: number;
  monthlyRevenue: number;
  newSignups: number;
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

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // TODO: API에서 실제 데이터 가져오기
    // 임시 데이터
    setTimeout(() => {
      setStats({
        totalMembers: 156,
        activeSubscriptions: 89,
        monthlyRevenue: 4521000,
        newSignups: 12,
      });
      setLoading(false);
    }, 500);
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">대시보드</h1>
        <p className="text-sm text-gray-500">
          마지막 업데이트: {new Date().toLocaleString('ko-KR')}
        </p>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="전체 회원"
          value={stats?.totalMembers || 0}
          icon={Users}
          color="bg-blue-500"
          suffix="명"
        />
        <StatCard
          title="활성 구독"
          value={stats?.activeSubscriptions || 0}
          icon={ShoppingCart}
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
          icon={TrendingUp}
          color="bg-orange-500"
          suffix="명"
        />
      </div>

      {/* 추가 섹션 (나중에 구현) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 최근 주문 */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">최근 주문</h2>
          <p className="text-gray-500 text-sm">구현 예정</p>
        </div>

        {/* 최근 가입 */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">최근 가입</h2>
          <p className="text-gray-500 text-sm">구현 예정</p>
        </div>
      </div>
    </div>
  );
}
