import jwt from 'jsonwebtoken';
import { adminDb, initializeFirebaseAdmin } from './firebase-admin';

// JWT_SECRET은 필수 환경변수 - 없으면 서버 시작 시 에러
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET 환경변수가 설정되지 않았습니다.');
}

// DEV_MODE는 개발 환경에서만 사용 (프로덕션에서는 절대 true로 설정하지 말 것)
const DEV_MODE = process.env.NODE_ENV === 'development' && process.env.DEV_MODE === 'true';
const DEV_EMAIL = process.env.DEV_EMAIL || 'test@example.com';

interface TokenPayload {
  email: string;
  purpose: 'checkout' | 'account';
  nonce: string;
  iat: number;
}

// 토큰 검증 함수
export async function verifyToken(token: string): Promise<string | null> {
  // 개발 모드: token이 'dev'이면 테스트 이메일 반환
  if (DEV_MODE && token === 'dev') {
    return DEV_EMAIL;
  }

  if (!token) return null;

  const db = adminDb || initializeFirebaseAdmin();
  if (!db) {
    console.error('Firebase Admin DB not initialized');
    return null;
  }

  try {
    // 1. JWT 검증
    const payload = jwt.verify(token, JWT_SECRET) as unknown as TokenPayload;

    // 2. purpose 체크
    if (payload.purpose !== 'checkout' && payload.purpose !== 'account') {
      throw new Error('Invalid purpose');
    }

    // 3. Firestore에서 사용 여부 확인
    const tokenDoc = await db.collection('ssoTokens').doc(token).get();

    if (!tokenDoc.exists) {
      // 토큰이 Firestore에 없으면 새로 생성 (첫 접근)
      await db.collection('ssoTokens').doc(token).set({
        email: payload.email,
        used: true,
        purpose: payload.purpose,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        createdAt: new Date(),
      });
      return payload.email;
    }

    const tokenData = tokenDoc.data();
    if (tokenData?.used) {
      // 이미 사용된 토큰이라도, 동일한 세션에서는 허용 (페이지 새로고침 등)
      // 만료 시간 내라면 허용
      const expiresAt = tokenData.expiresAt?.toDate?.() || new Date(tokenData.expiresAt);
      if (new Date() < expiresAt) {
        return payload.email;
      }
      throw new Error('Token already used');
    }

    // 4. 토큰 사용 처리
    await db.collection('ssoTokens').doc(token).update({ used: true });

    // 5. 이메일 반환
    return payload.email;
  } catch (error) {
    console.error('Token verification failed:', error);
    return null;
  }
}

// 토큰 생성 함수 (포탈에서 사용)
export function generateToken(email: string, purpose: 'checkout' | 'account'): string {
  const token = jwt.sign(
    {
      email,
      purpose,
      nonce: crypto.randomUUID(),
      iat: Math.floor(Date.now() / 1000),
    },
    JWT_SECRET,
    { expiresIn: '10m' }
  );

  return token;
}

// 구독 정보 조회 (email 기준 - deprecated, tenantId 사용 권장)
export async function getSubscription(email: string) {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) {
    console.error('Firebase Admin DB not initialized');
    return null;
  }

  try {
    const doc = await db.collection('subscriptions').doc(email).get();

    if (!doc.exists) {
      return null;
    }

    return doc.data();
  } catch (error) {
    console.error('Failed to get subscription:', error);
    return null;
  }
}

// 구독 정보 조회 (tenantId 기준)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getSubscriptionByTenantId(tenantId: string, email?: string): Promise<Record<string, any> | null> {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) {
    console.error('Firebase Admin DB not initialized');
    return null;
  }

  try {
    // 1. subscriptions 컬렉션에서 조회
    const doc = await db.collection('subscriptions').doc(tenantId).get();

    if (doc.exists) {
      const subscription = doc.data();

      // email이 제공된 경우 권한 확인
      if (email && subscription?.email !== email) {
        console.error('[getSubscriptionByTenantId] Unauthorized - subscription email:', subscription?.email, 'request email:', email);
        return null;
      }

      return { ...subscription, tenantId };
    }

    // 2. subscriptions 컬렉션에 없으면 tenants 컬렉션에서 조회 (폴백)
    const tenantSnapshot = await db
      .collection('tenants')
      .where('tenantId', '==', tenantId)
      .limit(1)
      .get();

    if (tenantSnapshot.empty) {
      return null;
    }

    const tenantData = tenantSnapshot.docs[0].data();

    // email이 제공된 경우 권한 확인
    if (email && tenantData.email !== email) {
      console.error('[getSubscriptionByTenantId] Unauthorized - tenant email:', tenantData.email, 'request email:', email);
      return null;
    }

    // tenants의 subscription이 없으면 null
    if (!tenantData.subscription) {
      return null;
    }

    // tenants 컬렉션의 subscription을 subscriptions 형식으로 변환
    let trialEndDate = tenantData.trialEndsAt || tenantData.subscription?.trial?.trialEndsAt;
    let startDate = tenantData.subscription.startedAt;

    // startDate를 Date 객체로 변환
    if (startDate && startDate.toDate) {
      startDate = startDate.toDate();
    } else if (startDate && startDate._seconds) {
      startDate = new Date(startDate._seconds * 1000);
    }

    // trialEndDate를 Date 객체로 변환
    if (trialEndDate && trialEndDate.toDate) {
      trialEndDate = trialEndDate.toDate();
    } else if (trialEndDate && trialEndDate._seconds) {
      trialEndDate = new Date(trialEndDate._seconds * 1000);
    }

    const subscription = {
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

    return subscription;
  } catch (error) {
    console.error('Failed to get subscription:', error);
    return null;
  }
}

