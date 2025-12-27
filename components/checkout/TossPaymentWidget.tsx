'use client';

import { useState } from 'react';
import { formatPrice } from '@/lib/utils';
import { useTossSDK, getTossPayments } from '@/hooks/useTossSDK';

interface TossPaymentWidgetProps {
  email: string;
  plan: string;
  planName: string;
  amount: number;
  tenantId?: string;
  isUpgrade?: boolean;
  fullAmount?: number;
  isNewTenant?: boolean;
  authParam?: string;
}

export default function TossPaymentWidget({
  email,
  plan,
  planName,
  amount,
  tenantId,
  isUpgrade = false,
  fullAmount,
  isNewTenant = false,
  authParam = '',
}: TossPaymentWidgetProps) {
  const { isReady: sdkReady, isLoading, error: sdkError } = useTossSDK();
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(sdkError);
  const [agreed, setAgreed] = useState(false);

  // 신규 매장인 경우 tenantId를 'new'로 처리
  const effectiveTenantId = tenantId || (isNewTenant ? 'new' : '');

  const handlePayment = async () => {
    if (!agreed) {
      setError('정기결제 약관에 동의해주세요.');
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      if (isUpgrade) {
        // 업그레이드: 기존 빌링키로 차액 결제
        const response = await fetch('/api/payments/upgrade', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            tenantId: effectiveTenantId,
            newPlan: plan,
            newAmount: fullAmount,
            proratedAmount: amount,
          }),
        });

        const data = await response.json();

        if (response.ok) {
          window.location.href = `/checkout/success?plan=${plan}&tenantId=${effectiveTenantId}&orderId=${data.orderId}`;
        } else {
          throw new Error(data.error || '업그레이드에 실패했습니다.');
        }
      } else {
        // 신규 결제: 빌링키 발급
        if (!sdkReady) {
          setError('결제 SDK가 준비되지 않았습니다.');
          return;
        }

        const tossPayments = getTossPayments();

        // 빌링키 발급 요청 (카드 등록 페이지로 리다이렉트)
        const authQuery = authParam ? `&${authParam}` : '';
        await tossPayments.requestBillingAuth('카드', {
          customerKey: email,
          successUrl: `${window.location.origin}/api/payments/billing-confirm?plan=${plan}&amount=${amount}&tenantId=${effectiveTenantId}${authQuery}`,
          failUrl: `${window.location.origin}/checkout?plan=${plan}&tenantId=${effectiveTenantId}${authQuery}&error=payment_failed`,
          customerEmail: email,
        });
      }
    } catch (err) {
      console.error('결제 실패:', err);
      setError(`결제에 실패했습니다: ${err instanceof Error ? err.message : '알 수 없는 오류'}`);
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 결제 정보 요약 */}
      <div className="bg-gray-50 rounded-lg p-4">
        <div className="flex justify-between items-center mb-2">
          <span className="text-gray-600">선택한 플랜</span>
          <span className="font-semibold">{planName}</span>
        </div>
        {isUpgrade && fullAmount ? (
          <>
            <div className="flex justify-between items-center mb-2">
              <span className="text-gray-600">정상가</span>
              <span className="text-gray-400 line-through">
                {formatPrice(fullAmount)}원 / 월
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">지금 결제 (차액)</span>
              <span className="text-xl font-bold text-yamoo-primary">
                {formatPrice(amount)}원
              </span>
            </div>
          </>
        ) : (
          <div className="flex justify-between items-center">
            <span className="text-gray-600">결제 금액</span>
            <span className="text-xl font-bold text-yamoo-primary">
              {formatPrice(amount)}원 / 월
            </span>
          </div>
        )}
      </div>

      {/* 안내 */}
      <div className="bg-blue-50 rounded-lg p-4">
        <h3 className="font-medium text-blue-900 mb-2">
          {isUpgrade ? '플랜 업그레이드 결제' : '정기결제 카드 등록'}
        </h3>
        <p className="text-sm text-blue-700">
          {isUpgrade
            ? '등록된 카드로 차액이 즉시 결제됩니다. 다음 결제일부터 새 플랜 금액이 정기 결제됩니다.'
            : '아래 버튼을 클릭하면 카드 등록 페이지로 이동합니다. 카드 등록 후 자동으로 첫 결제가 진행됩니다.'}
        </p>
      </div>

      {/* 약관 동의 */}
      <div className="border rounded-lg p-4">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-1 w-5 h-5 text-yamoo-primary rounded border-gray-300 focus:ring-yamoo-primary"
          />
          <div>
            <span className="font-medium text-gray-900">
              {isUpgrade ? '업그레이드 결제에 동의합니다 (필수)' : '정기결제 약관에 동의합니다 (필수)'}
            </span>
            <p className="text-sm text-gray-500 mt-1">
              {isUpgrade && fullAmount
                ? `지금 ${formatPrice(amount)}원이 결제되고, 다음 결제일부터 매월 ${formatPrice(fullAmount)}원이 자동 결제됩니다.`
                : `매월 ${formatPrice(amount)}원이 자동으로 결제됩니다. 언제든지 구독을 해지할 수 있습니다.`}
            </p>
          </div>
        </label>
      </div>

      {/* 에러 메시지 */}
      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* 결제 버튼 */}
      <button
        onClick={handlePayment}
        disabled={isLoading || isProcessing || !agreed}
        className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLoading ? (
          <span className="flex items-center justify-center gap-2">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
            로딩 중...
          </span>
        ) : isProcessing ? (
          <span className="flex items-center justify-center gap-2">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
            {isUpgrade ? '결제 처리 중...' : '카드 등록 페이지로 이동 중...'}
          </span>
        ) : isUpgrade ? (
          `${formatPrice(amount)}원 결제하기`
        ) : (
          '카드 등록하고 결제하기'
        )}
      </button>

      {/* 안내 문구 */}
      <ul className="text-sm text-gray-500 space-y-1">
        {isUpgrade ? (
          <>
            <li>• 등록된 카드로 즉시 결제됩니다.</li>
            <li>• 업그레이드 후 새 플랜 기능을 바로 이용할 수 있습니다.</li>
          </>
        ) : (
          <>
            <li>• 첫 결제 후 매월 동일한 날짜에 자동 결제됩니다.</li>
            <li>• 언제든지 구독을 해지할 수 있습니다.</li>
          </>
        )}
        <li>• 결제 관련 문의: <button type="button" onClick={() => window.ChannelIO?.('showMessenger')} className="text-yamoo-primary hover:underline">야무 YAMOO</button></li>
      </ul>
    </div>
  );
}
