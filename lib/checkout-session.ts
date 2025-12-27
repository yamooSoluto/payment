import { adminDb, initializeFirebaseAdmin } from './firebase-admin';
import { cookies } from 'next/headers';

const CHECKOUT_SESSION_COOKIE = 'checkout_session';
const SESSION_EXPIRY_MINUTES = 30;

export interface CheckoutSessionData {
  id: string;
  email: string;
  plan: string;
  tenantId?: string;
  isNewTenant?: boolean;
  mode?: 'immediate'; // for upgrade
  refund?: number;
  token?: string; // SSO token
  createdAt: Date;
  expiresAt: Date;
  // 결제 성공 정보 (success 페이지용)
  status?: 'pending' | 'success' | 'failed';
  orderId?: string;
  tenantName?: string;
}

// 세션 ID 생성
function generateSessionId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = 'cs_';
  for (let i = 0; i < 24; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// 세션 생성
export async function createCheckoutSession(data: {
  email: string;
  plan: string;
  tenantId?: string;
  isNewTenant?: boolean;
  mode?: 'immediate';
  refund?: number;
  token?: string;
}): Promise<string> {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) {
    throw new Error('Database unavailable');
  }

  const sessionId = generateSessionId();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_EXPIRY_MINUTES * 60 * 1000);

  const sessionData: CheckoutSessionData = {
    id: sessionId,
    email: data.email,
    plan: data.plan,
    tenantId: data.tenantId,
    isNewTenant: data.isNewTenant,
    mode: data.mode,
    refund: data.refund,
    token: data.token,
    createdAt: now,
    expiresAt,
  };

  await db.collection('checkout_sessions').doc(sessionId).set(sessionData);

  return sessionId;
}

// 세션 조회
export async function getCheckoutSession(sessionId: string): Promise<CheckoutSessionData | null> {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) {
    return null;
  }

  const doc = await db.collection('checkout_sessions').doc(sessionId).get();
  if (!doc.exists) {
    return null;
  }

  const data = doc.data() as CheckoutSessionData;

  // 만료 확인
  const expiresAt = data.expiresAt instanceof Date
    ? data.expiresAt
    : (data.expiresAt as { toDate: () => Date }).toDate?.() || new Date(data.expiresAt as unknown as string);

  if (expiresAt < new Date()) {
    // 만료된 세션 삭제
    await db.collection('checkout_sessions').doc(sessionId).delete();
    return null;
  }

  return data;
}

// 쿠키에서 세션 ID 가져오기
export async function getSessionIdFromCookie(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(CHECKOUT_SESSION_COOKIE)?.value || null;
}

// 쿠키에 세션 ID 저장
export async function setSessionCookie(sessionId: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(CHECKOUT_SESSION_COOKIE, sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_EXPIRY_MINUTES * 60,
    path: '/',
  });
}

// 세션 쿠키 삭제
export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(CHECKOUT_SESSION_COOKIE);
}

// 세션 삭제
export async function deleteCheckoutSession(sessionId: string): Promise<void> {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) return;

  await db.collection('checkout_sessions').doc(sessionId).delete();
}

// 세션 업데이트 (결제 성공 시)
export async function updateCheckoutSession(
  sessionId: string,
  data: {
    status?: 'pending' | 'success' | 'failed';
    orderId?: string;
    tenantName?: string;
    tenantId?: string;
  }
): Promise<void> {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) return;

  await db.collection('checkout_sessions').doc(sessionId).update({
    ...data,
    updatedAt: new Date(),
  });
}

// 쿠키에서 세션 ID 가져오기 (request 객체 사용 - API Route용)
export function getSessionIdFromRequest(request: Request): string | null {
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(';').map(c => c.trim());
  const sessionCookie = cookies.find(c => c.startsWith(`${CHECKOUT_SESSION_COOKIE}=`));
  if (!sessionCookie) return null;

  return sessionCookie.split('=')[1] || null;
}
