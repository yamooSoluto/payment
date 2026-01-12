import { NextResponse, NextRequest } from 'next/server';
import { getAdminAuth, initializeFirebaseAdmin, adminDb } from '@/lib/firebase-admin';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;

/**
 * SSO API - 포털에서 넘어온 Firebase ID Token을 검증하고 세션 생성
 *
 * POST /api/auth/sso
 * Body: { idToken, redirect }
 * - idToken 검증
 * - 세션 쿠키 설정
 * - redirect URL로 리다이렉트
 */
export async function POST(request: NextRequest) {
  try {
    // Form data 또는 JSON 파싱
    const contentType = request.headers.get('content-type') || '';
    let idToken: string | null = null;
    let redirect: string = '/account';

    if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await request.formData();
      idToken = formData.get('idToken') as string;
      redirect = (formData.get('redirect') as string) || '/account';
    } else {
      const body = await request.json();
      idToken = body.idToken;
      redirect = body.redirect || '/account';
    }

    if (!idToken) {
      return NextResponse.redirect(new URL('/login?error=missing_token', request.url), 303);
    }

    if (!JWT_SECRET) {
      console.error('[SSO] JWT_SECRET not configured');
      return NextResponse.redirect(new URL('/login?error=server_error', request.url), 303);
    }

    // Firebase Admin 초기화
    initializeFirebaseAdmin();
    const auth = getAdminAuth();

    if (!auth) {
      console.error('[SSO] Firebase Admin Auth not initialized');
      return NextResponse.redirect(new URL('/login?error=server_error', request.url), 303);
    }

    // ID Token 검증
    const decodedToken = await auth.verifyIdToken(idToken);
    const { uid, email } = decodedToken;

    if (!email) {
      return NextResponse.redirect(new URL('/login?error=no_email', request.url), 303);
    }

    console.log(`[SSO] Token verified: ${email} (${uid})`);

    // 사용자의 테넌트 조회하여 Custom Claims 설정
    const db = adminDb;
    if (db) {
      const tenantsSnapshot = await db.collection('tenants')
        .where('email', '==', email.toLowerCase())
        .get();

      const allowedTenants = tenantsSnapshot.docs.map(doc => doc.id);

      if (allowedTenants.length > 0) {
        await auth.setCustomUserClaims(uid, { allowedTenants });
      }
    }

    // Custom Token 발급 (클라이언트에서 Firebase Auth 로그인용)
    const customToken = await auth.createCustomToken(uid);

    // 세션 토큰 생성 (yamoo_session 쿠키용)
    const sessionToken = jwt.sign(
      { email, role: 'user' },
      JWT_SECRET,
      { expiresIn: '5d' }
    );

    console.log(`[SSO] Session created for: ${email}`);

    // 리다이렉트 URL에 customToken 추가 (클라이언트에서 Firebase 로그인용)
    const redirectUrl = new URL(redirect, request.url);
    redirectUrl.searchParams.set('ssoToken', customToken);

    // 리다이렉트 응답 생성 (303: POST → GET 변경)
    const response = NextResponse.redirect(redirectUrl, 303);

    // 세션 쿠키 설정
    const isProduction = process.env.NODE_ENV === 'production';
    response.cookies.set('yamoo_session', sessionToken, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: isProduction,
      maxAge: 60 * 60 * 24 * 5, // 5 days
    });

    return response;

  } catch (error: unknown) {
    console.error('[SSO] Error:', error);

    const firebaseError = error as { code?: string; message?: string };

    if (firebaseError.code === 'auth/id-token-expired') {
      return NextResponse.redirect(new URL('/login?error=token_expired', request.url), 303);
    }

    if (firebaseError.code === 'auth/argument-error' || firebaseError.code === 'auth/invalid-id-token') {
      return NextResponse.redirect(new URL('/login?error=invalid_token', request.url), 303);
    }

    return NextResponse.redirect(new URL('/login?error=server_error', request.url), 303);
  }
}

// GET 요청도 지원 (기존 호환성)
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const idToken = searchParams.get('idToken');

    if (!idToken) {
      return NextResponse.json(
        { error: 'idToken이 필요합니다.' },
        { status: 400 }
      );
    }

    // Firebase Admin 초기화
    initializeFirebaseAdmin();
    const auth = getAdminAuth();

    if (!auth) {
      console.error('Firebase Admin Auth not initialized');
      return NextResponse.json(
        { error: '서버 오류가 발생했습니다.' },
        { status: 500 }
      );
    }

    // ID Token 검증
    const decodedToken = await auth.verifyIdToken(idToken);
    const { uid, email } = decodedToken;

    if (!email) {
      return NextResponse.json(
        { error: '이메일 정보가 없습니다.' },
        { status: 400 }
      );
    }

    // Custom Token 발급
    const customToken = await auth.createCustomToken(uid);

    return NextResponse.json({
      success: true,
      customToken,
      email,
    });

  } catch (error: unknown) {
    console.error('[SSO] Error:', error);

    const firebaseError = error as { code?: string; message?: string };

    if (firebaseError.code === 'auth/id-token-expired') {
      return NextResponse.json(
        { error: '토큰이 만료되었습니다.' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
