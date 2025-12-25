'use client';

import { useState } from 'react';
import { CreditCard, Calendar, AlertCircle, Pencil, Check, X, Clock } from 'lucide-react';
import { formatPrice, formatDate, getStatusText, getStatusColor, calculateDaysLeft } from '@/lib/utils';
import { getPlanName } from '@/lib/toss';
import CancelModal from './CancelModal';

interface SubscriptionCardProps {
  subscription: {
    status: string;
    plan?: string;
    amount?: number;
    nextBillingDate?: Date | string;
    currentPeriodEnd?: Date | string;
    cardCompany?: string;
    cardNumber?: string;
    cardAlias?: string;
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
  const [isEditingAlias, setIsEditingAlias] = useState(false);
  const [cardAlias, setCardAlias] = useState(subscription.cardAlias || '');
  const [isSavingAlias, setIsSavingAlias] = useState(false);
  const [isCancelingPending, setIsCancelingPending] = useState(false);

  const isTrial = subscription.status === 'trial';
  const isActive = subscription.status === 'active';
  const isCanceled = subscription.status === 'canceled';
  const isPastDue = subscription.status === 'past_due';

  // authParam 파싱 헬퍼
  const parseAuthParam = () => {
    const params = new URLSearchParams(authParam);
    return {
      token: params.get('token'),
      email: params.get('email'),
    };
  };

  const handleCancel = async () => {
    setIsLoading(true);
    try {
      const { token, email } = parseAuthParam();

      const response = await fetch('/api/subscriptions/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, email, tenantId }),
      });

      if (response.ok) {
        window.location.reload();
      } else {
        alert('구독 해지에 실패했습니다. 다시 시도해주세요.');
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

  const handleUpdateCardAlias = async () => {
    setIsSavingAlias(true);
    try {
      const { token, email } = parseAuthParam();

      const response = await fetch('/api/subscriptions/update-card-alias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, email, tenantId, cardAlias: cardAlias.trim() }),
      });

      if (response.ok) {
        setIsEditingAlias(false);
        window.location.reload();
      } else {
        const data = await response.json();
        alert(data.error || '별칭 수정에 실패했습니다.');
      }
    } catch {
      alert('오류가 발생했습니다.');
    } finally {
      setIsSavingAlias(false);
    }
  };

  const handleCancelEdit = () => {
    setCardAlias(subscription.cardAlias || '');
    setIsEditingAlias(false);
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
              <p className="text-2xl font-bold text-yamoo-primary">
                {formatPrice(subscription.amount)}원<span className="text-sm font-normal text-gray-500"> / 월</span>
              </p>
            )}
          </div>
        </div>

        {/* Trial Info */}
        {isTrial && subscription.trialEndDate && (
          <div className="bg-blue-50 rounded-lg p-4 mb-6">
            <div className="flex items-center gap-2 text-blue-700">
              <Calendar className="w-5 h-5" />
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
              <Calendar className="w-5 h-5 text-gray-400" />
              <div>
                <p className="text-sm text-gray-500">다음 결제일</p>
                <p className="font-medium">{subscription.nextBillingDate ? formatDate(subscription.nextBillingDate) : '-'}</p>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 text-gray-600">
                <CreditCard className="w-5 h-5 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-500">결제 수단</p>
                  {isEditingAlias ? (
                    <div className="flex items-center gap-2 mt-1">
                      <input
                        type="text"
                        value={cardAlias}
                        onChange={(e) => setCardAlias(e.target.value)}
                        placeholder="카드 별칭 (예: 내 신용카드)"
                        maxLength={20}
                        className="px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-yamoo-primary focus:border-transparent"
                        disabled={isSavingAlias}
                        autoFocus
                      />
                      <button
                        onClick={handleUpdateCardAlias}
                        disabled={isSavingAlias}
                        className="p-1 text-green-600 hover:bg-green-50 rounded"
                        title="저장"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        disabled={isSavingAlias}
                        className="p-1 text-gray-400 hover:bg-gray-100 rounded"
                        title="취소"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <p className="font-medium">
                        {subscription.cardAlias
                          ? `${subscription.cardAlias} (${subscription.cardCompany || ''}카드)`
                          : subscription.cardCompany
                            ? `${subscription.cardCompany}카드 ${subscription.cardNumber || ''}`
                            : '등록된 카드'}
                      </p>
                      <button
                        onClick={() => setIsEditingAlias(true)}
                        className="p-1 text-gray-400 hover:text-yamoo-primary hover:bg-gray-100 rounded"
                        title="별칭 수정"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <a
                href={`/account/change-card?${authParam}${tenantId ? `&tenantId=${tenantId}` : ''}`}
                className="text-sm text-yamoo-primary hover:underline"
              >
                변경
              </a>
            </div>
          </div>
        )}

        {/* Pending Plan Change Notice */}
        {subscription.pendingPlan && (
          <div className="bg-blue-50 rounded-lg p-4 mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-blue-700">
                <Clock className="w-5 h-5" />
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
              <AlertCircle className="w-5 h-5" />
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
              className="btn-primary"
            >
              플랜 변경하기
            </a>
          )}
          {isActive && (
            <button
              onClick={() => setShowCancelModal(true)}
              className="btn-secondary text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
            >
              구독 해지하기
            </button>
          )}
          {isPastDue && (
            <a
              href={`/checkout?plan=${subscription.plan}&${authParam}${tenantId ? `&tenantId=${tenantId}` : ''}`}
              className="btn-primary"
            >
              결제 수단 변경하기
            </a>
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
        </div>
      </div>

      {/* Cancel Modal */}
      {showCancelModal && (
        <CancelModal
          onClose={() => setShowCancelModal(false)}
          onConfirm={handleCancel}
          isLoading={isLoading}
          currentPeriodEnd={subscription.currentPeriodEnd}
        />
      )}
    </>
  );
}
