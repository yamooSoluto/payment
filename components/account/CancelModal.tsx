'use client';

import { X, AlertTriangle } from 'lucide-react';
import { formatDate } from '@/lib/utils';

interface CancelModalProps {
  onClose: () => void;
  onConfirm: () => void;
  isLoading: boolean;
  currentPeriodEnd?: Date | string;
}

export default function CancelModal({ onClose, onConfirm, isLoading, currentPeriodEnd }: CancelModalProps) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="bg-white rounded-xl max-w-md w-full mx-4"
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
            <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-yellow-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">정말 해지하시겠습니까?</h3>
              <p className="text-sm text-gray-500">해지 후에도 기간 내 이용이 가능합니다.</p>
            </div>
          </div>

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
              onClick={onConfirm}
              className="flex-1 bg-red-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-red-700 transition-all disabled:opacity-50"
              disabled={isLoading}
            >
              {isLoading ? '처리 중...' : '해지하기'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
