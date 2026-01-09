import { redirect } from 'next/navigation';
import { verifyToken } from '@/lib/auth';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import SubscriptionCard from '@/components/account/SubscriptionCard';
import PaymentHistory from '@/components/account/PaymentHistory';
import CardList from '@/components/account/CardList';
import AccountTabs from '@/components/account/AccountTabs';
import SubscriptionHistory from '@/components/account/SubscriptionHistory';
import TenantHeader from '@/components/account/TenantHeader';
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
    // 로그인 후 이 페이지로 돌아올 수 있도록 redirect 파라미터 추가
    const returnUrl = `/account/${tenantId}`;
    redirect(`/login?redirect=${encodeURIComponent(returnUrl)}`);
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

  // 구독 정보 조회 (subscriptions 컬렉션 우선, 없으면 tenants 컬렉션의 subscription 사용)
  const subscriptionDoc = await db.collection('subscriptions').doc(tenantId).get();
  let rawSubscription = subscriptionDoc.exists ? subscriptionDoc.data() : null;

  // subscriptions 컬렉션에 없으면 tenants의 subscription 정보 사용
  // 단, subscription.plan이 있는 경우에만 (빈 subscription 객체는 무시)
  if (!rawSubscription && tenantData.subscription && tenantData.subscription.plan) {
    // tenants 컬렉션의 subscription을 subscriptions 형식으로 변환

    // trial 날짜: trial.trialEndsAt 또는 subscription.trial.trialEndsAt 또는 루트의 trialEndsAt
    let trialEndDate = tenantData.trial?.trialEndsAt || tenantData.subscription?.trial?.trialEndsAt || tenantData.trialEndsAt;

    // 시작일: subscription.startedAt만 사용
    let startDate = tenantData.subscription.startedAt;

    // startDate를 Date 객체로 변환 (값이 있을 때만)
    if (startDate && startDate.toDate) {
      startDate = startDate.toDate();
    } else if (startDate && startDate._seconds) {
      startDate = new Date(startDate._seconds * 1000);
    }

    // trialEndDate를 Date 객체로 변환 (값이 있을 때만)
    if (trialEndDate && trialEndDate.toDate) {
      trialEndDate = trialEndDate.toDate();
    } else if (trialEndDate && trialEndDate._seconds) {
      trialEndDate = new Date(trialEndDate._seconds * 1000);
    }

    rawSubscription = {
      tenantId,
      email: tenantData.email || email,
      brandName: tenantData.brandName,
      name: tenantData.name,
      phone: tenantData.phone,
      plan: tenantData.subscription.plan || tenantData.plan || 'trial',
      status: tenantData.subscription.status === 'trialing' ? 'trial' : tenantData.subscription.status,
      trialEndDate,
      currentPeriodStart: startDate,
      currentPeriodEnd: trialEndDate || tenantData.subscription.renewsAt,
      nextBillingDate: tenantData.subscription.renewsAt,
      createdAt: tenantData.createdAt,
      updatedAt: tenantData.updatedAt,
    };
  }

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

      {/* Header with Edit button */}
      <TenantHeader
        tenantId={tenantId}
        brandName={tenantData.brandName || '매장'}
        email={email}
        industry={tenantData.industry}
        authParam={authParam}
      />

      {/* Content */}
      <div>
        {subscription ? (
          <AccountTabs
            subscriptionContent={
              <SubscriptionCard
                subscription={subscription}
                authParam={authParam}
                tenantId={tenantId}
              />
            }
            cardsContent={
              <CardList
                tenantId={tenantId}
                email={email}
                authParam={authParam}
              />
            }
            paymentsContent={
              <PaymentHistory
                payments={payments as Parameters<typeof PaymentHistory>[0]['payments']}
                tenantName={tenantData.brandName}
              />
            }
            historyContent={
              <SubscriptionHistory
                subscription={subscription}
                payments={payments}
              />
            }
          />
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
