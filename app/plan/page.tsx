import { verifyToken, getSubscription, getTenantsByEmail, getPlans, getPlanSettings } from '@/lib/auth';
import { getAuthSessionIdFromCookie, getAuthSession } from '@/lib/auth-session';
import PricingClient from '@/components/pricing/PricingClient';
import ComparisonTable from '@/components/pricing/ComparisonTable';

export const dynamic = 'force-dynamic';

interface PricingPageProps {
  searchParams: Promise<{ token?: string; tenantId?: string }>;
}

export default async function PricingPage({ searchParams }: PricingPageProps) {
  const params = await searchParams;
  const { token, tenantId } = params;

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

  // 비로그인 상태에서도 요금제 페이지는 볼 수 있음 (선택 시 로그인 유도)
  const authParam = token ? `token=${token}` : '';

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
      <ComparisonTable
        comingSoonPlanIds={plans
          .filter(p => p.isActive === false && p.displayMode === 'coming_soon')
          .map(p => p.id)}
      />

      {/* FAQ Section */}
      <div className="mt-16">
        <h2 className="text-2xl font-bold text-gray-900 mb-8 text-center">
          자주 묻는 질문
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-100">
            <h3 className="font-semibold text-gray-900 mb-2">설치 비용이 있나요?</h3>
            <p className="text-gray-600 text-sm">
              아니요, 별도의 설치비는 없어요. 사용에 따른 후불 비용도 없고,
              기본 플랜 요금 외에 추가 비용은 발생하지 않습니다.
            </p>
          </div>
          <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-100">
            <h3 className="font-semibold text-gray-900 mb-2">AI 응대를 신뢰해도 될까요?</h3>
            <p className="text-gray-600 text-sm">
              네, 매장 정보를 기반으로 맥락을 이해하고 실제 사람처럼 답변해요.
              매장 정보를 다양하게 많이 입력해 주실수록 더 정확한 답변이 가능합니다.
            </p>
          </div>
          <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-100">
            <h3 className="font-semibold text-gray-900 mb-2">결제 후 바로 사용할 수 있나요?</h3>
            <p className="text-gray-600 text-sm">
              네, 매장 생성 후 플랜이 시작되면 바로 고객 문의용 채팅 링크가 만들어져요.
              매장 정보만 입력해 주시면 바로 이용 가능합니다. 결제 전 1개월 무료체험도 가능하답니다! 
            </p>
          </div>
          <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-100">
            <h3 className="font-semibold text-gray-900 mb-2">문의 건수 제한이 있나요?</h3>
            <p className="text-gray-600 text-sm">
              Basic 플랜은 월 300건 제한이 있지만, 무료체험을 포함한 다른 모든 플랜은
              건수 제한 없이 이용하실 수 있어요.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
