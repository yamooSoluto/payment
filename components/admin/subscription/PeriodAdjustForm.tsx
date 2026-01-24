'use client';

import { useState } from 'react';
import { RefreshDouble, Check } from 'iconoir-react';
import { SubscriptionFormProps, formatDateForInput } from './types';

export default function PeriodAdjustForm({
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

  const [currentPeriodStart, setCurrentPeriodStart] = useState(
    getDateString(subscription?.currentPeriodStart)
  );
  const [currentPeriodEnd, setCurrentPeriodEnd] = useState(
    getDateString(subscription?.currentPeriodEnd)
  );
  const [nextBillingDate, setNextBillingDate] = useState(
    getDateString(subscription?.nextBillingDate)
  );
  const [syncNextBilling, setSyncNextBilling] = useState(false);
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
      const response = await fetch(`/api/admin/subscriptions/${tenantId}/period`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPeriodStart: currentPeriodStart || undefined,
          currentPeriodEnd: currentPeriodEnd || undefined,
          nextBillingDate: nextBillingDate || null,
          syncNextBilling,
          reason,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        onSuccess();
      } else {
        setError(data.error || '기간 조정에 실패했습니다.');
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

      {/* 날짜 설정 */}
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">시작일</label>
          <input
            type="date"
            value={currentPeriodStart}
            onChange={(e) => setCurrentPeriodStart(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">종료일</label>
          <input
            type="date"
            value={currentPeriodEnd}
            onChange={(e) => setCurrentPeriodEnd(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">다음 결제일</label>
          <input
            type="date"
            value={nextBillingDate}
            onChange={(e) => setNextBillingDate(e.target.value)}
            disabled={syncNextBilling}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
          />
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={syncNextBilling}
            onChange={(e) => setSyncNextBilling(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-gray-600">
            종료일 변경 시 결제일도 자동 동기화 (종료일 + 1일)
          </span>
        </label>
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
              처리 중...
            </>
          ) : (
            <>
              <Check className="w-4 h-4" />
              기간 조정
            </>
          )}
        </button>
      </div>
    </div>
  );
}
