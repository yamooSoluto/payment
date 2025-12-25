import jwt from 'jsonwebtoken';
import { adminDb, initializeFirebaseAdmin } from './firebase-admin';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const DEV_MODE = process.env.DEV_MODE === 'true';
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
    const payload = jwt.verify(token, JWT_SECRET) as TokenPayload;

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
    const doc = await db.collection('subscriptions').doc(tenantId).get();

    if (!doc.exists) {
      return null;
    }

    const subscription = doc.data();

    // email이 제공된 경우 권한 확인
    if (email && subscription?.email !== email) {
      console.error('Unauthorized access to subscription');
      return null;
    }

    return { ...subscription, tenantId };
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

// 이메일로 매장 목록 조회
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

    // 각 매장에 대한 구독 정보 병렬 조회
    const tenants = await Promise.all(
      tenantsSnapshot.docs.map(async (doc) => {
        const tenantData = doc.data();
        const tenantId = tenantData.tenantId || doc.id;

        const subscriptionDoc = await db
          .collection('subscriptions')
          .doc(tenantId)
          .get();

        const subscription = subscriptionDoc.exists
          ? subscriptionDoc.data()
          : null;

        return {
          id: doc.id,
          tenantId,
          brandName: tenantData.brandName || '이름 없음',
          subscription: subscription
            ? {
                plan: subscription.plan,
                status: subscription.status,
              }
            : null,
        };
      })
    );

    return tenants;
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
