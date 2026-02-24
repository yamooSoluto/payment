import { NextRequest, NextResponse } from 'next/server';
import {
  verifyManagerBillingToken,
  MANAGER_SESSION_COOKIE,
  MANAGER_SESSION_MAX_AGE,
} from '@/lib/manager-auth';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';

// GET: 포탈 → 홈페이지 마이페이지 SSO 진입점 (브라우저 리다이렉트)
// query: ?token=xxx
// 토큰 검증 → manager_session 쿠키 설정 → /account 리다이렉트
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');

  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  try {
    const payload = verifyManagerBillingToken(token);
    if (!payload) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    // Firestore에 새 manager_session 생성
    const db = adminDb || initializeFirebaseAdmin();
    if (!db) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    const sessionId = `ms_${Array.from({ length: 24 }, () =>
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
        .charAt(Math.floor(Math.random() * 62))
    ).join('')}`;

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    await db.collection('manager_sessions').doc(sessionId).set({
      sessionId,
      managerId: payload.managerId,
      loginId: payload.loginId,
      masterEmail: payload.masterEmail,
      tenants: payload.tenants,
      createdAt: now,
      expiresAt,
    });

    const response = NextResponse.redirect(new URL('/account', request.url));
    response.cookies.set(MANAGER_SESSION_COOKIE, sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: MANAGER_SESSION_MAX_AGE,
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Manager SSO error:', error);
    return NextResponse.redirect(new URL('/login', request.url));
  }
}
