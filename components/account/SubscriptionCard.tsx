'use client';

import { useState } from 'react';
import { Calendar, WarningCircle, Clock, Check, Xmark, Sparks, Crown } from 'iconoir-react';
import { formatPrice, formatDate, getStatusText, getStatusColor, calculateDaysLeft } from '@/lib/utils';
import { getPlanName, PLAN_PRICES } from '@/lib/toss';
import { useAuth } from '@/contexts/AuthContext';
import CancelModal from './CancelModal';

// 플랜 선택 모달
interface PlanSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'schedule' | 'immediate';
  authParam: string;
  tenantId?: string;
  hasBillingKey?: boolean;
  hasPendingPlan?: boolean; // 변경할 예약이 있는지 여부
  onUpdatePendingPlan?: (planId: string) => Promise<void>;
  isActiveSubscription?: boolean; // Active 구독자 여부
  currentPlan?: string; // 현재 플랜 (같은 플랜 선택 방지)
  isExpired?: boolean; // 만료된 구독자 (새 구독 시작)
}

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

function PlanSelectModal({ isOpen, onClose, mode, authParam, tenantId, hasBillingKey, hasPendingPlan, onUpdatePendingPlan, isActiveSubscription, currentPlan, isExpired }: PlanSelectModalProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null); // Active 구독자용: 선택된 플랜

  if (!isOpen) return null;

  // checkout URL 생성 헬퍼 (authParam이 빈 문자열일 때도 올바르게 처리)
  // 보안: token은 URL에 노출하지 않음 (세션 쿠키로 인증)
  const buildCheckoutUrl = (planId: string, options?: { tenantId?: string; mode?: string }) => {
    const params = new URLSearchParams();
    params.set('plan', planId);
    if (authParam) {
      const authParams = new URLSearchParams(authParam);
      authParams.forEach((value, key) => {
        // token은 URL에 노출하지 않음 (세션 쿠키 사용)
        if (key !== 'token') {
          params.set(key, value);
        }
      });
    }
    if (options?.tenantId) params.set('tenantId', options.tenantId);
    if (options?.mode) params.set('mode', options.mode);
    return `/checkout?${params.toString()}`;
  };

  const handleSelectPlan = async (planId: string) => {
    // 만료된 구독자: 새로운 구독 시작 (모든 플랜 선택 가능)
    if (isExpired) {
      window.location.href = buildCheckoutUrl(planId, { tenantId });
      return;
    }

    // 같은 플랜 선택시 경고 (만료 상태가 아닐 때만)
    if (currentPlan === planId) {
      alert('현재 구독중인 플랜입니다.');
      return;
    }

    // Active 구독자: 먼저 플랜 선택 후 모드 선택 화면으로
    if (isActiveSubscription) {
      setSelectedPlan(planId);
      return;
    }

    // Trial 사용자: 기존 로직
    // 예약 모드이고 billingKey가 있고 변경할 예약이 있으면 API로 직접 업데이트
    if (mode === 'schedule' && hasBillingKey && hasPendingPlan && onUpdatePendingPlan) {
      setIsUpdating(true);
      try {
        await onUpdatePendingPlan(planId);
        onClose();
      } catch {
        alert('예약 변경에 실패했습니다.');
      } finally {
        setIsUpdating(false);
      }
      return;
    }

    // 그 외에는 checkout으로 이동
    const checkoutMode = mode === 'schedule' ? 'reserve' : 'immediate';
    window.location.href = buildCheckoutUrl(planId, { tenantId, mode: checkoutMode });
  };

  // Active 구독자: 모드 선택 후 처리 (checkout 페이지로 이동)
  const handleModeSelect = (selectedMode: 'schedule' | 'immediate') => {
    if (!selectedPlan) return;
    const checkoutMode = selectedMode === 'schedule' ? 'reserve' : 'immediate';
    window.location.href = buildCheckoutUrl(selectedPlan, { tenantId, mode: checkoutMode });
  };

  // Active 구독자가 플랜을 선택한 상태: 모드 선택 화면 표시
  if (isActiveSubscription && selectedPlan) {
    const selectedPlanInfo = PLANS.find(p => p.id === selectedPlan);
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setSelectedPlan(null)} />
        <div className="relative bg-white rounded-2xl shadow-2xl max-w-sm w-full mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 hover:bg-gray-100 rounded-full transition-colors z-10"
          >
            <Xmark width={20} height={20} strokeWidth={1.5} className="text-gray-500" />
          </button>

          {/* Header */}
          <div className="p-6 pb-4 border-b">
            <h3 className="text-xl font-bold text-gray-900">플랜 전환 방식 선택</h3>
            <p className="text-sm text-gray-500 mt-1">
              {selectedPlanInfo?.name} 플랜으로 어떻게 전환하시겠습니까?
            </p>
          </div>

          {/* Mode Selection */}
          <div className="p-6 space-y-3">
            <button
              onClick={() => handleModeSelect('schedule')}
              className="w-full py-3 px-4 rounded-lg font-semibold border-2 border-gray-300 text-gray-700 hover:bg-yamoo-primary hover:border-yamoo-primary hover:text-gray-900 transition-colors"
            >
              <span className="block text-base">플랜 예약</span>
              <span className="block text-xs opacity-70 mt-0.5">현재 구독 종료 후 자동 전환</span>
            </button>
            <button
              onClick={() => handleModeSelect('immediate')}
              className="w-full py-3 px-4 rounded-lg font-semibold border-2 border-gray-300 text-gray-700 hover:bg-yamoo-primary hover:border-yamoo-primary hover:text-gray-900 transition-colors"
            >
              <span className="block text-base">즉시 전환</span>
              <span className="block text-xs opacity-70 mt-0.5">지금 바로 전환</span>
            </button>
            <button
              onClick={() => setSelectedPlan(null)}
              className="w-full py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              뒤로
            </button>
          </div>
        </div>
      </div>
    );
  }

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
          <h3 className="text-xl font-bold text-gray-900">
            {isUpdating ? '변경 중...' : isExpired ? '플랜 선택' : isActiveSubscription ? '플랜 변경' : mode === 'schedule' ? '플랜 예약' : '즉시 전환'}
          </h3>
          <p className="text-sm text-gray-500 mt-1">
            {isUpdating
              ? '잠시만 기다려주세요'
              : isExpired
              ? '구독할 플랜을 선택해주세요'
              : isActiveSubscription
              ? '변경할 플랜을 선택해주세요'
              : mode === 'schedule'
              ? '무료체험 종료 후 자동으로 시작됩니다'
              : '선택한 플랜으로 바로 전환합니다'}
          </p>
        </div>

        {/* Plans */}
        <div className="p-6 space-y-4">
          {PLANS.map((plan) => {
            const Icon = plan.icon;
            // 만료 상태에서는 모든 플랜 선택 가능 (현재 플랜 표시 안함)
            const isCurrentPlan = !isExpired && currentPlan === plan.id;
            return (
              <button
                key={plan.id}
                onClick={() => handleSelectPlan(plan.id)}
                disabled={isUpdating || isCurrentPlan}
                className={`relative w-full p-4 rounded-xl border-2 text-left transition-all hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed ${
                  isCurrentPlan
                    ? 'border-gray-300 bg-gray-50'
                    : plan.color === 'blue'
                    ? 'border-blue-200 hover:border-blue-400 hover:bg-blue-50/50'
                    : 'border-purple-200 hover:border-purple-400 hover:bg-purple-50/50'
                }`}
              >
                {isCurrentPlan && (
                  <span className="absolute -top-2 right-4 px-2 py-0.5 bg-gray-500 text-white text-xs font-medium rounded-full">
                    현재 플랜
                  </span>
                )}
                {!isCurrentPlan && plan.popular && (
                  <span className="absolute -top-2 right-4 px-2 py-0.5 bg-purple-600 text-white text-xs font-medium rounded-full">
                    인기
                  </span>
                )}
                <div className="flex items-start gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    isCurrentPlan ? 'bg-gray-200' : plan.color === 'blue' ? 'bg-blue-100' : 'bg-purple-100'
                  }`}>
                    <Icon
                      width={24}
                      height={24}
                      strokeWidth={1.5}
                      className={isCurrentPlan ? 'text-gray-500' : plan.color === 'blue' ? 'text-blue-600' : 'text-purple-600'}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <h4 className={`font-bold ${isCurrentPlan ? 'text-gray-500' : 'text-gray-900'}`}>{plan.name}</h4>
                      <p className={`font-bold ${isCurrentPlan ? 'text-gray-500' : 'text-gray-900'}`}>
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

// 해지 성공 결과 모달
interface CancelResultModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'scheduled' | 'immediate';
  refundAmount?: number;
  endDate?: string;
}

function CancelResultModal({ isOpen, onClose, mode, refundAmount, endDate }: CancelResultModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-sm w-full mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 hover:bg-gray-100 rounded-full transition-colors"
        >
          <Xmark width={20} height={20} strokeWidth={1.5} className="text-gray-500" />
        </button>

        {/* Icon */}
        <div className="pt-10 pb-4 flex justify-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
            <Check width={32} height={32} strokeWidth={2} className="text-green-600" />
          </div>
        </div>

        {/* Content */}
        <div className="px-6 pb-8 text-center">
          <h3 className="text-xl font-bold text-gray-900 mb-3">
            {mode === 'immediate' ? '구독이 해지되었습니다' : '해지가 예약되었습니다'}
          </h3>

          {mode === 'immediate' ? (
            <div className="space-y-2 text-gray-600">
              {refundAmount && refundAmount > 0 ? (
                <>
                  <p className="text-lg">
                    <span className="font-bold text-gray-900">{formatPrice(refundAmount)}원</span>이 환불됩니다.
                  </p>
                  <p className="text-sm text-gray-500">
                    환불은 영업일 기준 3~5일 내 처리됩니다.
                  </p>
                </>
              ) : (
                <p>서비스 이용이 즉시 중단됩니다.</p>
              )}
            </div>
          ) : (
            <div className="space-y-2 text-gray-600">
              {endDate && (
                <p>
                  <span className="font-bold text-gray-900">{formatDate(endDate)}</span>까지 서비스를 이용할 수 있습니다.
                </p>
              )}
              <p className="text-sm text-gray-500">
                해지 예약은 언제든지 취소할 수 있습니다.
              </p>
            </div>
          )}

          {/* Button */}
          <button
            onClick={onClose}
            className="mt-6 w-full py-3 px-4 rounded-lg bg-gray-900 text-white font-semibold hover:bg-gray-800 transition-colors"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
}

// 예약 취소 확인 모달
interface CancelReservationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isLoading: boolean;
  pendingPlan?: string;
  pendingAmount?: number;
}

function CancelReservationModal({ isOpen, onClose, onConfirm, isLoading, pendingPlan, pendingAmount }: CancelReservationModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-sm w-full mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 hover:bg-gray-100 rounded-full transition-colors"
        >
          <Xmark width={20} height={20} strokeWidth={1.5} className="text-gray-500" />
        </button>

        {/* Icon */}
        <div className="pt-10 pb-4 flex justify-center">
          <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center">
            <WarningCircle width={32} height={32} strokeWidth={1.5} className="text-yellow-600" />
          </div>
        </div>

        {/* Content */}
        <div className="px-6 pb-8 text-center">
          <h3 className="text-xl font-bold text-gray-900 mb-3">
            예약된 플랜 변경을 취소하시겠습니까?
          </h3>

          {pendingPlan && (
            <div className="bg-gray-50 rounded-lg p-4 mb-4 text-left">
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-500">예약된 플랜</span>
                <span className="font-semibold text-gray-900">{getPlanName(pendingPlan)}</span>
              </div>
              {pendingAmount && (
                <div className="flex justify-between items-center text-sm mt-2">
                  <span className="text-gray-500">예정 금액</span>
                  <span className="font-semibold text-gray-900">{formatPrice(pendingAmount)}원/월</span>
                </div>
              )}
            </div>
          )}

          <p className="text-sm text-gray-500 mb-6">
            예약을 취소하면 현재 플랜이 계속 유지됩니다.
          </p>

          {/* Buttons */}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={isLoading}
              className="flex-1 py-3 px-4 rounded-lg border border-gray-300 text-gray-700 font-semibold hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              돌아가기
            </button>
            <button
              onClick={onConfirm}
              disabled={isLoading}
              className="flex-1 py-3 px-4 rounded-lg bg-red-600 text-white font-semibold hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              {isLoading ? '취소 중...' : '예약 취소'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface SubscriptionCardProps {
  subscription: {
    status: string;
    plan?: string;
    amount?: number;
    nextBillingDate?: Date | string;
    currentPeriodStart?: Date | string;
    currentPeriodEnd?: Date | string;
    trialEndDate?: Date | string;
    pendingPlan?: string;
    pendingAmount?: number;
    pendingChangeAt?: Date | string;
    billingKey?: string;
    cancelMode?: 'scheduled' | 'immediate'; // 해지 모드: scheduled(예정 해지), immediate(즉시 해지)
  };
  authParam: string;
  tenantId?: string;
}

export default function SubscriptionCard({ subscription, authParam, tenantId }: SubscriptionCardProps) {
  const { user } = useAuth();
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showPlanSelectModal, setShowPlanSelectModal] = useState<{ isOpen: boolean; mode: 'schedule' | 'immediate' }>({ isOpen: false, mode: 'schedule' });
  const [showCancelReservationModal, setShowCancelReservationModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isCancelingPending, setIsCancelingPending] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [cancelResult, setCancelResult] = useState<{
    isOpen: boolean;
    mode: 'scheduled' | 'immediate';
    refundAmount?: number;
  }>({ isOpen: false, mode: 'scheduled' });

  const isTrial = subscription.status === 'trial';
  const isActive = subscription.status === 'active';
  const isCanceled = subscription.status === 'canceled';
  const isPastDue = subscription.status === 'past_due';
  const isExpired = subscription.status === 'expired';

  // 즉시 해지 여부 (해지가 이미 완료된 상태)
  const isImmediateCanceled = isCanceled && subscription.cancelMode === 'immediate';
  // 예정 해지 여부 (해지 예약만 된 상태, 아직 이용 가능)
  const isScheduledCanceled = isCanceled && subscription.cancelMode !== 'immediate';

  // authParam 파싱 헬퍼
  const parseAuthParam = () => {
    const params = new URLSearchParams(authParam);
    return {
      token: params.get('token'),
      email: params.get('email'),
    };
  };

  // API 호출을 위한 인증 헤더/바디 준비
  const getAuthForRequest = async (): Promise<{
    headers: Record<string, string>;
    body: { token?: string | null; email?: string | null };
  }> => {
    const { token, email } = parseAuthParam();

    // SSO 토큰이 있으면 body에 포함
    if (token) {
      return { headers: { 'Content-Type': 'application/json' }, body: { token, email } };
    }

    // Firebase Auth 사용자는 Bearer 토큰 사용
    if (user) {
      const idToken = await user.getIdToken();
      return {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: { email: user.email },
      };
    }

    // 둘 다 없으면 email만
    return { headers: { 'Content-Type': 'application/json' }, body: { email } };
  };

  const handleCancel = async (
    reason: string,
    reasonDetail?: string,
    mode?: 'scheduled' | 'immediate',
    refundAmount?: number
  ) => {
    setIsLoading(true);
    try {
      const auth = await getAuthForRequest();

      // 취소 사유 조합 (기타인 경우 상세 사유 포함)
      const cancelReason = reasonDetail ? `${reason}: ${reasonDetail}` : reason;

      const response = await fetch('/api/subscriptions/cancel', {
        method: 'POST',
        headers: auth.headers,
        body: JSON.stringify({
          ...auth.body,
          tenantId,
          reason: cancelReason,
          mode: mode || 'scheduled',
          refundAmount: mode === 'immediate' ? refundAmount : undefined,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setShowCancelModal(false);
        setCancelResult({
          isOpen: true,
          mode: mode || 'scheduled',
          refundAmount: data.refundAmount,
        });
      } else {
        alert(data.error || '구독 해지에 실패했습니다. 다시 시도해주세요.');
      }
    } catch {
      alert('오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelResultClose = () => {
    setCancelResult({ isOpen: false, mode: 'scheduled' });
    window.location.reload();
  };

  const handleReactivate = async () => {
    setIsLoading(true);
    try {
      const auth = await getAuthForRequest();

      const response = await fetch('/api/subscriptions/reactivate', {
        method: 'POST',
        headers: auth.headers,
        body: JSON.stringify({ ...auth.body, tenantId }),
      });

      const data = await response.json();

      if (response.ok) {
        window.location.reload();
      } else if (data.expired) {
        // 만료된 경우 요금제 페이지로 이동
        alert('이용 기간이 만료되었습니다. 새로 구독해주세요.');
        window.location.href = `/plan${authParam ? `?${authParam}` : ''}`;
      } else {
        alert('구독 재활성화에 실패했습니다. 다시 시도해주세요.');
      }
    } catch {
      alert('오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelPendingPlan = async () => {
    setIsCancelingPending(true);
    try {
      const auth = await getAuthForRequest();

      const response = await fetch('/api/subscriptions/cancel-pending-plan', {
        method: 'POST',
        headers: auth.headers,
        body: JSON.stringify({ ...auth.body, tenantId }),
      });

      if (response.ok) {
        setShowCancelReservationModal(false);
        window.location.reload();
      } else {
        const data = await response.json();
        alert(data.error || '예약 취소에 실패했습니다.');
      }
    } catch {
      alert('오류가 발생했습니다.');
    } finally {
      setIsCancelingPending(false);
    }
  };

  const handleRetryPayment = async () => {
    if (!confirm('등록된 카드로 결제를 다시 시도하시겠습니까?')) return;

    setIsRetrying(true);
    try {
      const auth = await getAuthForRequest();

      const response = await fetch('/api/payments/retry', {
        method: 'POST',
        headers: auth.headers,
        body: JSON.stringify({ ...auth.body, tenantId }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        alert('결제가 성공적으로 처리되었습니다!');
        window.location.reload();
      } else {
        alert(data.error || '결제에 실패했습니다. 카드 정보를 확인해주세요.');
      }
    } catch {
      alert('오류가 발생했습니다.');
    } finally {
      setIsRetrying(false);
    }
  };

  // 예약 플랜 변경 (billingKey가 이미 있는 경우)
  const handleUpdatePendingPlan = async (newPlan: string) => {
    const auth = await getAuthForRequest();

    const response = await fetch('/api/subscriptions/update-pending-plan', {
      method: 'POST',
      headers: auth.headers,
      body: JSON.stringify({ ...auth.body, tenantId, newPlan }),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || '예약 변경에 실패했습니다.');
    }

    window.location.reload();
  };

  return (
    <>
      <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h2 className="text-xl font-bold text-gray-900">
                {(isTrial || subscription.plan === 'trial') ? '무료체험' : subscription.plan ? `${getPlanName(subscription.plan)} 플랜` : '구독 없음'}
              </h2>
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                isImmediateCanceled ? 'text-gray-600 bg-gray-100' : getStatusColor(subscription.status)
              }`}>
                {isImmediateCanceled ? '해지됨' : getStatusText(subscription.status)}
              </span>
            </div>
            {isActive && subscription.amount && (
              <p className="text-2xl font-bold text-blue-900">
                {formatPrice(subscription.amount)}원<span className="text-sm font-normal text-gray-500"> / 월</span>
              </p>
            )}
          </div>
        </div>

        {/* Trial Info */}
        {isTrial && (
          <>
            <div className="space-y-4 mb-6">
              <div className="flex items-center gap-3 text-gray-600">
                <Calendar width={20} height={20} strokeWidth={1.5} className="text-gray-400" />
                <div>
                  <p className="text-sm text-gray-500">이용기간</p>
                  <p className="font-medium">
                    {subscription.currentPeriodStart && subscription.trialEndDate
                      ? `${formatDate(subscription.currentPeriodStart)} ~ ${formatDate(subscription.trialEndDate)}`
                      : '-'}
                  </p>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Active/Canceled Subscription Info */}
        {(isActive || isCanceled) && (
          <div className="space-y-4 mb-6">
            <div className="flex items-center gap-3 text-gray-600">
              <Calendar width={20} height={20} strokeWidth={1.5} className="text-gray-400" />
              <div>
                <p className="text-sm text-gray-500">이용기간</p>
                <p className="font-medium">
                  {subscription.currentPeriodStart && (subscription.nextBillingDate || subscription.currentPeriodEnd)
                    ? (() => {
                        // currentPeriodEnd가 있으면 그 값을 직접 사용 (어드민이 설정한 값 우선)
                        // currentPeriodEnd가 없고 nextBillingDate만 있으면 -1일 적용
                        const useCurrentPeriodEnd = !!subscription.currentPeriodEnd;
                        const baseDate = useCurrentPeriodEnd
                          ? new Date(subscription.currentPeriodEnd)
                          : new Date(subscription.nextBillingDate!);
                        const endDate = new Date(baseDate);
                        if (!useCurrentPeriodEnd) {
                          endDate.setDate(endDate.getDate() - 1);
                        }
                        return `${formatDate(subscription.currentPeriodStart)} ~ ${formatDate(endDate)}`;
                      })()
                    : '-'}
                </p>
              </div>
            </div>
            {/* 예약된 플랜이 없고 active 상태일 때만 다음 결제일 표시 */}
            {isActive && !subscription.pendingPlan && (
              <div className="flex items-center gap-3 text-gray-600">
                <Calendar width={20} height={20} strokeWidth={1.5} className="text-gray-400" />
                <div>
                  <p className="text-sm text-gray-500">다음 결제일</p>
                  <p className="font-medium">{subscription.nextBillingDate ? formatDate(subscription.nextBillingDate) : '-'}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Pending Plan Change Notice */}
        {subscription.pendingPlan && (
          <div className="bg-blue-50 rounded-lg p-4 mb-6">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3 text-blue-700">
                <Clock width={20} height={20} strokeWidth={1.5} className="mt-0.5 flex-shrink-0" />
                <div>
                  <span className="font-medium">{isTrial ? '예약된 유료 플랜' : '예약된 플랜'}</span>
                  <div className="mt-2 space-y-1 text-sm text-blue-600">
                    <p>
                      <span className="text-blue-500">플랜:</span>{' '}
                      <span className="font-semibold">{getPlanName(subscription.pendingPlan)}</span>
                      {subscription.pendingAmount && ` (${formatPrice(subscription.pendingAmount)}원/월)`}
                    </p>
                    {subscription.pendingChangeAt && (
                      <>
                        <p>
                          <span className="text-blue-500">이용기간:</span>{' '}
                          {(() => {
                            const startDate = new Date(subscription.pendingChangeAt);
                            const endDate = new Date(startDate);
                            endDate.setMonth(endDate.getMonth() + 1);
                            endDate.setDate(endDate.getDate() - 1);
                            return `${formatDate(startDate)} ~ ${formatDate(endDate)}`;
                          })()}
                        </p>
                        <p>
                          <span className="text-blue-500">결제일:</span>{' '}
                          {formatDate(subscription.pendingChangeAt)}
                        </p>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                {/* 플랜이 3개 이상일 때만 예약 변경 버튼 표시 (현재 2개라 변경할 플랜이 1개뿐) */}
                {PLANS.length > 2 && (
                  <>
                    <button
                      onClick={() => setShowPlanSelectModal({ isOpen: true, mode: 'schedule' })}
                      className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      예약 변경
                    </button>
                    <span className="text-blue-300">|</span>
                  </>
                )}
                <button
                  onClick={() => setShowCancelReservationModal(true)}
                  disabled={isCancelingPending}
                  className="text-sm text-blue-600 hover:text-blue-800 hover:underline disabled:opacity-50"
                >
                  예약 취소
                </button>
              </div>
            </div>
            <p className="text-xs text-blue-400 mt-3">
              다른 플랜으로 변경하려면 기존 예약을 먼저 취소해주세요.
            </p>
          </div>
        )}

        {/* Past Due Warning */}
        {isPastDue && (
          <div className="bg-red-50 rounded-lg p-4 mb-6">
            <div className="flex items-center gap-2 text-red-700">
              <WarningCircle width={20} height={20} strokeWidth={1.5} />
              <span className="font-medium">결제 실패</span>
            </div>
            <p className="text-sm text-red-600 mt-1">
              결제에 실패했습니다. 결제 수단을 확인하고 다시 시도해주세요.
            </p>
          </div>
        )}

        {/* Canceled Info - 예정 해지 (scheduled) */}
        {isScheduledCanceled && subscription.currentPeriodEnd && (
          <div className="bg-yellow-50 rounded-lg p-4 mb-6">
            <p className="text-sm text-yellow-800 font-medium mb-1">
              구독이 해지 예정입니다
            </p>
            <p className="text-sm text-yellow-700">
              {formatDate(subscription.currentPeriodEnd)}까지 이용 가능하며,
              &apos;다시 이용하기&apos;를 누르면 해지가 취소되고 다음 결제일에 {subscription.amount ? `${formatPrice(subscription.amount)}원이` : '요금이'} 결제됩니다.
            </p>
          </div>
        )}

        {/* Canceled Info - 즉시 해지 (immediate) */}
        {isImmediateCanceled && subscription.currentPeriodEnd && (
          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <p className="text-sm text-gray-800 font-medium mb-1">
              구독이 해지되었습니다
            </p>
            <p className="text-sm text-gray-600">
              {formatDate(subscription.currentPeriodEnd)}에 구독이 해지되었습니다.
              다시 서비스를 이용하시려면 새로 구독해주세요.
            </p>
          </div>
        )}

        {/* Expired Info */}
        {isExpired && (
          <div className="bg-orange-50 rounded-lg p-4 mb-6">
            <div className="flex items-center gap-2 text-orange-700">
              <WarningCircle width={20} height={20} strokeWidth={1.5} />
              <span className="font-medium">구독이 만료되었습니다</span>
            </div>
            <p className="text-sm text-orange-600 mt-1">
              {subscription.plan === 'trial'
                ? '무료 체험 기간이 종료되었습니다. 유료 플랜을 선택하여 서비스를 계속 이용해주세요.'
                : '구독이 해지되어 서비스 이용이 종료되었습니다. 다시 구독하시려면 플랜을 선택해주세요.'}
            </p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-3">
          {/* Trial: pendingPlan이 없을 때만 버튼 표시 (있으면 파란 박스에서 예약 취소 가능) */}
          {isTrial && !subscription.pendingPlan && (
            <>
              <button
                onClick={() => setShowPlanSelectModal({ isOpen: true, mode: 'schedule' })}
                className="bg-black text-white px-6 py-2 rounded-lg font-semibold hover:bg-yamoo-primary hover:text-gray-900 transition-all duration-200"
              >
                플랜 예약
              </button>
              <button
                onClick={() => setShowPlanSelectModal({ isOpen: true, mode: 'immediate' })}
                className="bg-black text-white px-6 py-2 rounded-lg font-semibold hover:bg-yamoo-primary hover:text-gray-900 transition-all duration-200"
              >
                즉시 전환
              </button>
            </>
          )}
          {/* 플랜이 3개 이상이거나 예약된 플랜이 없을 때만 플랜 변경 버튼 표시 */}
          {isActive && (PLANS.length > 2 || !subscription.pendingPlan) && (
            <button
              onClick={() => setShowPlanSelectModal({ isOpen: true, mode: 'schedule' })}
              className="bg-black text-white px-6 py-2 rounded-lg font-semibold hover:bg-yamoo-primary hover:text-gray-900 transition-all duration-200"
            >
              플랜 변경
            </button>
          )}
          {isActive && (
            <button
              onClick={() => setShowCancelModal(true)}
              className="bg-black text-white px-6 py-2 rounded-lg font-semibold hover:bg-yamoo-primary hover:text-gray-900 transition-all duration-200"
            >
              구독 해지
            </button>
          )}
          {isPastDue && (
            <>
              <button
                onClick={handleRetryPayment}
                disabled={isRetrying}
                className="btn-primary"
              >
                {isRetrying ? '결제 중...' : '재결제하기'}
              </button>
              <a
                href={`/checkout?plan=${subscription.plan}${authParam ? `&${authParam}` : ''}${tenantId ? `&tenantId=${tenantId}` : ''}`}
                className="btn-secondary"
              >
                카드 변경하기
              </a>
            </>
          )}
          {/* 예정 해지: 다시 이용하기 (재활성화) */}
          {isScheduledCanceled && (
            <button
              onClick={handleReactivate}
              disabled={isLoading}
              className="btn-primary"
            >
              {isLoading ? '처리 중...' : '다시 이용하기'}
            </button>
          )}
          {/* 즉시 해지: 새로 구독하기 */}
          {isImmediateCanceled && (
            <button
              onClick={() => setShowPlanSelectModal({ isOpen: true, mode: 'immediate' })}
              className="btn-primary"
            >
              새로 구독하기
            </button>
          )}
          {isExpired && (
            <button
              onClick={() => setShowPlanSelectModal({ isOpen: true, mode: 'immediate' })}
              className="btn-primary"
            >
              유료 플랜 선택하기
            </button>
          )}
        </div>
      </div>

      {/* Cancel Modal */}
      {showCancelModal && (
        <CancelModal
          onClose={() => setShowCancelModal(false)}
          onConfirm={handleCancel}
          isLoading={isLoading}
          currentPeriodEnd={subscription.currentPeriodEnd}
          currentPeriodStart={subscription.currentPeriodStart}
          amount={subscription.amount}
          pendingPlan={subscription.pendingPlan}
        />
      )}

      {/* Cancel Result Modal */}
      <CancelResultModal
        isOpen={cancelResult.isOpen}
        onClose={handleCancelResultClose}
        mode={cancelResult.mode}
        refundAmount={cancelResult.refundAmount}
        endDate={subscription.currentPeriodEnd
          ? new Date(subscription.currentPeriodEnd).toISOString()
          : undefined}
      />

      {/* Cancel Reservation Modal */}
      <CancelReservationModal
        isOpen={showCancelReservationModal}
        onClose={() => setShowCancelReservationModal(false)}
        onConfirm={handleCancelPendingPlan}
        isLoading={isCancelingPending}
        pendingPlan={subscription.pendingPlan}
        pendingAmount={subscription.pendingAmount}
      />

      {/* Plan Select Modal */}
      <PlanSelectModal
        isOpen={showPlanSelectModal.isOpen}
        onClose={() => setShowPlanSelectModal({ isOpen: false, mode: 'schedule' })}
        mode={showPlanSelectModal.mode}
        authParam={authParam}
        tenantId={tenantId}
        hasBillingKey={!!subscription.billingKey}
        hasPendingPlan={!!subscription.pendingPlan}
        onUpdatePendingPlan={handleUpdatePendingPlan}
        isActiveSubscription={isActive}
        currentPlan={subscription.plan}
        isExpired={isExpired}
      />
    </>
  );
}
