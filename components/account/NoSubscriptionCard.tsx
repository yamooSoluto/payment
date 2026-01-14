'use client';

import { useState } from 'react';
import { CreditCard, NavArrowRight, Xmark, Sparks, Crown, Check } from 'iconoir-react';
import { Loader2 } from 'lucide-react';
import { formatPrice } from '@/lib/utils';
import { PLAN_PRICES } from '@/lib/toss';
import { useAuth } from '@/contexts/AuthContext';

// 플랜 정보
const PLANS = [
  {
    id: 'basic',
    name: 'Basic',
    price: PLAN_PRICES.basic,
    tagline: 'CS 마스터 고용하기',
    description: '월 300건 이내',
    features: ['월 300건 이내', '데이터 무제한 추가', 'AI 자동 답변', '업무 처리 메세지 요약 전달'],
    icon: Sparks,
    color: 'blue',
    popular: true,
  },
  {
    id: 'business',
    name: 'Business',
    price: PLAN_PRICES.business,
    tagline: '풀타임 전담 비서 고용하기',
    description: '문의 건수 제한 없음',
    features: ['Basic 기능 모두 포함', '문의 건수 제한 없음', '답변 메시지 AI 보정', '미니맵 연동 및 활용', '예약 및 재고 연동'],
    icon: Crown,
    color: 'purple',
    popular: false,
  },
];

interface PlanSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  authParam: string;
  tenantId: string;
}

