import { redirect } from 'next/navigation';
import { verifyToken, getSubscription, getSubscriptionByTenantId, getTenantInfo, getPlanById, getPaymentHistoryByTenantId, validateCustomLink } from '@/lib/auth';
import { getAuthSessionIdFromCookie, getAuthSession } from '@/lib/auth-session';
import TossPaymentWidget from '@/components/checkout/TossPaymentWidget';
import { NavArrowLeft, Shield, Lock, Sofa, WarningCircle } from 'iconoir-react';
import Link from 'next/link';

interface CheckoutPageProps {
  searchParams: Promise<{
    plan?: string;
    link?: string;      // 커스텀 결제 링크 ID
    token?: string;
    tenantId?: string;  // 매장 ID
    mode?: string;      // 'immediate' for upgrade, 'reserve' for trial reservation
    refund?: string;    // 현재 플랜 환불액
    newTenant?: string; // 신규 매장 (매장 없이 결제)
    brandName?: string; // 신규 매장 이름
    industry?: string;  // 신규 매장 업종
    error?: string;     // 결제 실패 에러
  }>;
}

// 에러 메시지 매핑
const ERROR_MESSAGES: Record<string, string> = {
  payment_failed: '결제가 실패했습니다. 카드 정보를 확인하고 다시 시도해주세요.',
  missing_params: '필수 정보가 누락되었습니다. 다시 시도해주세요.',
  database_unavailable: '일시적인 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
  unknown_error: '알 수 없는 오류가 발생했습니다. 다시 시도해주세요.',
  link_not_found: '유효하지 않은 결제 링크입니다.',
  link_expired: '결제 링크가 만료되었습니다.',
  link_disabled: '비활성화된 결제 링크입니다.',
  link_max_uses_reached: '결제 링크 사용 횟수가 초과되었습니다.',
  email_not_allowed: '이 결제 링크는 다른 이메일로만 사용할 수 있습니다.',
  link_not_yet_valid: '아직 사용할 수 없는 결제 링크입니다.',
};

