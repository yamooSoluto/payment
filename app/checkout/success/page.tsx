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


// 날짜 포맷 함수
function formatDate(date: Date): string {
  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

// 이용기간 계산 (URL 파라미터 우선, 없으면 현재 시점 기준으로 계산)
function getSubscriptionPeriod(startParam?: string | null, endParam?: string | null): { start: string; end: string; nextBilling: string } {
  // URL 파라미터가 있으면 사용
  if (startParam && endParam) {
    const startDate = new Date(startParam);
    const billingDate = new Date(endParam);
    const endDate = new Date(billingDate);
    endDate.setDate(endDate.getDate() - 1);

    return {
      start: formatDate(startDate),
      end: formatDate(endDate),
      nextBilling: formatDate(billingDate),
    };
  }

  // URL 파라미터가 없으면 현재 시점 기준 (폴백)
  const today = new Date();
  const billingDate = new Date(today);
  billingDate.setMonth(billingDate.getMonth() + 1);
  const endDate = new Date(billingDate);
  endDate.setDate(endDate.getDate() - 1);

  return {
    start: formatDate(today),
    end: formatDate(endDate),
    nextBilling: formatDate(billingDate),
  };
}

function SuccessContent() {
  const searchParams = useSearchParams();
  const plan = searchParams.get('plan') || '';
  const orderId = searchParams.get('orderId') || '';
  const tenantId = searchParams.get('tenantId') || '';
  const tenantName = searchParams.get('tenantName') || '';
  const token = searchParams.get('token');
  const email = searchParams.get('email');
  const startParam = searchParams.get('start');
  const endParam = searchParams.get('end');

  // 이용 기간 계산 (URL 파라미터 사용)
  const period = getSubscriptionPeriod(startParam, endParam);

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

        <div className="bg-gray-50 rounded-lg p-4 mb-6 text-left space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-gray-500 text-sm">구독 플랜</span>
            <span className="text-gray-900 font-semibold">{getPlanName(plan)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-500 text-sm">이용 기간</span>
            <span className="text-gray-900 text-sm">
              {period.start} ~ {period.end}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-500 text-sm">다음 결제일</span>
            <span className="text-gray-900 text-sm">
              {period.nextBilling}
            </span>
          </div>
          {orderId && (
            <div className="pt-2 border-t border-gray-200">
              <div className="flex justify-between items-center mb-1">
                <span className="text-gray-400 text-xs">주문번호</span>
              </div>
              <span className="text-gray-500 text-xs font-mono break-all">{orderId}</span>
            </div>
          )}
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
