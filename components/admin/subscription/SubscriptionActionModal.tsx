'use client';

import { useState } from 'react';
import { Xmark, Plus, ArrowsUpFromLine, Calendar, WarningCircle } from 'iconoir-react';
import {
  SubscriptionActionModalProps,
  SubscriptionActionType,
  isSubscriptionActive,
  canStartSubscription,
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

  if (!isOpen) return null;

  const handleSuccess = () => {
    onSuccess();
    onClose();
  };

  const handleCancel = () => {
    onClose();
  };

  // 사용 가능한 액션 결정
  const hasActiveSubscription = isSubscriptionActive(subscription?.status);
  const canStart = canStartSubscription(subscription?.status);

  // 액션 버튼 목록
  const actionButtons: { action: SubscriptionActionType; icon: typeof Plus; show: boolean }[] = [
    { action: 'start', icon: Plus, show: canStart },
    { action: 'change_plan', icon: ArrowsUpFromLine, show: hasActiveSubscription },
    { action: 'adjust_period', icon: Calendar, show: hasActiveSubscription },
    { action: 'cancel', icon: WarningCircle, show: hasActiveSubscription },
  ];

  const renderActionForm = () => {
    const commonProps = {
      tenantId,
      subscription,
      tenant,
      onSuccess: handleSuccess,
      onCancel: handleCancel,
    };

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
          <h3 className="text-lg font-bold text-gray-900">
            {ACTION_LABELS[currentAction]}
          </h3>
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
              .map(({ action, icon: Icon }) => (
                <button
                  key={action}
                  onClick={() => setCurrentAction(action)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                    currentAction === action
                      ? 'bg-blue-600 text-white'
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
