'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Xmark, Sofa } from 'iconoir-react';
import { INDUSTRY_OPTIONS } from '@/lib/constants';

const LOADING_MESSAGES = [
  { title: '매장 생성 중', message: '잠시만 기다려주세요 💪' },
  { title: '거의 다 됐어요', message: '데이터를 동기화하고 있어요 🔄' },
  { title: '조금만 더요', message: '마무리 작업 중이에요 ✨' },
  { title: '거의 완료!', message: '곧 매장이 준비됩니다 🎉' },
];

interface NewTenantData {
  tenantId: string;
  brandName: string;
  industry: string;
}

interface AddTenantModalProps {
  onClose: () => void;
  onSuccess: (newTenant?: NewTenantData) => void;
  authParam: string;
}

export default function AddTenantModal({ onClose, onSuccess, authParam }: AddTenantModalProps) {
  const router = useRouter();
  const [brandName, setBrandName] = useState('');
  const [industry, setIndustry] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdTenantId, setCreatedTenantId] = useState<string | null>(null);
  const [messageIndex, setMessageIndex] = useState(0);
  const [progress, setProgress] = useState(0);

  // 로딩 메시지 순환 및 진행바 업데이트
  useEffect(() => {
    if (!isSubmitting) {
      setMessageIndex(0);
      setProgress(0);
      return;
    }

    // 메시지 순환
    const messageInterval = setInterval(() => {
      setMessageIndex((prev) => Math.min(prev + 1, LOADING_MESSAGES.length - 1));
    }, 8000); // 8초마다 메시지 변경

    // 진행바 업데이트 (0% -> 90%까지 약 25초에 걸쳐 증가)
    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 90) return prev;
        // 처음엔 빠르게, 나중엔 느리게 증가
        const increment = prev < 30 ? 3 : prev < 60 ? 2 : 1;
        return Math.min(prev + increment, 90);
      });
    }, 500);

    return () => {
      clearInterval(messageInterval);
      clearInterval(progressInterval);
    };
  }, [isSubmitting]);

  const parseAuthParam = () => {
    const params = new URLSearchParams(authParam);
    return {
      token: params.get('token'),
      email: params.get('email'),
    };
  };

  // 매장이 실제로 생성되었는지 폴링으로 확인
  const checkTenantExists = useCallback(async (tenantId: string): Promise<boolean> => {
    try {
      const { token, email } = parseAuthParam();
      const queryParam = token ? `token=${token}` : `email=${encodeURIComponent(email || '')}`;
      const response = await fetch(`/api/tenants?${queryParam}`);
      if (response.ok) {
        const data = await response.json();
        return data.tenants?.some((t: { tenantId: string }) => t.tenantId === tenantId) || false;
      }
    } catch {
      // 에러 무시하고 계속 폴링
    }
    return false;
  }, [authParam]);

  // 매장 생성 완료 후 폴링 시작
  useEffect(() => {
    if (!createdTenantId) return;

    let isCancelled = false;
    let attempts = 0;
    const maxAttempts = 30; // 최대 30번 시도 (약 30초)

    const poll = async () => {
      while (!isCancelled && attempts < maxAttempts) {
        attempts++;
        const exists = await checkTenantExists(createdTenantId);

        if (exists) {
          // 매장이 생성됨 - 진행률 100%로 설정 후 모달 닫기
          setProgress(100);
          await new Promise(resolve => setTimeout(resolve, 300)); // 100% 표시 잠깐 보여주기
          router.refresh();
          onClose();
          onSuccess();
          return;
        }

        // 1초 대기 후 다시 확인
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // 타임아웃 - 그냥 닫기
      if (!isCancelled) {
        router.refresh();
        onClose();
        onSuccess();
      }
    };

    poll();

    return () => {
      isCancelled = true;
    };
  }, [createdTenantId, checkTenantExists, router, onClose, onSuccess]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!brandName.trim()) {
      setError('매장명을 입력해주세요.');
      return;
    }

    if (!industry) {
      setError('업종을 선택해주세요.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const { token, email } = parseAuthParam();

      const response = await fetch('/api/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          email,
          brandName: brandName.trim(),
          industry,
        }),
      });

      const data = await response.json();

      if (response.ok && data.tenantId) {
        // 폴링 시작 - createdTenantId 설정하면 useEffect에서 폴링 시작
        setCreatedTenantId(data.tenantId);
      } else {
        setError(data.error || '매장 추가에 실패했습니다.');
        setIsSubmitting(false);
      }
    } catch {
      setError('네트워크 오류가 발생했습니다. 다시 시도해주세요.');
      setIsSubmitting(false);
    }
  };

  // 로딩 중 화면
  if (isSubmitting) {
    const currentMessage = LOADING_MESSAGES[messageIndex];
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
        <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          <div className="py-16 px-6 flex flex-col items-center justify-center">
            <div className="w-20 h-20 bg-black rounded-full flex items-center justify-center mb-4 animate-pulse">
              <Sofa width={40} height={40} strokeWidth={1.5} className="text-white" />
            </div>

            <h3 className="text-xl font-bold text-gray-900 text-center mb-1">
              매장 추가중
            </h3>
            <p className="text-sm text-gray-400 text-center mb-6">
              창을 닫으면 정상적으로 완료되지 않을 수 있어요
            </p>

            {/* 진행바 */}
            <div className="w-full max-w-xs mb-6">
              <div className="flex justify-between text-sm text-gray-500 mb-2">
                <span>진행률</span>
                <span>{progress}%</span>
              </div>
              <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-black rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            <h3 className="text-xl font-bold text-gray-900 text-center mb-2 transition-all">
              {currentMessage.title}
            </h3>
            <p className="text-gray-600 text-center transition-all">
              {currentMessage.message}
            </p>
          </div>
        </div>
      </div>
    );
  }

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
          <div className="w-16 h-16 bg-black rounded-full flex items-center justify-center">
            <Sofa width={32} height={32} strokeWidth={1.5} className="text-white" />
          </div>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="px-6 pb-6">
          <h3 className="text-xl font-bold text-gray-900 text-center mb-2">
            새 매장 추가
          </h3>
          <p className="text-gray-600 text-center text-sm mb-6">
            매장명과 업종을 입력해주세요.<br />
            추가된 매장은 미구독 상태로 생성됩니다.
          </p>

          {/* 매장명 입력 */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              매장명 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
              placeholder="예: 야무 강남점"
              className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
            />
          </div>

          {/* 업종 선택 */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              업종 <span className="text-red-500">*</span>
            </label>
            <select
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent bg-white"
            >
              <option value="">업종을 선택해주세요</option>
              {INDUSTRY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500">
              업종은 최초 설정 후 변경할 수 없습니다.
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
              className="flex-1 py-3 px-4 rounded-lg font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={!brandName.trim() || !industry}
              className="flex-1 py-3 px-4 rounded-lg font-semibold text-white bg-black hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              매장 추가
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
