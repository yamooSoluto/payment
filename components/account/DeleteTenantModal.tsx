'use client';

import { useState } from 'react';
import { WarningTriangle, Xmark } from 'iconoir-react';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

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
  const { user } = useAuth();
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

  // 삭제 가능 여부 확인 (만료, 해지 완료 상태만 삭제 가능)
  const canDelete = !tenant.subscription ||
    tenant.subscription.status === 'expired' ||
    tenant.subscription.status === 'canceled';

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

      // Firebase Auth 사용자는 Bearer 토큰 사용
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (!token && user) {
        const idToken = await user.getIdToken();
        headers['Authorization'] = `Bearer ${idToken}`;
      }

      const response = await fetch(`/api/tenants/${tenant.tenantId}`, {
        method: 'DELETE',
        headers,
        body: JSON.stringify({
          token,
          email: email || user?.email,
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
            {canDelete ? '매장을 삭제하시겠습니까?' : '매장을 삭제할 수 없습니다'}
          </h3>
          <p className="text-center mb-4">
            <span className="text-lg font-bold text-gray-900">[ {tenant.brandName} ]</span>
          </p>

          {canDelete ? (
            <>
              {/* 삭제 가능 - 복구 불가 안내 */}
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                <ul className="text-sm text-gray-700 space-y-2">
                  <li className="flex items-start gap-2">
                    <span className="text-red-400">•</span>
                    <span>삭제된 매장은 더 이상 사용할 수 없으며 <strong className="text-red-600">복구가 불가능</strong>합니다.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-red-400">•</span>
                    <span>일부 데이터는 관련 법령에 따라 보관 후 파기됩니다.</span>
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

              {/* Buttons - 삭제 가능 */}
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
                  disabled={isDeleting || confirmText !== '매장삭제'}
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
            </>
          ) : (
            <>
              {/* 삭제 불가 - 구독 상태 안내 */}
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-4">
                <p className="text-sm text-orange-800">
                  <strong>구독 중, 체험 중, 또는 해지 예정인 매장</strong>은 삭제할 수 없습니다.
                </p>
                <p className="text-sm text-orange-700 mt-2">
                  매장 삭제는 이용 종료 또는 구독 해지 후 가능합니다.
                </p>
              </div>

              {/* Button - 확인만 */}
              <button
                onClick={onClose}
                className="w-full py-3 px-4 rounded-lg font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                확인
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
