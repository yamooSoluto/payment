import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, verifyBearerToken } from '@/lib/auth';
import { createAuthSession } from '@/lib/auth-session';
import { cookies } from 'next/headers';

const AUTH_SESSION_COOKIE = 'auth_session';
const SESSION_EXPIRY_HOURS = 24;

// GET: 토큰으로 세션 생성 후 리다이렉트
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');
  const redirect = searchParams.get('redirect') || '/account';

  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  try {
    // 토큰 검증
    const email = await verifyToken(token);
    if (!email) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    // IP 주소 가져오기
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      null;

    // 세션 생성
    const sessionId = await createAuthSession({ email, token, ip: ip || undefined });

    // 쿠키 설정 후 리다이렉트
    const response = NextResponse.redirect(new URL(redirect, request.url));
    response.cookies.set(AUTH_SESSION_COOKIE, sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: SESSION_EXPIRY_HOURS * 60 * 60,
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Session creation error:', error);
    return NextResponse.redirect(new URL('/login', request.url));
  }
}

// POST: 세션 생성 (클라이언트에서 호출)
export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json();

    let email: string | null = null;

    if (token) {
      email = await verifyToken(token);
    } else {
      email = await verifyBearerToken(request.headers.get('authorization'));
    }

    if (!email) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // IP 주소 가져오기
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      null;

    // 세션 생성
    const sessionId = await createAuthSession({ email, token, ip: ip || undefined });

    // 쿠키 설정
    const cookieStore = await cookies();
    cookieStore.set(AUTH_SESSION_COOKIE, sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: SESSION_EXPIRY_HOURS * 60 * 60,
      path: '/',
    });

    return NextResponse.json({ success: true, sessionId });
  } catch (error) {
    console.error('Session creation error:', error);
    return NextResponse.json({ error: 'Session creation failed' }, { status: 500 });
  }
}

// DELETE: 로그아웃 (세션 삭제)
export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete(AUTH_SESSION_COOKIE);
  return NextResponse.json({ success: true });
}
