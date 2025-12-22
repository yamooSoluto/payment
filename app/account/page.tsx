import { redirect } from 'next/navigation';
import { verifyToken, getSubscription, getPaymentHistory } from '@/lib/auth';
import SubscriptionCard from '@/components/account/SubscriptionCard';
import PaymentHistory from '@/components/account/PaymentHistory';
import Link from 'next/link';
import { ArrowRight, Package } from 'lucide-react';

interface AccountPageProps {
  searchParams: Promise<{ token?: string; email?: string }>;
}

// Firebase Timestamp를 직렬화하는 헬퍼 함수
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeData(data: any): any {
  if (data === null || data === undefined) {
    return data;
  }

  // Firestore Timestamp 객체 처리
  if (data._seconds !== undefined && data._nanoseconds !== undefined) {
    return new Date(data._seconds * 1000).toISOString();
  }

  // toDate 메서드가 있는 Timestamp 처리
  if (typeof data.toDate === 'function') {
    return data.toDate().toISOString();
  }

  // 배열 처리
  if (Array.isArray(data)) {
    return data.map(serializeData);
  }

  // 객체 처리
  if (typeof data === 'object') {
    const serialized: Record<string, unknown> = {};
    for (const key of Object.keys(data)) {
      serialized[key] = serializeData(data[key]);
    }
    return serialized;
  }

  return data;
}

export default async function AccountPage({ searchParams }: AccountPageProps) {
  const params = await searchParams;
  const { token, email: emailParam } = params;

  let email: string | null = null;

  // 1. 토큰으로 인증 (포탈 SSO)
  if (token) {
    email = await verifyToken(token);
  }
  // 2. 이메일 파라미터로 접근 (Firebase Auth)
  else if (emailParam) {
    email = emailParam;
  }

  if (!email) {
    redirect('/login');
  }

  const rawSubscription = await getSubscription(email);
  const rawPayments = await getPaymentHistory(email);

  // Firebase Timestamp 직렬화
  const subscription = rawSubscription ? serializeData(rawSubscription) : null;
  const payments = serializeData(rawPayments);
  const authParam = token ? `token=${token}` : `email=${encodeURIComponent(email)}`;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">마이페이지</h1>
        <p className="text-gray-600">{email}</p>
      </div>

      {/* Content */}
      <div className="space-y-6">
        {subscription ? (
          <>
            <SubscriptionCard subscription={subscription} authParam={authParam} />
            <PaymentHistory payments={payments as Parameters<typeof PaymentHistory>[0]['payments']} />
          </>
        ) : (
          /* 구독이 없을 때 */
          <div className="bg-white rounded-xl shadow-lg p-8 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Package className="w-8 h-8 text-gray-400" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              아직 구독 중인 플랜이 없습니다
            </h2>
            <p className="text-gray-600 mb-6">
              YAMOO의 다양한 요금제를 확인하고 CS 자동화를 시작해보세요.
            </p>
            <Link
              href={`/pricing?${authParam}`}
              className="btn-primary inline-flex items-center gap-2"
            >
              요금제 보기
              <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
