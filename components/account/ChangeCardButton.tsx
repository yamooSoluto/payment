'use client';

import { useEffect, useState } from 'react';
import { CreditCard } from 'lucide-react';

interface ChangeCardButtonProps {
  email: string;
  authParam: string;
  currentAlias?: string;
  tenantId?: string;
}

export default function ChangeCardButton({ email, authParam, currentAlias, tenantId }: ChangeCardButtonProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [cardAlias, setCardAlias] = useState(currentAlias || '');

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

      // 별칭을 URL에 포함
      const aliasParam = cardAlias ? `&cardAlias=${encodeURIComponent(cardAlias)}` : '';
      const tenantParam = tenantId ? `&tenantId=${encodeURIComponent(tenantId)}` : '';

      // 빌링키 발급 요청 (새 카드 등록)
      await tossPayments.requestBillingAuth('카드', {
        customerKey: email,
        successUrl: `${window.location.origin}/api/payments/update-card?${authParam}${aliasParam}${tenantParam}`,
        failUrl: `${window.location.origin}/account/change-card?${authParam}${tenantParam}&error=card_change_failed`,
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

      <div>
        <label htmlFor="cardAlias" className="block text-sm font-medium text-gray-700 mb-1">
          카드 별칭 (선택)
        </label>
        <input
          type="text"
          id="cardAlias"
          value={cardAlias}
          onChange={(e) => setCardAlias(e.target.value)}
          placeholder="예: 회사카드, 개인카드"
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yamoo-primary focus:border-transparent"
          maxLength={20}
        />
      </div>

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
            카드 변경하기
          </>
        )}
      </button>
    </div>
  );
}
