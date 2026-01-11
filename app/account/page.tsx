import { redirect } from 'next/navigation';
import { verifyToken } from '@/lib/auth';
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

  const authParam = token ? `token=${token}` : `email=${encodeURIComponent(email)}`;

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
      nextBillingDate: string | null;
      currentPeriodEnd: string | null;
      canceledAt: string | null;
    } | null;
  }> = [];

  // 사용자 정보 (users 컬렉션 우선, 없으면 tenants에서 가져옴)
  let userInfo: { name: string; phone: string } = { name: '', phone: '' };
  // 무료체험 이력 (phone 기준 trialApplied === true)
  let hasTrialHistory = false;

  if (db) {
    try {
      // users 컬렉션에서 사용자 정보 조회 (우선)
      const userDoc = await db.collection('users').doc(email).get();
      if (userDoc.exists) {
        const userData = userDoc.data();
        userInfo = {
          name: userData?.name || '',
          phone: userData?.phone || '',
        };
        // users에서 trialApplied 확인
        if (userData?.trialApplied === true) {
          hasTrialHistory = true;
        }

        // 프로필 미완성 시 (이름 또는 연락처 없음) 로그인 페이지로 리다이렉트
        if (!userData?.name || !userData?.phone) {
          redirect(`/login?incomplete=true&email=${encodeURIComponent(email)}`);
        }
      } else {
        // Firestore에 사용자 정보 없음 - 프로필 완성 필요
        redirect(`/login?incomplete=true&email=${encodeURIComponent(email)}`);
      }

      // phone 기준으로 무료체험 이력 추가 확인 (users 컬렉션에서)
      if (!hasTrialHistory && userInfo.phone) {
        const usersByPhone = await db.collection('users')
          .where('phone', '==', userInfo.phone)
          .limit(1)
          .get();
        if (!usersByPhone.empty) {
          const phoneUserData = usersByPhone.docs[0].data();
          if (phoneUserData.trialApplied === true) {
            hasTrialHistory = true;
          }
        }
      }

      // tenants 컬렉션에서 email로 매장 목록 조회
      const tenantsSnapshot = await db
        .collection('tenants')
        .where('email', '==', email)
        .get();

      if (!tenantsSnapshot.empty) {
        // users에서 정보가 없으면 첫 번째 tenant에서 가져오기
        if (!userInfo.name || !userInfo.phone) {
          const firstTenantData = tenantsSnapshot.docs[0].data();
          userInfo = {
            name: userInfo.name || firstTenantData.name || firstTenantData.ownerName || '',
            phone: userInfo.phone || firstTenantData.phone || '',
          };
        }

        // 모든 tenant 데이터 수집 (삭제된 매장 제외, trial/subscription 정보 포함)
        const tenantDataList = tenantsSnapshot.docs
          .filter((doc) => !doc.data().deleted)
          .map((doc) => {
          const data = doc.data();

          // 체험 종료일 확인
          const trialEndsAtRaw = data.trialEndsAt || data.subscription?.trialEndsAt;
          let trialEndsAtDate: Date | null = null;
          if (trialEndsAtRaw) {
            if (typeof trialEndsAtRaw === 'object' && 'toDate' in trialEndsAtRaw) {
              trialEndsAtDate = trialEndsAtRaw.toDate();
            } else if (typeof trialEndsAtRaw === 'object' && '_seconds' in trialEndsAtRaw) {
              trialEndsAtDate = new Date(trialEndsAtRaw._seconds * 1000);
            } else if (typeof trialEndsAtRaw === 'string') {
              trialEndsAtDate = new Date(trialEndsAtRaw);
            }
          }

          // 구독 상태 결정 로직
          let effectiveStatus = data.subscription?.status || data.status;
          const effectivePlan = data.subscription?.plan || data.plan;

          // 명시적 구독 상태가 없는 경우 체험 기간으로 판단
          if (!effectiveStatus || effectiveStatus === 'active') {
            if (effectivePlan === 'trial' || !effectivePlan) {
              // trial 플랜인 경우: 체험 종료일 확인
              if (trialEndsAtDate) {
                const now = new Date();
                if (trialEndsAtDate > now) {
                  effectiveStatus = 'trial';
                } else {
                  effectiveStatus = 'expired';
                }
              } else {
                // 체험 종료일이 없으면 기본값 trial
                effectiveStatus = 'trial';
              }
            }
          }

          return {
            id: doc.id,
            tenantId: data.tenantId || doc.id,
            brandName: data.brandName || '이름 없음',
            email: data.email,
            industry: data.industry || null,
            createdAt: serializeTimestamp(data.createdAt),
            // tenants 컬렉션의 구독/체험 정보 (fallback용)
            tenantSubscription: {
              plan: effectivePlan || 'trial',
              status: effectiveStatus,
              trialEndsAt: serializeTimestamp(trialEndsAtRaw),
              startedAt: serializeTimestamp(data.subscription?.startedAt),
              renewsAt: serializeTimestamp(data.subscription?.renewsAt),
            },
          };
        });

        // 구독 정보 한 번에 조회 (getAll 사용으로 N+1 문제 해결)
        const subscriptionRefs = tenantDataList.map((t) =>
          db.collection('subscriptions').doc(t.tenantId)
        );
        const subscriptionDocs = await db.getAll(...subscriptionRefs);

        // 구독 정보를 Map으로 변환
        const subscriptionMap = new Map<string, {
          plan: string;
          status: string;
          amount: number;
          nextBillingDate: string | null;
          currentPeriodEnd: string | null;
          canceledAt: string | null;
        }>();

        subscriptionDocs.forEach((doc) => {
          if (doc.exists) {
            const data = doc.data();
            subscriptionMap.set(doc.id, {
              plan: data?.plan,
              status: data?.status,
              amount: data?.amount,
              nextBillingDate: serializeTimestamp(data?.nextBillingDate),
              currentPeriodEnd: serializeTimestamp(data?.currentPeriodEnd),
              canceledAt: serializeTimestamp(data?.canceledAt),
            });
          }
        });

        // 최종 결과 조합 (subscriptions 컬렉션 우선, plan이 있는 경우만 사용)
        tenants = tenantDataList.map((tenant) => {
          const subFromCollection = subscriptionMap.get(tenant.tenantId);

          // subscriptions 컬렉션에 있고 plan이 있으면 사용
          if (subFromCollection?.plan) {
            return {
              id: tenant.id,
              tenantId: tenant.tenantId,
              brandName: tenant.brandName,
              email: tenant.email,
              industry: tenant.industry,
              createdAt: tenant.createdAt,
              subscription: subFromCollection,
            };
          }

          // tenants 컬렉션의 subscription 정보 확인 (plan이 있는 경우만)
          const tenantSub = tenant.tenantSubscription;
          if (tenantSub.plan && tenantSub.plan !== 'trial') {
            // trial이 아닌 실제 플랜이 있는 경우에만 사용
            return {
              id: tenant.id,
              tenantId: tenant.tenantId,
              brandName: tenant.brandName,
              email: tenant.email,
              industry: tenant.industry,
              createdAt: tenant.createdAt,
              subscription: {
                plan: tenantSub.plan,
                status: tenantSub.status,
                amount: 0,
                nextBillingDate: tenantSub.renewsAt,
                currentPeriodEnd: tenantSub.trialEndsAt || tenantSub.renewsAt,
                canceledAt: null,
              },
            };
          }

          // trialEndsAt이 있는 진짜 체험 중인 경우
          if (tenantSub.trialEndsAt && tenantSub.status === 'trial') {
            return {
              id: tenant.id,
              tenantId: tenant.tenantId,
              brandName: tenant.brandName,
              email: tenant.email,
              industry: tenant.industry,
              createdAt: tenant.createdAt,
              subscription: {
                plan: 'trial',
                status: 'trial',
                amount: 0,
                nextBillingDate: null,
                currentPeriodEnd: tenantSub.trialEndsAt,
                canceledAt: null,
              },
            };
          }

          // 그 외에는 미구독 (subscription: null)
          return {
            id: tenant.id,
            tenantId: tenant.tenantId,
            brandName: tenant.brandName,
            email: tenant.email,
            industry: tenant.industry,
            createdAt: tenant.createdAt,
            subscription: null,
          };
        });
      }
    } catch (error) {
      console.error('Failed to fetch tenants:', error);
    }
  }

  // 활성/해지예정 구독 여부 확인 (active, trial, canceled 모두 탈퇴 불가)
  // plan이 'trial'인 경우도 체크 (status가 다른 값이어도 체험 중으로 처리)
  const hasActiveSubscriptions = tenants.some(
    (t) => t.subscription?.status === 'active' ||
           t.subscription?.status === 'trial' ||
           t.subscription?.status === 'canceled' ||
           t.subscription?.plan === 'trial'
  );

  return (
    <>
      {/* URL에서 토큰/이메일 파라미터 제거 (보안) */}
      <UrlCleaner />
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">마이페이지</h1>
          <p className="text-gray-600">{email}</p>
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
