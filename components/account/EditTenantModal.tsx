'use client';

import { useState } from 'react';
import { Xmark, EditPencil } from 'iconoir-react';
import { Loader2 } from 'lucide-react';
import { INDUSTRIES, IndustryCode } from '@/lib/constants';
import { useAuth } from '@/contexts/AuthContext';

interface Tenant {
  tenantId: string;
  brandName: string;
  industry?: string | null;
}

interface EditTenantModalProps {
  tenant: Tenant;
  onClose: () => void;
  onSuccess: (updatedBrandName: string) => void;
  authParam: string;
}

export default function EditTenantModal({ tenant, onClose, onSuccess, authParam }: EditTenantModalProps) {
  const { user } = useAuth();
  const [brandName, setBrandName] = useState(tenant.brandName);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parseAuthParam = () => {
    const params = new URLSearchParams(authParam);
    return {
      token: params.get('token'),
      email: params.get('email'),
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!brandName.trim()) {
      setError('매장명을 입력해주세요.');
      return;
    }

    if (brandName.trim() === tenant.brandName) {
      setError('변경된 내용이 없습니다.');
      return;
    }

    setIsSubmitting(true);
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
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          token,
          email: email || user?.email,
          brandName: brandName.trim(),
        }),
      });

      const data = await response.json();

      if (response.ok) {
        onSuccess(brandName.trim());
        onClose();
      } else {
        setError(data.error || '매장 수정에 실패했습니다.');
      }
    } catch {
      setError('네트워크 오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 업종 라벨 가져오기
  const industryLabel = tenant.industry && tenant.industry in INDUSTRIES
    ? INDUSTRIES[tenant.industry as IndustryCode]
    : tenant.industry || '미설정';

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
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
            <EditPencil width={32} height={32} strokeWidth={1.5} className="text-gray-600" />
          </div>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="px-6 pb-6">
          <h3 className="text-xl font-bold text-gray-900 text-center mb-2">
            매장 정보 수정
          </h3>
          <p className="text-gray-600 text-center text-sm mb-6">
            매장명을 수정할 수 있습니다.
          </p>

          {/* 매장명 입력 */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              매장명
            </label>
            <input
              type="text"
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
              placeholder="매장명을 입력해주세요"
              className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
              disabled={isSubmitting}
            />
          </div>

          {/* 업종 표시 (읽기 전용) */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              업종
            </label>
            <div className="w-full px-4 py-3 border border-gray-200 rounded-lg bg-gray-50 text-gray-500">
              {industryLabel}
            </div>
            <p className="mt-1 text-xs text-gray-500">
              업종은 변경할 수 없습니다.
            </p>
          </div>

          {error && (
            <p className="text-sm text-red-600 mb-4">{error}</p>
          )}

          {/* Buttons */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 py-3 px-4 rounded-lg font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !brandName.trim() || brandName.trim() === tenant.brandName}
              className="flex-1 py-3 px-4 rounded-lg font-semibold text-white bg-black hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  저장 중...
                </>
              ) : (
                '저장'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
