import { redirect } from 'next/navigation';
import { verifyToken } from '@/lib/auth';
import { getAuthSessionIdFromCookie, getAuthSession } from '@/lib/auth-session';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { getSubscriptionHistory } from '@/lib/subscription-history';
import SubscriptionCard from '@/components/account/SubscriptionCard';
import PaymentHistory from '@/components/account/PaymentHistory';
import CardList from '@/components/account/CardList';
import AccountTabs from '@/components/account/AccountTabs';
import SubscriptionHistory from '@/components/account/SubscriptionHistory';
import TenantHeader from '@/components/account/TenantHeader';
import NoSubscriptionCard from '@/components/account/NoSubscriptionCard';
import Link from 'next/link';
import { NavArrowLeft } from 'iconoir-react';

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

  // Date 객체 처리
  if (data instanceof Date) {
    return data.toISOString();
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
  let sessionToken: string | undefined = undefined;

  // 1. 세션 쿠키 확인 (우선)
  const sessionId = await getAuthSessionIdFromCookie();
  if (sessionId) {
    const session = await getAuthSession(sessionId);
    if (session) {
      email = session.email;
      sessionToken = session.token;
    }
  }

  // 2. 세션이 없고 토큰이 URL에 있으면 세션 생성 후 리다이렉트
  if (!email && token) {
    const tokenEmail = await verifyToken(token);
    if (tokenEmail) {
      redirect(`/api/auth/session?token=${encodeURIComponent(token)}&redirect=/account/${tenantId}`);
    }
  }

  // 3. 이메일 파라미터로 접근 - 세션 쿠키가 없으면 로그인으로
  if (!email && emailParam) {
    const returnUrl = `/account/${tenantId}`;
    redirect(`/login?redirect=${encodeURIComponent(returnUrl)}`);
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

  // 구독 히스토리 조회 (subscription_history 컬렉션)
  const rawHistoryData = await getSubscriptionHistory(db, tenantId);

  // 직렬화
  const subscription = rawSubscription ? serializeData(rawSubscription) : null;
  const payments = serializeData(limitedPayments);
  const historyData = serializeData(rawHistoryData);
  // authParam: 세션 토큰 우선, 없으면 빈 문자열 (쿠키 인증 사용)
  const authParam = sessionToken ? `token=${sessionToken}` : '';

  // 사용자 정보 및 무료체험 이력 확인 (구독이 없을 때만)
  let hasTrialHistory = false;
  let userName: string | undefined;
  let userPhone: string | undefined;

  if (!subscription) {
    // users 컬렉션에서 사용자 정보 조회
    const userDoc = await db.collection('users').doc(email).get();
    if (userDoc.exists) {
      const userData = userDoc.data();
      hasTrialHistory = userData?.trialApplied === true;
      userName = userData?.name;
      userPhone = userData?.phone;
    }

    // 해당 이메일로 등록된 다른 tenant들 중 trial 이력이 있는지 확인
    if (!hasTrialHistory) {
      const tenantsSnapshot = await db.collection('tenants')
        .where('email', '==', email)
        .get();

      for (const doc of tenantsSnapshot.docs) {
        const tData = doc.data();
        // trial 상태였던 이력이 있거나 subscription이 있으면 무료체험 이력으로 간주
        if (tData.subscription?.status === 'trial' ||
            tData.subscription?.plan === 'trial' ||
            tData.trial?.trialEndsAt) {
          hasTrialHistory = true;
          break;
        }
        // subscriptions 컬렉션도 확인
        const subDoc = await db.collection('subscriptions').doc(tData.tenantId || doc.id).get();
        if (subDoc.exists) {
          const subData = subDoc.data();
          if (subData?.status === 'trial' || subData?.plan === 'trial' || subData?.trialEndDate) {
            hasTrialHistory = true;
            break;
          }
        }
      }
    }
  }

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
        industry={tenantData.industry}
        authParam={authParam}
        subscription={subscription}
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
                historyData={historyData}
              />
            }
          />
        ) : (
          /* 구독이 없을 때 */
          <NoSubscriptionCard
            tenantId={tenantId}
            brandName={tenantData.brandName || '매장'}
            email={email}
            authParam={authParam}
            hasTrialHistory={hasTrialHistory}
            userName={userName}
            userPhone={userPhone}
            industry={tenantData.industry}
          />
        )}
      </div>
    </div>
  );
}