export default async function CheckoutPage({ searchParams }: CheckoutPageProps) {
  const params = await searchParams;
  const { plan: planParam, link, token, tenantId, mode, refund, newTenant, brandName, industry, error } = params;

  // 커스텀 링크 또는 플랜 ID가 필요
  if (!planParam && !link) {
    redirect('/error?message=invalid_access');
  }

  // 신규 매장이 아니고, 커스텀 링크도 아닌 경우에만 tenantId 필수
  const isNewTenant = newTenant === 'true';
  const isCustomLink = !!link;
  if (!tenantId && !isNewTenant && !isCustomLink) {
    redirect('/error?message=missing_tenant_id');
  }

  let email: string | null = null;

  // 1. 토큰으로 인증 (포탈 SSO)
  if (token) {
    email = await verifyToken(token);
  }
  // 2. 세션 쿠키로 인증 (SSO 후 쿠키 기반)
  else {
    const sessionId = await getAuthSessionIdFromCookie();
    if (sessionId) {
      const session = await getAuthSession(sessionId);
      if (session) {
        email = session.email;
      }
    }
  }

  if (!email) {
    // 모든 쿼리 파라미터 보존하여 로그인 후 돌아올 수 있도록
    const queryParams = new URLSearchParams();
    if (planParam) queryParams.set('plan', planParam);
    if (link) queryParams.set('link', link);
    if (tenantId) queryParams.set('tenantId', tenantId);
    if (mode) queryParams.set('mode', mode);
    if (newTenant) queryParams.set('newTenant', newTenant);
    if (brandName) queryParams.set('brandName', brandName);
    if (industry) queryParams.set('industry', industry);
    redirect(`/login?redirect=/checkout?${queryParams.toString()}`);
  }

  // 커스텀 링크 검증 및 플랜 정보 추출
  let plan = planParam;
  let customLinkId: string | undefined;
  let customAmount: number | undefined;
  let customBillingType: 'recurring' | 'onetime' | undefined;
  let customSubscriptionDays: number | undefined;

  if (link) {
    const linkValidation = await validateCustomLink(link, email);
    if (!linkValidation.valid) {
      redirect(`/error?message=${linkValidation.error || 'link_not_found'}`);
    }
    plan = linkValidation.planId;
    customLinkId = linkValidation.linkId;
    customAmount = linkValidation.amount;
    customBillingType = linkValidation.billingType;
    customSubscriptionDays = linkValidation.subscriptionDays || undefined;
  }

  if (!plan) {
    redirect('/error?message=invalid_access');
  }

  const authParam = token ? `token=${token}` : '';

  // 병렬로 데이터 조회 (성능 최적화)
  // tenantId가 있으면 해당 tenant의 구독 정보 조회 (billingKey 확인용)
  const [subscription, tenantInfo, planInfo] = await Promise.all([
    tenantId
      ? getSubscriptionByTenantId(tenantId, email)
      : getSubscription(email),
    tenantId ? getTenantInfo(tenantId) : Promise.resolve(null),
    getPlanById(plan),
  ]);

  // 플랜 정보가 없으면 에러
  if (!planInfo) {
    redirect('/error?message=invalid_plan');
  }

  // 이미 같은 플랜을 사용 중인 경우 (커스텀 링크 제외)
  if (!isCustomLink && subscription?.plan === plan && subscription?.status === 'active') {
    redirect(`/account?${authParam}`);
  }

  // 커스텀 링크인 경우 customAmount 사용, 아니면 플랜 기본 가격
  const fullAmount = customAmount ?? planInfo.price;
  const planName = planInfo.name;

  // 즉시 플랜 변경인 경우 일할 계산
  let amount = fullAmount;
  let isChangePlanMode = false; // 즉시 플랜 변경 (업그레이드 또는 다운그레이드)
  let isDowngrade = false;      // 다운그레이드 여부 (환불 필요)
  let refundAmount = 0;         // 다운그레이드 시 환불 금액
  let isReserveMode = false;
  let isTrialImmediate = false; // Trial에서 즉시 전환
  let currentPlanName = '';
  let nextBillingDateStr: string | undefined;
  let trialEndDateStr: string | undefined;
  let currentPeriodEndStr: string | undefined;
  const hasBillingKey = !!subscription?.billingKey;

  // 계산 상세 정보 (다운그레이드 시 사용)
  let calculationDetails: {
    totalDays: number;
    usedDays: number;
    daysLeft: number;
    currentPlanAmount: number;
    usedAmount: number;
    currentRefund: number;
    newPlanRemaining: number;
    currentPeriodStart?: string;
    currentPeriodEndDate?: string;
  } | undefined;

  // Trial 즉시 전환 모드
  if (mode === 'immediate' && subscription?.status === 'trial') {
    isTrialImmediate = true;
    currentPlanName = '무료체험';
  }
  // Trial 예약 모드
  else if (mode === 'reserve' && subscription?.status === 'trial') {
    isReserveMode = true;
    currentPlanName = '무료체험';
    if (subscription.trialEndDate) {
      const trialEndDate = subscription.trialEndDate.toDate
        ? subscription.trialEndDate.toDate()
        : new Date(subscription.trialEndDate);
      trialEndDateStr = trialEndDate.toISOString();
      nextBillingDateStr = trialEndDateStr; // 무료체험 종료일 = 첫 결제일
    }
  }
  // Active 구독자 플랜 예약 모드
  else if (mode === 'reserve' && subscription?.status === 'active') {
    isReserveMode = true;
    const currentPlanInfo = await getPlanById(subscription.plan);
    currentPlanName = currentPlanInfo?.name || subscription.plan;

    // currentPeriodEnd = nextBillingDate - 1 (DB 값이 잘못되어 있을 수 있으므로 항상 계산)
    if (subscription.nextBillingDate) {
      const nextBilling = subscription.nextBillingDate.toDate
        ? subscription.nextBillingDate.toDate()
        : new Date(subscription.nextBillingDate);
      const periodEnd = new Date(nextBilling);
      periodEnd.setDate(periodEnd.getDate() - 1);
      currentPeriodEndStr = periodEnd.toISOString();
    }
  }
  // 즉시 플랜 변경 (Active 구독자)
  else if (mode === 'immediate' && subscription?.status === 'active') {
    isChangePlanMode = true;
    const currentPlanInfo = await getPlanById(subscription.plan);
    currentPlanName = currentPlanInfo?.name || subscription.plan;

    // 결제 기간 계산 (실제 기간 일수 기준) - currentAmount 계산 전에 먼저 수행
    let totalDays = 31; // 기본값
    let billingCycleTotalDays = 31; // 원래 결제 주기 총 일수 (기본값)
    let usedDays = 1;   // 기본값 (오늘 사용)
    let daysLeft = 30;
    let newPlanDays = 31; // 새 플랜 이용 일수 (기본값)
    let periodStartStr: string | undefined;
    let periodEndStr: string | undefined;

    if (subscription.currentPeriodStart && subscription.nextBillingDate) {
      const startDate = subscription.currentPeriodStart.toDate
        ? subscription.currentPeriodStart.toDate()
        : new Date(subscription.currentPeriodStart);
      const nextDate = subscription.nextBillingDate.toDate
        ? subscription.nextBillingDate.toDate()
        : new Date(subscription.nextBillingDate);

      nextBillingDateStr = nextDate.toISOString();
      currentPeriodEndStr = nextBillingDateStr;

      const startDateOnly = new Date(startDate);
      startDateOnly.setHours(0, 0, 0, 0);
      const nextDateOnly = new Date(nextDate);
      nextDateOnly.setHours(0, 0, 0, 0);
      totalDays = Math.round((nextDateOnly.getTime() - startDateOnly.getTime()) / (1000 * 60 * 60 * 24));

      const originalBillingCycleStart = new Date(nextDateOnly);
      originalBillingCycleStart.setMonth(originalBillingCycleStart.getMonth() - 1);
      billingCycleTotalDays = Math.round((nextDateOnly.getTime() - originalBillingCycleStart.getTime()) / (1000 * 60 * 60 * 24));

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      usedDays = Math.round((today.getTime() - startDateOnly.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      daysLeft = Math.max(0, totalDays - usedDays);
      newPlanDays = daysLeft + 1;

      const endDate = new Date(nextDateOnly);
      endDate.setDate(endDate.getDate() - 1);
      periodStartStr = startDateOnly.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\. /g, '-').replace('.', '');
      periodEndStr = endDate.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\. /g, '-').replace('.', '');
    }

    // 실제 결제한 금액 조회
    // 우선순위: 1) payments에서 조회 → 2) 일할계산 → 3) subscription.amount → 4) 플랜 기본가
    let currentAmount = 0;
    if (tenantId) {
      const payments = await getPaymentHistoryByTenantId(tenantId, 10);
      // 현재 플랜의 마지막 결제 (charge 타입) 찾기
      const lastPaymentForCurrentPlan = payments.find(
        (p: { plan?: string; transactionType?: string; amount?: number }) =>
          p.plan === subscription.plan && p.transactionType === 'charge' && p.amount && p.amount > 0
      );
      if (lastPaymentForCurrentPlan?.amount) {
        currentAmount = lastPaymentForCurrentPlan.amount;
      }
    }
    // payments에서 못 찾은 경우: 일할계산 수행 (다운그레이드 후 재변경 케이스)
    if (!currentAmount && totalDays > 0 && billingCycleTotalDays > 0) {
      const planPrice = currentPlanInfo?.price || 0;
      // 현재 기간에 해당하는 플랜 가치 = 플랜기본가 * (현재기간일수 / 원래결제주기일수)
      currentAmount = Math.round((planPrice / billingCycleTotalDays) * totalDays);
    }
    // 그래도 없으면 subscription.amount 또는 플랜 기본가 사용 (최후의 fallback)
    if (!currentAmount) {
      currentAmount = subscription.amount || currentPlanInfo?.price || 0;
    }

    // 즉시 플랜 변경 계산
    // 기존 플랜: 변경일(오늘)까지 사용 → 현재 기간 기준으로 사용금액 계산 후 환불
    const usedAmount = Math.round((currentAmount / totalDays) * usedDays);
    const currentRefund = currentAmount - usedAmount;
    // 새 플랜: 변경일(오늘)부터 종료일까지 이용 → 원래 결제 주기 기준으로 일할 계산
    // 원래 결제 주기(예: 31일)에서 새 플랜이 이용할 일수(예: 30일)만큼만 결제
    const newPlanCharge = Math.round((fullAmount / billingCycleTotalDays) * newPlanDays);

    if (fullAmount < currentAmount) {
      // 다운그레이드: 환불
      isDowngrade = true;
      // 순환불액 = 기존 플랜 환불액 - 새 플랜 결제 금액
      refundAmount = currentRefund - newPlanCharge;
      amount = 0; // 결제 금액 없음

      // 계산 상세 정보 저장
      calculationDetails = {
        totalDays,
        usedDays,
        daysLeft,
        currentPlanAmount: currentAmount,
        usedAmount,
        currentRefund,
        newPlanRemaining: newPlanCharge,
        currentPeriodStart: periodStartStr,
        currentPeriodEndDate: periodEndStr,
      };
    } else {
      // 업그레이드: 차액 결제
      // 결제금액 = 새 플랜 결제 금액 - 기존 플랜 환불액
      amount = newPlanCharge - currentRefund;

      // 계산 상세 정보 저장
      calculationDetails = {
        totalDays,
        usedDays,
        daysLeft,
        currentPlanAmount: currentAmount,
        usedAmount,
        currentRefund,
        newPlanRemaining: newPlanCharge,
        currentPeriodStart: periodStartStr,
        currentPeriodEndDate: periodEndStr,
      };
    }
  }

  // Trial 플랜은 무료 - 별도 처리 필요
  if (plan === 'trial') {
    redirect(`/checkout/trial?email=${encodeURIComponent(email)}`);
  }

  // 무료 플랜인 경우 (trial 이외) 에러 처리
  if (fullAmount === 0) {
    redirect('/error?message=invalid_plan');
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Back Button */}
      <Link
        href={
          tenantId
            ? `/account/${tenantId}?${authParam}`
            : `/plan?${authParam}`
        }
        className="inline-flex items-center gap-2 text-gray-600 hover:text-yamoo-primary mb-8 transition-colors"
      >
        <NavArrowLeft width={16} height={16} strokeWidth={1.5} />
        {tenantId
          ? '매장 상세 페이지로 돌아가기'
          : '요금제 선택으로 돌아가기'}
      </Link>

      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          {isChangePlanMode ? '플랜 변경' : isReserveMode ? '플랜 예약' : isTrialImmediate ? '즉시 전환' : '결제하기'}
        </h1>
        <p className="text-gray-600">
          {isChangePlanMode
            ? `${currentPlanName} → ${planName} 플랜으로 변경합니다`
            : isReserveMode
            ? currentPeriodEndStr
              ? `현재 구독 종료 후 ${planName} 플랜으로 변경됩니다`
              : `무료체험 종료 후 ${planName} 플랜이 자동 시작됩니다`
            : isTrialImmediate
            ? `${currentPlanName}에서 ${planName} 플랜으로 즉시 전환합니다`
            : `${planName} 플랜을 구독합니다`}
        </p>
      </div>

      {/* 에러 메시지 */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex items-start gap-3">
          <WarningCircle width={20} height={20} strokeWidth={1.5} className="text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-red-800">결제 오류</p>
            <p className="text-sm text-red-600 mt-1">
              {ERROR_MESSAGES[error] || decodeURIComponent(error)}
            </p>
          </div>
        </div>
      )}

      {/* 매장 정보 */}
      {(tenantInfo || (isNewTenant && brandName)) && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6 flex items-center gap-3">
          <div className="w-10 h-10 bg-gray-900 rounded-lg flex items-center justify-center flex-shrink-0">
            <Sofa width={20} height={20} strokeWidth={1.5} className="text-white" />
          </div>
          <div>
            <p className="text-sm text-gray-500">{isNewTenant ? '신규 매장' : '적용 매장'}</p>
            <p className="font-semibold text-gray-900">{tenantInfo?.brandName || brandName}</p>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="bg-white rounded-xl shadow-lg p-6 md:p-8">
        <TossPaymentWidget
          email={email}
          plan={plan}
          planName={planName}
          amount={amount}
          tenantId={tenantId}
          isChangePlan={isChangePlanMode}
          isDowngrade={isDowngrade}
          refundAmount={refundAmount}
          isReserve={isReserveMode}
          isTrialImmediate={isTrialImmediate}
          fullAmount={fullAmount}
          isNewTenant={isNewTenant || isCustomLink}
          authParam={authParam}
          nextBillingDate={nextBillingDateStr}
          trialEndDate={trialEndDateStr}
          currentPeriodEnd={currentPeriodEndStr}
          hasBillingKey={hasBillingKey}
          calculationDetails={calculationDetails}
          currentPlanName={currentPlanName}
          brandName={brandName}
          industry={industry}
          customLinkId={customLinkId}
          customBillingType={customBillingType}
          customSubscriptionDays={customSubscriptionDays}
        />
      </div>

      {/* Security Badges */}
      <div className="mt-8 flex flex-wrap justify-center gap-6 text-sm text-gray-500">
        <div className="flex items-center gap-2">
          <Shield width={16} height={16} strokeWidth={1.5} className="text-green-500" />
          <span>안전결제</span>
        </div>
        <div className="flex items-center gap-2">
          <Lock width={16} height={16} strokeWidth={1.5} className="text-green-500" />
          <span>SSL 암호화 적용</span>
        </div>
      </div>
    </div>
  );
}
