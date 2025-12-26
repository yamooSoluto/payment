'use client';

import { useState, useEffect, useCallback } from 'react';
import { BarChart3, Users, CreditCard, TrendingUp, Calendar, Loader2 } from 'lucide-react';

interface Summary {
  totalMembers: number;
  activeMembers: number;
  trialMembers: number;
  canceledMembers: number;
  newSignups: number;
  totalRevenue: number;
  periodRevenue: number;
}

interface DailyStat {
  date: string;
  signups: number;
  revenue: number;
}

interface StatsData {
  summary: Summary;
  dailyStats: DailyStat[];
  planDistribution: Record<string, number>;
  period: {
    start: string;
    end: string;
  };
}

export default function StatsPage() {
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('month');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ period });
      if (startDate && endDate) {
        params.set('startDate', startDate);
        params.set('endDate', endDate);
      }

      const response = await fetch(`/api/admin/stats?${params}`);
      if (response.ok) {
        const result = await response.json();
        setData(result);
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    } finally {
      setLoading(false);
    }
  }, [period, startDate, endDate]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const getPlanName = (planId: string) => {
    switch (planId) {
      case 'basic': return 'Basic';
      case 'business': return 'Business';
      case 'enterprise': return 'Enterprise';
      case 'unknown': return '미지정';
      default: return planId;
    }
  };

  const maxRevenue = data?.dailyStats.length
    ? Math.max(...data.dailyStats.map(d => d.revenue))
    : 0;

  const maxSignups = data?.dailyStats.length
    ? Math.max(...data.dailyStats.map(d => d.signups))
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BarChart3 className="w-8 h-8 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900">통계</h1>
        </div>
      </div>

      {/* 기간 필터 */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
        <div className="flex flex-col sm:flex-row gap-4 items-end">
          <div>
            <label className="block text-sm text-gray-500 mb-1">기간</label>
            <select
              value={period}
              onChange={(e) => {
                setPeriod(e.target.value);
                setStartDate('');
                setEndDate('');
              }}
              className="px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="week">최근 1주일</option>
              <option value="month">최근 1개월</option>
              <option value="year">최근 1년</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-gray-400" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-gray-400">~</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={fetchStats}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            조회
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
        </div>
      ) : data ? (
        <>
          {/* 요약 카드 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Users className="w-5 h-5 text-blue-600" />
                </div>
                <span className="text-sm text-gray-500">전체 회원</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">{data.summary.totalMembers}명</p>
            </div>

            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-green-100 rounded-lg">
                  <Users className="w-5 h-5 text-green-600" />
                </div>
                <span className="text-sm text-gray-500">활성 구독</span>
              </div>
              <p className="text-2xl font-bold text-green-600">{data.summary.activeMembers}명</p>
            </div>

            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-orange-100 rounded-lg">
                  <TrendingUp className="w-5 h-5 text-orange-600" />
                </div>
                <span className="text-sm text-gray-500">신규 가입</span>
              </div>
              <p className="text-2xl font-bold text-orange-600">{data.summary.newSignups}명</p>
            </div>

            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <CreditCard className="w-5 h-5 text-purple-600" />
                </div>
                <span className="text-sm text-gray-500">기간 매출</span>
              </div>
              <p className="text-2xl font-bold text-purple-600">
                {data.summary.periodRevenue.toLocaleString()}원
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* 매출 차트 */}
            <div className="lg:col-span-2 bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <h2 className="text-lg font-semibold mb-4">일별 매출</h2>
              <div className="h-64 flex items-end gap-1">
                {data.dailyStats.slice(-30).map((stat, index) => (
                  <div
                    key={stat.date}
                    className="flex-1 bg-blue-100 hover:bg-blue-200 transition-colors rounded-t relative group"
                    style={{
                      height: maxRevenue > 0 ? `${(stat.revenue / maxRevenue) * 100}%` : '0%',
                      minHeight: stat.revenue > 0 ? '4px' : '0',
                    }}
                  >
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 whitespace-nowrap z-10">
                      {new Date(stat.date).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
                      <br />
                      {stat.revenue.toLocaleString()}원
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-between mt-2 text-xs text-gray-400">
                <span>
                  {data.dailyStats.length > 0 &&
                    new Date(data.dailyStats[Math.max(0, data.dailyStats.length - 30)].date).toLocaleDateString('ko-KR')}
                </span>
                <span>
                  {data.dailyStats.length > 0 &&
                    new Date(data.dailyStats[data.dailyStats.length - 1].date).toLocaleDateString('ko-KR')}
                </span>
              </div>
            </div>

            {/* 플랜별 분포 */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <h2 className="text-lg font-semibold mb-4">플랜별 분포</h2>
              <div className="space-y-4">
                {Object.entries(data.planDistribution).map(([planId, count]) => {
                  const percentage = data.summary.totalMembers > 0
                    ? Math.round((count / data.summary.totalMembers) * 100)
                    : 0;
                  return (
                    <div key={planId}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-medium">{getPlanName(planId)}</span>
                        <span className="text-gray-500">{count}명 ({percentage}%)</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 가입 추이 */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <h2 className="text-lg font-semibold mb-4">일별 신규 가입</h2>
            <div className="h-40 flex items-end gap-1">
              {data.dailyStats.slice(-30).map((stat) => (
                <div
                  key={stat.date}
                  className="flex-1 bg-green-100 hover:bg-green-200 transition-colors rounded-t relative group"
                  style={{
                    height: maxSignups > 0 ? `${(stat.signups / maxSignups) * 100}%` : '0%',
                    minHeight: stat.signups > 0 ? '4px' : '0',
                  }}
                >
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 whitespace-nowrap z-10">
                    {new Date(stat.date).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
                    <br />
                    {stat.signups}명
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 회원 상태 분포 */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <h2 className="text-lg font-semibold mb-4">회원 상태</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <p className="text-2xl font-bold text-green-600">{data.summary.activeMembers}</p>
                <p className="text-sm text-gray-500">활성</p>
              </div>
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <p className="text-2xl font-bold text-blue-600">{data.summary.trialMembers}</p>
                <p className="text-sm text-gray-500">체험중</p>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <p className="text-2xl font-bold text-gray-600">{data.summary.canceledMembers}</p>
                <p className="text-sm text-gray-500">해지</p>
              </div>
              <div className="text-center p-4 bg-purple-50 rounded-lg">
                <p className="text-2xl font-bold text-purple-600">
                  {data.summary.totalRevenue.toLocaleString()}원
                </p>
                <p className="text-sm text-gray-500">누적 매출</p>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="text-center py-20 text-gray-500">
          데이터를 불러올 수 없습니다.
        </div>
      )}
    </div>
  );
}