function PlanSelectModal({ isOpen, onClose, authParam, tenantId }: PlanSelectModalProps) {
  if (!isOpen) return null;

  const handleSelectPlan = (planId: string) => {
    // URLSearchParams로 올바른 URL 구성 (authParam이 빈 문자열일 때 && 방지)
    const params = new URLSearchParams();
    params.set('plan', planId);
    if (authParam) {
      const authParams = new URLSearchParams(authParam);
      authParams.forEach((value, key) => params.set(key, value));
    }
    params.set('tenantId', tenantId);
    window.location.href = `/checkout?${params.toString()}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-lg w-full mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 hover:bg-gray-100 rounded-full transition-colors z-10"
        >
          <Xmark width={20} height={20} strokeWidth={1.5} className="text-gray-500" />
        </button>

        {/* Header */}
        <div className="p-6 pb-4 border-b">
          <h3 className="text-xl font-bold text-gray-900">플랜 선택</h3>
          <p className="text-sm text-gray-500 mt-1">구독할 플랜을 선택해주세요</p>
        </div>

        {/* Plans */}
        <div className="p-6 space-y-4">
          {PLANS.map((plan) => {
            const Icon = plan.icon;
            return (
              <button
                key={plan.id}
                onClick={() => handleSelectPlan(plan.id)}
                className={`relative w-full p-4 rounded-xl border-2 text-left transition-all hover:shadow-md ${
                  plan.color === 'blue'
                    ? 'border-blue-200 hover:border-blue-400 hover:bg-blue-50/50'
                    : 'border-purple-200 hover:border-purple-400 hover:bg-purple-50/50'
                }`}
              >
                {plan.popular && (
                  <span className="absolute -top-2 right-4 px-2 py-0.5 bg-purple-600 text-white text-xs font-medium rounded-full">
                    인기
                  </span>
                )}
                <div className="flex items-start gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    plan.color === 'blue' ? 'bg-blue-100' : 'bg-purple-100'
                  }`}>
                    <Icon
                      width={24}
                      height={24}
                      strokeWidth={1.5}
                      className={plan.color === 'blue' ? 'text-blue-600' : 'text-purple-600'}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <h4 className="font-bold text-gray-900">{plan.name}</h4>
                      <p className="font-bold text-gray-900">
                        {formatPrice(plan.price)}원<span className="text-sm font-normal text-gray-500">/월</span>
                      </p>
                    </div>
                    <p className="text-sm text-gray-500 mb-2">{plan.tagline}</p>
                    <ul className="flex flex-wrap gap-2">
                      {plan.features.map((feature, idx) => (
                        <li key={idx} className="text-xs text-gray-600 bg-gray-100 px-2 py-1 rounded-full">
                          {feature}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6">
          <button
            onClick={onClose}
            className="w-full py-3 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            취소
          </button>
        </div>
      </div>
    </div>
  );
}

interface NoSubscriptionCardProps {
  tenantId: string;
  brandName: string;
  email: string;
  authParam: string;
  hasTrialHistory: boolean;
  userName?: string;
  userPhone?: string;
  industry?: string;
}

export default function NoSubscriptionCard({
  tenantId,
  brandName,
  email,
  authParam,
  hasTrialHistory,
  userName,
  userPhone,
  industry,
}: NoSubscriptionCardProps) {
  const { user } = useAuth();
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [isApplyingTrial, setIsApplyingTrial] = useState(false);
  const [trialSuccess, setTrialSuccess] = useState(false);
  const [trialError, setTrialError] = useState<string | null>(null);

  const handleApplyTrial = async () => {
    if (!userName || !userPhone) {
      setTrialError('사용자 정보가 부족합니다. 고객센터에 문의해주세요.');
      return;
    }

    setIsApplyingTrial(true);
    setTrialError(null);

    try {
      // 기존 tenant에 trial 적용 (새 tenant 생성 안 함)
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (user) {
        const idToken = await user.getIdToken();
        headers['Authorization'] = `Bearer ${idToken}`;
      }

      const response = await fetch('/api/trial/apply', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          tenantId,
          email,
          name: userName,
          phone: userPhone,
          brandName,
          industry: industry || 'other',
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '무료체험 신청에 실패했습니다.');
      }

      setTrialSuccess(true);
      // 3초 후 페이지 새로고침
      setTimeout(() => {
        window.location.reload();
      }, 3000);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : '무료체험 신청에 실패했습니다.';
      setTrialError(errorMessage);
    } finally {
      setIsApplyingTrial(false);
    }
  };

  // 무료체험 신청 성공 화면
  if (trialSuccess) {
    return (
      <div className="bg-white rounded-xl shadow-lg p-8 text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Check width={32} height={32} strokeWidth={2} className="text-green-600" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">
          무료체험 신청 완료!
        </h2>
        <p className="text-gray-600 mb-4">
          {brandName} 매장의 무료체험이 시작되었습니다.
        </p>
        <p className="text-sm text-gray-500">
          잠시 후 페이지가 새로고침됩니다...
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="bg-white rounded-xl shadow-lg p-8 text-center">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CreditCard width={32} height={32} strokeWidth={1.5} className="text-gray-400" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-6">
          이 매장에 구독 중인 플랜이 없습니다
        </h2>

        {trialError && (
          <div className="bg-red-50 text-red-700 p-3 rounded-lg mb-4 text-sm">
            {trialError}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          {/* 무료체험 이력이 없을 경우에만 무료체험 신청 버튼 표시 */}
          {!hasTrialHistory && userName && userPhone && (
            <button
              onClick={handleApplyTrial}
              disabled={isApplyingTrial}
              className="bg-yamoo-primary text-gray-900 px-6 py-3 rounded-lg font-semibold hover:bg-yamoo-primary/90 transition-colors inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isApplyingTrial ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  신청 중...
                </>
              ) : (
                <>
                  무료체험 신청
                  <NavArrowRight width={20} height={20} strokeWidth={1.5} />
                </>
              )}
            </button>
          )}

          <button
            onClick={() => setShowPlanModal(true)}
            className="bg-gray-900 text-white px-6 py-3 rounded-lg font-semibold hover:bg-gray-800 transition-colors inline-flex items-center justify-center gap-2"
          >
            구독하기
            <NavArrowRight width={20} height={20} strokeWidth={1.5} />
          </button>
        </div>

        {!hasTrialHistory && (!userName || !userPhone) && (
          <p className="text-sm text-gray-500 mt-4">
            무료체험을 신청하시려면{' '}
            <a href="/about" className="text-blue-600 hover:underline">
              무료체험 신청 페이지
            </a>
            를 이용해주세요.
          </p>
        )}
      </div>

      {/* 플랜 선택 모달 */}
      <PlanSelectModal
        isOpen={showPlanModal}
        onClose={() => setShowPlanModal(false)}
        authParam={authParam}
        tenantId={tenantId}
      />
    </>
  );
}
