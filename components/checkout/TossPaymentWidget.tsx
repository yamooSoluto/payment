'use client';

import { useState, useRef, useEffect } from 'react';
import { formatPrice } from '@/lib/utils';
import { useTossSDK, getTossPayments } from '@/hooks/useTossSDK';
import { Check, InfoCircle } from 'iconoir-react';

// 플랜별 상세 기능 (요금제 페이지와 동일)
const PLAN_FEATURES: Record<string, string[]> = {
  basic: [
    '월 300건 이내',
    '데이터 무제한 추가',
    'AI 자동 답변',
    '업무 처리 메세지 요약 전달',
  ],
  business: [
    'Basic 기능 모두 포함',
    '문의 건수 제한 없음',
    '답변 메시지 AI 보정',
    '미니맵 연동 및 활용',
    '예약 및 재고 연동',
  ],
};

interface TossPaymentWidgetProps {
  email: string;
  plan: string;
  planName: string;
  amount: number;
  tenantId?: string;
  isUpgrade?: boolean;
  isReserve?: boolean;  // Trial 예약 모드
  fullAmount?: number;
  isNewTenant?: boolean;
  authParam?: string;
  nextBillingDate?: string; // 업그레이드 시 다음 결제일
  trialEndDate?: string;    // Trial 종료일 (예약 모드)
}

// 이용기간 계산 (종료일 = 다음 결제일 하루 전)
function getSubscriptionPeriod(nextBillingDate?: string, isReserve?: boolean, trialEndDate?: string): { start: string; end: string; nextBilling: string } {
  const today = new Date();

  // 컴팩트한 날짜 포맷 (YYYY-MM-DD)
  const formatDate = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // 예약 모드: 무료체험 종료일 = 첫 결제일, 이용시작은 그 다음날
  if (isReserve && trialEndDate) {
    const billingDate = new Date(trialEndDate); // 결제일 = 무료체험 종료일
    const startDate = new Date(billingDate);
    startDate.setDate(startDate.getDate() + 1); // 이용 시작일 = 결제일 다음날
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + 1);
    endDate.setDate(endDate.getDate() - 1); // 이용 종료일 = 시작일 + 1개월 - 1일

    return {
      start: formatDate(startDate),
      end: formatDate(endDate),
      nextBilling: formatDate(billingDate),
    };
  }

  // 일반 모드
  const startDate = today;

  // 다음 결제일: 시작일 + 1개월 (달력 기준)
  let billingDate: Date;
  if (nextBillingDate) {
    billingDate = new Date(nextBillingDate);
  } else {
    billingDate = new Date(startDate);
    billingDate.setMonth(billingDate.getMonth() + 1);
  }

  // 이용 기간 종료일 = 다음 결제일 - 1일
  const endDate = new Date(billingDate);
  endDate.setDate(endDate.getDate() - 1);

  return {
    start: formatDate(startDate),
    end: formatDate(endDate),
    nextBilling: formatDate(billingDate),
  };
}

