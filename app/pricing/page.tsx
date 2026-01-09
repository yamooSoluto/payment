import { verifyToken, getSubscription, getTenantsByEmail, getPlans, getPlanSettings } from '@/lib/auth';
import PricingClient from '@/components/pricing/PricingClient';
import ComparisonTable from '@/components/pricing/ComparisonTable';

export const dynamic = 'force-dynamic';

interface PricingPageProps {
  searchParams: Promise<{ token?: string; email?: string; tenantId?: string }>;
}

export default async function PricingPage({ searchParams }: PricingPageProps) {
  const params = await searchParams;
  const { token, email: emailParam, tenantId } = params;

  let email: string | null = null;

  // 1. 토큰으로 인증 (포탈 SSO)
  if (token) {
    email = await verifyToken(token);
  }
  // 2. 이메일 파라미터로 접근 (Firebase Auth)
  else if (emailParam) {
    email = emailParam;
  }

  // 비로그인 상태에서도 요금제 페이지는 볼 수 있음 (선택 시 로그인 유도)
  const authParam = token ? `token=${token}` : email ? `email=${encodeURIComponent(email)}` : '';

  // 병렬로 플랜, 구독 정보, 매장 목록, 설정 조회 (성능 최적화)
  const [plans, subscription, tenants, planSettings] = await Promise.all([
    getPlans(),
    email ? getSubscription(email) : Promise.resolve(null),
    email ? getTenantsByEmail(email) : Promise.resolve([]),
    getPlanSettings(),
  ]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Header */}
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          요금제 선택
        </h1>
        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
          비즈니스에 맞는 플랜을 선택하세요.
        </p>
      </div>

      {/* Pricing Cards */}
      <PricingClient
        plans={plans}
        currentPlan={subscription?.status === 'active' || subscription?.status === 'trial' ? subscription?.plan : null}
        subscriptionStatus={subscription?.status}
        authParam={authParam}
        isLoggedIn={!!email}
        initialTenantId={tenantId}
        initialTenants={tenants}
        gridCols={planSettings.gridCols}
      />

      {/* Comparison Table */}
      <ComparisonTable />

      {/* FAQ Section */}
      <div className="mt-16">
        <h2 className="text-2xl font-bold text-gray-900 mb-8 text-center">
          자주 묻는 질문
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-100">
            <h3 className="font-semibold text-gray-900 mb-2">플랜 변경은 어떻게 하나요?</h3>
            <p className="text-gray-600 text-sm">
              언제든지 상위 플랜으로 업그레이드하거나 하위 플랜으로 변경할 수 있습니다.
              변경은 다음 결제일부터 적용됩니다.
            </p>
          </div>
          <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-100">
            <h3 className="font-semibold text-gray-900 mb-2">해지하면 어떻게 되나요?</h3>
            <p className="text-gray-600 text-sm">
              해지 시 다음 결제일에 자동결제가 중단됩니다. 남은 기간 동안은 계속 이용 가능합니다.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
