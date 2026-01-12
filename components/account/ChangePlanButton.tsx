'use client';

import { useState } from 'react';
import { Flash, Calendar, Xmark, CheckCircle, WarningCircle } from 'iconoir-react';
import { getPlanName } from '@/lib/toss';

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
  totalDaysInPeriod?: number;
  tenantId?: string;
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
  currentPlan,
  currentAmount,
  isUpgrade,
  priceDiff,
  authParam,
  nextBillingDate,
  daysLeft = 0,
  totalDaysInPeriod = 30,
  tenantId,
}: ChangePlanButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [selectedMode, setSelectedMode] = useState<'immediate' | 'scheduled' | null>(null);
  const [resultModal, setResultModal] = useState<{
    isOpen: boolean;
    type: 'success' | 'error';
    title: string;
    message: string;
    refundAmount?: number;
  }>({
    isOpen: false,
    type: 'success',
    title: '',
    message: '',
  });

  // 즉시 변경 시 계산 (실제 결제 기간 기준, 0 나누기 방지)
  // 기존 플랜: 변경일(오늘)까지 사용 → usedDays만큼 차감 후 daysLeft만큼 환불
  const refundAmount = totalDaysInPeriod > 0 ? Math.round((currentAmount / totalDaysInPeriod) * daysLeft) : 0;
  // 새 플랜: 변경일(오늘)부터 종료일까지 이용 → (daysLeft + 1)일 결제
  const proratedNewAmount = totalDaysInPeriod > 0 ? Math.round((newAmount / totalDaysInPeriod) * (daysLeft + 1)) : 0;
  // 실제 결제/환불 금액
  const immediatePayment = proratedNewAmount - refundAmount;

  // 멱등성 키 생성
  const generateIdempotencyKey = (operation: string) => {
    return `${operation}_${tenantId}_${Date.now()}`;
  };

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

      // 멱등성 키 생성
      const idempotencyKey = generateIdempotencyKey(mode === 'immediate' ? 'IMMEDIATE_CHANGE' : 'SCHEDULED_CHANGE');

      const response = await fetch('/api/subscriptions/change-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          email,
          tenantId,
          newPlan,
          newAmount,
          mode,
          refundAmount: actualRefundAmount, // 즉시 다운그레이드 시 환불 금액
          idempotencyKey,  // 멱등성 키 전달
        }),
      });

      const data = await response.json();

      const tenantParam = tenantId ? `&tenantId=${encodeURIComponent(tenantId)}` : '';

      if (response.ok) {
        if (mode === 'immediate' && data.requiresPayment) {
          // 업그레이드: 결제 페이지로 이동
          window.location.href = `/checkout?plan=${newPlan}&${authParam}${tenantParam}&mode=immediate&refund=${refundAmount}`;
        } else {
          // 다운그레이드 또는 예약 변경: 완료 모달
          setShowModal(false);
          if (mode === 'immediate') {
            setResultModal({
              isOpen: true,
              type: 'success',
              title: '플랜이 변경되었습니다',
              message: `${newPlanName} 플랜으로 즉시 변경되었습니다.`,
              refundAmount: data.refundProcessed ? data.refundAmount : undefined,
            });
          } else {
            setResultModal({
              isOpen: true,
              type: 'success',
              title: '플랜 변경이 예약되었습니다',
              message: `${nextBillingDate ? formatDate(nextBillingDate) : '다음 결제일'}부터 ${newPlanName} 플랜이 적용됩니다.`,
            });
          }
        }
      } else {
        setShowModal(false);
        setResultModal({
          isOpen: true,
          type: 'error',
          title: '플랜 변경 실패',
          message: data.error || '플랜 변경에 실패했습니다.',
        });
      }
    } catch {
      setShowModal(false);
      setResultModal({
        isOpen: true,
        type: 'error',
        title: '오류 발생',
        message: '오류가 발생했습니다. 다시 시도해주세요.',
      });
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
                <Xmark width={20} height={20} strokeWidth={1.5} />
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
                  <div className="w-10 h-10 bg-gray-900 rounded-full flex items-center justify-center flex-shrink-0">
                    <Flash width={20} height={20} strokeWidth={1.5} className="text-white" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-gray-900 mb-1">즉시 변경</h4>
                    <p className="text-sm text-gray-600 mb-3">
                      지금 바로 새 플랜을 이용합니다. 새 플랜은 기존 플랜의 만료일({nextBillingDate ? (() => {
                        const endDate = new Date(nextBillingDate);
                        endDate.setDate(endDate.getDate() - 1);
                        return formatDate(endDate.toISOString());
                      })() : '-'})까지 이용 가능합니다.
                    </p>
                    <div className="bg-gray-50 rounded-lg p-3 text-sm">
                      <div className="flex justify-between mb-1">
                        <span className="text-gray-500">새 플랜 비용 ({newPlanName})</span>
                        <span className="text-gray-900">+{formatPrice(proratedNewAmount)}원</span>
                      </div>
                      <div className="flex justify-between mb-1">
                        <span className="text-gray-500">현재 플랜 환불 ({getPlanName(currentPlan)})</span>
                        <span className="text-green-600">-{formatPrice(refundAmount)}원</span>
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

              {/* 변경 예약 옵션 */}
              <div
                className={`border-2 rounded-xl p-4 cursor-pointer transition-all ${
                  selectedMode === 'scheduled'
                    ? 'border-yamoo-primary bg-yellow-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => setSelectedMode('scheduled')}
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-gray-900 rounded-full flex items-center justify-center flex-shrink-0">
                    <Calendar width={20} height={20} strokeWidth={1.5} className="text-white" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-gray-900 mb-1">변경 예약</h4>
                    <p className="text-sm text-gray-600 mb-3">
                      다음 결제일부터 새 플랜이 적용됩니다. 현재 플랜은 만료일까지 유지됩니다.
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
                      * 현재 플랜({formatPrice(currentAmount)}원)은 {nextBillingDate ? (() => {
                        const endDate = new Date(nextBillingDate);
                        endDate.setDate(endDate.getDate() - 1);
                        return formatDate(endDate.toISOString());
                      })() : '만료일'}까지 유지
                    </p>
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

      {/* Result Modal */}
      {resultModal.isOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => {
              setResultModal(prev => ({ ...prev, isOpen: false }));
              if (resultModal.type === 'success') {
                window.location.href = tenantId ? `/account/${tenantId}${authParam ? `?${authParam}` : ''}` : `/account${authParam ? `?${authParam}` : ''}`;
              }
            }}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-sm w-full mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Icon */}
            <div className="pt-8 pb-4 flex justify-center">
              <div className={`w-16 h-16 rounded-full flex items-center justify-center ${
                resultModal.type === 'success' ? 'bg-green-100' : 'bg-red-100'
              }`}>
                {resultModal.type === 'success' ? (
                  <CheckCircle width={32} height={32} strokeWidth={1.5} className="text-green-600" />
                ) : (
                  <WarningCircle width={32} height={32} strokeWidth={1.5} className="text-red-600" />
                )}
              </div>
            </div>

            {/* Content */}
            <div className="px-6 pb-6 text-center">
              <h3 className="text-lg font-bold text-gray-900 mb-2">
                {resultModal.title}
              </h3>
              <p className="text-gray-600 text-sm mb-2">
                {resultModal.message}
              </p>
              {resultModal.refundAmount && resultModal.refundAmount > 0 && (
                <div className="bg-green-50 rounded-lg p-3 mb-4">
                  <p className="text-green-700 text-sm font-medium">
                    {formatPrice(resultModal.refundAmount)}원이 환불 처리됩니다
                  </p>
                  <p className="text-green-600 text-xs mt-1">
                    영업일 기준 3~5일 내 환불 완료
                  </p>
                </div>
              )}

              {/* Button */}
              <button
                onClick={() => {
                  setResultModal(prev => ({ ...prev, isOpen: false }));
                  if (resultModal.type === 'success') {
                    window.location.href = tenantId ? `/account/${tenantId}${authParam ? `?${authParam}` : ''}` : `/account${authParam ? `?${authParam}` : ''}`;
                  }
                }}
                className={`w-full py-3 px-4 rounded-lg font-semibold transition-colors ${
                  resultModal.type === 'success'
                    ? 'bg-gray-900 text-white hover:bg-gray-800'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
