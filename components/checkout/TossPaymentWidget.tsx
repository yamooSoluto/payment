'use client';

import { useState, useRef, useEffect } from 'react';
import { formatPrice } from '@/lib/utils';
import { useTossSDK, getTossPayment } from '@/hooks/useTossSDK';
import { Check, InfoCircle, NavArrowDown, NavArrowUp } from 'iconoir-react';
import { AGREEMENT_LABEL, REFUND_POLICY_ITEMS, getPaymentScheduleTexts } from '@/lib/payment-constants';
import RefundPolicyModal from '@/components/modals/RefundPolicyModal';
import { useAuth } from '@/contexts/AuthContext';

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

// 환불/결제 계산 상세 정보
interface CalculationDetails {
  totalDays: number;        // 총 결제 기간 일수
  usedDays: number;         // 사용한 일수
  daysLeft: number;         // 남은 일수
  currentPlanAmount: number; // 현재 플랜 월정액
  usedAmount: number;       // 사용한 금액
  currentRefund: number;    // 현재 플랜 환불액
  newPlanRemaining: number; // 새 플랜 남은 기간 금액
  currentPeriodStart?: string; // 현재 구독 시작일
  currentPeriodEndDate?: string; // 현재 구독 종료일
}

interface TossPaymentWidgetProps {
  email: string;
  plan: string;
  planName: string;
  amount: number;
  tenantId?: string;
  isChangePlan?: boolean;     // 즉시 플랜 변경 (Active 구독자)
  isDowngrade?: boolean;      // 다운그레이드 여부 (환불 필요)
  refundAmount?: number;      // 다운그레이드 시 환불 금액
  isReserve?: boolean;        // 예약 모드 (Trial 또는 Active)
  isTrialImmediate?: boolean; // Trial에서 즉시 전환
  fullAmount?: number;
  isNewTenant?: boolean;
  authParam?: string;
  nextBillingDate?: string;   // 다음 결제일
  trialEndDate?: string;      // Trial 종료일 (Trial 예약 모드)
  currentPeriodEnd?: string;  // 현재 구독 기간 종료일 (Active 예약 모드)
  hasBillingKey?: boolean;    // 이미 카드가 등록되어 있는지
  calculationDetails?: CalculationDetails; // 환불/결제 계산 상세 정보
  currentPlanName?: string;   // 현재 플랜 이름
  brandName?: string;         // 신규 매장 이름
  industry?: string;          // 신규 매장 업종
  customLinkId?: string;      // 커스텀 결제 링크 ID
  customBillingType?: 'recurring' | 'onetime';  // 커스텀 링크 결제 유형
  customSubscriptionDays?: number;  // 1회성 결제 시 이용 기간 (일 단위)
}

