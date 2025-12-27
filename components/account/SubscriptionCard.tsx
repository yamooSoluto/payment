'use client';

import { useState } from 'react';
import { Calendar, WarningCircle, Clock } from 'iconoir-react';
import { formatPrice, formatDate, getStatusText, getStatusColor, calculateDaysLeft } from '@/lib/utils';
import { getPlanName } from '@/lib/toss';
import CancelModal from './CancelModal';

interface SubscriptionCardProps {
  subscription: {
    status: string;
    plan?: string;
    amount?: number;
    nextBillingDate?: Date | string;
    currentPeriodStart?: Date | string;
    currentPeriodEnd?: Date | string;
    trialEndDate?: Date | string;
    pendingPlan?: string;
    pendingAmount?: number;
    pendingChangeAt?: Date | string;
  };
  authParam: string;
  tenantId?: string;
}

export default function SubscriptionCard({ subscription, authParam, tenantId }: SubscriptionCardProps) {
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isCancelingPending, setIsCancelingPending] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  const isTrial = subscription.status === 'trial';
  const isActive = subscription.status === 'active';
  const isCanceled = subscription.status === 'canceled';
  const isPastDue = subscription.status === 'past_due';
  const isExpired = subscription.status === 'expired';

  // authParam 파싱 헬퍼
  const parseAuthParam = () => {
    const params = new URLSearchParams(authParam);
    return {
      token: params.get('token'),
      email: params.get('email'),
    };
  };

  const handleCancel = async (
    reason: string,
    reasonDetail?: string,
    mode?: 'scheduled' | 'immediate',
    refundAmount?: number
  ) => {
    setIsLoading(true);
    try {
      const { token, email } = parseAuthParam();

      // 취소 사유 조합 (기타인 경우 상세 사유 포함)
      const cancelReason = reasonDetail ? `${reason}: ${reasonDetail}` : reason;

      const response = await fetch('/api/subscriptions/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          email,
          tenantId,
          reason: cancelReason,
          mode: mode || 'scheduled',
          refundAmount: mode === 'immediate' ? refundAmount : undefined,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        if (mode === 'immediate' && data.refundAmount > 0) {
          alert(`구독이 즉시 해지되었습니다. ${data.refundAmount.toLocaleString()}원이 환불됩니다.`);
        } else if (mode === 'immediate') {
          alert('구독이 즉시 해지되었습니다.');
        }
        window.location.reload();
      } else {
        alert(data.error || '구독 해지에 실패했습니다. 다시 시도해주세요.');
      }
    } catch {
      alert('오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
      setShowCancelModal(false);
    }
  };

  const handleReactivate = async () => {
    setIsLoading(true);
    try {
      const { token, email } = parseAuthParam();

      const response = await fetch('/api/subscriptions/reactivate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, email, tenantId }),
      });

      const data = await response.json();

      if (response.ok) {
        window.location.reload();
      } else if (data.expired) {
        // 만료된 경우 요금제 페이지로 이동
        alert('이용 기간이 만료되었습니다. 새로 구독해주세요.');
        window.location.href = `/pricing?${authParam}`;
      } else {
        alert('구독 재활성화에 실패했습니다. 다시 시도해주세요.');
      }
    } catch {
      alert('오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelPendingPlan = async () => {
    if (!confirm('예약된 플랜 변경을 취소하시겠습니까?')) return;

    setIsCancelingPending(true);
    try {
      const { token, email } = parseAuthParam();

      const response = await fetch('/api/subscriptions/cancel-pending-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, email, tenantId }),
      });

      if (response.ok) {
        window.location.reload();
      } else {
        const data = await response.json();
        alert(data.error || '예약 취소에 실패했습니다.');
      }
    } catch {
      alert('오류가 발생했습니다.');
    } finally {
      setIsCancelingPending(false);
    }
  };

  const handleRetryPayment = async () => {
    if (!confirm('등록된 카드로 결제를 다시 시도하시겠습니까?')) return;

    setIsRetrying(true);
    try {
      const { token, email } = parseAuthParam();

      const response = await fetch('/api/payments/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, email, tenantId }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        alert('결제가 성공적으로 처리되었습니다!');
        window.location.reload();
      } else {
        alert(data.error || '결제에 실패했습니다. 카드 정보를 확인해주세요.');
      }
    } catch {
      alert('오류가 발생했습니다.');
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <>
      <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h2 className="text-xl font-bold text-gray-900">
                {isTrial ? '무료체험' : subscription.plan ? `${getPlanName(subscription.plan)} 플랜` : '구독 없음'}
              </h2>
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(subscription.status)}`}>
                {getStatusText(subscription.status)}
              </span>
            </div>
            {isActive && subscription.amount && (
              <p className="text-2xl font-bold text-blue-900">
                {formatPrice(subscription.amount)}원<span className="text-sm font-normal text-gray-500"> / 월</span>
              </p>
            )}
          </div>
        </div>

        {/* Trial Info */}
        {isTrial && subscription.trialEndDate && (
          <div className="bg-blue-50 rounded-lg p-4 mb-6">
            <div className="flex items-center gap-2 text-blue-700">
              <Calendar width={20} height={20} strokeWidth={1.5} />
              <span className="font-medium">
                무료체험 {calculateDaysLeft(subscription.trialEndDate)}일 남음
              </span>
            </div>
            <p className="text-sm text-blue-600 mt-1">
              체험 종료일: {formatDate(subscription.trialEndDate)}
            </p>
          </div>
        )}

        {/* Active Subscription Info */}
        {isActive && (
          <div className="space-y-4 mb-6">
            <div className="flex items-center gap-3 text-gray-600">
              <Calendar width={20} height={20} strokeWidth={1.5} className="text-gray-400" />
              <div>
                <p className="text-sm text-gray-500">이용기간</p>
                <p className="font-medium">
                  {subscription.currentPeriodStart && subscription.nextBillingDate
                    ? (() => {
                        const endDate = new Date(subscription.nextBillingDate);
                        endDate.setDate(endDate.getDate() - 1);
                        return `${formatDate(subscription.currentPeriodStart)} ~ ${formatDate(endDate)}`;
                      })()
                    : '-'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 text-gray-600">
              <Calendar width={20} height={20} strokeWidth={1.5} className="text-gray-400" />
              <div>
                <p className="text-sm text-gray-500">다음 결제일</p>
                <p className="font-medium">{subscription.nextBillingDate ? formatDate(subscription.nextBillingDate) : '-'}</p>
              </div>
            </div>
          </div>
        )}

        {/* Pending Plan Change Notice */}
        {subscription.pendingPlan && (
          <div className="bg-blue-50 rounded-lg p-4 mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-blue-700">
                <Clock width={20} height={20} strokeWidth={1.5} />
                <div>
                  <span className="font-medium">예약된 플랜 변경</span>
                  <p className="text-sm text-blue-600 mt-0.5">
                    {subscription.pendingChangeAt ? formatDate(subscription.pendingChangeAt) : '다음 결제일'}부터{' '}
                    <span className="font-semibold">{getPlanName(subscription.pendingPlan)}</span> 플랜
                    {subscription.pendingAmount && ` (${formatPrice(subscription.pendingAmount)}원/월)`}
                  </p>
                </div>
              </div>
              <button
                onClick={handleCancelPendingPlan}
                disabled={isCancelingPending}
                className="text-sm text-blue-600 hover:text-blue-800 hover:underline disabled:opacity-50"
              >
                {isCancelingPending ? '취소 중...' : '예약 취소'}
              </button>
            </div>
          </div>
        )}

        {/* Past Due Warning */}
        {isPastDue && (
          <div className="bg-red-50 rounded-lg p-4 mb-6">
            <div className="flex items-center gap-2 text-red-700">
              <WarningCircle width={20} height={20} strokeWidth={1.5} />
              <span className="font-medium">결제 실패</span>
            </div>
            <p className="text-sm text-red-600 mt-1">
              결제에 실패했습니다. 결제 수단을 확인하고 다시 시도해주세요.
            </p>
          </div>
        )}

        {/* Canceled Info */}
        {isCanceled && subscription.currentPeriodEnd && (
          <div className="bg-yellow-50 rounded-lg p-4 mb-6">
            <p className="text-sm text-yellow-800 font-medium mb-1">
              구독이 해지 예정입니다
            </p>
            <p className="text-sm text-yellow-700">
              {formatDate(subscription.currentPeriodEnd)}까지 이용 가능하며,
              &apos;다시 이용하기&apos;를 누르면 해지가 취소되고 다음 결제일에 {subscription.amount ? `${formatPrice(subscription.amount)}원이` : '요금이'} 결제됩니다.
            </p>
          </div>
        )}

        {/* Expired Info */}
        {isExpired && (
          <div className="bg-orange-50 rounded-lg p-4 mb-6">
            <div className="flex items-center gap-2 text-orange-700">
              <WarningCircle width={20} height={20} strokeWidth={1.5} />
              <span className="font-medium">구독이 만료되었습니다</span>
            </div>
            <p className="text-sm text-orange-600 mt-1">
              무료 체험 기간이 종료되었습니다. 유료 플랜을 선택하여 서비스를 계속 이용해주세요.
            </p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-3">
          {isTrial && (
            <a
              href={`/pricing?${authParam}${tenantId ? `&tenantId=${tenantId}` : ''}`}
              className="btn-primary"
            >
              유료 전환하기
            </a>
          )}
          {isActive && (
            <a
              href={`/account/change-plan?${authParam}${tenantId ? `&tenantId=${tenantId}` : ''}`}
              className="bg-black text-white px-6 py-3 rounded-lg font-semibold hover:bg-yamoo-primary hover:text-gray-900 transition-all duration-200"
            >
              플랜 변경
            </a>
          )}
          {isActive && (
            <button
              onClick={() => setShowCancelModal(true)}
              className="border-2 border-black text-gray-900 px-6 py-3 rounded-lg font-semibold hover:bg-yamoo-primary hover:border-yamoo-primary transition-all duration-200"
            >
              구독 해지
            </button>
          )}
          {isPastDue && (
            <>
              <button
                onClick={handleRetryPayment}
                disabled={isRetrying}
                className="btn-primary"
              >
                {isRetrying ? '결제 중...' : '재결제하기'}
              </button>
              <a
                href={`/checkout?plan=${subscription.plan}&${authParam}${tenantId ? `&tenantId=${tenantId}` : ''}`}
                className="btn-secondary"
              >
                카드 변경하기
              </a>
            </>
          )}
          {isCanceled && (
            <button
              onClick={handleReactivate}
              disabled={isLoading}
              className="btn-primary"
            >
              {isLoading ? '처리 중...' : '다시 이용하기'}
            </button>
          )}
          {isExpired && (
            <a
              href={`/pricing?${authParam}${tenantId ? `&tenantId=${tenantId}` : ''}`}
              className="btn-primary"
            >
              유료 플랜 선택하기
            </a>
          )}
        </div>
      </div>

      {/* Cancel Modal */}
      {showCancelModal && (
        <CancelModal
          onClose={() => setShowCancelModal(false)}
          onConfirm={handleCancel}
          isLoading={isLoading}
          currentPeriodEnd={subscription.currentPeriodEnd}
          currentPeriodStart={subscription.currentPeriodStart}
          amount={subscription.amount}
        />
      )}
    </>
  );
}
