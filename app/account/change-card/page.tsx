import { redirect } from 'next/navigation';
import { verifyToken, getSubscription } from '@/lib/auth';
import Link from 'next/link';
import { ArrowLeft, CreditCard, Shield } from 'lucide-react';
import ChangeCardButton from '@/components/account/ChangeCardButton';

interface ChangeCardPageProps {
  searchParams: Promise<{ token?: string; email?: string }>;
}

export default async function ChangeCardPage({ searchParams }: ChangeCardPageProps) {
  const params = await searchParams;
  const { token, email: emailParam } = params;

  let email: string | null = null;

  if (token) {
    email = await verifyToken(token);
  } else if (emailParam) {
    email = emailParam;
  }

  if (!email) {
    redirect('/login');
  }

  const subscription = await getSubscription(email);
  if (!subscription || subscription.status !== 'active') {
    redirect('/pricing');
  }

  const authParam = token ? `token=${token}` : `email=${encodeURIComponent(email)}`;

  // 카드 정보 추출
  const cardInfo = subscription.cardInfo || {};
  const cardCompany = cardInfo.company || cardInfo.issuerCode || '알 수 없음';
  const cardNumber = cardInfo.number || '****';

  return (
    <div className="max-w-lg mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Header */}
      <div className="mb-8">
        <Link
          href={`/account?${authParam}`}
          className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          마이페이지로 돌아가기
        </Link>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">결제 카드 변경</h1>
        <p className="text-gray-600">새로운 카드를 등록하여 결제 수단을 변경합니다.</p>
      </div>

      {/* Current Card */}
      <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">현재 등록된 카드</h2>
        <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
          <div className="w-12 h-12 bg-gray-200 rounded-lg flex items-center justify-center">
            <CreditCard className="w-6 h-6 text-gray-500" />
          </div>
          <div>
            <p className="font-medium text-gray-900">{cardCompany}카드</p>
            <p className="text-sm text-gray-500">{cardNumber}</p>
          </div>
        </div>
      </div>

      {/* Change Card */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">새 카드 등록</h2>
        <p className="text-sm text-gray-600 mb-6">
          새 카드를 등록하면 기존 카드는 자동으로 해제되고, 다음 결제부터 새 카드로 결제됩니다.
        </p>

        <ChangeCardButton email={email} authParam={authParam} />

        <div className="mt-6 flex items-center gap-2 text-sm text-gray-500">
          <Shield className="w-4 h-4 text-green-500" />
          <span>카드 정보는 토스페이먼츠에 안전하게 저장됩니다.</span>
        </div>
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
