'use client';

import { useState, useEffect } from 'react';
import { Xmark, Plus, FastRightCircle, Calendar, WarningCircle } from 'iconoir-react';
import {
  SubscriptionActionModalProps,
  SubscriptionActionType,
  isSubscriptionActive,
  canStartSubscription,
  PLAN_LABELS,
  PlanType,
} from './types';
import SubscriptionStatusCard from './SubscriptionStatusCard';
import StartSubscriptionForm from './StartSubscriptionForm';
import PlanChangeForm from './PlanChangeForm';
import PeriodAdjustForm from './PeriodAdjustForm';
import CancelSubscriptionForm from './CancelSubscriptionForm';

const ACTION_LABELS: Record<SubscriptionActionType, string> = {
  start: '구독 시작',
  change_plan: '플랜 변경',
  adjust_period: '기간 조정',
  cancel: '해지',
};

export default function SubscriptionActionModal({
  isOpen,
  onClose,
  tenantId,
  subscription,
  tenant,
  initialAction,
  onSuccess,
}: SubscriptionActionModalProps) {
  // 초기 액션 결정
  const getDefaultAction = (): SubscriptionActionType => {
    if (initialAction) return initialAction;
    if (canStartSubscription(subscription?.status)) return 'start';
    return 'change_plan';
  };

  const [currentAction, setCurrentAction] = useState<SubscriptionActionType>(getDefaultAction());
  const [cancelingPending, setCancelingPending] = useState(false);

  // initialAction이 변경되거나 모달이 열릴 때 currentAction 업데이트
  useEffect(() => {
    if (isOpen) {
      setCurrentAction(getDefaultAction());
    }
  }, [isOpen, initialAction]);

  if (!isOpen) return null;

  const handleSuccess = () => {
    onSuccess();
    onClose();
  };

  const handleCancel = () => {
    onClose();
  };

  // 예약 상태 확인
  const hasPendingPlan = !!subscription?.pendingPlan;
  const hasPendingCancel = subscription?.status === 'pending_cancel';
  const hasPendingAction = hasPendingPlan || hasPendingCancel;

  // 예약 취소 핸들러
  const handleCancelPending = async (type: 'plan' | 'cancel') => {
    setCancelingPending(true);
    try {
      const res = await fetch(`/api/admin/subscriptions/${tenantId}/pending?type=${type}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || '예약 취소에 실패했습니다.');
        return;
      }
      alert(data.message);
      onSuccess(); // 데이터 새로고침
    } catch {
      alert('예약 취소에 실패했습니다.');
    } finally {
      setCancelingPending(false);
    }
  };

  // 사용 가능한 액션 결정
  const hasActiveSubscription = isSubscriptionActive(subscription?.status);
  const canStart = canStartSubscription(subscription?.status);

  // 액션 버튼 목록
  const actionButtons: { action: SubscriptionActionType; icon: typeof Plus; show: boolean; disabled: boolean }[] = [
    { action: 'start', icon: Plus, show: canStart, disabled: false },
    { action: 'change_plan', icon: FastRightCircle, show: hasActiveSubscription, disabled: hasPendingAction },
    { action: 'adjust_period', icon: Calendar, show: hasActiveSubscription, disabled: hasPendingAction },
    { action: 'cancel', icon: WarningCircle, show: hasActiveSubscription && !hasPendingCancel, disabled: hasPendingPlan },
  ];

  const renderActionForm = () => {
    const commonProps = {
      tenantId,
      subscription,
      tenant,
      onSuccess: handleSuccess,
      onCancel: handleCancel,
    };

    // 예약이 있으면 해당 액션 비활성화
    const isActionBlocked = (action: SubscriptionActionType): boolean => {
      if (action === 'start') return false;
      if (hasPendingPlan) return true;
      if (hasPendingCancel && action !== 'cancel') return true;
      return false;
    };

    if (isActionBlocked(currentAction)) {
      const pendingType = hasPendingPlan ? 'plan' : 'cancel';
      const pendingLabel = hasPendingPlan
        ? `플랜 변경 예약: ${PLAN_LABELS[subscription?.plan as PlanType] || '-'} → ${PLAN_LABELS[subscription?.pendingPlan as PlanType]}`
        : '해지 예약됨';

      return (
        <div className="text-center py-8 text-gray-500">
          <WarningCircle className="w-12 h-12 mx-auto mb-3 text-amber-400" />
          <p className="font-medium text-gray-700">{pendingLabel}</p>
          <p className="text-sm mt-1 mb-4">다른 작업을 하려면 먼저 예약을 취소해주세요.</p>
          <button
            onClick={() => handleCancelPending(pendingType)}
            disabled={cancelingPending}
            className="px-4 py-2 text-sm font-medium text-amber-700 bg-amber-100 hover:bg-amber-200 rounded-lg transition-colors disabled:opacity-50"
          >
            {cancelingPending ? '취소 중...' : '예약 취소'}
          </button>
        </div>
      );
    }

    switch (currentAction) {
      case 'start':
        return <StartSubscriptionForm {...commonProps} />;
      case 'change_plan':
        return <PlanChangeForm {...commonProps} />;
      case 'adjust_period':
        return <PeriodAdjustForm {...commonProps} />;
      case 'cancel':
        return <CancelSubscriptionForm {...commonProps} />;
      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <div>
            <h3 className="text-lg font-bold text-gray-900">
              {ACTION_LABELS[currentAction]}
            </h3>
            <p className="text-sm text-gray-500">{tenant.brandName}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <Xmark className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* 액션 선택 탭 (활성 구독이 있을 때만 표시) */}
        {hasActiveSubscription && (
          <div className="flex gap-1 px-4 py-2 border-b border-gray-100 overflow-x-auto">
            {actionButtons
              .filter((btn) => btn.show)
              .map(({ action, icon: Icon, disabled }) => (
                <button
                  key={action}
                  onClick={() => !disabled && setCurrentAction(action)}
                  disabled={disabled}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                    currentAction === action
                      ? 'bg-blue-600 text-white'
                      : disabled
                      ? 'text-gray-300 cursor-not-allowed'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {ACTION_LABELS[action]}
                </button>
              ))}
          </div>
        )}

        {/* 컨텐츠 */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* 구독 상태 카드 (start 액션이 아닐 때만) */}
          {currentAction !== 'start' && (
            <div className="mb-4">
              <SubscriptionStatusCard subscription={subscription} tenant={tenant} />
            </div>
          )}

          {/* 액션 폼 */}
          {renderActionForm()}
        </div>
      </div>
    </div>
  );
}
