'use client';

import { useState } from 'react';
import { RefreshDouble, Check, ArrowRight } from 'iconoir-react';
import {
  SubscriptionFormProps,
  PlanType,
  PLAN_LABELS,
  PLAN_PRICES,
} from './types';

// 플랜 변경 가능한 플랜 목록 (trial은 제외)
const CHANGEABLE_PLANS: PlanType[] = ['basic', 'business', 'enterprise'];

export default function PlanChangeForm({
  tenantId,
  subscription,
  tenant,
  onSuccess,
  onCancel,
}: SubscriptionFormProps) {
  const currentPlan = subscription?.plan as PlanType | null;
  // 기본 선택: 현재 플랜이 basic이면 business, 아니면 basic
  const [newPlan, setNewPlan] = useState<PlanType>(
    currentPlan === 'basic' ? 'business' :
    currentPlan === 'business' ? 'enterprise' : 'basic'
  );
  const [applyNow, setApplyNow] = useState(true);
  const [reason, setReason] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const isUpgrade = currentPlan && newPlan && PLAN_PRICES[newPlan] > PLAN_PRICES[currentPlan];

  const handleSubmit = async () => {
    setError('');

    if (newPlan === currentPlan) {
      setError('현재와 동일한 플랜입니다.');
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch(`/api/admin/subscriptions/${tenantId}/change-plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newPlan,
          applyNow,
          reason: reason || undefined,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        onSuccess();
      } else {
        setError(data.error || '플랜 변경에 실패했습니다.');
      }
    } catch {
      setError('오류가 발생했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-gray-50 rounded-lg p-3 text-sm">
        <div className="font-medium text-gray-900">{tenant.brandName}</div>
        <div className="text-gray-500">{tenant.email}</div>
      </div>

      {/* 현재 플랜 → 변경 플랜 */}
      <div className="flex items-center justify-center gap-4 py-4 bg-gradient-to-r from-gray-50 via-white to-gray-50 rounded-lg">
        <div className="text-center">
          <div className="text-xs text-gray-500 mb-1">현재</div>
          <div className="text-lg font-bold text-gray-700">
            {currentPlan ? PLAN_LABELS[currentPlan] : '-'}
          </div>
          <div className="text-xs text-gray-500">
            {currentPlan ? `${PLAN_PRICES[currentPlan].toLocaleString()}원/월` : '-'}
          </div>
        </div>
        <ArrowRight className="w-5 h-5 text-gray-400" />
        <div className="text-center">
          <div className="text-xs text-gray-500 mb-1">변경</div>
          <div className={`text-lg font-bold ${isUpgrade ? 'text-blue-600' : 'text-orange-600'}`}>
            {PLAN_LABELS[newPlan]}
          </div>
          <div className="text-xs text-gray-500">
            {PLAN_PRICES[newPlan].toLocaleString()}원/월
          </div>
        </div>
      </div>

      {/* 플랜 선택 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">변경할 플랜</label>
        <div className="grid grid-cols-3 gap-2">
          {CHANGEABLE_PLANS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setNewPlan(p)}
              disabled={p === currentPlan}
              className={`py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${
                newPlan === p
                  ? 'bg-blue-600 text-white border-blue-600'
                  : p === currentPlan
                  ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              <div>{PLAN_LABELS[p]}</div>
              <div className="text-xs opacity-80">{PLAN_PRICES[p].toLocaleString()}원/월</div>
            </button>
          ))}
        </div>
      </div>

      {/* 적용 시점 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">적용 시점</label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setApplyNow(true)}
            className={`flex-1 py-2 px-4 rounded-lg border text-sm font-medium transition-colors ${
              applyNow
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
          >
            즉시 적용
          </button>
          <button
            type="button"
            onClick={() => setApplyNow(false)}
            className={`flex-1 py-2 px-4 rounded-lg border text-sm font-medium transition-colors ${
              !applyNow
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
          >
            다음 결제일부터
          </button>
        </div>
        {!applyNow && (
          <p className="mt-2 text-xs text-gray-500">
            다음 결제일에 자동으로 플랜이 변경됩니다.
          </p>
        )}
      </div>

      {/* 안내 메시지 */}
      {isUpgrade && applyNow && (
        <div className="text-xs text-amber-600 bg-amber-50 p-3 rounded-lg">
          업그레이드 차액 결제가 필요한 경우, 별도로 커스텀 결제 링크를 발송해주세요.
        </div>
      )}

      {/* 메모 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">메모 (선택)</label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="변경 사유를 입력하세요"
          rows={2}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 resize-none"
        />
      </div>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">
          {error}
        </div>
      )}

      {/* 버튼 */}
      <div className="flex gap-3 pt-2">
        <button
          onClick={onCancel}
          className="flex-1 py-2.5 px-4 rounded-lg font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
        >
          취소
        </button>
        <button
          onClick={handleSubmit}
          disabled={isSaving || newPlan === currentPlan}
          className="flex-1 py-2.5 px-4 rounded-lg font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isSaving ? (
            <>
              <RefreshDouble className="w-4 h-4 animate-spin" />
              처리 중...
            </>
          ) : (
            <>
              <Check className="w-4 h-4" />
              플랜 변경
            </>
          )}
        </button>
      </div>
    </div>
  );
}
