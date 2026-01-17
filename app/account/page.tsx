import { redirect } from 'next/navigation';
import { verifyToken } from '@/lib/auth';
import { getAuthSessionIdFromCookie, getAuthSession } from '@/lib/auth-session';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import TenantList from '@/components/account/TenantList';
import UserProfile from '@/components/account/UserProfile';
import AccountDeletion from '@/components/account/AccountDeletion';
import UrlCleaner from '@/components/account/UrlCleaner';

// Force dynamic rendering - this page requires searchParams
export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface AccountPageProps {
  searchParams: Promise<{ token?: string; email?: string }>;
}

// Timestamp를 ISO string으로 변환
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeTimestamp(val: any): string | null {
  if (!val) return null;
  if (typeof val === 'object' && val !== null) {
    if ('toDate' in val && typeof val.toDate === 'function') {
      return val.toDate().toISOString();
    }
    if ('_seconds' in val) {
      return new Date(val._seconds * 1000).toISOString();
    }
  }
  return val;
}

export default async function AccountPage({ searchParams }: AccountPageProps) {
  const params = await searchParams;
  const { token, email: emailParam } = params;

  let email: string | null = null;
  let sessionToken: string | undefined = undefined;

  // 1. 세션 쿠키 확인 (우선)
  const sessionId = await getAuthSessionIdFromCookie();
  if (sessionId) {
    const session = await getAuthSession(sessionId);
    if (session) {
      email = session.email;
      sessionToken = session.token; // 세션에 저장된 토큰
    }
  }

  // 2. 세션이 없고 토큰이 URL에 있으면 세션 생성 후 리다이렉트
  if (!email && token) {
    const tokenEmail = await verifyToken(token);
    if (tokenEmail) {
      // 세션 API를 통해 쿠키 설정 후 돌아오기 (URL에서 토큰 제거)
      redirect(`/api/auth/session?token=${encodeURIComponent(token)}&redirect=/account`);
    }
  }

  // 3. 이메일 파라미터로 접근 - 세션 쿠키가 없으면 로그인으로
  if (!email && emailParam) {
    // 이메일만으로는 세션 생성 불가, 로그인 필요
    redirect('/login');
  }

  if (!email) {
    redirect('/login');
  }

  // authParam: 빈 문자열 (쿠키 인증 사용, URL에 토큰 노출 방지)
  const authParam = '';

  // 서버에서 직접 매장 목록 조회 (빠른 초기 로딩)
  const db = adminDb || initializeFirebaseAdmin();
  let tenants: Array<{
    id: string;
    tenantId: string;
    brandName: string;
    email: string;
    industry: string | null;
    createdAt: string | null;
    subscription: {
      plan: string;
      status: string;
      amount: number;
      baseAmount?: number;  // 플랜 기본 가격 (정기결제 금액)
      nextBillingDate: string | null;
      currentPeriodEnd: string | null;
      canceledAt: string | null;
      cancelMode?: 'scheduled' | 'immediate';
    } | null;
  }> = [];

  // 사용자 정보 (users 컬렉션 우선, 없으면 tenants에서 가져옴)
  let userInfo: { name: string; phone: string } = { name: '', phone: '' };
  // 무료체험 이력 (phone 기준 trialApplied === true)
  let hasTrialHistory = false;

  if (db) {
    try {
      // 1단계: 사용자 정보 + 매장 목록 병렬 조회
      const [userDoc, tenantsSnapshot] = await Promise.all([
        db.collection('users').doc(email).get(),
        db.collection('tenants').where('email', '==', email).get(),
      ]);

      // 사용자 정보 처리
      if (userDoc.exists) {
        const userData = userDoc.data();
        userInfo = {
          name: userData?.name || '',
          phone: userData?.phone || '',
        };
        if (userData?.trialApplied === true) {
          hasTrialHistory = true;
        }
        if (!userData?.name || !userData?.phone) {
          redirect(`/login?incomplete=true&email=${encodeURIComponent(email)}`);
        }
      } else {
        redirect(`/login?incomplete=true&email=${encodeURIComponent(email)}`);
      }

      // 매장 데이터 준비 (삭제된 매장 제외)
      const tenantDataList = tenantsSnapshot.docs
        .filter((doc) => !doc.data().deleted)
        .map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            tenantId: data.tenantId || doc.id,
            brandName: data.brandName || '이름 없음',
            email: data.email,
            industry: data.industry || null,
            createdAt: serializeTimestamp(data.createdAt),
          };
        });

      // 2단계: 무료체험 이력 + 구독 정보 병렬 조회
      const parallelQueries: Promise<unknown>[] = [];

      // 무료체험 이력 조회 (phone이 있고 아직 이력이 없는 경우)
      if (!hasTrialHistory && userInfo.phone) {
        parallelQueries.push(
          Promise.all([
            db.collection('users')
              .where('phone', '==', userInfo.phone)
              .where('trialApplied', '==', true)
              .limit(1)
              .get(),
            db.collection('users')
              .where('previousPhones', 'array-contains', userInfo.phone)
              .where('trialApplied', '==', true)
              .limit(1)
              .get(),
          ])
        );
      } else {
        parallelQueries.push(Promise.resolve(null));
      }

      // 구독 정보 조회 (매장이 있는 경우)
      if (tenantDataList.length > 0) {
        const subscriptionRefs = tenantDataList.map((t) =>
          db.collection('subscriptions').doc(t.tenantId)
        );
        parallelQueries.push(db.getAll(...subscriptionRefs));
      } else {
        parallelQueries.push(Promise.resolve([]));
      }

      const [trialResult, subscriptionDocs] = await Promise.all(parallelQueries) as [
        [FirebaseFirestore.QuerySnapshot, FirebaseFirestore.QuerySnapshot] | null,
        FirebaseFirestore.DocumentSnapshot[]
      ];

      // 무료체험 이력 결과 처리
      if (trialResult) {
        const [usersByCurrentPhone, usersByPreviousPhone] = trialResult;
        if (!usersByCurrentPhone.empty || !usersByPreviousPhone.empty) {
          hasTrialHistory = true;
        }
      }

      // 구독 정보 Map으로 변환
      const subscriptionMap = new Map<string, {
        plan: string;
        status: string;
        amount: number;
        baseAmount?: number;
        nextBillingDate: string | null;
        currentPeriodEnd: string | null;
        canceledAt: string | null;
        cancelMode?: 'scheduled' | 'immediate';
      }>();

      (subscriptionDocs || []).forEach((doc) => {
        if (doc.exists) {
          const data = doc.data();
          subscriptionMap.set(doc.id, {
            plan: data?.plan,
            status: data?.status,
            amount: data?.amount,
            baseAmount: data?.baseAmount,
            nextBillingDate: serializeTimestamp(data?.nextBillingDate),
            currentPeriodEnd: serializeTimestamp(data?.currentPeriodEnd),
            canceledAt: serializeTimestamp(data?.canceledAt),
            cancelMode: data?.cancelMode,
          });
        }
      });

      // 최종 결과 조합
      tenants = tenantDataList.map((tenant) => {
        const subscription = subscriptionMap.get(tenant.tenantId);
        return {
          id: tenant.id,
          tenantId: tenant.tenantId,
          brandName: tenant.brandName,
          email: tenant.email,
          industry: tenant.industry,
          createdAt: tenant.createdAt,
          subscription: subscription?.plan ? subscription : null,
        };
      });
    } catch (error) {
      console.error('Failed to fetch tenants:', error);
    }
  }

  // 활성/해지예정 구독 여부 확인 (active, trial, scheduled canceled 모두 탈퇴 불가)
  // 즉시 해지(cancelMode: 'immediate')는 이미 해지 완료된 상태이므로 탈퇴 가능
  // plan이 'trial'인 경우도 체크 (status가 다른 값이어도 체험 중으로 처리)
  const hasActiveSubscriptions = tenants.some(
    (t) => t.subscription?.status === 'active' ||
           t.subscription?.status === 'trial' ||
           (t.subscription?.status === 'canceled' && t.subscription?.cancelMode !== 'immediate') ||
           t.subscription?.plan === 'trial'
  );

  return (
    <>
      {/* URL에서 토큰/이메일 파라미터 제거 (보안) */}
      <UrlCleaner />
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">마이페이지</h1>
        </div>

        {/* Content */}
        <div className="space-y-6">
          {/* 기본 정보 */}
          <UserProfile
            email={email}
            name={userInfo.name}
            phone={userInfo.phone}
          />
          {/* 내 매장 */}
          <TenantList
            authParam={authParam}
            email={email}
            initialTenants={tenants}
            hasTrialHistory={hasTrialHistory}
          />
          {/* 회원 탈퇴 */}
          <AccountDeletion
            authParam={authParam}
            hasActiveSubscriptions={hasActiveSubscriptions}
          />
        </div>
      </div>
    </>
  );
}