export default function TossPaymentWidget({
  email,
  plan,
  planName,
  amount,
  tenantId,
  isUpgrade = false,
  isReserve = false,
  fullAmount,
  isNewTenant = false,
  authParam = '',
  nextBillingDate,
  trialEndDate,
}: TossPaymentWidgetProps) {
  const { isReady: sdkReady, isLoading, error: sdkError } = useTossSDK();
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(sdkError);
  const [agreed, setAgreed] = useState(false);
  const [showPlanTooltip, setShowPlanTooltip] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // 툴팁 외부 클릭 시 닫기
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(event.target as Node)) {
        setShowPlanTooltip(false);
      }
    };

    if (showPlanTooltip) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showPlanTooltip]);

  const planFeatures = PLAN_FEATURES[plan] || [];

  // 신규 매장인 경우 tenantId를 'new'로 처리
  const effectiveTenantId = tenantId || (isNewTenant ? 'new' : '');

  const handlePayment = async () => {
    if (!agreed) {
      setError('결제/환불 규정에 동의해주세요.');
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
          const authQuery = authParam ? `&${authParam}` : '';
          window.location.href = `/checkout/success?plan=${plan}&tenantId=${effectiveTenantId}&orderId=${data.orderId}${authQuery}`;
        } else {
          throw new Error(data.error || '업그레이드에 실패했습니다.');
        }
      } else {
        // 신규 결제 or 예약: 빌링키 발급
        if (!sdkReady) {
          setError('결제 SDK가 준비되지 않았습니다.');
          return;
        }

        const tossPayments = getTossPayments();

        // 빌링키 발급 요청 (카드 등록 페이지로 리다이렉트)
        const authQuery = authParam ? `&${authParam}` : '';
        const reserveQuery = isReserve ? `&mode=reserve` : '';
        await tossPayments.requestBillingAuth('카드', {
          customerKey: email,
          successUrl: `${window.location.origin}/api/payments/billing-confirm?plan=${plan}&amount=${amount}&tenantId=${effectiveTenantId}${authQuery}${reserveQuery}`,
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

  const period = getSubscriptionPeriod(nextBillingDate, isReserve, trialEndDate);

  return (
    <div className="space-y-6">
      {/* 결제 정보 요약 */}
      <div className="bg-gray-50 rounded-lg p-4">
        <div className="flex justify-between items-center mb-2">
          <span className="text-gray-600">선택한 플랜</span>
          <div className="relative" ref={tooltipRef}>
            <button
              type="button"
              onClick={() => setShowPlanTooltip(!showPlanTooltip)}
              onMouseEnter={() => setShowPlanTooltip(true)}
              onMouseLeave={() => setShowPlanTooltip(false)}
              className="font-semibold flex items-center gap-1 hover:text-yamoo-primary transition-colors"
            >
              {planName}
              <InfoCircle width={16} height={16} strokeWidth={1.5} className="text-gray-400" />
            </button>
            {/* 플랜 상세 툴팁 */}
            {showPlanTooltip && planFeatures.length > 0 && (
              <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-lg shadow-xl border border-gray-200 p-4 z-50">
                <h4 className="font-semibold text-gray-900 mb-3">{planName} 플랜 혜택</h4>
                <ul className="space-y-2">
                  {planFeatures.map((feature, index) => (
                    <li key={index} className="flex items-start gap-2 text-sm">
                      <Check width={16} height={16} strokeWidth={2} className="text-green-500 flex-shrink-0 mt-0.5" />
                      <span className="text-gray-600">{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
        <div className="flex justify-between items-center mb-2">
          <span className="text-gray-600">이용 기간</span>
          <span className="text-sm text-gray-900 whitespace-nowrap">
            {period.start}~{period.end}
          </span>
        </div>
        <div className="flex justify-between items-center mb-2">
          <span className="text-gray-600">{isReserve ? '첫 결제일' : '다음 결제일'}</span>
          <span className="text-sm text-gray-900">
            {period.nextBilling}
          </span>
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
              <span className="text-xl font-bold text-gray-900">
                {formatPrice(amount)}원
              </span>
            </div>
          </>
        ) : isReserve ? (
          <div className="flex justify-between items-center">
            <span className="text-gray-600">예약 후 결제 금액</span>
            <span className="text-xl font-bold text-gray-900">
              {formatPrice(amount)}원 / 월
            </span>
          </div>
        ) : (
          <div className="flex justify-between items-center">
            <span className="text-gray-600">결제 금액</span>
            <span className="text-xl font-bold text-gray-900">
              {formatPrice(amount)}원 / 월
            </span>
          </div>
        )}
      </div>

      {/* 안내 */}
      <div className="bg-blue-50 rounded-lg p-4">
        <h3 className="font-medium text-blue-900 mb-2">
          {isUpgrade ? '플랜 업그레이드 결제' : isReserve ? '무료체험 종료 후 자동 시작' : '정기결제 카드 등록'}
        </h3>
        <p className="text-sm text-blue-700">
          {isUpgrade
            ? '등록된 카드로 차액이 즉시 결제됩니다. 다음 결제일부터 새 플랜 금액이 정기 결제됩니다.'
            : isReserve
            ? `무료체험이 종료되면 자동으로 ${planName} 플랜이 시작되며, 등록하신 카드로 ${formatPrice(amount)}원이 결제됩니다.`
            : '아래 버튼을 클릭하면 카드 등록 페이지로 이동합니다. 카드 등록 후 자동으로 첫 결제가 진행됩니다.'}
        </p>
      </div>

      {/* 결제/환불 규정 동의 */}
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
              결제/환불 규정에 동의합니다 (필수)
            </span>
            <p className="text-sm text-gray-500 mt-1">
              {isUpgrade && fullAmount
                ? `지금 ${formatPrice(amount)}원이 결제되고, 다음 결제일부터 매월 ${formatPrice(fullAmount)}원이 자동 결제됩니다.`
                : isReserve
                ? `무료체험 종료일인 ${period.nextBilling}부터 매월 ${formatPrice(amount)}원이 자동으로 결제됩니다.`
                : `매월 ${formatPrice(amount)}원이 자동으로 결제됩니다.`}
              {' '}구독 해지 시 다음 결제일부터 결제가 중단되며, 이미 결제된 금액은 환불되지 않습니다.
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
        disabled={isLoading || isProcessing}
        className="w-full py-4 px-6 rounded-lg font-semibold transition-all bg-gray-900 text-yamoo-primary hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLoading ? (
          <span className="flex items-center justify-center gap-2">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-yamoo-primary"></div>
            로딩 중...
          </span>
        ) : isProcessing ? (
          <span className="flex items-center justify-center gap-2">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-yamoo-primary"></div>
            {isUpgrade ? '결제 처리 중...' : '카드 등록 페이지로 이동 중...'}
          </span>
        ) : isUpgrade ? (
          `${formatPrice(amount)}원 결제하기`
        ) : isReserve ? (
          '카드 등록하고 예약하기'
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
        ) : isReserve ? (
          <>
            <li>• 무료체험 종료 후 자동으로 유료 플랜이 시작됩니다.</li>
            <li>• 예약을 취소하려면 구독 설정에서 언제든 취소할 수 있습니다.</li>
            <li>• 무료체험 기간 동안에는 결제되지 않습니다.</li>
          </>
        ) : (
          <>
            <li>• 첫 결제 후 매월 동일한 날짜에 자동 결제됩니다.</li>
            <li>• 언제든지 구독을 해지할 수 있습니다.</li>
          </>
        )}
      </ul>
    </div>
  );
}
