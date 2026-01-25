'use client';

import { useState } from 'react';
import { RefreshDouble, WarningTriangle } from 'iconoir-react';
import { SubscriptionFormProps, formatDateForInput } from './types';

type CancelMode = 'scheduled' | 'immediate';

export default function CancelSubscriptionForm({
  tenantId,
  subscription,
  tenant: _tenant,
  onSuccess,
  onCancel,
}: SubscriptionFormProps) {
  void _tenant; // Props interface 호환성 유지
  const [cancelMode, setCancelMode] = useState<CancelMode>('scheduled');
  const [reason, setReason] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  // Firestore Timestamp 처리
  const getDateString = (value: unknown): string => {
    if (!value) return '-';
    if (typeof value === 'string') return formatDateForInput(value);
    if (typeof value === 'object' && value !== null && 'toDate' in value) {
      return formatDateForInput((value as { toDate: () => Date }).toDate());
    }
    return '-';
  };

  const periodEndDate = getDateString(subscription?.currentPeriodEnd);

  const handleSubmit = async () => {
    setError('');
    setIsSaving(true);
    try {
      const response = await fetch(`/api/admin/subscriptions/${tenantId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cancelMode,
          reason,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        onSuccess();
      } else {
        setError(data.error || '구독 해지에 실패했습니다.');
      }
    } catch {
      setError('오류가 발생했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* 해지 방식 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">해지 방식</label>
        <div className="space-y-2">
          <label
            className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
              cancelMode === 'scheduled'
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-200 hover:bg-gray-50'
            }`}
          >
            <input
              type="radio"
              name="cancelMode"
              value="scheduled"
              checked={cancelMode === 'scheduled'}
              onChange={() => setCancelMode('scheduled')}
              className="mt-0.5 w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
            />
            <div>
              <div className="font-medium text-gray-900 text-sm">해지 예약</div>
              <div className="text-xs text-gray-500 mt-0.5">
                현재 이용기간 종료 후 해지됩니다.
                {periodEndDate !== '-' && ` (${periodEndDate})`}
              </div>
            </div>
          </label>

          <label
            className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
              cancelMode === 'immediate'
                ? 'border-red-500 bg-red-50'
                : 'border-gray-200 hover:bg-gray-50'
            }`}
          >
            <input
              type="radio"
              name="cancelMode"
              value="immediate"
              checked={cancelMode === 'immediate'}
              onChange={() => setCancelMode('immediate')}
              className="mt-0.5 w-4 h-4 text-red-600 border-gray-300 focus:ring-red-500"
            />
            <div>
              <div className="font-medium text-gray-900 text-sm">즉시 해지</div>
              <div className="text-xs text-gray-500 mt-0.5">
                지금 바로 구독이 해지됩니다. 서비스 이용이 즉시 중단됩니다.
              </div>
            </div>
          </label>
        </div>
      </div>

      {/* 메모 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">메모 (선택)</label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="해지 사유를 입력하세요"
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
          className={`flex-1 py-2.5 px-4 rounded-lg font-medium text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${
            cancelMode === 'immediate'
              ? 'bg-red-600 hover:bg-red-700'
              : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          {isSaving ? (
            <>
              <RefreshDouble className="w-4 h-4 animate-spin" />
              처리 중...
            </>
          ) : (
            <>
              <WarningTriangle className="w-4 h-4" />
              {cancelMode === 'immediate' ? '즉시 해지' : '해지 예약'}
            </>
          )}
        </button>
      </div>
    </div>
  );
}
