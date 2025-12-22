'use client';

import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';

interface PricingCardProps {
  plan: {
    id: string;
    name: string;
    price: string;
    priceNumber?: number;
    tagline?: string;
    description: string;
    features: string[];
    popular?: boolean;
  };
  currentPlan?: string | null;
  authParam: string;
  isLoggedIn: boolean;
}

export default function PricingCard({ plan, currentPlan, authParam, isLoggedIn }: PricingCardProps) {
  const { user } = useAuth();
  const isCurrentPlan = currentPlan === plan.id;
  const isEnterprise = plan.id === 'enterprise';

  // 서버에서 전달받은 isLoggedIn 또는 클라이언트 Firebase Auth 상태 확인
  const isAuthenticated = isLoggedIn || !!user;

  const handleSelect = () => {
    if (isEnterprise) {
      window.location.href = 'mailto:yamoo@soluto.co.kr?subject=Enterprise 플랜 문의';
    } else if (!isAuthenticated) {
      // 비로그인 상태면 로그인 페이지로
      window.location.href = `/login?redirect=/checkout?plan=${plan.id}`;
    } else {
      // 클라이언트 인증된 경우 이메일 파라미터 사용
      const finalAuthParam = authParam || (user?.email ? `email=${encodeURIComponent(user.email)}` : '');
      window.location.href = `/checkout?plan=${plan.id}&${finalAuthParam}`;
    }
  };

  const isTrial = plan.id === 'trial';

  return (
    <div className="flex flex-col">
      {/* Tagline */}
      {plan.tagline && (
        <div className="text-center mb-3">
          <span className="text-yamoo-dark font-medium">
            🔥 {plan.tagline}
          </span>
        </div>
      )}

      <div
        className={cn(
          'card card-hover flex flex-col relative flex-1',
          plan.popular && 'border-2 border-yamoo-primary',
          isCurrentPlan && 'ring-2 ring-green-500'
        )}
      >
        {plan.popular && (
          <div className="absolute -top-3 left-1/2 -translate-x-1/2">
            <span className="bg-yamoo-primary text-gray-900 text-xs font-semibold px-3 py-1 rounded-full">
              인기
            </span>
          </div>
        )}

        {isCurrentPlan && (
          <div className="absolute -top-3 right-4">
            <span className="bg-green-500 text-white text-xs font-semibold px-3 py-1 rounded-full">
              현재 플랜
            </span>
          </div>
        )}

        <div className="mb-6">
          <h3 className="text-xl font-bold text-gray-900 mb-4">{plan.name}</h3>
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-bold text-yamoo-dark">{plan.price}</span>
            <span className="text-gray-500">/월</span>
          </div>
        </div>

        <ul className="space-y-3 mb-6 flex-1">
          {plan.features.map((feature, index) => (
            <li key={index} className="flex items-start gap-2">
              <Check className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
              <span className="text-gray-600 text-sm">{feature}</span>
            </li>
          ))}
        </ul>

        <button
          onClick={handleSelect}
          disabled={isCurrentPlan}
          className={cn(
            'w-full py-3 px-4 rounded-lg font-semibold transition-all',
            isCurrentPlan
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : plan.popular
              ? 'btn-primary'
              : 'btn-secondary'
          )}
        >
          {isCurrentPlan
            ? '현재 이용 중'
            : isEnterprise
            ? '문의하기'
            : isTrial
            ? '무료 체험하기'
            : '선택하기'}
        </button>
      </div>
    </div>
  );
}
