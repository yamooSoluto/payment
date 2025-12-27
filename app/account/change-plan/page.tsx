import { redirect } from 'next/navigation';
import { getAuthFromParamsOrSession } from '@/lib/auth-session';
import { getSubscriptionByTenantId } from '@/lib/auth';
import Link from 'next/link';
import { NavArrowLeft, Check } from 'iconoir-react';
import { PLAN_PRICES, getPlanName } from '@/lib/toss';
import ChangePlanButton from '@/components/account/ChangePlanButton';

interface ChangePlanPageProps {
  searchParams: Promise<{ token?: string; email?: string; tenantId?: string }>;
}

const PLANS = [
  {
    id: 'basic',
    name: 'Basic',
    price: 39000,
    description: 'CS 마스터 고용하기',
    features: ['월 300건 이내', '데이터 무제한 추가', 'AI 자동 답변', '업무 처리 메세지 요약 전달'],
  },
  {
    id: 'business',
    name: 'Business',
    price: 99000,
    description: '풀타임 전담 비서 고용하기',
    features: ['Basic 기능 모두 포함', '문의 건수 제한 없음', '답변 메시지 AI 보정', '미니맵 연동 및 활용', '예약 및 재고 연동'],
    popular: true,
  },
];

// Firebase Timestamp를 직렬화하는 헬퍼 함수
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeData(data: any): any {
  if (data === null || data === undefined) {
    return data;
  }
  if (data._seconds !== undefined && data._nanoseconds !== undefined) {
    return new Date(data._seconds * 1000).toISOString();
  }
  if (typeof data.toDate === 'function') {
    return data.toDate().toISOString();
  }
  if (Array.isArray(data)) {
    return data.map(serializeData);
  }
  if (typeof data === 'object') {
    const serialized: Record<string, unknown> = {};
    for (const key of Object.keys(data)) {
      serialized[key] = serializeData(data[key]);
    }
    return serialized;
  }
  return data;
}

function formatPrice(price: number): string {
  return price.toLocaleString('ko-KR');
}

export default async function ChangePlanPage({ searchParams }: ChangePlanPageProps) {
  const params = await searchParams;
  const { token, email: emailParam, tenantId } = params;

  // URL params 또는 세션에서 인증 정보 가져오기
  const { email, shouldRedirect } = await getAuthFromParamsOrSession({
    token,
    email: emailParam,
  });

  // URL에 token/email이 있었다면 clean URL로 리다이렉트
  if (shouldRedirect && email && tenantId) {
    redirect(`/account/change-plan?tenantId=${tenantId}`);
  }

  if (!email) {
    redirect('/login');
  }

  if (!tenantId) {
    redirect('/account');
  }

  const rawSubscription = await getSubscriptionByTenantId(tenantId, email);
  if (!rawSubscription) {
    redirect('/pricing');
  }

  // 해지된 구독은 플랜 변경 대신 요금제 페이지로 이동
  if (rawSubscription.status === 'canceled') {
    redirect(`/pricing?tenantId=${tenantId}`);
  }

  const subscription = serializeData(rawSubscription);
  const currentPlan = subscription.plan;
  const currentAmount = PLAN_PRICES[currentPlan] || 0;
  const nextBillingDate = subscription.nextBillingDate;
  const currentPeriodStart = subscription.currentPeriodStart;

  // 결제 기간 총 일수 계산
  const totalDaysInPeriod = (nextBillingDate && currentPeriodStart)
    ? Math.ceil((new Date(nextBillingDate).getTime() - new Date(currentPeriodStart).getTime()) / (1000 * 60 * 60 * 24))
    : 30;

  // 남은 일수 계산
  const daysLeft = nextBillingDate
    ? Math.max(0, Math.ceil((new Date(nextBillingDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Header */}
      <div className="mb-8">
        <Link
          href={`/account/${tenantId}`}
          className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
        >
          <NavArrowLeft width={16} height={16} strokeWidth={1.5} />
          매장 구독 관리로 돌아가기
        </Link>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">플랜 변경</h1>
        <p className="text-gray-600">
          현재 플랜: <span className="font-semibold">{getPlanName(currentPlan)}</span>
          {currentAmount > 0 && (
            <span className="ml-2">({formatPrice(currentAmount)}원/월)</span>
          )}
        </p>
      </div>

      {/* Plans */}
      <div className="grid md:grid-cols-2 gap-6">
        {PLANS.map((plan) => {
          const isCurrentPlan = plan.id === currentPlan;
          const isUpgrade = plan.price > currentAmount;
          const isDowngrade = plan.price < currentAmount;
          const priceDiff = plan.price - currentAmount;

          return (
            <div
              key={plan.id}
              className={`bg-white rounded-xl p-6 border-2 transition-all flex flex-col ${
                isCurrentPlan
                  ? 'border-green-500 bg-green-50'
                  : plan.popular
                  ? 'border-yamoo-primary'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              {plan.popular && !isCurrentPlan && (
                <span className="inline-block bg-yamoo-primary text-gray-900 text-xs font-semibold px-3 py-1 rounded-full mb-4">
                  인기
                </span>
              )}
              {isCurrentPlan && (
                <span className="inline-block bg-green-500 text-white text-xs font-semibold px-3 py-1 rounded-full mb-4">
                  현재 플랜
                </span>
              )}

              <h3 className="text-xl font-bold text-gray-900 mb-1">{plan.name}</h3>
              <p className="text-gray-500 text-sm mb-4">{plan.description}</p>

              <div className="flex items-baseline gap-1 mb-6">
                <span className="text-3xl font-bold text-gray-900">
                  {formatPrice(plan.price)}원
                </span>
                <span className="text-gray-500">/월</span>
              </div>

              <ul className="space-y-3 mb-6 flex-grow">
                {plan.features.map((feature, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <Check width={20} height={20} strokeWidth={1.5} className="text-green-500 flex-shrink-0 mt-0.5" />
                    <span className="text-gray-600 text-sm">{feature}</span>
                  </li>
                ))}
              </ul>

              {isCurrentPlan ? (
                <button
                  disabled
                  className="w-full py-3 px-4 rounded-lg font-semibold bg-gray-100 text-gray-400 cursor-not-allowed"
                >
                  현재 이용 중
                </button>
              ) : (
                <ChangePlanButton
                  newPlan={plan.id}
                  newPlanName={plan.name}
                  newAmount={plan.price}
                  currentPlan={currentPlan}
                  currentAmount={currentAmount}
                  isUpgrade={isUpgrade}
                  isDowngrade={isDowngrade}
                  priceDiff={priceDiff}
                  nextBillingDate={nextBillingDate}
                  daysLeft={daysLeft}
                  totalDaysInPeriod={totalDaysInPeriod}
                  tenantId={tenantId}
                />
              )}

            </div>
          );
        })}
      </div>

      {/* Notice */}
      <div className="mt-8 bg-gray-50 rounded-lg p-4">
        <h4 className="font-medium text-gray-900 mb-2">플랜 변경 안내</h4>
        <ul className="text-sm text-gray-600 space-y-1">
          <li>• 업그레이드 시 즉시 적용되며, 차액이 일할 계산됩니다.</li>
          <li>• 다운그레이드 시 다음 결제일부터 적용됩니다.</li>
          <li>• 변경된 플랜은 다음 결제 주기부터 새로운 금액이 청구됩니다.</li>
        </ul>
      </div>
    </div>
  );
}
