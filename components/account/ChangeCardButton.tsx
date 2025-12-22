'use client';

import { useEffect, useState } from 'react';
import { CreditCard } from 'lucide-react';

interface ChangeCardButtonProps {
  email: string;
  authParam: string;
}

export default function ChangeCardButton({ email, authParam }: ChangeCardButtonProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sdkReady, setSdkReady] = useState(false);

  useEffect(() => {
    const loadTossPaymentsSDK = () => {
      if (window.TossPayments) {
        setSdkReady(true);
        setIsLoading(false);
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://js.tosspayments.com/v1/payment';
      script.async = true;
      script.onload = () => {
        setSdkReady(true);
        setIsLoading(false);
      };
      script.onerror = () => {
        setError('결제 SDK를 불러오는데 실패했습니다.');
        setIsLoading(false);
      };
      document.head.appendChild(script);
    };

    loadTossPaymentsSDK();
  }, []);

  const handleChangeCard = async () => {
    if (!sdkReady || !window.TossPayments) {
      setError('결제 SDK가 준비되지 않았습니다.');
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY;
      if (!clientKey) {
        throw new Error('토스 클라이언트 키가 설정되지 않았습니다.');
      }

      const tossPayments = window.TossPayments(clientKey);

      // 빌링키 발급 요청 (새 카드 등록)
      await tossPayments.requestBillingAuth('카드', {
        customerKey: email,
        successUrl: `${window.location.origin}/api/payments/update-card?${authParam}`,
        failUrl: `${window.location.origin}/account/change-card?${authParam}&error=card_change_failed`,
        customerEmail: email,
      });
    } catch (err) {
      console.error('카드 변경 실패:', err);
      setError(`카드 변경에 실패했습니다: ${err instanceof Error ? err.message : '알 수 없는 오류'}`);
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-lg text-sm">
          {error}
        </div>
      )}

      <button
        onClick={handleChangeCard}
        disabled={isLoading || isProcessing}
        className="w-full py-3 px-4 rounded-lg font-semibold transition-all flex items-center justify-center gap-2 bg-yamoo-primary text-gray-900 hover:bg-yellow-400 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLoading ? (
          <span className="flex items-center gap-2">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-900"></div>
            로딩 중...
          </span>
        ) : isProcessing ? (
          <span className="flex items-center gap-2">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-900"></div>
            카드 등록 페이지로 이동 중...
          </span>
        ) : (
          <>
            <CreditCard className="w-5 h-5" />
            새 카드 등록하기
          </>
        )}
      </button>
    </div>
  );
}
