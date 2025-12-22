'use client';

import { useState } from 'react';
import { CreditCard, Calendar, AlertCircle } from 'lucide-react';
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
    trialEndDate?: Date | string;
  };
  authParam: string;
}

export default function SubscriptionCard({ subscription, authParam }: SubscriptionCardProps) {
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const isTrial = subscription.status === 'trial';
  const isActive = subscription.status === 'active';
  const isCanceled = subscription.status === 'canceled';
  const isPastDue = subscription.status === 'past_due';

  const handleCancel = async () => {
    setIsLoading(true);
    try {
      // authParam 파싱 (token=xxx 또는 email=xxx)
      const params = new URLSearchParams(authParam);
      const token = params.get('token');
      const email = params.get('email');

      const response = await fetch('/api/subscriptions/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, email }),
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
                  <p className="font-medium">
                    {subscription.cardCompany
                      ? `${subscription.cardCompany}카드 ${subscription.cardNumber || ''}`
                      : '등록된 카드'}
                  </p>
                </div>
              </div>
              <a
                href={`/account/change-card?${authParam}`}
                className="text-sm text-yamoo-primary hover:underline"
              >
                변경
              </a>
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
          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <p className="text-sm text-gray-600">
              구독이 해지되었습니다. {formatDate(subscription.currentPeriodEnd)}까지 이용 가능합니다.
            </p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-3">
          {isTrial && (
            <a
              href={`/pricing?${authParam}`}
              className="btn-primary"
            >
              유료 전환하기
            </a>
          )}
          {isActive && (
            <a
              href={`/account/change-plan?${authParam}`}
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
              href={`/checkout?plan=${subscription.plan}&${authParam}`}
              className="btn-primary"
            >
              결제 수단 변경하기
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
        />
      )}
    </>
  );
}
