'use client';

import { Check } from 'iconoir-react';
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
  subscriptionStatus?: string | null;
  authParam: string;
  isLoggedIn: boolean;
  tenantId?: string | null;
  tenantCount?: number;
  trialApplied?: boolean;
  onSelectWithoutTenant?: (planId: string) => void;
  onEnterpriseClick?: () => void;
  onCheckTrialBeforeSubscribe?: (planId: string, checkoutUrl: string) => void;
}

export default function PricingCard({ plan, currentPlan, subscriptionStatus, authParam, isLoggedIn, tenantId, tenantCount = 0, trialApplied = false, onSelectWithoutTenant, onEnterpriseClick, onCheckTrialBeforeSubscribe }: PricingCardProps) {
  const { user } = useAuth();
  const isCurrentPlan = currentPlan === plan.id;
  const isEnterprise = plan.id === 'enterprise';

  // 서버에서 전달받은 isLoggedIn 또는 클라이언트 Firebase Auth 상태 확인
  const isAuthenticated = isLoggedIn || !!user;

  const isTrial = plan.id === 'trial';

  const handleSelect = () => {
    if (isEnterprise) {
      onEnterpriseClick?.();
    } else if (isTrial) {
      // 무료체험은 trial 페이지로 이동
      window.location.href = '/trial';
    } else if (!isAuthenticated) {
      // 비로그인 상태면 로그인 페이지로
      window.location.href = `/login?redirect=/pricing`;
    } else if (!tenantId || tenantCount >= 1) {
      // 매장이 1개 이상이면 모달 표시 (매장 선택)
      onSelectWithoutTenant?.(plan.id);
    } else {
      // 유료 플랜: 무료체험 이력 체크
      const finalAuthParam = authParam || (user?.email ? `email=${encodeURIComponent(user.email)}` : '');
      const checkoutUrl = `/checkout?plan=${plan.id}&${finalAuthParam}&tenantId=${tenantId}`;

      // 무료체험 이력이 없고, 현재 trial 상태가 아닐 때만 팝업 표시
      if (!trialApplied && subscriptionStatus !== 'trial' && onCheckTrialBeforeSubscribe) {
        onCheckTrialBeforeSubscribe(plan.id, checkoutUrl);
      } else {
        // 무료체험 이력이 있거나 현재 trial 상태이거나 핸들러가 없으면 바로 결제 진행
        window.location.href = checkoutUrl;
      }
    }
  };

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

      {/* 클레이모피즘 카드 */}
      <div
        className={cn(
          'flex flex-col relative flex-1 rounded-2xl p-6',
          // 클레이모피즘: 흰 배경 + 테두리 + 입체 그림자
          'bg-white',
          'border border-gray-200',
          // 입체감: 내부 하이라이트 + 외부 다중 그림자
          'shadow-[inset_0_1px_0_0_rgba(255,255,255,1),0_4px_6px_-1px_rgba(0,0,0,0.08),0_10px_20px_-5px_rgba(0,0,0,0.06)]',
          // 호버 효과
          'transition-all duration-300 ease-out',
          'hover:-translate-y-1',
          'hover:shadow-[inset_0_1px_0_0_rgba(255,255,255,1),0_8px_12px_-2px_rgba(0,0,0,0.1),0_16px_30px_-8px_rgba(0,0,0,0.08)]',
          // 인기 플랜: 노란색 테두리 + 글로우
          plan.popular && 'border-2 border-yamoo-primary bg-gradient-to-b from-yellow-50/50 to-white',
          plan.popular && 'shadow-[inset_0_1px_0_0_rgba(255,255,255,1),0_4px_6px_-1px_rgba(250,204,21,0.15),0_10px_20px_-5px_rgba(250,204,21,0.1)]',
          plan.popular && 'hover:shadow-[inset_0_1px_0_0_rgba(255,255,255,1),0_8px_12px_-2px_rgba(250,204,21,0.2),0_16px_30px_-8px_rgba(250,204,21,0.15)]',
          // 현재 플랜: 초록색 링
          isCurrentPlan && 'ring-2 ring-green-500 ring-offset-2'
        )}
      >
        {plan.popular && (
          <div className="absolute -top-3 left-1/2 -translate-x-1/2">
            <span className="bg-gradient-to-r from-yellow-400 to-yamoo-primary text-gray-900 text-xs font-semibold px-4 py-1.5 rounded-full shadow-lg shadow-yamoo-primary/30">
              인기
            </span>
          </div>
        )}

        {isCurrentPlan && (
          <div className="absolute -top-3 right-4">
            <span className="bg-gradient-to-r from-green-500 to-emerald-500 text-white text-xs font-semibold px-4 py-1.5 rounded-full shadow-lg shadow-green-500/30 flex items-center gap-1">
              <Check width={12} height={12} strokeWidth={2.5} />
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
              <Check width={20} height={20} strokeWidth={1.5} className="text-green-500 flex-shrink-0 mt-0.5" />
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
            : '구독하기'}
        </button>
      </div>
    </div>
  );
}
