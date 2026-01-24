'use client';

import { useState } from 'react';
import { RefreshDouble, Check, WarningTriangle } from 'iconoir-react';
import {
  SubscriptionFormProps,
  PlanType,
  SubscriptionStatus,
  PLAN_LABELS,
  PLAN_PRICES,
  STATUS_LABELS,
  formatDateForInput,
} from './types';

// API 업데이트용 (기존 subscriptions list API 사용)
export default function AdvancedSettingsForm({
  tenantId,
  subscription,
  tenant,
  onSuccess,
  onCancel,
}: SubscriptionFormProps) {
  // Firestore Timestamp 처리
  const getDateString = (value: unknown): string => {
    if (!value) return '';
    if (typeof value === 'string') return formatDateForInput(value);
    if (typeof value === 'object' && value !== null && 'toDate' in value) {
      return formatDateForInput((value as { toDate: () => Date }).toDate());
    }
    return '';
  };

  const [plan, setPlan] = useState<PlanType | ''>(subscription?.plan || '');
  const [status, setStatus] = useState<SubscriptionStatus | ''>(subscription?.status || '');
  const [currentPeriodStart, setCurrentPeriodStart] = useState(
    getDateString(subscription?.currentPeriodStart)
  );
  const [currentPeriodEnd, setCurrentPeriodEnd] = useState(
    getDateString(subscription?.currentPeriodEnd)
  );
  const [nextBillingDate, setNextBillingDate] = useState(
    getDateString(subscription?.nextBillingDate)
  );
  const [reason, setReason] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    setError('');

    if (!reason.trim()) {
      setError('변경 사유를 입력해주세요.');
      return;
    }

    setIsSaving(true);
    try {
      // 기존 subscriptions list API 사용
      const response = await fetch('/api/admin/subscriptions/list', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          plan: plan || null,
          status: status || null,
          currentPeriodStart: currentPeriodStart || null,
          currentPeriodEnd: currentPeriodEnd || null,
          nextBillingDate: nextBillingDate || null,
          reason,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        onSuccess();
      } else {
        setError(data.error || '저장에 실패했습니다.');
      }
    } catch {
      setError('오류가 발생했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-amber-50 rounded-lg p-3 flex items-start gap-2">
        <WarningTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-amber-700">
          <p className="font-medium">고급 설정</p>
          <p className="mt-0.5">
            필드를 직접 수정합니다. 데이터 정합성에 주의해주세요.
          </p>
        </div>
      </div>

      <div className="bg-gray-50 rounded-lg p-3 text-sm">
        <div className="font-medium text-gray-900">{tenant.brandName}</div>
        <div className="text-gray-500">{tenant.email}</div>
      </div>

      {/* 플랜 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">플랜</label>
        <select
          value={plan}
          onChange={(e) => setPlan(e.target.value as PlanType | '')}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
        >
          <option value="">선택 안함</option>
          {(['basic', 'business'] as PlanType[]).map((p) => (
            <option key={p} value={p}>
              {PLAN_LABELS[p]} ({PLAN_PRICES[p].toLocaleString()}원)
            </option>
          ))}
        </select>
      </div>

      {/* 상태 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">상태</label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as SubscriptionStatus | '')}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
        >
          <option value="">선택 안함</option>
          {(Object.keys(STATUS_LABELS) as SubscriptionStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>

      {/* 날짜 */}
      <div className="space-y-3 p-3 bg-gray-50 rounded-lg">
        <div className="text-xs font-medium text-gray-500">기간 설정</div>

        <div>
          <label className="block text-xs text-gray-600 mb-1">시작일</label>
          <input
            type="date"
            value={currentPeriodStart}
            onChange={(e) => setCurrentPeriodStart(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-600 mb-1">종료일</label>
          <input
            type="date"
            value={currentPeriodEnd}
            onChange={(e) => setCurrentPeriodEnd(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-600 mb-1">다음 결제일</label>
          <input
            type="date"
            value={nextBillingDate}
            onChange={(e) => setNextBillingDate(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* 메모 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          변경 사유 <span className="text-red-500">*</span>
        </label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="변경 사유를 입력하세요 (필수)"
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
              저장 중...
            </>
          ) : (
            <>
              <Check className="w-4 h-4" />
              저장
            </>
          )}
        </button>
      </div>
    </div>
  );
}