// 결제 내역 조회 (email 기준 - deprecated, tenantId 사용 권장)
export async function getPaymentHistory(email: string, limit: number = 10) {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) {
    console.error('Firebase Admin DB not initialized');
    return [];
  }

  try {
    const snapshot = await db
      .collection('payments')
      .where('email', '==', email)
      .get();

    // 클라이언트에서 정렬 (인덱스 불필요)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payments: any[] = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    // createdAt 기준 내림차순 정렬
    payments.sort((a, b) => {
      const aTime = a.createdAt?.toDate?.() || new Date(a.createdAt || 0);
      const bTime = b.createdAt?.toDate?.() || new Date(b.createdAt || 0);
      return bTime.getTime() - aTime.getTime();
    });

    return payments.slice(0, limit);
  } catch (error) {
    console.error('Failed to get payment history:', error);
    return [];
  }
}

// 결제 내역 조회 (tenantId 기준)
export async function getPaymentHistoryByTenantId(tenantId: string, limit: number = 10) {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) {
    console.error('Firebase Admin DB not initialized');
    return [];
  }

  try {
    const snapshot = await db
      .collection('payments')
      .where('tenantId', '==', tenantId)
      .get();

    // 클라이언트에서 정렬 (인덱스 불필요)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payments: any[] = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    // createdAt 기준 내림차순 정렬
    payments.sort((a, b) => {
      const aTime = a.createdAt?.toDate?.() || new Date(a.createdAt || 0);
      const bTime = b.createdAt?.toDate?.() || new Date(b.createdAt || 0);
      return bTime.getTime() - aTime.getTime();
    });

    return payments.slice(0, limit);
  } catch (error) {
    console.error('Failed to get payment history:', error);
    return [];
  }
}

// 이메일로 매장 목록 조회 (배치 쿼리로 최적화)
export async function getTenantsByEmail(email: string): Promise<Array<{
  id: string;
  tenantId: string;
  brandName: string;
  subscription?: {
    plan: string;
    status: string;
  } | null;
}>> {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) {
    console.error('Firebase Admin DB not initialized');
    return [];
  }

  try {
    const tenantsSnapshot = await db
      .collection('tenants')
      .where('email', '==', email)
      .get();

    if (tenantsSnapshot.empty) {
      return [];
    }

    // 모든 tenantId 수집
    const tenantDataList = tenantsSnapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        tenantId: data.tenantId || doc.id,
        brandName: data.brandName || '이름 없음',
      };
    });

    // 구독 정보 한 번에 조회 (getAll 사용으로 N+1 문제 해결)
    const subscriptionRefs = tenantDataList.map((t) =>
      db.collection('subscriptions').doc(t.tenantId)
    );
    const subscriptionDocs = await db.getAll(...subscriptionRefs);

    // 구독 정보를 Map으로 변환
    const subscriptionMap = new Map<string, { plan: string; status: string }>();
    subscriptionDocs.forEach((doc) => {
      if (doc.exists) {
        const data = doc.data();
        subscriptionMap.set(doc.id, {
          plan: data?.plan,
          status: data?.status,
        });
      }
    });

    // 최종 결과 조합
    return tenantDataList.map((tenant) => ({
      ...tenant,
      subscription: subscriptionMap.get(tenant.tenantId) || null,
    }));
  } catch (error) {
    console.error('Failed to get tenants:', error);
    return [];
  }
}

// 매장 정보 조회 (tenantId 기준)
export async function getTenantInfo(tenantId: string): Promise<{ tenantId: string; brandName: string } | null> {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) {
    console.error('Firebase Admin DB not initialized');
    return null;
  }

  try {
    const snapshot = await db
      .collection('tenants')
      .where('tenantId', '==', tenantId)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return null;
    }

    const tenantData = snapshot.docs[0].data();
    return {
      tenantId,
      brandName: tenantData.brandName || '이름 없음',
    };
  } catch (error) {
    console.error('Failed to get tenant info:', error);
    return null;
  }
}

