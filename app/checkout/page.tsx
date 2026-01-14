import { redirect } from 'next/navigation';
import { verifyToken, getSubscription, getSubscriptionByTenantId, getTenantInfo, getPlanById } from '@/lib/auth';
import { getAuthSessionIdFromCookie, getAuthSession } from '@/lib/auth-session';
import TossPaymentWidget from '@/components/checkout/TossPaymentWidget';
import { NavArrowLeft, Shield, Lock, Sofa, WarningCircle } from 'iconoir-react';
import Link from 'next/link';

interface CheckoutPageProps {
  searchParams: Promise<{
    plan?: string;
    token?: string;
    email?: string;
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
};

export default async function CheckoutPage({ searchParams }: CheckoutPageProps) {
  const params = await searchParams;
  const { plan, token, email: emailParam, tenantId, mode, refund, newTenant, brandName, industry, error } = params;

  if (!plan) {
    redirect('/error?message=invalid_access');
  }

  // 신규 매장이 아닌 경우에만 tenantId 필수
  const isNewTenant = newTenant === 'true';
  if (!tenantId && !isNewTenant) {
    redirect('/error?message=missing_tenant_id');
  }

  let email: string | null = null;

  // 1. 토큰으로 인증 (포탈 SSO)
  if (token) {
    email = await verifyToken(token);
  }
  // 2. 이메일 파라미터로 접근 (Firebase Auth)
  else if (emailParam) {
    email = emailParam;
  }
  // 3. 세션 쿠키로 인증 (SSO 후 쿠키 기반)
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
    queryParams.set('plan', plan);
    if (tenantId) queryParams.set('tenantId', tenantId);
    if (mode) queryParams.set('mode', mode);
    if (newTenant) queryParams.set('newTenant', newTenant);
    if (brandName) queryParams.set('brandName', brandName);
    if (industry) queryParams.set('industry', industry);
    redirect(`/login?redirect=/checkout?${queryParams.toString()}`);
  }

  const authParam = token ? `token=${token}` : `email=${encodeURIComponent(email)}`;

  // 병렬로 데이터 조회 (성능 최적화)
  // mode=immediate 또는 mode=reserve인 경우 특정 tenant의 구독 정보를 조회
  const [subscription, tenantInfo, planInfo] = await Promise.all([
    ((mode === 'immediate' || mode === 'reserve') && tenantId)
      ? getSubscriptionByTenantId(tenantId, email)
      : getSubscription(email),
    tenantId ? getTenantInfo(tenantId) : Promise.resolve(null),
    getPlanById(plan),
  ]);

  // 플랜 정보가 없으면 에러
  if (!planInfo) {
    redirect('/error?message=invalid_plan');
  }

  // 이미 같은 플랜을 사용 중인 경우
  if (subscription?.plan === plan && subscription?.status === 'active') {
    redirect(`/account?${authParam}`);
  }

  const fullAmount = planInfo.price;
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
    const currentAmount = currentPlanInfo?.price || 0;

    // 결제 기간 계산 (실제 기간 일수 기준)
    let totalDays = 31; // 기본값
    let usedDays = 1;   // 기본값 (오늘 사용)
    let daysLeft = 30;
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
      currentPeriodEndStr = nextBillingDateStr; // 플랜 변경 후 success 페이지에서 사용

      // 총 기간 일수 (currentPeriodStart ~ nextBillingDate 전날)
      const startDateOnly = new Date(startDate);
      startDateOnly.setHours(0, 0, 0, 0);
      const nextDateOnly = new Date(nextDate);
      nextDateOnly.setHours(0, 0, 0, 0);
      totalDays = Math.round((nextDateOnly.getTime() - startDateOnly.getTime()) / (1000 * 60 * 60 * 24));

      // 사용 일수 (currentPeriodStart ~ 오늘, 오늘 포함)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      usedDays = Math.round((today.getTime() - startDateOnly.getTime()) / (1000 * 60 * 60 * 24)) + 1;

      // 남은 일수
      daysLeft = Math.max(0, totalDays - usedDays);

      // 기간 문자열 (표시용)
      const endDate = new Date(nextDateOnly);
      endDate.setDate(endDate.getDate() - 1);
      periodStartStr = startDateOnly.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\. /g, '-').replace('.', '');
      periodEndStr = endDate.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\. /g, '-').replace('.', '');
    }

    // 즉시 플랜 변경 계산 (실제 기간 일수 기준)
    // 기존 플랜: 변경일(오늘)까지 사용 → usedDays만큼 차감 후 daysLeft만큼 환불
    const usedAmount = Math.round((currentAmount / totalDays) * usedDays);
    const currentRefund = currentAmount - usedAmount;
    // 새 플랜: 변경일(오늘)부터 종료일까지 이용 → (daysLeft + 1)일 결제
    const newPlanCharge = Math.round((fullAmount / totalDays) * (daysLeft + 1));

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
          isNewTenant={isNewTenant}
          authParam={authParam}
          nextBillingDate={nextBillingDateStr}
          trialEndDate={trialEndDateStr}
          currentPeriodEnd={currentPeriodEndStr}
          hasBillingKey={hasBillingKey}
          calculationDetails={calculationDetails}
          currentPlanName={currentPlanName}
          brandName={brandName}
          industry={industry}
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
