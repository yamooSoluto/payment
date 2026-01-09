'use client';

import { useState } from 'react';
import { WarningTriangle, Xmark } from 'iconoir-react';
import { Loader2 } from 'lucide-react';

interface Subscription {
  plan: string;
  status: string;
}

interface Tenant {
  tenantId: string;
  brandName: string;
  subscription: Subscription | null;
}

interface DeleteTenantModalProps {
  tenant: Tenant;
  onClose: () => void;
  onSuccess: () => void;
  authParam: string;
}

export default function DeleteTenantModal({ tenant, onClose, onSuccess, authParam }: DeleteTenantModalProps) {
  const [confirmText, setConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parseAuthParam = () => {
    const params = new URLSearchParams(authParam);
    return {
      token: params.get('token'),
      email: params.get('email'),
    };
  };

  // 삭제 가능 여부 확인
  const canDelete = !tenant.subscription ||
    tenant.subscription.status === 'expired';

  const handleDelete = async () => {
    if (confirmText !== '매장삭제') {
      setError('확인 문구를 정확히 입력해주세요.');
      return;
    }

    if (!canDelete) {
      setError('구독 중인 매장은 삭제할 수 없습니다.');
      return;
    }

    setIsDeleting(true);
    setError(null);

    try {
      const { token, email } = parseAuthParam();

      const response = await fetch(`/api/tenants/${tenant.tenantId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          email,
          confirmText,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        onSuccess();
        onClose();
      } else {
        setError(data.error || '매장 삭제에 실패했습니다.');
      }
    } catch {
      setError('네트워크 오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 hover:bg-gray-100 rounded-full transition-colors"
        >
          <Xmark width={20} height={20} strokeWidth={1.5} className="text-gray-500" />
        </button>

        {/* Icon */}
        <div className="pt-8 pb-4 flex justify-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
            <WarningTriangle width={32} height={32} strokeWidth={1.5} className="text-red-600" />
          </div>
        </div>

        {/* Content */}
        <div className="px-6 pb-6">
          <h3 className="text-xl font-bold text-gray-900 text-center mb-2">
            매장을 삭제하시겠습니까?
          </h3>
          <p className="text-gray-600 text-center text-sm mb-2">
            <span className="font-semibold text-gray-900">{tenant.brandName}</span>
          </p>

          {/* 안내사항 */}
          <div className="bg-gray-50 rounded-lg p-4 mb-4">
            <ul className="text-sm text-gray-600 space-y-2">
              <li className="flex items-start gap-2">
                <span className="text-gray-400">•</span>
                <span>삭제된 매장 데이터는 <strong>90일간 보관</strong>됩니다.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-gray-400">•</span>
                <span>90일 이내에 재구독 시 데이터를 복구할 수 있습니다.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-gray-400">•</span>
                <span>90일 후 모든 데이터가 영구적으로 삭제됩니다.</span>
              </li>
            </ul>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              확인을 위해 <span className="text-red-600 font-bold">&apos;매장삭제&apos;</span>를 입력해주세요
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="매장삭제"
              className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
              disabled={isDeleting}
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 mb-4">{error}</p>
          )}

          {/* Buttons */}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={isDeleting}
              className="flex-1 py-3 px-4 rounded-lg font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors disabled:opacity-50"
            >
              취소
            </button>
            <button
              onClick={handleDelete}
              disabled={isDeleting || confirmText !== '매장삭제' || !canDelete}
              className="flex-1 py-3 px-4 rounded-lg font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  삭제 중...
                </>
              ) : (
                '삭제'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