// 기본 플랜 데이터 (Firestore가 비어있을 때 사용)
const DEFAULT_PLANS = [
  {
    id: 'trial',
    name: 'Trial',
    price: 'Free',
    priceNumber: 0,
    tagline: '백문이 불여일견',
    description: '1개월 무료체험',
    features: [
      '1개월 무료체험',
      'AI 자동 답변',
      '업무 처리 메세지 요약 전달',
      '답변 메시지 AI 보정',
    ],
  },
  {
    id: 'basic',
    name: 'Basic',
    price: '₩39,000',
    priceNumber: 39000,
    tagline: 'CS 마스터 고용하기',
    description: '월 300건 이내',
    popular: true,
    features: [
      '월 300건 이내',
      '데이터 무제한 추가',
      'AI 자동 답변',
      '업무 처리 메세지 요약 전달',
    ],
  },
  {
    id: 'business',
    name: 'Business',
    price: '₩99,000',
    priceNumber: 99000,
    tagline: '풀타임 전담 비서 고용하기',
    description: '문의 건수 제한 없음',
    features: [
      'Basic 기능 모두 포함',
      '문의 건수 제한 없음',
      '답변 메시지 AI 보정',
      '미니맵 연동 및 활용',
      '예약 및 재고 연동',
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: '협의',
    priceNumber: 0,
    tagline: '비즈니스 확장의 든든한 동반자',
    description: '맞춤형 솔루션 제공',
    features: [
      'Business 기능 모두 포함',
      '데이터 초기 세팅 및 관리',
      '다지점/브랜드 지원',
      '맞춤형 자동화 컨설팅',
      '데이터 리포트 & 통계',
    ],
  },
];

// 플랜 목록 조회 (public - 요금제 페이지용)
export async function getPlans(): Promise<Array<{
  id: string;
  name: string;
  price: string;
  priceNumber?: number;
  tagline?: string;
  description: string;
  features: string[];
  popular?: boolean;
}>> {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) {
    console.error('Firebase Admin DB not initialized');
    return DEFAULT_PLANS;
  }

  try {
    const snapshot = await db.collection('plans')
      .where('isActive', '==', true)
      .get();

    if (snapshot.empty) {
      return DEFAULT_PLANS;
    }

    // Sort by order in memory (avoids needing composite index)
    const sortedDocs = snapshot.docs.sort((a, b) => {
      const orderA = a.data().order ?? 999;
      const orderB = b.data().order ?? 999;
      return orderA - orderB;
    });

    return sortedDocs.map(doc => {
      const data = doc.data();
      const priceNumber = data.price || 0;

      // 가격 포맷팅
      let priceStr = 'Free';
      if (doc.id === 'enterprise') {
        priceStr = '협의';
      } else if (priceNumber > 0) {
        priceStr = `₩${priceNumber.toLocaleString()}`;
      }

      return {
        id: doc.id,
        name: data.name,
        price: priceStr,
        priceNumber,
        tagline: data.tagline || '',
        description: data.description,
        features: data.features || [],
        popular: data.popular || doc.id === 'basic',
      };
    });
  } catch (error) {
    console.error('Failed to get plans:', error);
    return DEFAULT_PLANS;
  }
}

// 특정 플랜 정보 조회 (checkout, billing 등에서 사용)
export async function getPlanById(planId: string): Promise<{
  id: string;
  name: string;
  price: number;
  description: string;
  features: string[];
  refundPolicy?: string;
} | null> {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) {
    // Firestore 없을 때 기본값 반환
    const defaultPlan = DEFAULT_PLANS.find(p => p.id === planId);
    if (defaultPlan) {
      return {
        id: defaultPlan.id,
        name: defaultPlan.name,
        price: defaultPlan.priceNumber,
        description: defaultPlan.description,
        features: defaultPlan.features,
      };
    }
    return null;
  }

  try {
    const doc = await db.collection('plans').doc(planId).get();
    if (!doc.exists) {
      // Firestore에 없으면 기본값 반환
      const defaultPlan = DEFAULT_PLANS.find(p => p.id === planId);
      if (defaultPlan) {
        return {
          id: defaultPlan.id,
          name: defaultPlan.name,
          price: defaultPlan.priceNumber,
          description: defaultPlan.description,
          features: defaultPlan.features,
        };
      }
      return null;
    }

    const data = doc.data();
    return {
      id: doc.id,
      name: data?.name || planId,
      price: data?.price || 0,
      description: data?.description || '',
      features: data?.features || [],
      refundPolicy: data?.refundPolicy,
    };
  } catch (error) {
    console.error('Failed to get plan:', error);
    return null;
  }
}

// 플랜 표시 설정 조회 (public - 요금제 페이지용)
export async function getPlanSettings(): Promise<{ gridCols: number }> {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) {
    return { gridCols: 4 };
  }

  try {
    const doc = await db.collection('settings').doc('plans').get();
    if (!doc.exists) {
      return { gridCols: 4 };
    }
    const data = doc.data();
    return { gridCols: data?.gridCols || 4 };
  } catch (error) {
    console.error('Failed to get plan settings:', error);
    return { gridCols: 4 };
  }
}
