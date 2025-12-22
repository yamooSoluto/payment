import { redirect } from 'next/navigation';
import { verifyToken, getSubscription } from '@/lib/auth';
import { getPlanAmount, getPlanName } from '@/lib/toss';
import TossPaymentWidget from '@/components/checkout/TossPaymentWidget';
import { ArrowLeft, Shield, Lock } from 'lucide-react';
import Link from 'next/link';

interface CheckoutPageProps {
  searchParams: Promise<{
    plan?: string;
    token?: string;
    email?: string;
    mode?: string;      // 'immediate' for upgrade
    refund?: string;    // 현재 플랜 환불액
  }>;
}

export default async function CheckoutPage({ searchParams }: CheckoutPageProps) {
  const params = await searchParams;
  const { plan, token, email: emailParam, mode, refund } = params;

  if (!plan) {
    redirect('/error?message=invalid_access');
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

  const subscription = await getSubscription(email);
  const authParam = token ? `token=${token}` : `email=${encodeURIComponent(email)}`;

  // 이미 같은 플랜을 사용 중인 경우
  if (subscription?.plan === plan && subscription?.status === 'active') {
    redirect(`/account?${authParam}`);
  }

  const fullAmount = getPlanAmount(plan);
  const planName = getPlanName(plan);

  // 즉시 업그레이드인 경우 일할 계산
  let amount = fullAmount;
  let isUpgradeMode = false;
  let currentPlanName = '';

  if (mode === 'immediate' && subscription?.status === 'active') {
    isUpgradeMode = true;
    currentPlanName = getPlanName(subscription.plan);
    const currentAmount = getPlanAmount(subscription.plan) || 0;

    // 다음 결제일까지 남은 일수 계산
    let daysLeft = 30;
    if (subscription.nextBillingDate) {
      const nextDate = subscription.nextBillingDate.toDate
        ? subscription.nextBillingDate.toDate()
        : new Date(subscription.nextBillingDate);
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

  // 유효하지 않은 플랜 (trial, basic, business 외)
  if (fullAmount === undefined || (plan !== 'trial' && fullAmount === 0)) {
    redirect('/error?message=invalid_plan');
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Back Button */}
      <Link
        href={isUpgradeMode ? `/account/change-plan?${authParam}` : `/pricing?${authParam}`}
        className="inline-flex items-center gap-2 text-gray-600 hover:text-yamoo-primary mb-8 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
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

      {/* Upgrade Info */}
      {isUpgradeMode && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-blue-800">
            <strong>일할 계산 적용:</strong> 현재 플랜의 남은 기간에 대한 환불액을 차감한 금액입니다.
            다음 결제일부터 월 {fullAmount.toLocaleString()}원이 정기 결제됩니다.
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
          isUpgrade={isUpgradeMode}
          fullAmount={fullAmount}
        />
      </div>

      {/* Security Badges */}
      <div className="mt-8 flex flex-wrap justify-center gap-6 text-sm text-gray-500">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-green-500" />
          <span>토스페이먼츠 안전결제</span>
        </div>
        <div className="flex items-center gap-2">
          <Lock className="w-4 h-4 text-green-500" />
          <span>SSL 암호화 적용</span>
        </div>
      </div>
    </div>
  );
}
