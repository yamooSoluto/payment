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

    // 종료일 계산
    // - expired (즉시 해지): currentPeriodEnd 사용 (해지 시점)
    // - canceled (예약 해지): currentPeriodEnd 사용 (기간 종료일)
    // - active: nextBillingDate - 1일
    let currentEndDate: Date | string | null = null;
    if (subscription.status === 'expired') {
      // 즉시 해지: currentPeriodEnd가 해지 시점으로 설정됨
      currentEndDate = subscription.currentPeriodEnd || subscription.canceledAt || null;
    } else if (subscription.status === 'canceled') {
      // 예약 해지: 기간 종료일까지 이용 가능
      currentEndDate = subscription.currentPeriodEnd || subscription.canceledAt || null;
    } else if (subscription.nextBillingDate) {
      const endDate = new Date(subscription.nextBillingDate);
      endDate.setDate(endDate.getDate() - 1);
      currentEndDate = endDate.toISOString();
    }

    // 상태 매핑
    let periodStatus: 'active' | 'completed' | 'canceled' = 'active';
    if (subscription.status === 'expired') {
      periodStatus = 'canceled';  // 즉시 해지 완료
    } else if (subscription.status === 'canceled') {
      periodStatus = 'canceled';  // 예약 해지
    }

    subscriptionPeriods.push({
      id: 'current',
      plan: subscription.plan,
      startDate: currentStart || new Date(),
      endDate: currentEndDate,
      status: periodStatus,
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
        <div className="overflow-x-auto -mx-6 px-6">
          <table className="w-full min-w-[400px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500 whitespace-nowrap">플랜</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500 whitespace-nowrap">구독 시작</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500 whitespace-nowrap">구독 종료</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500 whitespace-nowrap">상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {subscriptionPeriods.map((period) => (
                <tr key={period.id}>
                  <td className="px-4 py-4 text-sm font-medium text-gray-900 whitespace-nowrap">
                    {getPlanName(period.plan)}
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-700 whitespace-nowrap">
                    {formatDate(period.startDate)}
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-700 whitespace-nowrap">
                    {period.endDate ? formatDate(period.endDate) : '-'}
                  </td>
                  <td className={`px-4 py-4 text-sm font-medium whitespace-nowrap ${getStatusStyle(period.status)}`}>
                    {getStatusText(period.status)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
