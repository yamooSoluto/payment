import { redirect } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle } from 'iconoir-react';
import { getSessionIdFromCookie, getCheckoutSession, deleteCheckoutSession, clearSessionCookie } from '@/lib/checkout-session';
import { getPlanName } from '@/lib/toss';

export default async function CheckoutSuccessPage() {
  // 쿠키에서 세션 ID 가져오기
  const sessionId = await getSessionIdFromCookie();
  if (!sessionId) {
    redirect('/pricing');
  }

  // 세션 데이터 조회
  const session = await getCheckoutSession(sessionId);
  if (!session || session.status !== 'success') {
    redirect('/pricing');
  }

  const { plan, orderId, tenantId, tenantName } = session;
  const planName = getPlanName(plan);

  // 성공 페이지 표시 후 세션 삭제 (cleanup)
  await deleteCheckoutSession(sessionId);
  await clearSessionCookie();

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
          YAMOO {planName} 플랜 구독이 시작되었습니다.
        </p>

        <div className="bg-gray-50 rounded-lg p-4 mb-6 text-left">
          <div className="flex justify-between items-center mb-2">
            <span className="text-gray-500 text-sm">주문번호</span>
            <span className="text-gray-900 text-sm font-mono">{orderId}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-500 text-sm">구독 플랜</span>
            <span className="text-gray-900 font-semibold">{planName}</span>
          </div>
        </div>

        <div className="space-y-3">
          <Link
            href={tenantId ? `/account/${tenantId}` : '/account'}
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
