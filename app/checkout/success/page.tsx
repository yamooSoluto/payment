'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle } from 'iconoir-react';
import { Suspense } from 'react';

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

function SuccessContent() {
  const searchParams = useSearchParams();
  const plan = searchParams.get('plan') || '';
  const orderId = searchParams.get('orderId') || '';
  const tenantId = searchParams.get('tenantId') || '';
  const tenantName = searchParams.get('tenantName') || '';
  const token = searchParams.get('token');
  const email = searchParams.get('email');

  // 인증 파라미터 생성
  const authParam = token ? `token=${token}` : email ? `email=${encodeURIComponent(email)}` : '';
  const accountUrl = tenantId && authParam
    ? `/account/${tenantId}?${authParam}`
    : authParam
    ? `/account?${authParam}`
    : '/account';

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle width={40} height={40} strokeWidth={1.5} className="text-green-500" />
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          결제가 완료되었습니다!
        </h1>

        {tenantName && (
          <p className="text-lg font-semibold text-gray-800 mb-2">
            {tenantName}
          </p>
        )}

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
            href={accountUrl}
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

export default function CheckoutSuccessPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yamoo-primary"></div>
      </div>
    }>
      <SuccessContent />
    </Suspense>
  );
}
