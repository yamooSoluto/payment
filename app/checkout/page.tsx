import { redirect } from 'next/navigation';
import { verifyToken, getSubscription, getSubscriptionByTenantId, getTenantInfo, getPlanById } from '@/lib/auth';
import TossPaymentWidget from '@/components/checkout/TossPaymentWidget';
import { NavArrowLeft, Shield, Lock, Sofa, WarningCircle } from 'iconoir-react';
import Link from 'next/link';

interface CheckoutPageProps {
  searchParams: Promise<{
    plan?: string;
    token?: string;
    email?: string;
    tenantId?: string;  // 매장 ID
    mode?: string;      // 'immediate' for upgrade
    refund?: string;    // 현재 플랜 환불액
    newTenant?: string; // 신규 매장 (매장 없이 결제)
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
  const { plan, token, email: emailParam, tenantId, mode, refund, newTenant, error } = params;

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

  if (!email) {
    redirect('/login?redirect=/checkout?plan=' + plan);
  }

  const authParam = token ? `token=${token}` : `email=${encodeURIComponent(email)}`;

  // 병렬로 데이터 조회 (성능 최적화)
  // mode=immediate인 경우 특정 tenant의 구독 정보를 조회
  const [subscription, tenantInfo, planInfo] = await Promise.all([
    (mode === 'immediate' && tenantId)
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

  // 즉시 업그레이드인 경우 일할 계산
  let amount = fullAmount;
  let isUpgradeMode = false;
  let currentPlanName = '';
  let nextBillingDateStr: string | undefined;

  if (mode === 'immediate' && subscription?.status === 'active') {
    isUpgradeMode = true;
    const currentPlanInfo = await getPlanById(subscription.plan);
    currentPlanName = currentPlanInfo?.name || subscription.plan;
    const currentAmount = currentPlanInfo?.price || 0;

    // 다음 결제일까지 남은 일수 계산
    let daysLeft = 30;
    if (subscription.nextBillingDate) {
      const nextDate = subscription.nextBillingDate.toDate
        ? subscription.nextBillingDate.toDate()
        : new Date(subscription.nextBillingDate);
      nextBillingDateStr = nextDate.toISOString();
      daysLeft = Math.max(0, Math.ceil((nextDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
    }

    // 일할 계산: 새 플랜 비용 - 현재 플랜 환불액
    const proratedNewAmount = Math.round((fullAmount / 30) * daysLeft);
    const refundAmount = refund ? parseInt(refund) : Math.round((currentAmount / 30) * daysLeft);
    amount = Math.max(0, proratedNewAmount - refundAmount);
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
        href={isUpgradeMode ? `/account/change-plan?${authParam}&tenantId=${tenantId}` : `/pricing?${authParam}`}
        className="inline-flex items-center gap-2 text-gray-600 hover:text-yamoo-primary mb-8 transition-colors"
      >
        <NavArrowLeft width={16} height={16} strokeWidth={1.5} />
        {isUpgradeMode ? '플랜 변경으로 돌아가기' : '요금제 선택으로 돌아가기'}
      </Link>

      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          {isUpgradeMode ? '플랜 업그레이드' : '결제하기'}
        </h1>
        <p className="text-gray-600">
          {isUpgradeMode
            ? `${currentPlanName} → ${planName} 플랜으로 업그레이드`
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
      {tenantInfo && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6 flex items-center gap-3">
          <div className="w-10 h-10 bg-gray-900 rounded-lg flex items-center justify-center flex-shrink-0">
            <Sofa width={20} height={20} strokeWidth={1.5} className="text-white" />
          </div>
          <div>
            <p className="text-sm text-gray-500">적용 매장</p>
            <p className="font-semibold text-gray-900">{tenantInfo.brandName}</p>
          </div>
        </div>
      )}

      {/* 신규 매장 안내 */}
      {isNewTenant && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-yellow-800">
            <strong>신규 매장:</strong> 결제 완료 후 담당자가 매장 설정을 도와드립니다.
          </p>
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
          isUpgrade={isUpgradeMode}
          fullAmount={fullAmount}
          isNewTenant={isNewTenant}
          authParam={authParam}
          nextBillingDate={nextBillingDateStr}
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
