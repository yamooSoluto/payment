import { adminDb, initializeFirebaseAdmin } from './firebase-admin';
import { cookies } from 'next/headers';
import { verifyToken } from './auth';

const AUTH_SESSION_COOKIE = 'auth_session';
const SESSION_EXPIRY_HOURS = 24;

export interface AuthSessionData {
  id: string;
  email: string;
  token?: string; // SSO token (for verification)
  createdAt: Date;
  expiresAt: Date;
}

// 세션 ID 생성
function generateSessionId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = 'as_';
  for (let i = 0; i < 24; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// 세션 생성
export async function createAuthSession(data: {
  email: string;
  token?: string;
  ip?: string;
}): Promise<string> {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) {
    throw new Error('Database unavailable');
  }

  const sessionId = generateSessionId();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_EXPIRY_HOURS * 60 * 60 * 1000);

  // Firestore doesn't allow undefined values, so only include token if defined
  const sessionData = {
    id: sessionId,
    email: data.email,
    createdAt: now,
    expiresAt,
    ...(data.token && { token: data.token }),
  };

  await db.collection('auth_sessions').doc(sessionId).set(sessionData);

  // 사용자 마지막 로그인 정보 업데이트 (비동기 - 세션 생성 완료를 기다리지 않음)
  const userRef = db.collection('users').doc(data.email);
  userRef.get().then(userDoc => {
    if (userDoc.exists) {
      userRef.update({
        lastLoginAt: now,
        ...(data.ip && { lastLoginIP: data.ip }),
      }).catch(err => console.error('Failed to update last login info:', err));
    }
  }).catch(err => console.error('Failed to get user for login update:', err));

  return sessionId;
}

// 세션 조회
export async function getAuthSession(sessionId: string): Promise<AuthSessionData | null> {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) {
    return null;
  }

  const doc = await db.collection('auth_sessions').doc(sessionId).get();
  if (!doc.exists) {
    return null;
  }

  const data = doc.data() as AuthSessionData;

  // 만료 확인
  const expiresAt = data.expiresAt instanceof Date
    ? data.expiresAt
    : (data.expiresAt as { toDate: () => Date }).toDate?.() || new Date(data.expiresAt as unknown as string);

  if (expiresAt < new Date()) {
    // 만료된 세션 삭제 (비동기 - 삭제 완료를 기다리지 않음)
    db.collection('auth_sessions').doc(sessionId).delete()
      .catch(err => console.error('Failed to delete expired session:', err));
    return null;
  }

  return data;
}

// 쿠키에서 세션 ID 가져오기
export async function getAuthSessionIdFromCookie(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(AUTH_SESSION_COOKIE)?.value || null;
}

// 쿠키에 세션 ID 저장
export async function setAuthSessionCookie(sessionId: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(AUTH_SESSION_COOKIE, sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_EXPIRY_HOURS * 60 * 60,
    path: '/',
  });
}

// 세션 쿠키 삭제
export async function clearAuthSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(AUTH_SESSION_COOKIE);
}

// 세션 삭제
export async function deleteAuthSession(sessionId: string): Promise<void> {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) return;

  await db.collection('auth_sessions').doc(sessionId).delete();
}

// URL params 또는 세션에서 이메일 가져오기
// token/email params가 있으면 세션 생성 후 clean URL로 리다이렉트해야 함
export async function getAuthFromParamsOrSession(params: {
  token?: string;
  email?: string;
}): Promise<{ email: string | null; shouldRedirect: boolean; redirectUrl?: string }> {
  const { token, email: emailParam } = params;

  // 1. URL에 token이 있으면 검증 후 세션 생성
  if (token) {
    const email = await verifyToken(token);
    if (email) {
      // 세션 생성 및 쿠키 설정
      const sessionId = await createAuthSession({ email, token });
      await setAuthSessionCookie(sessionId);
      return { email, shouldRedirect: true };
    }
  }

  // 2. URL에 email이 있으면 세션 생성
  if (emailParam) {
    const sessionId = await createAuthSession({ email: emailParam });
    await setAuthSessionCookie(sessionId);
    return { email: emailParam, shouldRedirect: true };
  }

  // 3. 쿠키에서 세션 확인
  const sessionId = await getAuthSessionIdFromCookie();
  if (sessionId) {
    const session = await getAuthSession(sessionId);
    if (session) {
      return { email: session.email, shouldRedirect: false };
    }
  }

  // 4. 인증 정보 없음
  return { email: null, shouldRedirect: false };
}
