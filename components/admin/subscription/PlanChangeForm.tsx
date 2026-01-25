'use client';

import { useState, useEffect } from 'react';
import { RefreshDouble, Check } from 'iconoir-react';
import {
  SubscriptionFormProps,
  PlanType,
} from './types';

// DB에서 가져오는 플랜 인터페이스
interface Plan {
  id: string;
  name: string;
  price: number;
  minPrice?: number;
  maxPrice?: number;
  isNegotiable?: boolean;
  isActive?: boolean;
  order?: number;
}

export default function PlanChangeForm({
  tenantId,
  subscription,
  tenant: _tenant,
  onSuccess,
  onCancel,
}: SubscriptionFormProps) {
  void _tenant; // Props interface 호환성 유지
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
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

  // 플랜 목록 가져오기
  useEffect(() => {
    const fetchPlans = async () => {
      try {
        const response = await fetch('/api/admin/plans', {
          credentials: 'include',
        });
        if (response.ok) {
          const data = await response.json();
          setPlans(data.plans || []);
        }
      } catch (error) {
        console.error('Failed to fetch plans:', error);
      } finally {
        setLoadingPlans(false);
      }
    };
    fetchPlans();
  }, []);

  // 변경 가능한 플랜 (trial 제외)
  const changeablePlans = plans.filter(p => p.id !== 'trial');

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
      {/* 플랜 선택 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">변경할 플랜</label>
        {loadingPlans ? (
          <div className="text-sm text-gray-500">플랜 로딩 중...</div>
        ) : (
          <select
            value={newPlan}
            onChange={(e) => setNewPlan(e.target.value as PlanType)}
            className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
          >
            {changeablePlans.map((p) => (
              <option key={p.id} value={p.id} disabled={p.id === currentPlan}>
                {p.name} - {p.isNegotiable ? '협의' : `${p.price.toLocaleString()}원/월`}
                {p.id === currentPlan ? ' (현재)' : ''}
              </option>
            ))}
          </select>
        )}
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
