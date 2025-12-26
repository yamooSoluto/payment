'use client';

import { useState, useMemo } from 'react';
import { X, AlertTriangle, Calendar, Zap } from 'lucide-react';
import { formatDate, formatPrice } from '@/lib/utils';

// 취소 사유 옵션
const CANCEL_REASONS = [
  { value: 'too_expensive', label: '가격이 비싸서' },
  { value: 'not_using', label: '서비스를 잘 사용하지 않아서' },
  { value: 'missing_features', label: '필요한 기능이 없어서' },
  { value: 'switching_service', label: '다른 서비스로 변경해서' },
  { value: 'temporary', label: '일시적으로 필요 없어서' },
  { value: 'other', label: '기타' },
] as const;

type CancelMode = 'scheduled' | 'immediate';

interface CancelModalProps {
  onClose: () => void;
  onConfirm: (reason: string, reasonDetail?: string, mode?: CancelMode, refundAmount?: number) => void;
  isLoading: boolean;
  currentPeriodEnd?: Date | string;
  currentPeriodStart?: Date | string;
  amount?: number;
}

export default function CancelModal({ onClose, onConfirm, isLoading, currentPeriodEnd, currentPeriodStart, amount }: CancelModalProps) {
  const [selectedReason, setSelectedReason] = useState<string>('');
  const [otherReason, setOtherReason] = useState('');
  const [cancelMode, setCancelMode] = useState<CancelMode>('scheduled');

  // 남은 일수 기반 환불 금액 계산
  const refundInfo = useMemo(() => {
    if (!currentPeriodStart || !currentPeriodEnd || !amount) {
      return { daysLeft: 0, refundAmount: 0 };
    }

    const start = new Date(currentPeriodStart);
    const end = new Date(currentPeriodEnd);
    const today = new Date();

    // 총 기간 (일)
    const totalDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    // 남은 기간 (일)
    const daysLeft = Math.max(0, Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));

    // 일할 계산된 환불 금액
    const refundAmount = Math.floor((amount * daysLeft) / totalDays);

    return { daysLeft, refundAmount };
  }, [currentPeriodStart, currentPeriodEnd, amount]);

  const handleConfirm = () => {
    if (!selectedReason) {
      alert('해지 사유를 선택해주세요.');
      return;
    }

    const reasonLabel = CANCEL_REASONS.find(r => r.value === selectedReason)?.label || selectedReason;
    const reasonDetail = selectedReason === 'other' ? otherReason : undefined;

    onConfirm(
      reasonLabel,
      reasonDetail,
      cancelMode,
      cancelMode === 'immediate' ? refundInfo.refundAmount : undefined
    );
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="bg-white rounded-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-bold text-gray-900">구독 해지</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-6 h-6 text-yellow-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">정말 해지하시겠습니까?</h3>
              <p className="text-sm text-gray-500">해지 후에도 기간 내 이용이 가능합니다.</p>
            </div>
          </div>

          {/* 취소 사유 선택 */}
          <div className="mb-6">
            <h4 className="font-medium text-gray-900 mb-3">해지 사유를 선택해주세요</h4>
            <div className="space-y-2">
              {CANCEL_REASONS.map((reason) => (
                <label
                  key={reason.value}
                  className={`flex items-center p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedReason === reason.value
                      ? 'border-yamoo-primary bg-yamoo-primary/5'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="cancelReason"
                    value={reason.value}
                    checked={selectedReason === reason.value}
                    onChange={(e) => setSelectedReason(e.target.value)}
                    className="w-4 h-4 text-yamoo-primary focus:ring-yamoo-primary"
                  />
                  <span className="ml-3 text-sm text-gray-700">{reason.label}</span>
                </label>
              ))}
            </div>

            {/* 기타 사유 입력 */}
            {selectedReason === 'other' && (
              <textarea
                value={otherReason}
                onChange={(e) => setOtherReason(e.target.value)}
                placeholder="해지 사유를 입력해주세요"
                className="mt-3 w-full p-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-yamoo-primary focus:border-transparent resize-none"
                rows={3}
              />
            )}
          </div>

          {/* 취소 방식 선택 */}
          {amount && amount > 0 && (
            <div className="mb-6">
              <h4 className="font-medium text-gray-900 mb-3">해지 방식 선택</h4>
              <div className="space-y-2">
                <label
                  className={`flex items-start p-3 rounded-lg border cursor-pointer transition-colors ${
                    cancelMode === 'scheduled'
                      ? 'border-yamoo-primary bg-yamoo-primary/5'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="cancelMode"
                    value="scheduled"
                    checked={cancelMode === 'scheduled'}
                    onChange={() => setCancelMode('scheduled')}
                    className="w-4 h-4 mt-0.5 text-yamoo-primary focus:ring-yamoo-primary"
                  />
                  <div className="ml-3">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-gray-500" />
                      <span className="text-sm font-medium text-gray-700">기간 종료 후 해지</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {currentPeriodEnd ? `${formatDate(currentPeriodEnd)}까지 서비스 이용 후 자동 해지됩니다.` : '현재 결제 기간까지 서비스를 이용할 수 있습니다.'}
                    </p>
                  </div>
                </label>

                <label
                  className={`flex items-start p-3 rounded-lg border cursor-pointer transition-colors ${
                    cancelMode === 'immediate'
                      ? 'border-yamoo-primary bg-yamoo-primary/5'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="cancelMode"
                    value="immediate"
                    checked={cancelMode === 'immediate'}
                    onChange={() => setCancelMode('immediate')}
                    className="w-4 h-4 mt-0.5 text-yamoo-primary focus:ring-yamoo-primary"
                  />
                  <div className="ml-3">
                    <div className="flex items-center gap-2">
                      <Zap className="w-4 h-4 text-orange-500" />
                      <span className="text-sm font-medium text-gray-700">즉시 해지</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      즉시 서비스가 중단되며, 남은 기간에 대해
                      {refundInfo.refundAmount > 0 ? (
                        <span className="text-orange-600 font-medium"> {formatPrice(refundInfo.refundAmount)}원</span>
                      ) : (
                        <span> 환불 없이</span>
                      )}
                      {refundInfo.refundAmount > 0 ? ' 환불됩니다.' : ' 처리됩니다.'}
                      {refundInfo.daysLeft > 0 && (
                        <span className="text-gray-400"> (남은 {refundInfo.daysLeft}일)</span>
                      )}
                    </p>
                  </div>
                </label>
              </div>
            </div>
          )}

          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <h4 className="font-medium text-gray-900 mb-2">해지 시 안내사항</h4>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>• 다음 결제일에 자동 결제가 중단됩니다.</li>
              {currentPeriodEnd && (
                <li>• {formatDate(currentPeriodEnd)}까지 서비스 이용이 가능합니다.</li>
              )}
              <li>• 언제든지 다시 구독할 수 있습니다.</li>
              <li>• 등록된 데이터는 유지됩니다.</li>
            </ul>
          </div>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 btn-secondary"
              disabled={isLoading}
            >
              취소
            </button>
            <button
              onClick={handleConfirm}
              className="flex-1 bg-red-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-red-700 transition-all disabled:opacity-50"
              disabled={isLoading || !selectedReason}
            >
              {isLoading ? '처리 중...' : '해지하기'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
