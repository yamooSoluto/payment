'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle } from 'lucide-react';

// 플랜 이름 (클라이언트용)
function getPlanName(plan: string): string {
  const names: Record<string, string> = {
    trial: 'Trial',
    basic: 'Basic',
    business: 'Business',
    enterprise: 'Enterprise',
  };
  return names[plan] || plan;
}

export default function CheckoutSuccessPage() {
  const searchParams = useSearchParams();
  const plan = searchParams.get('plan') || '';
  const orderId = searchParams.get('orderId') || '';

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle className="w-10 h-10 text-green-500" />
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          결제가 완료되었습니다!
        </h1>

        <p className="text-gray-600 mb-6">
          YAMOO {getPlanName(plan)} 플랜 구독이 시작되었습니다.
        </p>

        <div className="bg-gray-50 rounded-lg p-4 mb-6 text-left">
          <div className="flex justify-between items-center mb-2">
            <span className="text-gray-500 text-sm">주문번호</span>
            <span className="text-gray-900 text-sm font-mono">{orderId}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-500 text-sm">구독 플랜</span>
            <span className="text-gray-900 font-semibold">{getPlanName(plan)}</span>
          </div>
        </div>

        <div className="space-y-3">
          <Link
            href="/account"
            className="btn-primary w-full block text-center"
          >
            내 계정으로 이동
          </Link>
          <Link
            href="/"
            className="btn-secondary w-full block text-center"
          >
            홈으로 이동
          </Link>
        </div>

        <p className="text-sm text-gray-500 mt-6">
          결제 관련 문의: yamoo@soluto.co.kr
        </p>
      </div>
    </div>
  );
}
