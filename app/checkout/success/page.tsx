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

// 주문번호에서 tenantId 제거 (타임스탬프만 표시)
function formatOrderId(orderId: string): string {
  // 패턴: PREFIX_TIMESTAMP_TENANTID → PREFIX_TIMESTAMP
  const parts = orderId.split('_');
  if (parts.length >= 3) {
    // 타임스탬프까지만 반환 (예: SUB_1767967504914)
    return `${parts[0]}_${parts[1]}`;
  }
  return orderId;
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
  const startParam = searchParams.get('start');
  const endParam = searchParams.get('end');
  const reserved = searchParams.get('reserved') === 'true'; // 플랜 예약 모드
  const changed = searchParams.get('changed') === 'true'; // 즉시 플랜 변경 모드

  // 이용 기간 계산 (URL 파라미터 사용)
  // 플랜 예약 모드에서는 start가 첫 결제일(= 이용 시작일)
  const period = reserved && startParam
    ? (() => {
        const startDate = new Date(startParam);
        const endDate = new Date(startDate);
        endDate.setMonth(endDate.getMonth() + 1);
        endDate.setDate(endDate.getDate() - 1);
        return {
          start: formatDate(startDate),
          end: formatDate(endDate),
          nextBilling: formatDate(startDate), // 첫 결제일 = 이용 시작일
        };
      })()
    : getSubscriptionPeriod(startParam, endParam);

  const accountUrl = '/account';

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle width={40} height={40} strokeWidth={1.5} className="text-green-500" />
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          {reserved ? '플랜 예약이 완료되었습니다!' : changed ? '플랜 전환이 완료되었습니다!' : '결제가 완료되었습니다!'}
        </h1>

        {tenantName && (
          <p className="text-lg font-semibold text-gray-800 mb-2">
            {tenantName}
          </p>
        )}

        <p className="text-gray-600 mb-6">
          {reserved
            ? `${period.nextBilling}부터 ${getPlanName(plan)} 플랜이 시작됩니다.`
            : changed
            ? `${getPlanName(plan)} 플랜으로 전환되었습니다.`
            : `YAMOO ${getPlanName(plan)} 플랜 구독이 시작되었습니다.`}
        </p>

        <div className="bg-gray-50 rounded-lg p-4 mb-6 text-left space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-gray-500 text-sm">{reserved ? '예약 플랜' : changed ? '변경 플랜' : '구독 플랜'}</span>
            <span className="text-gray-900 font-semibold">{getPlanName(plan)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-500 text-sm">{reserved ? '예정 이용 기간' : '이용 기간'}</span>
            <span className="text-gray-900 text-sm">
              {period.start} ~ {period.end}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-500 text-sm">{reserved ? '첫 결제일' : '다음 결제일'}</span>
            <span className="text-gray-900 text-sm">
              {period.nextBilling}
            </span>
          </div>
          {orderId && !reserved && (
            <div className="pt-2 border-t border-gray-200">
              <div className="flex justify-between items-center mb-1">
                <span className="text-gray-400 text-xs">주문번호</span>
              </div>
              <span className="text-gray-500 text-xs font-mono break-all">{formatOrderId(orderId)}</span>
            </div>
          )}
        </div>

        {reserved && (
          <div className="bg-blue-50 rounded-lg p-4 mb-6 text-left">
            <p className="text-sm text-blue-700">
              등록하신 카드로 첫 결제일에 자동 결제됩니다.<br />
              예약은 마이페이지에서 언제든 취소할 수 있습니다.
            </p>
          </div>
        )}

        <div className="space-y-3">
          <Link
            href={accountUrl}
            className="btn-primary w-full block text-center"
          >
            마이페이지로 이동
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
