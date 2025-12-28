'use client';

import { formatDate } from '@/lib/utils';
import { getPlanName } from '@/lib/toss';
import { Calendar } from 'iconoir-react';

interface Subscription {
  plan: string;
  status: string;
  startDate?: Date | string;
  createdAt?: Date | string;
  currentPeriodStart?: Date | string;
  currentPeriodEnd?: Date | string;
  nextBillingDate?: Date | string;
  planChangedAt?: Date | string;
  previousPlan?: string;
  canceledAt?: Date | string;
  cancelReason?: string;
}

interface Payment {
  id: string;
  plan: string;
  type?: string;
  previousPlan?: string;
  paidAt?: Date | string;
  createdAt: Date | string;
  amount: number;
}

interface SubscriptionPeriod {
  id: string;
  plan: string;
  startDate: Date | string;
  endDate: Date | string | null;
  status: 'active' | 'completed' | 'canceled';
}

interface SubscriptionHistoryProps {
  subscription: Subscription | null;
  payments?: Payment[];
}

export default function SubscriptionHistory({ subscription, payments = [] }: SubscriptionHistoryProps) {
  // 구독 기간 목록 생성
  const subscriptionPeriods: SubscriptionPeriod[] = [];

  if (subscription) {
    // 현재 구독 추가 - SubscriptionCard와 동일한 로직 사용
    const currentStart = subscription.currentPeriodStart || subscription.planChangedAt || subscription.startDate || subscription.createdAt;

    // 종료일 계산: active 상태일 때는 nextBillingDate - 1일 (SubscriptionCard와 동일)
    let currentEndDate: Date | string | null = null;
    if (subscription.status === 'canceled') {
      currentEndDate = subscription.currentPeriodEnd || subscription.canceledAt || null;
    } else if (subscription.nextBillingDate) {
      const endDate = new Date(subscription.nextBillingDate);
      endDate.setDate(endDate.getDate() - 1);
      currentEndDate = endDate.toISOString();
    }

    subscriptionPeriods.push({
      id: 'current',
      plan: subscription.plan,
      startDate: currentStart || new Date(),
      endDate: currentEndDate,
      status: subscription.status === 'active' ? 'active' : 'canceled',
    });

    // 결제 내역에서 이전 구독 기간 추출
    // upgrade: 업그레이드 결제, downgrade: 다운그레이드, refund: 다운그레이드 환불
    const planChanges = payments
      .filter(p => p.type === 'upgrade' || p.type === 'downgrade' || (p.type === 'refund' && p.previousPlan))
      .sort((a, b) => new Date(b.paidAt || b.createdAt).getTime() - new Date(a.paidAt || a.createdAt).getTime());

    // 플랜 변경 내역으로 이전 구독 기간 구성
    planChanges.forEach((change, index) => {
      const changeDate = change.paidAt || change.createdAt;
      if (change.previousPlan) {
        // 이전 플랜의 시작일 추정 (이전 변경 날짜 또는 구독 시작일)
        const prevChange = planChanges[index + 1];
        const startDate = prevChange
          ? (prevChange.paidAt || prevChange.createdAt)
          : (subscription.startDate || subscription.createdAt || changeDate);

        subscriptionPeriods.push({
          id: `period-${index}`,
          plan: change.previousPlan,
          startDate: startDate,
          endDate: changeDate,
          status: 'completed',
        });
      }
    });

    // 최초 구독이 있고 플랜 변경이 없는 경우
    if (planChanges.length === 0 && subscription.previousPlan && subscription.planChangedAt) {
      const originalStart = subscription.startDate || subscription.createdAt;
      if (originalStart) {
        subscriptionPeriods.push({
          id: 'original',
          plan: subscription.previousPlan,
          startDate: originalStart,
          endDate: subscription.planChangedAt,
          status: 'completed',
        });
      }
    }
  }

  // 시작일 기준 내림차순 정렬
  subscriptionPeriods.sort((a, b) =>
    new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
  );

  const getStatusText = (status: SubscriptionPeriod['status']) => {
    switch (status) {
      case 'active':
        return '사용중';
      case 'completed':
        return '사용완료';
      case 'canceled':
        return '해지됨';
      default:
        return status;
    }
  };

  const getStatusStyle = (status: SubscriptionPeriod['status']) => {
    switch (status) {
      case 'active':
        return 'text-green-600';
      case 'completed':
        return 'text-gray-500';
      case 'canceled':
        return 'text-red-500';
      default:
        return 'text-gray-500';
    }
  };

  if (!subscription) {
    return (
      <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
        <h2 className="text-xl font-bold text-gray-900 mb-4">구독 내역</h2>
        <div className="text-center py-8 text-gray-500">
          <Calendar width={48} height={48} strokeWidth={1.5} className="mx-auto mb-3 text-gray-300" />
          <p>구독 내역이 없습니다.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
      <h2 className="text-xl font-bold text-gray-900 mb-6">구독 내역</h2>

      {subscriptionPeriods.length > 0 ? (
        <div className="overflow-x-auto">
          {/* 테이블 헤더 */}
          <div className="hidden sm:grid sm:grid-cols-4 gap-4 px-4 py-3 bg-gray-50 rounded-t-lg text-sm font-medium text-gray-500">
            <div>플랜</div>
            <div>구독 시작</div>
            <div>구독 종료</div>
            <div>상태</div>
          </div>

          {/* 테이블 바디 */}
          <div className="divide-y divide-gray-100">
            {subscriptionPeriods.map((period) => (
              <div
                key={period.id}
                className="grid grid-cols-1 sm:grid-cols-4 gap-2 sm:gap-4 px-4 py-4"
              >
                {/* 플랜 */}
                <div className="flex items-center justify-between sm:justify-start">
                  <span className="text-sm text-gray-500 sm:hidden">플랜</span>
                  <span className="font-medium text-gray-900">{getPlanName(period.plan)}</span>
                </div>

                {/* 구독 시작 */}
                <div className="flex items-center justify-between sm:justify-start">
                  <span className="text-sm text-gray-500 sm:hidden">구독 시작</span>
                  <span className="text-gray-700">{formatDate(period.startDate)}</span>
                </div>

                {/* 구독 종료 */}
                <div className="flex items-center justify-between sm:justify-start">
                  <span className="text-sm text-gray-500 sm:hidden">구독 종료</span>
                  <span className="text-gray-700">
                    {period.endDate ? formatDate(period.endDate) : '-'}
                  </span>
                </div>

                {/* 상태 */}
                <div className="flex items-center justify-between sm:justify-start">
                  <span className="text-sm text-gray-500 sm:hidden">상태</span>
                  <span className={`font-medium ${getStatusStyle(period.status)}`}>
                    {getStatusText(period.status)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="text-center py-8 text-gray-500">
          <Calendar width={48} height={48} strokeWidth={1.5} className="mx-auto mb-3 text-gray-300" />
          <p>구독 내역이 없습니다.</p>
        </div>
      )}
    </div>
  );
}
