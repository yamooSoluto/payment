'use client';

import { useState } from 'react';
import { RefreshDouble, WarningTriangle } from 'iconoir-react';
import { SubscriptionFormProps, STATUS_LABELS, formatDateForInput } from './types';

type CancelMode = 'scheduled' | 'immediate';

export default function CancelSubscriptionForm({
  tenantId,
  subscription,
  tenant,
  onSuccess,
  onCancel,
}: SubscriptionFormProps) {
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

    if (!reason.trim()) {
      setError('해지 사유를 입력해주세요.');
      return;
    }

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
      <div className="bg-gray-50 rounded-lg p-3 text-sm">
        <div className="font-medium text-gray-900">{tenant.brandName}</div>
        <div className="text-gray-500">{tenant.email}</div>
        {subscription && (
          <div className="mt-2 pt-2 border-t border-gray-200 text-xs text-gray-500">
            현재 상태: {STATUS_LABELS[subscription.status] || subscription.status}
            {periodEndDate !== '-' && ` · 종료일: ${periodEndDate}`}
          </div>
        )}
      </div>

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
              <div className="font-medium text-gray-900 text-sm">예약 해지</div>
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

      {/* 즉시 해지 경고 */}
      {cancelMode === 'immediate' && (
        <div className="flex items-start gap-2 p-3 bg-red-50 rounded-lg">
          <WarningTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-red-700">
            <p className="font-medium">즉시 해지 시 주의사항</p>
            <ul className="mt-1 space-y-0.5 list-disc list-inside">
              <li>서비스 이용이 즉시 중단됩니다</li>
              <li>남은 기간에 대한 환불이 필요한 경우 별도로 처리해주세요</li>
            </ul>
          </div>
        </div>
      )}

      {/* 해지 사유 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          해지 사유 <span className="text-red-500">*</span>
        </label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="해지 사유를 입력하세요 (필수)"
          rows={3}
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
