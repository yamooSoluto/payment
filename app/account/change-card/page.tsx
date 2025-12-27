import { redirect } from 'next/navigation';
import { verifyToken, getSubscriptionByTenantId } from '@/lib/auth';
import Link from 'next/link';
import { NavArrowLeft, CreditCard } from 'iconoir-react';
import ChangeCardButton from '@/components/account/ChangeCardButton';

interface ChangeCardPageProps {
  searchParams: Promise<{ token?: string; email?: string; tenantId?: string }>;
}

export default async function ChangeCardPage({ searchParams }: ChangeCardPageProps) {
  const params = await searchParams;
  const { token, email: emailParam, tenantId } = params;

  let email: string | null = null;

  if (token) {
    email = await verifyToken(token);
  } else if (emailParam) {
    email = emailParam;
  }

  if (!email) {
    redirect('/login');
  }

  if (!tenantId) {
    redirect('/account');
  }

  const subscription = await getSubscriptionByTenantId(tenantId, email);
  if (!subscription || subscription.status !== 'active') {
    redirect('/pricing');
  }

  const authParam = token ? `token=${token}` : `email=${encodeURIComponent(email)}`;

  // 카드 정보 추출
  const cardInfo = subscription.cardInfo || {};
  const cardCompany = cardInfo.company || cardInfo.issuerCode || '알 수 없음';
  const cardNumber = cardInfo.number || '****';
  const cardAlias = subscription.cardAlias || '';

  return (
    <div className="max-w-lg mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Header */}
      <div className="mb-8">
        <Link
          href={`/account/${tenantId}?${authParam}`}
          className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
        >
          <NavArrowLeft width={16} height={16} strokeWidth={1.5} />
          매장 구독 관리로 돌아가기
        </Link>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">결제 카드 변경</h1>
        <p className="text-gray-600">새로운 카드를 등록하여 결제 수단을 변경합니다.</p>
      </div>

      {/* Current Card */}
      <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">현재 등록된 카드</h2>
        <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
          <div className="w-12 h-12 bg-gray-200 rounded-lg flex items-center justify-center">
            <CreditCard width={24} height={24} strokeWidth={1.5} className="text-gray-500" />
          </div>
          <div>
            <p className="font-medium text-gray-900">
              {cardAlias ? `${cardAlias} (${cardCompany}카드)` : `${cardCompany}카드`}
            </p>
            <p className="text-sm text-gray-500">{cardNumber}</p>
          </div>
        </div>
      </div>

      {/* Change Card */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">카드 변경</h2>
        <p className="text-sm text-gray-600 mb-6">
          새 카드를 등록하면 기존 카드는 자동으로 해제되고, 다음 결제부터 새 카드로 결제됩니다.
        </p>

        <ChangeCardButton email={email} authParam={authParam} currentAlias={cardAlias} tenantId={tenantId} />
      </div>

      {/* Notice */}
      <div className="mt-6 bg-gray-50 rounded-lg p-4">
        <h4 className="font-medium text-gray-900 mb-2">안내사항</h4>
        <ul className="text-sm text-gray-600 space-y-1">
          <li>• 카드 변경 후 기존 카드로는 더 이상 결제되지 않습니다.</li>
          <li>• 변경된 카드는 다음 정기 결제일부터 적용됩니다.</li>
          <li>• 카드 변경은 즉시 적용되며, 추가 비용이 발생하지 않습니다.</li>
        </ul>
      </div>
    </div>
  );
}
