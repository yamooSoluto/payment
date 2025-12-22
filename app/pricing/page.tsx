import { verifyToken, getSubscription } from '@/lib/auth';
import PricingCard from '@/components/pricing/PricingCard';
import ComparisonTable from '@/components/pricing/ComparisonTable';
import { Zap, Clock, Infinity } from 'lucide-react';
import Link from 'next/link';

const plans = [
  {
    id: 'trial',
    name: 'Trial',
    price: 'Free',
    priceNumber: 0,
    tagline: '백문이 불여일견',
    description: '1개월 무료체험',
    features: [
      '1개월 무료체험',
      'AI 자동 답변',
      '업무 처리 메세지 요약 전달',
      '수동 답변 메세지 자동 보정',
    ],
  },
  {
    id: 'basic',
    name: 'Basic',
    price: '₩39,000',
    priceNumber: 39000,
    tagline: 'CS 마스터 고용하기',
    description: '월 300건 이내',
    popular: true,
    features: [
      '월 300건 이내',
      '데이터 무제한 추가',
      'AI 자동 답변',
      '업무 처리 메세지 요약 전달',
    ],
  },
  {
    id: 'business',
    name: 'Business',
    price: '₩99,000',
    priceNumber: 99000,
    tagline: '풀타임 전담 비서 고용하기',
    description: '문의 건수 제한 없음',
    features: [
      'Basic 기능 모두 포함',
      '문의 건수 제한 없음',
      '수동 답변 메세지 자동 보정',
      '미니맵 연동 및 활용',
      '예약 및 재고 연동',
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: '협의',
    tagline: '비즈니스 확장의 든든한 동반자',
    description: '맞춤형 솔루션 제공',
    features: [
      'Business 기능 모두 포함',
      '데이터 초기 세팅 및 관리',
      '다지점/브랜드 지원',
      '맞춤형 자동화 컨설팅',
      '데이터 리포트 & 통계',
    ],
  },
];

interface PricingPageProps {
  searchParams: Promise<{ token?: string; email?: string }>;
}

export default async function PricingPage({ searchParams }: PricingPageProps) {
  const params = await searchParams;
  const { token, email: emailParam } = params;

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
  const subscription = email ? await getSubscription(email) : null;
  const authParam = token ? `token=${token}` : email ? `email=${encodeURIComponent(email)}` : '';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Header */}
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          요금제 선택
        </h1>
        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
          비즈니스에 맞는 플랜을 선택하세요. 모든 플랜은 30일 무료체험이 가능합니다.
        </p>
      </div>

      {/* Pricing Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
        {plans.map((plan) => (
          <PricingCard
            key={plan.id}
            plan={plan}
            currentPlan={subscription?.plan}
            authParam={authParam}
            isLoggedIn={!!email}
          />
        ))}
      </div>

      {/* Common Features */}
      <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-100 mb-8">
        <h2 className="text-xl font-bold text-gray-900 mb-6 text-center">
          모든 플랜 공통 혜택
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <Clock className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">24시간 AI 자동 응답</h3>
              <p className="text-sm text-gray-500">언제든 고객 문의에 즉시 응답</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <Infinity className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">무제한 응대 건수</h3>
              <p className="text-sm text-gray-500">응대 횟수 제한 없이 이용</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <Zap className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">30일 무료체험</h3>
              <p className="text-sm text-gray-500">부담 없이 먼저 체험해보세요</p>
            </div>
          </div>
        </div>
      </div>

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
          <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-100">
            <h3 className="font-semibold text-gray-900 mb-2">환불 정책은 어떻게 되나요?</h3>
            <p className="text-gray-600 text-sm">
              결제 후 7일 이내 미이용 시 전액 환불, 이용 후에는 일할 계산하여 환불해 드립니다.
            </p>
          </div>
          <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-100">
            <h3 className="font-semibold text-gray-900 mb-2">Enterprise 견적은 어떻게 받나요?</h3>
            <p className="text-gray-600 text-sm">
              yamoo@soluto.co.kr로 문의주시면 담당자가 맞춤 견적을 안내해 드립니다.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
