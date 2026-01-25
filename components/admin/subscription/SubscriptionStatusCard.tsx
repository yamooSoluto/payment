'use client';

import {
  SubscriptionStatusCardProps,
  PLAN_LABELS,
  PLAN_PRICES,
  STATUS_LABELS,
  isSubscriptionActive,
  canStartSubscription,
  formatDateForInput,
  PlanType,
} from './types';

export default function SubscriptionStatusCard({
  subscription,
}: SubscriptionStatusCardProps) {
  // Firestore Timestamp 처리
  const formatDate = (value: unknown): string => {
    if (!value) return '-';
    if (typeof value === 'string') {
      return new Date(value).toLocaleDateString('ko-KR');
    }
    if (typeof value === 'object' && value !== null && 'toDate' in value) {
      return (value as { toDate: () => Date }).toDate().toLocaleDateString('ko-KR');
    }
    return '-';
  };

  const getDateForInput = (value: unknown): string => {
    if (!value) return '';
    if (typeof value === 'string') return formatDateForInput(value);
    if (typeof value === 'object' && value !== null && 'toDate' in value) {
      return formatDateForInput((value as { toDate: () => Date }).toDate());
    }
    return '';
  };

  // 상태 뱃지
  const getStatusBadge = (status: string) => {
    const baseClass = 'px-2 py-1 text-xs font-medium rounded-full';
    switch (status) {
      case 'active':
        return <span className={`${baseClass} bg-green-100 text-green-700`}>구독중</span>;
      case 'trial':
      case 'trialing':
        return <span className={`${baseClass} bg-blue-100 text-blue-700`}>체험</span>;
      case 'pending_cancel':
        return <span className={`${baseClass} bg-orange-100 text-orange-700`}>해지 예정</span>;
      case 'canceled':
        return <span className={`${baseClass} bg-red-100 text-red-700`}>해지</span>;
      case 'expired':
        return <span className={`${baseClass} bg-gray-100 text-gray-600`}>만료</span>;
      case 'none':
        return <span className={`${baseClass} bg-gray-100 text-gray-500`}>미구독</span>;
      default:
        return <span className={`${baseClass} bg-gray-100 text-gray-600`}>{status || '-'}</span>;
    }
  };

  if (!subscription || canStartSubscription(subscription.status)) {
    return (
      <div className="bg-gray-50 rounded-lg p-4 text-center">
        <div className="text-gray-400 text-sm mb-1">구독 정보 없음</div>
        <div className="text-xs text-gray-400">
          구독을 시작하려면 아래 버튼을 클릭하세요.
        </div>
      </div>
    );
  }

  const plan = subscription.plan as PlanType | null;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-gray-900">
            {plan ? PLAN_LABELS[plan] : '-'}
          </span>
          {getStatusBadge(subscription.status)}
        </div>
        {plan && plan !== 'enterprise' && (
          <span className="text-sm text-gray-500">
            {PLAN_PRICES[plan].toLocaleString()}원/월
          </span>
        )}
      </div>

      {/* 상세 정보 */}
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <div className="text-xs text-gray-500">시작일</div>
          <div className="font-medium text-gray-700">
            {formatDate(subscription.currentPeriodStart)}
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-500">종료일</div>
          <div className="font-medium text-gray-700">
            {formatDate(subscription.currentPeriodEnd)}
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-500">다음 결제일</div>
          <div className="font-medium text-gray-700">
            {subscription.status === 'trial' || subscription.status === 'trialing'
              ? (subscription.nextBillingDate ? formatDate(subscription.nextBillingDate) : '-')
              : formatDate(subscription.nextBillingDate)}
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-500">결제 금액</div>
          <div className="font-medium text-gray-700">
            {subscription.amount?.toLocaleString() || 0}원
          </div>
        </div>
      </div>

      {/* 해지 예정 알림 */}
      {subscription.status === 'pending_cancel' && subscription.cancelAt && (
        <div className="text-xs text-orange-600 bg-orange-50 p-2 rounded">
          {getDateForInput(subscription.cancelAt)}에 해지 예정입니다.
        </div>
      )}

      {/* 예약된 플랜 변경 알림 */}
      {subscription.pendingPlan && (
        <div className="text-xs text-blue-600 bg-blue-50 p-2 rounded">
          다음 구독부터 {PLAN_LABELS[subscription.pendingPlan as PlanType]} 플랜으로 변경 예정
        </div>
      )}
    </div>
  );
}