// 이용기간 계산 (종료일 = 다음 결제일 하루 전)
function getSubscriptionPeriod(
  nextBillingDate?: string,
  isReserve?: boolean,
  trialEndDate?: string,
  currentPeriodEnd?: string
): { start: string; end: string; nextBilling: string } {
  const today = new Date();

  // 컴팩트한 날짜 포맷 (YYYY-MM-DD)
  const formatDate = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Active 구독자 예약 모드: 현재 구독 종료일 다음날부터 새 플랜 시작
  if (isReserve && currentPeriodEnd) {
    const periodEnd = new Date(currentPeriodEnd);
    const startDate = new Date(periodEnd);
    startDate.setDate(startDate.getDate() + 1); // 이용 시작일 = 현재 구독 종료일 + 1
    const billingDate = new Date(startDate); // 결제일 = 시작일과 동일
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + 1);
    endDate.setDate(endDate.getDate() - 1); // 이용 종료일 = 시작일 + 1개월 - 1일

    return {
      start: formatDate(startDate),
      end: formatDate(endDate),
      nextBilling: formatDate(billingDate),
    };
  }

  // Trial 예약 모드: 무료체험 종료일 다음날부터 유료 플랜 시작
  if (isReserve && trialEndDate) {
    const trialEnd = new Date(trialEndDate);
    const startDate = new Date(trialEnd);
    startDate.setDate(startDate.getDate() + 1); // 이용 시작일 = 무료체험 종료일 + 1
    const billingDate = new Date(startDate); // 첫 결제일 = 이용 시작일
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
  isChangePlan = false,
  isDowngrade = false,
  refundAmount = 0,
  isReserve = false,
  isTrialImmediate = false,
  fullAmount,
  isNewTenant = false,
  authParam = '',
  nextBillingDate,
  trialEndDate,
  currentPeriodEnd,
  hasBillingKey = false,
  calculationDetails,
  currentPlanName,
  brandName,
  industry,
  customLinkId,
  customBillingType,
  customSubscriptionDays,
}: TossPaymentWidgetProps) {
  const { user } = useAuth();
  const { isReady: sdkReady, isLoading, error: sdkError } = useTossSDK();
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(sdkError);
  const [agreed, setAgreed] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showPlanTooltip, setShowPlanTooltip] = useState(false);
  const [showCalculationDetails, setShowCalculationDetails] = useState(false);
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

  // 멱등성 키 생성 (결제 시도당 고유한 키)
  const generateIdempotencyKey = (operation: string) => {
    return `${operation}_${effectiveTenantId}_${Date.now()}`;
  };

  const handlePayment = async () => {
    if (!agreed) {
      setError('결제/환불 규정에 동의해주세요.');
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      // Firebase ID 토큰 가져오기
      let idToken = '';
      if (user) {
        idToken = await user.getIdToken();
      }

      if (isChangePlan) {
        // 플랜 변경: 기존 플랜 환불 + 새 플랜 결제
        const idempotencyKey = generateIdempotencyKey('PLAN_CHANGE');
        // authParam에서 SSO token 추출 (token=xxx 형태) - Firebase 토큰이 없을 때 fallback
        const params = new URLSearchParams(authParam);
        const ssoToken = params.get('token');
        const authHeader = idToken ? `Bearer ${idToken}` : ssoToken || '';
        const response = await fetch('/api/payments/change-plan', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(authHeader && { 'Authorization': authHeader }),
          },
          body: JSON.stringify({
            tenantId: effectiveTenantId,
            newPlan: plan,
            idempotencyKey,  // 멱등성 키 전달
          }),
        });

        const data = await response.json();

        if (response.ok) {
          const authQuery = authParam ? `&${authParam}` : '';
          // 플랜 변경 시 기존 구독 종료일 유지 (start: 오늘, end: 기존 다음 결제일)
          let periodQuery = '';
          if (currentPeriodEnd) {
            const today = new Date();
            periodQuery = `&start=${today.toISOString()}&end=${new Date(currentPeriodEnd).toISOString()}`;
          }
          window.location.href = `/checkout/success?plan=${plan}&tenantId=${effectiveTenantId}&orderId=${data.orderId}&changed=true${periodQuery}${authQuery}`;
        } else {
          throw new Error(data.error || '플랜 변경에 실패했습니다.');
        }
      } else if (hasBillingKey && isReserve && currentPeriodEnd) {
        // Active 구독자 + 카드 등록됨 + 예약 모드: 기존 빌링키로 예약 API 호출
        const idempotencyKey = generateIdempotencyKey('SCHEDULED_CHANGE');
        const authHeader = idToken ? `Bearer ${idToken}` : '';
        const response = await fetch('/api/subscriptions/change-plan', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(authHeader && { 'Authorization': authHeader }),
          },
          body: JSON.stringify({
            email,
            tenantId: effectiveTenantId,
            newPlan: plan,
            newAmount: fullAmount,
            mode: 'scheduled',
            idempotencyKey,  // 멱등성 키 전달
          }),
        });

        const data = await response.json();

        if (response.ok) {
          const authQuery = authParam ? `&${authParam}` : '';
          // 새 플랜 시작일 계산: 현재 구독 종료일 + 1일
          let startQuery = '';
          if (currentPeriodEnd) {
            const periodEnd = new Date(currentPeriodEnd);
            const startDate = new Date(periodEnd);
            startDate.setDate(startDate.getDate() + 1);
            startQuery = `&start=${startDate.toISOString()}`;
          }
          window.location.href = `/checkout/success?plan=${plan}&tenantId=${effectiveTenantId}&reserved=true${startQuery}${authQuery}`;
        } else {
          throw new Error(data.error || '플랜 예약에 실패했습니다.');
        }
      } else if (hasBillingKey && isReserve && trialEndDate) {
        // Trial + 카드 등록됨 + 예약 모드: 기존 빌링키로 예약 API 호출
        const authHeader = idToken ? `Bearer ${idToken}` : '';
        const response = await fetch('/api/subscriptions/update-pending-plan', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(authHeader && { 'Authorization': authHeader }),
          },
          body: JSON.stringify({
            email,
            tenantId: effectiveTenantId,
            newPlan: plan,
          }),
        });

        const data = await response.json();

        if (response.ok) {
          const authQuery = authParam ? `&${authParam}` : '';
          // Trial 종료일 + 1일이 새 플랜 시작일
          let startQuery = '';
          if (trialEndDate) {
            const trialEnd = new Date(trialEndDate);
            const startDate = new Date(trialEnd);
            startDate.setDate(startDate.getDate() + 1);
            startQuery = `&start=${startDate.toISOString()}`;
          }
          window.location.href = `/checkout/success?plan=${plan}&tenantId=${effectiveTenantId}&reserved=true${startQuery}${authQuery}`;
        } else {
          throw new Error(data.error || '플랜 예약에 실패했습니다.');
        }
      } else if (hasBillingKey && isTrialImmediate) {
        // Trial에서 즉시 전환 + 이미 카드 등록됨: 기존 빌링키로 바로 결제
        const idempotencyKey = generateIdempotencyKey('IMMEDIATE_CONVERT');
        const authHeader = idToken ? `Bearer ${idToken}` : '';
        const response = await fetch('/api/payments/immediate-convert', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(authHeader && { 'Authorization': authHeader }),
          },
          body: JSON.stringify({
            email,
            tenantId: effectiveTenantId,
            plan,
            amount,
            idempotencyKey,  // 멱등성 키 전달
          }),
        });

        const data = await response.json();

        if (response.ok) {
          const authQuery = authParam ? `&${authParam}` : '';
          window.location.href = `/checkout/success?plan=${plan}&tenantId=${effectiveTenantId}&orderId=${data.orderId}${authQuery}`;
        } else {
          throw new Error(data.error || '결제에 실패했습니다.');
        }
      } else {
        // 신규 결제 or 예약: 빌링키 발급
        if (!sdkReady) {
          setError('결제 SDK가 준비되지 않았습니다.');
          return;
        }

        // V2 SDK: customerKey로 payment 인스턴스 생성
        const payment = getTossPayment(email);

        // 빌링키 발급 요청 (카드 등록 페이지로 리다이렉트)
        const idempotencyKey = generateIdempotencyKey('BILLING_CONFIRM');
        const authQuery = authParam ? `&${authParam}` : '';
        const reserveQuery = isReserve ? `&mode=reserve` : '';
        // 신규 매장인 경우 brandName과 industry 전달
        const newTenantQuery = isNewTenant && brandName ? `&brandName=${encodeURIComponent(brandName)}&industry=${encodeURIComponent(industry || '')}` : '';
        // 커스텀 링크인 경우 linkId, billingType, subscriptionDays 전달
        let customLinkQuery = customLinkId ? `&linkId=${encodeURIComponent(customLinkId)}` : '';
        if (customBillingType) customLinkQuery += `&billingType=${customBillingType}`;
        if (customSubscriptionDays) customLinkQuery += `&subscriptionDays=${customSubscriptionDays}`;
        await payment.requestBillingAuth({
          method: 'CARD',
          successUrl: `${window.location.origin}/api/payments/billing-confirm?plan=${plan}&amount=${amount}&tenantId=${effectiveTenantId}${authQuery}${reserveQuery}${newTenantQuery}${customLinkQuery}&idempotencyKey=${encodeURIComponent(idempotencyKey)}`,
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

  const period = getSubscriptionPeriod(nextBillingDate, isReserve, trialEndDate, currentPeriodEnd);

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
          <span className="text-gray-600">
            {isReserve ? (currentPeriodEnd ? '결제 예정일' : '첫 결제일') : '다음 결제일'}
          </span>
          <span className="text-sm text-gray-900">
            {period.nextBilling}
          </span>
        </div>
        {isChangePlan && fullAmount ? (
          isDowngrade ? (
            <>
              <div className="flex justify-between items-center mb-2">
                <span className="text-gray-600">새 플랜 가격</span>
                <span className="text-gray-900">
                  {formatPrice(fullAmount)}원 / 월
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">환불액</span>
                <span className="text-xl font-bold text-green-600">
                  +{formatPrice(refundAmount)}원
                </span>
              </div>
              {/* 계산 상세 내역 토글 */}
              {calculationDetails && (
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={() => setShowCalculationDetails(!showCalculationDetails)}
                    className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
                  >
                    {showCalculationDetails ? (
                      <>
                        <NavArrowUp width={14} height={14} strokeWidth={2} />
                        계산 내역 접기
                      </>
                    ) : (
                      <>
                        <NavArrowDown width={14} height={14} strokeWidth={2} />
                        계산 내역 보기
                      </>
                    )}
                  </button>
                  {showCalculationDetails && (() => {
                    // 실제 이용 종료일 계산 (시작일 + 사용일수 - 1)
                    const getUsageEndDate = () => {
                      if (!calculationDetails.currentPeriodStart) return calculationDetails.currentPeriodStart;
                      const start = new Date(calculationDetails.currentPeriodStart.replace(/-/g, '/'));
                      start.setDate(start.getDate() + calculationDetails.usedDays - 1);
                      const year = start.getFullYear();
                      const month = String(start.getMonth() + 1).padStart(2, '0');
                      const day = String(start.getDate()).padStart(2, '0');
                      return `${year}-${month}-${day}`;
                    };
                    const usageEndDate = getUsageEndDate();

                    // 새 플랜 이용 시작일 = 변경일 = 기존 플랜 이용 종료일
                    const newPlanStartDate = usageEndDate;

                    return (
                      <div className="mt-3 space-y-3">
                        {/* 파트 1: 기존 플랜 중도 해지 */}
                        <div className="bg-gray-100 rounded-lg p-3 text-sm">
                          <div className="text-gray-900 font-bold mb-2">
                            {currentPlanName || '현재 플랜'} 플랜 중도 해지
                          </div>
                          <div className="flex justify-between text-gray-600 mb-1">
                            <span>이용 기간</span>
                            <div className="text-right">
                              <span>{calculationDetails.currentPeriodStart} ~ {usageEndDate}</span>
                              <div className="text-gray-400 line-through text-xs">
                                {calculationDetails.currentPeriodStart} ~ {calculationDetails.currentPeriodEndDate}
                              </div>
                            </div>
                          </div>
                          <div className="border-t border-gray-200 my-2 pt-2 space-y-1">
                            <div className="flex justify-between text-gray-600">
                              <span>결제금액</span>
                              <span>{formatPrice(calculationDetails.currentPlanAmount)}원</span>
                            </div>
                            <div className="flex justify-between text-gray-600">
                              <span>사용금액</span>
                              <span>{formatPrice(calculationDetails.usedAmount)}원</span>
                            </div>
                            <div className="flex justify-between text-gray-900 font-medium">
                              <span>환불금액</span>
                              <span>{formatPrice(calculationDetails.currentRefund)}원</span>
                            </div>
                          </div>
                        </div>

                        {/* 파트 2: 새 플랜 중도 이용 */}
                        <div className="bg-gray-100 rounded-lg p-3 text-sm">
                          <div className="text-gray-900 font-bold mb-2">
                            {planName} 플랜 중도 이용
                          </div>
                          <div className="flex justify-between text-gray-600 mb-1">
                            <span>이용 기간</span>
                            <span>{newPlanStartDate} ~ {calculationDetails.currentPeriodEndDate}</span>
                          </div>
                          <div className="border-t border-gray-200 my-2 pt-2 space-y-1">
                            <div className="flex justify-between text-gray-600">
                              <span>원금액</span>
                              <span>{formatPrice(fullAmount || 0)}원</span>
                            </div>
                            <div className="flex justify-between text-gray-900 font-medium">
                              <span>결제금액</span>
                              <span>{formatPrice(calculationDetails.newPlanRemaining)}원</span>
                            </div>
                          </div>
                        </div>

                        {/* 파트 3: 실 금액 */}
                        <div className="bg-gray-100 rounded-lg p-3 text-sm">
                          <div className="flex justify-between items-center">
                            <span className="text-gray-900 font-bold">실 금액</span>
                            <div className="text-right">
                              <span className="text-xs text-gray-500 block">
                                {formatPrice(calculationDetails.currentRefund)}원 - {formatPrice(calculationDetails.newPlanRemaining)}원
                              </span>
                              <span className="text-green-600 font-bold text-base">
                                = {formatPrice(refundAmount)}원 (환불)
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </>
          ) : (
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
              {/* 업그레이드 계산 상세 내역 토글 */}
              {calculationDetails && (
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={() => setShowCalculationDetails(!showCalculationDetails)}
                    className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
                  >
                    {showCalculationDetails ? (
                      <>
                        <NavArrowUp width={14} height={14} strokeWidth={2} />
                        계산 내역 접기
                      </>
                    ) : (
                      <>
                        <NavArrowDown width={14} height={14} strokeWidth={2} />
                        계산 내역 보기
                      </>
                    )}
                  </button>
                  {showCalculationDetails && (() => {
                    // 실제 이용 종료일 계산 (시작일 + 사용일수 - 1)
                    const getUsageEndDate = () => {
                      if (!calculationDetails.currentPeriodStart) return calculationDetails.currentPeriodStart;
                      const start = new Date(calculationDetails.currentPeriodStart.replace(/-/g, '/'));
                      start.setDate(start.getDate() + calculationDetails.usedDays - 1);
                      const year = start.getFullYear();
                      const month = String(start.getMonth() + 1).padStart(2, '0');
                      const day = String(start.getDate()).padStart(2, '0');
                      return `${year}-${month}-${day}`;
                    };
                    const usageEndDate = getUsageEndDate();

                    // 새 플랜 이용 시작일 = 변경일 = 기존 플랜 이용 종료일
                    const newPlanStartDate = usageEndDate;

                    return (
                      <div className="mt-3 space-y-3">
                        {/* 파트 1: 기존 플랜 중도 해지 */}
                        <div className="bg-gray-100 rounded-lg p-3 text-sm">
                          <div className="text-gray-900 font-bold mb-2">
                            {currentPlanName || '현재 플랜'} 플랜 중도 해지
                          </div>
                          <div className="flex justify-between text-gray-600 mb-1">
                            <span>이용 기간</span>
                            <div className="text-right">
                              <span>{calculationDetails.currentPeriodStart} ~ {usageEndDate}</span>
                              <div className="text-gray-400 line-through text-xs">
                                {calculationDetails.currentPeriodStart} ~ {calculationDetails.currentPeriodEndDate}
                              </div>
                            </div>
                          </div>
                          <div className="border-t border-gray-200 my-2 pt-2 space-y-1">
                            <div className="flex justify-between text-gray-600">
                              <span>결제금액</span>
                              <span>{formatPrice(calculationDetails.currentPlanAmount)}원</span>
                            </div>
                            <div className="flex justify-between text-gray-600">
                              <span>사용금액</span>
                              <span>{formatPrice(calculationDetails.usedAmount)}원</span>
                            </div>
                            <div className="flex justify-between text-gray-900 font-medium">
                              <span>환불금액</span>
                              <span>{formatPrice(calculationDetails.currentRefund)}원</span>
                            </div>
                          </div>
                        </div>

                        {/* 파트 2: 새 플랜 중도 이용 */}
                        <div className="bg-gray-100 rounded-lg p-3 text-sm">
                          <div className="text-gray-900 font-bold mb-2">
                            {planName} 플랜 중도 이용
                          </div>
                          <div className="flex justify-between text-gray-600 mb-1">
                            <span>이용 기간</span>
                            <span>{newPlanStartDate} ~ {calculationDetails.currentPeriodEndDate}</span>
                          </div>
                          <div className="border-t border-gray-200 my-2 pt-2 space-y-1">
                            <div className="flex justify-between text-gray-600">
                              <span>원금액</span>
                              <span>{formatPrice(fullAmount || 0)}원</span>
                            </div>
                            <div className="flex justify-between text-gray-900 font-medium">
                              <span>결제금액</span>
                              <span>{formatPrice(calculationDetails.newPlanRemaining)}원</span>
                            </div>
                          </div>
                        </div>

                        {/* 파트 3: 실 금액 */}
                        <div className="bg-gray-100 rounded-lg p-3 text-sm">
                          <div className="flex justify-between items-center">
                            <span className="text-gray-900 font-bold">실 금액</span>
                            <div className="text-right">
                              <span className="text-xs text-gray-500 block">
                                {formatPrice(calculationDetails.newPlanRemaining)}원 - {formatPrice(calculationDetails.currentRefund)}원
                              </span>
                              <span className="text-blue-700 font-bold text-base">
                                = {formatPrice(amount)}원 (결제)
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </>
          )
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
      {!isChangePlan && (
        <div className={`rounded-lg p-4 ${isDowngrade ? 'bg-green-50' : 'bg-blue-50'}`}>
          <h3 className={`font-medium mb-2 ${isDowngrade ? 'text-green-900' : 'text-blue-900'}`}>
            {isTrialImmediate && hasBillingKey
              ? '등록된 카드로 즉시 결제'
              : isTrialImmediate
              ? '즉시 전환 결제'
              : isReserve && hasBillingKey
              ? currentPeriodEnd
                ? '등록된 카드로 플랜 예약'
                : '등록된 카드로 자동 시작 예약'
              : isReserve
              ? currentPeriodEnd
                ? '구독 종료 후 자동 변경'
                : '무료체험 종료 후 자동 시작'
              : '정기결제 카드 등록'}
          </h3>
          <p className={`text-sm ${isDowngrade ? 'text-green-700' : 'text-blue-700'}`}>
            {isTrialImmediate && hasBillingKey
              ? `등록된 카드로 ${formatPrice(amount)}원이 즉시 결제되고 ${planName} 플랜이 바로 시작됩니다.`
              : isTrialImmediate
              ? '아래 버튼을 클릭하면 카드 등록 페이지로 이동합니다. 카드 등록 후 자동으로 첫 결제가 진행됩니다.'
              : isReserve
              ? currentPeriodEnd
                ? `현재 구독이 종료되면 자동으로 ${planName} 플랜으로 변경되며, 등록하신 카드로 ${formatPrice(amount)}원이 결제됩니다.`
                : `무료체험이 종료되면 자동으로 ${planName} 플랜이 시작되며, 등록하신 카드로 ${formatPrice(amount)}원이 결제됩니다.`
              : '아래 버튼을 클릭하면 카드 등록 페이지로 이동합니다. 카드 등록 후 자동으로 첫 결제가 진행됩니다.'}
          </p>
          {isReserve && (
            <ul className={`mt-3 text-sm space-y-1 ${isDowngrade ? 'text-green-600' : 'text-blue-600'}`}>
              <li>• 예약은 구독 설정에서 언제든 취소할 수 있습니다.</li>
              <li>• {currentPeriodEnd ? '현재 구독' : '무료체험'} 기간 동안에는 결제되지 않습니다.</li>
            </ul>
          )}
        </div>
      )}

      {/* 결제/환불 규정 동의 */}
      <div className="border rounded-lg p-4">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-1 w-5 h-5 text-yamoo-primary rounded border-gray-300 focus:ring-yamoo-primary"
          />
          <span className="font-medium text-gray-900">
            {AGREEMENT_LABEL}
          </span>
        </label>
        <ul className="text-sm text-gray-500 mt-2 space-y-1">
          {getPaymentScheduleTexts({
            amount,
            fullAmount,
            isChangePlan,
            isDowngrade,
            refundAmount,
            isReserve,
            isTrialImmediate,
            hasBillingKey,
            currentPeriodEnd,
            nextBillingDate: period.nextBilling,
            formatPrice,
            // 채널톡 스타일: 실제 결제/환불 금액 분리 안내
            newPlanPaymentAmount: calculationDetails?.newPlanRemaining,
            currentRefundAmount: calculationDetails?.currentRefund,
          }).map((text, index) => (
            <li key={`schedule-${index}`} className="flex gap-2">
              <span className="flex-shrink-0">•</span>
              <span>{text}</span>
            </li>
          ))}
          {REFUND_POLICY_ITEMS
            .filter(policy => !isReserve || !policy.includes('즉시 적용'))
            .map((policy, index) => (
            <li key={index} className="flex gap-2">
              <span className="flex-shrink-0">•</span>
              <span>{policy}</span>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => setShowTermsModal(true)}
          className="mt-3 text-sm text-blue-600 hover:text-blue-700 underline"
        >
          상세 내용 확인하기
        </button>
      </div>

      {/* 결제/환불 규정 모달 */}
      {showTermsModal && (
        <RefundPolicyModal onClose={() => setShowTermsModal(false)} />
      )}

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
            {(isChangePlan || (hasBillingKey && isTrialImmediate) || (hasBillingKey && isReserve)) ? '처리 중...' : '카드 등록 페이지로 이동 중...'}
          </span>
        ) : isChangePlan ? (
          isDowngrade ? '플랜 변경하기' : `${formatPrice(amount)}원 결제하기`
        ) : hasBillingKey && isTrialImmediate ? (
          `${formatPrice(amount)}원 즉시 결제하기`
        ) : hasBillingKey && isReserve ? (
          '등록된 카드로 예약하기'
        ) : isReserve ? (
          '카드 등록하고 예약하기'
        ) : (
          '카드 등록하고 결제하기'
        )}
      </button>

      {/* 안내 문구 */}
      {!isChangePlan && (
        <ul className="text-sm text-gray-500 space-y-1">
          {hasBillingKey && isTrialImmediate ? (
          <>
            <li>• 등록된 카드로 즉시 결제됩니다.</li>
            <li>• 결제 후 바로 유료 플랜이 시작됩니다.</li>
            <li>• 매월 동일한 날짜에 자동 결제됩니다.</li>
          </>
        ) : null}
        </ul>
      )}
    </div>
  );
}
