import { redirect } from 'next/navigation';
import { verifyToken } from '@/lib/auth';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import TenantList from '@/components/account/TenantList';
import UserProfile from '@/components/account/UserProfile';
import AccountDeletion from '@/components/account/AccountDeletion';

// Force dynamic rendering - this page requires searchParams
export const dynamic = 'force-dynamic';

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

  // 사용자 정보 (첫 번째 tenant에서 가져옴)
  let userInfo: { name: string; phone: string } = { name: '', phone: '' };

  if (db) {
    try {
      // tenants 컬렉션에서 email로 매장 목록 조회
      const tenantsSnapshot = await db
        .collection('tenants')
        .where('email', '==', email)
        .get();

      if (!tenantsSnapshot.empty) {
        // 첫 번째 tenant에서 사용자 정보 가져오기
        const firstTenantData = tenantsSnapshot.docs[0].data();
        userInfo = {
          name: firstTenantData.name || '',
          phone: firstTenantData.phone || '',
        };

        // 모든 tenant 데이터 수집
        const tenantDataList = tenantsSnapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            tenantId: data.tenantId || doc.id,
            brandName: data.brandName || '이름 없음',
            email: data.email,
            createdAt: serializeTimestamp(data.createdAt),
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

        // 최종 결과 조합
        tenants = tenantDataList.map((tenant) => ({
          ...tenant,
          subscription: subscriptionMap.get(tenant.tenantId) || null,
        }));
      }
    } catch (error) {
      console.error('Failed to fetch tenants:', error);
    }
  }

  // 활성/해지예정 구독 여부 확인 (active, trial, canceled 모두 탈퇴 불가)
  const hasActiveSubscriptions = tenants.some(
    (t) => t.subscription?.status === 'active' ||
           t.subscription?.status === 'trial' ||
           t.subscription?.status === 'canceled'
  );

  return (
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
        <TenantList authParam={authParam} email={email} initialTenants={tenants} />
        {/* 회원 탈퇴 */}
        <AccountDeletion
          authParam={authParam}
          hasActiveSubscriptions={hasActiveSubscriptions}
        />
      </div>
    </div>
  );
}
