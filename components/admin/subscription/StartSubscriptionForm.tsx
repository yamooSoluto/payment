'use client';

import { useState, useEffect } from 'react';
import { RefreshDouble, Check } from 'iconoir-react';
import {
  SubscriptionFormProps,
  PlanType,
  formatDateForInput,
  calculatePeriodEnd,
  calculateNextBillingDate,
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

export default function StartSubscriptionForm({
  tenantId,
  tenant: _tenant,
  onSuccess,
  onCancel,
}: SubscriptionFormProps) {
  void _tenant; // Props interface 호환성 유지
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [plan, setPlan] = useState<PlanType>('trial');
  const [currentPeriodStart, setCurrentPeriodStart] = useState('');
  const [currentPeriodEnd, setCurrentPeriodEnd] = useState('');
  const [nextBillingDate, setNextBillingDate] = useState('');
  const [reason, setReason] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const isTrial = plan === 'trial';
  const selectedPlan = plans.find(p => p.id === plan);

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

  // 초기 날짜 설정
  useEffect(() => {
    const today = new Date();
    const endDate = calculatePeriodEnd(today);
    setCurrentPeriodStart(formatDateForInput(today));
    setCurrentPeriodEnd(formatDateForInput(endDate));
    if (!isTrial) {
      setNextBillingDate(formatDateForInput(calculateNextBillingDate(endDate)));
    } else {
      setNextBillingDate('');
    }
  }, [isTrial]);

  // 시작일 변경 시 종료일, 결제일 재계산
  const handleStartDateChange = (value: string) => {
    setCurrentPeriodStart(value);
    if (value) {
      const startDate = new Date(value);
      const endDate = calculatePeriodEnd(startDate);
      setCurrentPeriodEnd(formatDateForInput(endDate));
      if (!isTrial) {
        setNextBillingDate(formatDateForInput(calculateNextBillingDate(endDate)));
      }
    }
  };

  // 종료일 변경 시 결제일 재계산
  const handleEndDateChange = (value: string) => {
    setCurrentPeriodEnd(value);
    if (value && !isTrial) {
      const endDate = new Date(value);
      setNextBillingDate(formatDateForInput(calculateNextBillingDate(endDate)));
    }
  };

  // 플랜 변경 시 결제일 처리
  const handlePlanChange = (newPlan: PlanType) => {
    setPlan(newPlan);
    if (newPlan === 'trial') {
      setNextBillingDate('');
    } else if (currentPeriodEnd) {
      setNextBillingDate(formatDateForInput(calculateNextBillingDate(new Date(currentPeriodEnd))));
    }
  };

  const handleSubmit = async () => {
    setError('');

    if (!plan) {
      setError('플랜을 선택해주세요.');
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch(`/api/admin/subscriptions/${tenantId}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan,
          currentPeriodStart: currentPeriodStart || undefined,
          currentPeriodEnd: currentPeriodEnd || undefined,
          nextBillingDate: isTrial ? null : (nextBillingDate || undefined),
          reason: reason || undefined,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        onSuccess();
      } else {
        setError(data.error || '구독 시작에 실패했습니다.');
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
        <label className="block text-sm font-medium text-gray-700 mb-2">플랜</label>
        {loadingPlans ? (
          <div className="text-sm text-gray-500">플랜 로딩 중...</div>
        ) : (
          <select
            value={plan}
            onChange={(e) => handlePlanChange(e.target.value as PlanType)}
            className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
          >
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} - {p.isNegotiable ? '협의' : p.price === 0 ? '무료' : `${p.price.toLocaleString()}원/월`}
              </option>
            ))}
          </select>
        )}
        {selectedPlan && (selectedPlan.isNegotiable || selectedPlan.price === 0) && (
          <div className="mt-2 text-sm text-gray-600">
            {selectedPlan.isNegotiable ? '가격 협의 플랜입니다.' : '무료 플랜입니다.'}
          </div>
        )}
      </div>

      {/* 날짜 설정 */}
      <div className="space-y-3 p-3 bg-gray-50 rounded-lg">
        <div className="text-xs font-medium text-gray-500 mb-2">기간 설정</div>

        <div>
          <label className="block text-xs text-gray-600 mb-1">시작일</label>
          <input
            type="date"
            value={currentPeriodStart}
            onChange={(e) => handleStartDateChange(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-600 mb-1">종료일</label>
          <input
            type="date"
            value={currentPeriodEnd}
            onChange={(e) => handleEndDateChange(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {!isTrial && (
          <div>
            <label className="block text-xs text-gray-600 mb-1">다음 결제일</label>
            <input
              type="date"
              value={nextBillingDate}
              disabled
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-100 text-gray-500 cursor-not-allowed"
            />
            <p className="text-xs text-gray-500 mt-1">
              종료일 + 1일로 자동 설정됩니다.
            </p>
          </div>
        )}

        {isTrial && (
          <p className="text-xs text-gray-500">
            Trial은 결제일이 설정되지 않습니다.
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
          disabled={isSaving}
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
              구독 시작
            </>
          )}
        </button>
      </div>
    </div>
  );
}
