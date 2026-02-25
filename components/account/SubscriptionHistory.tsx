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
  trialEndDate?: Date | string;
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

// 새 subscription_history 컬렉션에서 가져온 데이터
interface HistoryRecord {
  plan: string;
  status: string;
  periodStart: Date | string;
  periodEnd: Date | string | null;
  changeType: string;
  changedAt: Date | string;
}

interface SubscriptionPeriod {
  id: string;
  plan: string;
  startDate: Date | string;
  endDate: Date | string | null;
  status: 'active' | 'trial' | 'completed' | 'canceled' | 'pending_cancel';
}

interface SubscriptionHistoryProps {
  subscription: Subscription | null;
  payments?: Payment[];
  historyData?: HistoryRecord[]; // 새로운 prop: subscription_history에서 가져온 데이터
}

export default function SubscriptionHistory({ subscription, payments = [], historyData }: SubscriptionHistoryProps) {
  // 구독 기간 목록 생성
  let subscriptionPeriods: SubscriptionPeriod[] = [];

  // historyData가 있으면 그것을 사용 (새 subscription_history 컬렉션)
  if (historyData && historyData.length > 0) {
    subscriptionPeriods = historyData.map((record, index) => {
      // status 매핑
      let periodStatus: SubscriptionPeriod['status'] = 'completed';
      if (record.status === 'trial') {
        periodStatus = 'trial';
      } else if (record.status === 'active') {
        periodStatus = 'active';
      } else if (record.status === 'pending_cancel') {
        periodStatus = 'pending_cancel';
      } else if (record.status === 'canceled') {
        periodStatus = 'canceled';
      } else if (record.status === 'expired') {
        periodStatus = 'completed';
      }

      // 종료일: periodEnd에 이미 마지막 이용일이 저장되어 있음
      const endDate = record.periodEnd;

      return {
        id: `history-${index}`,
        plan: record.plan,
        startDate: record.periodStart,
        endDate,
        status: periodStatus,
      };
    });
  } else if (subscription) {
    // 기존 로직: subscription + payments에서 추출
    // 현재 구독 추가 - SubscriptionCard와 동일한 로직 사용
    const currentStart = subscription.currentPeriodStart || subscription.planChangedAt || subscription.startDate || subscription.createdAt;

    // 종료일 계산
    let currentEndDate: Date | string | null = null;
    if (subscription.status === 'trial' || subscription.plan === 'trial') {
      currentEndDate = subscription.trialEndDate || subscription.currentPeriodEnd || null;
    } else if (subscription.status === 'expired') {
      currentEndDate = subscription.currentPeriodEnd || subscription.canceledAt || null;
    } else if (subscription.status === 'canceled') {
      // currentPeriodEnd에 이미 마지막 이용일이 저장되어 있음
      currentEndDate = subscription.currentPeriodEnd || subscription.canceledAt || null;
    } else if (subscription.nextBillingDate) {
      const endDate = new Date(subscription.nextBillingDate);
      endDate.setDate(endDate.getDate() - 1);
      currentEndDate = endDate.toISOString();
    }

    // 상태 매핑
    let periodStatus: SubscriptionPeriod['status'] = 'active';
    if (subscription.status === 'trial') {
      periodStatus = 'trial';
    } else if (subscription.status === 'pending_cancel') {
      periodStatus = 'pending_cancel';
    } else if (subscription.status === 'canceled') {
      periodStatus = 'canceled';
    } else if (subscription.status === 'expired') {
      periodStatus = 'completed';
    }

    subscriptionPeriods.push({
      id: 'current',
      plan: subscription.plan,
      startDate: currentStart || new Date(),
      endDate: currentEndDate,
      status: periodStatus,
    });

    // 결제 내역에서 이전 구독 기간 추출
    const planChanges = payments
      .filter(p =>
        p.type === 'upgrade' ||
        p.type === 'downgrade' ||
        p.type === 'conversion' ||
        p.type === 'trial_conversion' ||
        (p.type === 'refund' && p.previousPlan)
      )
      .sort((a, b) => new Date(b.paidAt || b.createdAt).getTime() - new Date(a.paidAt || a.createdAt).getTime());

    // 플랜 변경 내역으로 이전 구독 기간 구성
    planChanges.forEach((change, index) => {
      const changeDate = change.paidAt || change.createdAt;
      const prevPlan = change.previousPlan ||
        ((change.type === 'conversion' || change.type === 'trial_conversion') ? 'trial' : null);

      if (prevPlan) {
        const prevChange = planChanges[index + 1];
        const startDate = prevChange
          ? (prevChange.paidAt || prevChange.createdAt)
          : (subscription.startDate || subscription.createdAt || changeDate);

        subscriptionPeriods.push({
          id: `period-${index}`,
          plan: prevPlan,
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

  // 정렬: 사용중/체험중 맨 위, 나머지는 시작일 내림차순 (최신순)
  subscriptionPeriods.sort((a, b) => {
    const aActive = a.status === 'active' || a.status === 'trial' || a.status === 'pending_cancel';
    const bActive = b.status === 'active' || b.status === 'trial' || b.status === 'pending_cancel';
    if (aActive && !bActive) return -1;
    if (!aActive && bActive) return 1;
    return new Date(b.startDate).getTime() - new Date(a.startDate).getTime();
  });

  const getStatusText = (status: SubscriptionPeriod['status']) => {
    switch (status) {
      case 'trial':
        return '체험중';
      case 'active':
        return '사용중';
      case 'completed':
        return '사용완료';
      case 'pending_cancel':
        return '해지예정';
      case 'canceled':
        return '해지됨';
      default:
        return status;
    }
  };

  const getStatusStyle = (status: SubscriptionPeriod['status']) => {
    switch (status) {
      case 'trial':
        return 'text-yellow-600';
      case 'active':
        return 'text-green-600';
      case 'completed':
        return 'text-gray-500';
      case 'pending_cancel':
        return 'text-orange-500';
      case 'canceled':
        return 'text-red-500';
      default:
        return 'text-gray-500';
    }
  };

  if (!subscription && (!historyData || historyData.length === 0)) {
    return (
      <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg p-6 border border-white/60">
        <h2 className="text-xl font-bold text-gray-900 mb-4">구독 내역</h2>
        <div className="text-center py-8 text-gray-500">
          <Calendar width={48} height={48} strokeWidth={1.5} className="mx-auto mb-3 text-gray-300" />
          <p>구독 내역이 없습니다.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg p-6 border border-white/60">
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
