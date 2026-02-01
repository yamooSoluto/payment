'use client';

import { useState, useMemo, useEffect } from 'react';
import { RefreshDouble, WarningTriangle } from 'iconoir-react';
import { SubscriptionFormProps, PLAN_PRICES, formatDateForInput, PlanType } from './types';

interface LatestPaymentInfo {
  id: string;
  amount: number;
  plan: string;
  paymentKey: string | null;
  paidAt: string | null;
  orderId: string;
}

type CancelMode = 'scheduled' | 'immediate';

const REFUND_REASONS = ['불만', '실수', '변심', '버그', '관리', '기타'] as const;
type RefundReason = '' | (typeof REFUND_REASONS)[number];

export default function CancelSubscriptionForm({
  tenantId,
  subscription,
  tenant: _tenant,
  onSuccess,
  onCancel,
}: SubscriptionFormProps) {
  void _tenant; // Props interface 호환성 유지
  const [cancelMode, setCancelMode] = useState<CancelMode>('scheduled');
  const [reason, setReason] = useState('');
  const [processRefund, setProcessRefund] = useState(true);
  const [refundReason, setRefundReason] = useState<RefundReason>('');
  const [customRefundAmount, setCustomRefundAmount] = useState<string>('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [latestPayment, setLatestPayment] = useState<LatestPaymentInfo | null>(null);
  const [paymentLoading, setPaymentLoading] = useState(true);

  // 원결제 내역 조회
  useEffect(() => {
    const fetchPayment = async () => {
      try {
        const res = await fetch(`/api/admin/subscriptions/${tenantId}/latest-payment`);
        if (res.ok) {
          const data = await res.json();
          setLatestPayment(data.payment || null);
          // 원결제 없으면 환불 체크 해제
          if (!data.payment) {
            setProcessRefund(false);
          }
        }
      } catch {
        // 조회 실패 시 무시
      } finally {
        setPaymentLoading(false);
      }
    };
    fetchPayment();
  }, [tenantId]);

  // Firestore Timestamp 처리
  const getDateString = (value: unknown): string => {
    if (!value) return '-';
    if (typeof value === 'string') return formatDateForInput(value);
    if (typeof value === 'object' && value !== null && 'toDate' in value) {
      return formatDateForInput((value as { toDate: () => Date }).toDate());
    }
    return '-';
  };

  const periodEndDate = getDateString(subscription?.currentPeriodEnd);
  const planAmount = subscription?.amount || PLAN_PRICES[subscription?.plan as PlanType] || 0;
  // 실제 결제 금액: 원결제 내역이 있으면 그 금액, 없으면 플랜 금액
  const paidAmount = latestPayment?.amount ?? 0;
  const hasRealPayment = !!latestPayment?.paymentKey;

  // 환불 예상 금액 계산 (pro-rata) - 실제 결제 금액 기준
  const calculatedRefundAmount = useMemo(() => {
    if (!subscription || !hasRealPayment) return 0;
    const currentAmount = paidAmount;
    if (currentAmount <= 0) return 0;

    const periodStart = subscription.currentPeriodStart
      ? new Date(subscription.currentPeriodStart)
      : null;
    const nextBilling = subscription.nextBillingDate
      ? new Date(subscription.nextBillingDate)
      : null;

    if (!periodStart || !nextBilling) return 0;

    const startOnly = new Date(periodStart);
    startOnly.setHours(0, 0, 0, 0);
    const nextOnly = new Date(nextBilling);
    nextOnly.setHours(0, 0, 0, 0);

    const totalDays = Math.round(
      (nextOnly.getTime() - startOnly.getTime()) / (1000 * 60 * 60 * 24)
    );

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const usedDays = Math.round(
      (today.getTime() - startOnly.getTime()) / (1000 * 60 * 60 * 24)
    ) + 1;

    const daysLeft = Math.max(0, totalDays - usedDays);
    if (totalDays <= 0) return 0;

    return Math.round((currentAmount / totalDays) * daysLeft);
  }, [subscription, hasRealPayment, paidAmount]);

  // 실제 환불 금액 (커스텀 입력 or 자동 계산)
  const effectiveRefundAmount = customRefundAmount !== ''
    ? parseInt(customRefundAmount, 10) || 0
    : calculatedRefundAmount;

  // 검증 후 확인 화면으로 전환
  const handleRequestConfirm = () => {
    setError('');

    if (cancelMode === 'immediate' && processRefund) {
      if (!hasRealPayment) {
        setError('원결제 내역이 없어 환불 처리를 할 수 없습니다.');
        return;
      }
      if (refundReason === '') {
        setError('환불 사유를 선택해주세요.');
        return;
      }
      if (effectiveRefundAmount > paidAmount) {
        setError(`환불 금액은 결제 금액(${paidAmount.toLocaleString()}원)을 초과할 수 없습니다.`);
        return;
      }
      if (effectiveRefundAmount < 0) {
        setError('환불 금액은 0원 이상이어야 합니다.');
        return;
      }
    }

    setShowConfirm(true);
  };

  // 실제 처리
  const handleSubmit = async () => {
    setIsSaving(true);
    setError('');
    try {
      const response = await fetch(`/api/admin/subscriptions/${tenantId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cancelMode,
          reason,
          ...(cancelMode === 'immediate' && {
            processRefund,
            ...(processRefund && {
              refundAmount: effectiveRefundAmount,
              refundReason,
            }),
          }),
        }),
      });

      const data = await response.json();

      if (response.ok) {
        if (data.message) {
          alert(data.message);
        }
        onSuccess();
      } else {
        setShowConfirm(false);
        setError(data.error || '구독 해지에 실패했습니다.');
      }
    } catch {
      setShowConfirm(false);
      setError('오류가 발생했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  // 확인 화면
  if (showConfirm) {
    return (
      <div className="space-y-4">
        <div className="text-sm font-medium text-gray-900">
          {cancelMode === 'immediate' ? '즉시 해지 확인' : '해지 예약 확인'}
        </div>

        <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-2.5 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">해지 방식</span>
            <span className={`font-medium ${cancelMode === 'immediate' ? 'text-red-600' : 'text-blue-600'}`}>
              {cancelMode === 'immediate' ? '즉시 해지' : '해지 예약'}
            </span>
          </div>

          {cancelMode === 'scheduled' && periodEndDate !== '-' && (
            <div className="flex justify-between">
              <span className="text-gray-500">해지 예정일</span>
              <span className="text-gray-900">{periodEndDate}</span>
            </div>
          )}

          {cancelMode === 'immediate' && (
            <>
              <div className="flex justify-between">
                <span className="text-gray-500">원결제 금액</span>
                <span className={`font-medium ${hasRealPayment ? 'text-gray-900' : 'text-gray-400'}`}>
                  {hasRealPayment ? `${paidAmount.toLocaleString()}원` : '결제 내역 없음'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">환불 처리</span>
                <span className={`font-medium ${processRefund ? 'text-red-600' : 'text-gray-400'}`}>
                  {processRefund ? '예' : '아니오'}
                </span>
              </div>
              {processRefund && (
                <>
                  <div className="flex justify-between">
                    <span className="text-gray-500">환불 금액</span>
                    <span className="font-medium text-red-600">
                      {effectiveRefundAmount.toLocaleString()}원
                      {effectiveRefundAmount !== calculatedRefundAmount && (
                        <span className="text-gray-400 font-normal ml-1">
                          (일할계산: {calculatedRefundAmount.toLocaleString()}원)
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">환불 사유</span>
                    <span className="text-gray-900">{refundReason}</span>
                  </div>
                </>
              )}
            </>
          )}

          {reason && (
            <div className="flex justify-between">
              <span className="text-gray-500">메모</span>
              <span className="text-gray-900 text-right max-w-[60%]">{reason}</span>
            </div>
          )}
        </div>

        {cancelMode === 'immediate' && !hasRealPayment && (
          <div className="text-xs text-gray-500 bg-yellow-50 border border-yellow-200 p-2.5 rounded-lg">
            원결제 내역이 없어 환불 없이 해지만 처리됩니다.
          </div>
        )}

        {error && (
          <div className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">
            {error}
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button
            onClick={() => setShowConfirm(false)}
            disabled={isSaving}
            className="flex-1 py-2.5 px-4 rounded-lg font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors disabled:opacity-50"
          >
            이전
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSaving}
            className={`flex-1 py-2.5 px-4 rounded-lg font-medium text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${
              cancelMode === 'immediate'
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {isSaving ? (
              <>
                <RefreshDouble className="w-4 h-4 animate-spin" />
                처리 중...
              </>
            ) : (
              <>
                <WarningTriangle className="w-4 h-4" />
                확인
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  // 입력 화면
  return (
    <div className="space-y-4">
      {/* 해지 방식 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">해지 방식</label>
        <div className="space-y-2">
          <label
            className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
              cancelMode === 'scheduled'
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-200 hover:bg-gray-50'
            }`}
          >
            <input
              type="radio"
              name="cancelMode"
              value="scheduled"
              checked={cancelMode === 'scheduled'}
              onChange={() => setCancelMode('scheduled')}
              className="mt-0.5 w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
            />
            <div>
              <div className="font-medium text-gray-900 text-sm">해지 예약</div>
              <div className="text-xs text-gray-500 mt-0.5">
                현재 이용기간 종료 후 해지됩니다.
                {periodEndDate !== '-' && ` (${periodEndDate})`}
              </div>
            </div>
          </label>

          <label
            className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
              cancelMode === 'immediate'
                ? 'border-red-500 bg-red-50'
                : 'border-gray-200 hover:bg-gray-50'
            }`}
          >
            <input
              type="radio"
              name="cancelMode"
              value="immediate"
              checked={cancelMode === 'immediate'}
              onChange={() => setCancelMode('immediate')}
              className="mt-0.5 w-4 h-4 text-red-600 border-gray-300 focus:ring-red-500"
            />
            <div>
              <div className="font-medium text-gray-900 text-sm">즉시 해지</div>
              <div className="text-xs text-gray-500 mt-0.5">
                지금 바로 구독이 해지됩니다. 서비스 이용이 즉시 중단됩니다.
              </div>
            </div>
          </label>
        </div>
      </div>

      {/* 즉시 해지 시 환불 옵션 */}
      {cancelMode === 'immediate' && (
        <div className="space-y-3">
          {/* 원결제 정보 */}
          <div className="p-3 rounded-lg border border-gray-200 bg-gray-50">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">원결제 금액</span>
              {paymentLoading ? (
                <span className="text-gray-400">조회 중...</span>
              ) : hasRealPayment ? (
                <span className="text-gray-900 font-medium">{paidAmount.toLocaleString()}원</span>
              ) : (
                <span className="text-gray-400">결제 내역 없음</span>
              )}
            </div>
            {!paymentLoading && hasRealPayment && latestPayment?.paidAt && (
              <div className="flex justify-between text-xs mt-1">
                <span className="text-gray-400">결제일</span>
                <span className="text-gray-500">{formatDateForInput(latestPayment.paidAt)}</span>
              </div>
            )}
            {!paymentLoading && !hasRealPayment && (
              <div className="text-xs text-gray-400 mt-1">
                관리자가 생성한 구독으로 실제 결제 내역이 없습니다.
              </div>
            )}
            {!paymentLoading && hasRealPayment && planAmount !== paidAmount && (
              <div className="flex justify-between text-xs mt-1">
                <span className="text-gray-400">플랜 금액</span>
                <span className="text-gray-500">{planAmount.toLocaleString()}원</span>
              </div>
            )}
          </div>

          {/* 환불 처리 체크박스 */}
          <label className={`flex items-center gap-2 ${hasRealPayment ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}>
            <input
              type="checkbox"
              checked={processRefund}
              onChange={(e) => setProcessRefund(e.target.checked)}
              disabled={!hasRealPayment}
              className="w-4 h-4 text-red-600 border-gray-300 rounded focus:ring-red-500"
            />
            <span className="text-sm font-medium text-gray-700">
              환불 처리
              {!hasRealPayment && <span className="text-gray-400 font-normal ml-1">(결제 내역 없음)</span>}
            </span>
          </label>

          {processRefund && hasRealPayment && (
            <div className="ml-6 space-y-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
              {/* 환불 금액 */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  환불 금액
                  <span className="text-gray-400 ml-1">
                    (일할계산: {calculatedRefundAmount.toLocaleString()}원)
                  </span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={paidAmount}
                    value={customRefundAmount !== '' ? customRefundAmount : calculatedRefundAmount}
                    onChange={(e) => setCustomRefundAmount(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-red-500"
                  />
                  <span className="text-sm text-gray-500 whitespace-nowrap">원</span>
                </div>
                {customRefundAmount !== '' && parseInt(customRefundAmount, 10) !== calculatedRefundAmount && (
                  <button
                    type="button"
                    onClick={() => setCustomRefundAmount('')}
                    className="text-xs text-blue-600 hover:underline mt-1"
                  >
                    자동 계산 금액으로 복원
                  </button>
                )}
              </div>

              {/* 환불 사유 */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">환불 사유</label>
                <div className="flex flex-wrap gap-1.5">
                  {REFUND_REASONS.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRefundReason(r)}
                      className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                        refundReason === r
                          ? 'border-red-500 bg-red-50 text-red-700'
                          : 'border-gray-200 text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 메모 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">메모 (선택)</label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="해지 사유를 입력하세요"
          rows={2}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 resize-none"
        />
      </div>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">
          {error}
        </div>
      )}

      {/* 버튼 */}
      <div className="flex gap-3 pt-2">
        <button
          onClick={onCancel}
          className="flex-1 py-2.5 px-4 rounded-lg font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
        >
          취소
        </button>
        <button
          onClick={handleRequestConfirm}
          className={`flex-1 py-2.5 px-4 rounded-lg font-medium text-white transition-colors flex items-center justify-center gap-2 ${
            cancelMode === 'immediate'
              ? 'bg-red-600 hover:bg-red-700'
              : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          <WarningTriangle className="w-4 h-4" />
          {cancelMode === 'immediate' ? '즉시 해지' : '해지 예약'}
        </button>
      </div>
    </div>
  );
}
