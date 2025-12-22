'use client';

import { useState } from 'react';
import { Zap, Calendar, X } from 'lucide-react';

interface ChangePlanButtonProps {
  newPlan: string;
  newPlanName: string;
  newAmount: number;
  currentPlan: string;
  currentAmount: number;
  isUpgrade: boolean;
  isDowngrade: boolean;
  priceDiff: number;
  authParam: string;
  nextBillingDate?: string;
  daysLeft?: number;
}

function formatPrice(price: number): string {
  return price.toLocaleString('ko-KR');
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export default function ChangePlanButton({
  newPlan,
  newPlanName,
  newAmount,
  currentAmount,
  isUpgrade,
  priceDiff,
  authParam,
  nextBillingDate,
  daysLeft = 0,
}: ChangePlanButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [selectedMode, setSelectedMode] = useState<'immediate' | 'scheduled' | null>(null);

  // 즉시 변경 시 일할 계산
  // 남은 일수에 대한 현재 플랜 환불액
  const refundAmount = Math.round((currentAmount / 30) * daysLeft);
  // 남은 일수에 대한 새 플랜 비용 (할인가)
  const proratedNewAmount = Math.round((newAmount / 30) * daysLeft);
  // 실제 결제/환불 금액
  const immediatePayment = proratedNewAmount - refundAmount;

  const handleChangePlan = async (mode: 'immediate' | 'scheduled') => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams(authParam);
      const token = params.get('token');
      const email = params.get('email');

      // 즉시 다운그레이드 시 환불 금액 계산
      // 다운그레이드: immediatePayment가 음수 (환불해야 함)
      const actualRefundAmount = mode === 'immediate' && immediatePayment < 0
        ? Math.abs(immediatePayment)
        : 0;

      const response = await fetch('/api/subscriptions/change-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          email,
          newPlan,
          newAmount,
          mode,
          refundAmount: actualRefundAmount, // 즉시 다운그레이드 시 환불 금액
        }),
      });

      const data = await response.json();

      if (response.ok) {
        if (mode === 'immediate' && data.requiresPayment) {
          // 업그레이드: 결제 페이지로 이동
          window.location.href = `/checkout?plan=${newPlan}&${authParam}&mode=immediate&refund=${refundAmount}`;
        } else {
          // 다운그레이드 또는 예약 변경: 완료 메시지
          let message = '';
          if (mode === 'immediate') {
            message = data.refundProcessed
              ? `${newPlanName} 플랜으로 즉시 변경되었습니다. ${data.refundAmount?.toLocaleString() || 0}원이 환불 처리됩니다.`
              : `${newPlanName} 플랜으로 즉시 변경되었습니다.`;
          } else {
            message = `${newPlanName} 플랜으로 ${nextBillingDate ? formatDate(nextBillingDate) : '다음 결제일'}부터 변경됩니다.`;
          }
          alert(message);
          window.location.href = `/account?${authParam}`;
        }
      } else {
        alert(data.error || '플랜 변경에 실패했습니다.');
      }
    } catch {
      alert('오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
      setShowModal(false);
      setSelectedMode(null);
    }
  };

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="w-full py-3 px-4 rounded-lg font-semibold transition-all bg-yamoo-primary text-gray-900 hover:bg-yellow-400"
      >
        플랜 변경하기
      </button>

      {/* Change Plan Modal */}
      {showModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowModal(false)}
        >
          <div
            className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b">
              <h3 className="text-xl font-bold text-gray-900">
                {newPlanName} 플랜으로 변경
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              {/* 즉시 변경 옵션 */}
              <div
                className={`border-2 rounded-xl p-4 cursor-pointer transition-all ${
                  selectedMode === 'immediate'
                    ? 'border-yamoo-primary bg-yellow-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => setSelectedMode('immediate')}
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <Zap className="w-5 h-5 text-yellow-600" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-gray-900 mb-1">즉시 변경</h4>
                    <p className="text-sm text-gray-600 mb-3">
                      지금 바로 새 플랜을 이용합니다. 현재 플랜의 남은 기간은 일할 환불됩니다.
                    </p>
                    <div className="bg-gray-50 rounded-lg p-3 text-sm">
                      <div className="flex justify-between mb-1">
                        <span className="text-gray-500">현재 플랜 환불 ({daysLeft}일)</span>
                        <span className="text-green-600">+{formatPrice(refundAmount)}원</span>
                      </div>
                      <div className="flex justify-between mb-1">
                        <span className="text-gray-500">새 플랜 비용 ({daysLeft}일)</span>
                        <span className="text-gray-900">-{formatPrice(proratedNewAmount)}원</span>
                      </div>
                      <div className="flex justify-between pt-2 border-t mt-2 font-semibold">
                        <span className="text-gray-900">
                          {immediatePayment >= 0 ? '추가 결제' : '환불'}
                        </span>
                        <span className={immediatePayment >= 0 ? 'text-blue-600' : 'text-green-600'}>
                          {formatPrice(Math.abs(immediatePayment))}원
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      * 다음 결제일({nextBillingDate ? formatDate(nextBillingDate) : '-'})부터 월 {formatPrice(newAmount)}원
                    </p>
                  </div>
                </div>
              </div>

              {/* 예약 변경 옵션 */}
              <div
                className={`border-2 rounded-xl p-4 cursor-pointer transition-all ${
                  selectedMode === 'scheduled'
                    ? 'border-yamoo-primary bg-yellow-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => setSelectedMode('scheduled')}
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <Calendar className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-gray-900 mb-1">예약 변경</h4>
                    <p className="text-sm text-gray-600 mb-3">
                      다음 결제일부터 새 플랜이 적용됩니다. 현재 플랜은 기간 끝까지 유지됩니다.
                    </p>
                    <div className="bg-gray-50 rounded-lg p-3 text-sm">
                      <div className="flex justify-between mb-1">
                        <span className="text-gray-500">변경 적용일</span>
                        <span className="text-gray-900 font-medium">
                          {nextBillingDate ? formatDate(nextBillingDate) : '-'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">새 플랜 요금</span>
                        <span className="text-gray-900 font-medium">
                          월 {formatPrice(newAmount)}원
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      * 현재 플랜({formatPrice(currentAmount)}원)은 {nextBillingDate ? formatDate(nextBillingDate) : '다음 결제일'}까지 유지
                    </p>
                  </div>
                </div>
              </div>

              {/* 가격 비교 */}
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">월 요금 변화</span>
                  <div className="text-right">
                    <span className="text-gray-400 line-through mr-2">
                      {formatPrice(currentAmount)}원
                    </span>
                    <span className="font-bold text-gray-900">
                      {formatPrice(newAmount)}원
                    </span>
                    <span className={`ml-2 text-sm ${priceDiff > 0 ? 'text-blue-600' : 'text-green-600'}`}>
                      ({priceDiff > 0 ? '+' : ''}{formatPrice(priceDiff)}원)
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 border-t bg-gray-50 rounded-b-xl">
              <div className="flex gap-3">
                <button
                  onClick={() => setShowModal(false)}
                  className="flex-1 btn-secondary"
                  disabled={isLoading}
                >
                  취소
                </button>
                <button
                  onClick={() => selectedMode && handleChangePlan(selectedMode)}
                  disabled={!selectedMode || isLoading}
                  className="flex-1 py-3 px-6 rounded-lg font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-yamoo-primary text-gray-900 hover:bg-yellow-400"
                >
                  {isLoading ? '처리 중...' : '변경하기'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
