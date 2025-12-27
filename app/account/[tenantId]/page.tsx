import { redirect } from 'next/navigation';
import { verifyToken } from '@/lib/auth';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import SubscriptionCard from '@/components/account/SubscriptionCard';
import PaymentHistory from '@/components/account/PaymentHistory';
import CardList from '@/components/account/CardList';
import Link from 'next/link';
import { NavArrowLeft, NavArrowRight, Sofa } from 'iconoir-react';

interface TenantPageProps {
  params: Promise<{ tenantId: string }>;
  searchParams: Promise<{ token?: string; email?: string }>;
}

// Firebase Timestamp를 직렬화하는 헬퍼 함수
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeData(data: any): any {
  if (data === null || data === undefined) {
    return data;
  }

  if (data._seconds !== undefined && data._nanoseconds !== undefined) {
    return new Date(data._seconds * 1000).toISOString();
  }

  if (typeof data.toDate === 'function') {
    return data.toDate().toISOString();
  }

  if (Array.isArray(data)) {
    return data.map(serializeData);
  }

  if (typeof data === 'object') {
    const serialized: Record<string, unknown> = {};
    for (const key of Object.keys(data)) {
      serialized[key] = serializeData(data[key]);
    }
    return serialized;
  }

  return data;
}

export default async function TenantPage({ params, searchParams }: TenantPageProps) {
  const { tenantId } = await params;
  const { token, email: emailParam } = await searchParams;

  let email: string | null = null;

  if (token) {
    email = await verifyToken(token);
  } else if (emailParam) {
    email = emailParam;
  }

  if (!email) {
    redirect('/login');
  }

  const db = adminDb || initializeFirebaseAdmin();
  if (!db) {
    redirect('/error?message=database_unavailable');
  }

  // tenant 정보 조회
  const tenantSnapshot = await db
    .collection('tenants')
    .where('tenantId', '==', tenantId)
    .get();

  if (tenantSnapshot.empty) {
    redirect('/account?error=tenant_not_found');
  }

  const tenantData = tenantSnapshot.docs[0].data();

  // 해당 사용자의 매장인지 확인
  if (tenantData.email !== email) {
    redirect('/account?error=unauthorized');
  }

  // 구독 정보 조회
  const subscriptionDoc = await db.collection('subscriptions').doc(tenantId).get();
  const rawSubscription = subscriptionDoc.exists ? subscriptionDoc.data() : null;

  // 결제 내역 조회 (인덱스 없이 클라이언트에서 정렬)
  const paymentsSnapshot = await db
    .collection('payments')
    .where('tenantId', '==', tenantId)
    .get();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawPayments = paymentsSnapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as any[];

  // createdAt 기준 내림차순 정렬 및 10개 제한
  rawPayments.sort((a, b) => {
    const aTime = a.createdAt?.toDate?.() || new Date(a.createdAt || 0);
    const bTime = b.createdAt?.toDate?.() || new Date(b.createdAt || 0);
    return bTime.getTime() - aTime.getTime();
  });
  const limitedPayments = rawPayments.slice(0, 10);

  // 직렬화
  const subscription = rawSubscription ? serializeData(rawSubscription) : null;
  const payments = serializeData(limitedPayments);
  const authParam = token ? `token=${token}` : `email=${encodeURIComponent(email)}`;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Back Button */}
      <Link
        href={`/account?${authParam}`}
        className="inline-flex items-center gap-2 text-gray-600 hover:text-yamoo-primary mb-6 transition-colors"
      >
        <NavArrowLeft width={16} height={16} strokeWidth={1.5} />
        매장 목록으로 돌아가기
      </Link>

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-black rounded-lg flex items-center justify-center">
            <Sofa width={20} height={20} strokeWidth={1.5} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">{tenantData.brandName || '매장'}</h1>
        </div>
        <p className="text-gray-600">{email}</p>
      </div>

      {/* Content */}
      <div className="space-y-6">
        {subscription ? (
          <>
            <SubscriptionCard
              subscription={subscription}
              authParam={authParam}
              tenantId={tenantId}
            />
            <CardList
              tenantId={tenantId}
              email={email}
              authParam={authParam}
            />
            <PaymentHistory
              payments={payments as Parameters<typeof PaymentHistory>[0]['payments']}
            />
          </>
        ) : (
          /* 구독이 없을 때 */
          <div className="bg-white rounded-xl shadow-lg p-8 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Sofa width={32} height={32} strokeWidth={1.5} className="text-gray-400" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-6">
              이 매장에 구독 중인 플랜이 없습니다
            </h2>
            <Link
              href={`/pricing?${authParam}&tenantId=${tenantId}`}
              className="btn-primary inline-flex items-center gap-2"
            >
              요금제 보기
              <NavArrowRight width={20} height={20} strokeWidth={1.5} />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
