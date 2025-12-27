'use client';

import { useState } from 'react';
import { Check } from 'iconoir-react';
import { Loader2 } from 'lucide-react';
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
  onSelectWithoutTenant?: (planId: string) => void;
  onEnterpriseClick?: () => void;
}

export default function PricingCard({ plan, currentPlan, subscriptionStatus, authParam, isLoggedIn, tenantId, tenantCount = 0, onSelectWithoutTenant, onEnterpriseClick }: PricingCardProps) {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const isCurrentPlan = currentPlan === plan.id;
  const isEnterprise = plan.id === 'enterprise';

  // 서버에서 전달받은 isLoggedIn 또는 클라이언트 Firebase Auth 상태 확인
  const isAuthenticated = isLoggedIn || !!user;

  const isTrial = plan.id === 'trial';

  // 세션 생성 후 checkout으로 이동
  const createSessionAndRedirect = async (email: string, planId: string, tid?: string, token?: string) => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/checkout/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          plan: planId,
          tenantId: tid,
          token,
        }),
      });

      if (response.ok) {
        window.location.href = '/checkout';
      } else {
        console.error('Failed to create checkout session');
        setIsLoading(false);
      }
    } catch (error) {
      console.error('Error creating session:', error);
      setIsLoading(false);
    }
  };

  const handleSelect = async () => {
    if (isEnterprise) {
      onEnterpriseClick?.();
    } else if (isTrial) {
      // 무료체험은 about 페이지 신청폼으로 이동
      window.location.href = '/about#free-trial-form';
    } else if (!isAuthenticated) {
      // 비로그인 상태면 로그인 페이지로
      window.location.href = `/login?redirect=/pricing`;
    } else if (!tenantId || tenantCount > 1) {
      // 매장이 없거나 여러 개면 모달 표시 (매장 선택)
      onSelectWithoutTenant?.(plan.id);
    } else {
      // 매장이 1개면 세션 생성 후 결제 페이지로
      const email = user?.email || '';
      const token = authParam.startsWith('token=') ? authParam.replace('token=', '') : undefined;
      await createSessionAndRedirect(email, plan.id, tenantId, token);
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
              <Check width={20} height={20} strokeWidth={1.5} className="text-green-500 flex-shrink-0 mt-0.5" />
              <span className="text-gray-600 text-sm">{feature}</span>
            </li>
          ))}
        </ul>

        <button
          onClick={handleSelect}
          disabled={isCurrentPlan || isLoading}
          className={cn(
            'w-full py-3 px-4 rounded-lg font-semibold transition-all flex items-center justify-center gap-2',
            isCurrentPlan || isLoading
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : plan.popular
              ? 'btn-primary'
              : 'btn-secondary'
          )}
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              처리 중...
            </>
          ) : isCurrentPlan ? (
            '현재 이용 중'
          ) : isEnterprise ? (
            '문의하기'
          ) : isTrial ? (
            '무료 체험하기'
          ) : (
            '구독하기'
          )}
        </button>
      </div>
    </div>
  );
}
