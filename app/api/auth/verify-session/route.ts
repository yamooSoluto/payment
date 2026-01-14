import { NextResponse } from 'next/server';
import { getAuthSessionIdFromCookie, getAuthSession } from '@/lib/auth-session';

// GET: 세션 쿠키 유효성 검증
export async function GET() {
  try {
    const sessionId = await getAuthSessionIdFromCookie();

    if (!sessionId) {
      return NextResponse.json({ valid: false, reason: 'no_session' });
    }

    const session = await getAuthSession(sessionId);

    if (!session) {
      return NextResponse.json({ valid: false, reason: 'session_expired' });
    }

    return NextResponse.json({
      valid: true,
      email: session.email,
    });
  } catch (error) {
    console.error('Session verification error:', error);
    return NextResponse.json({ valid: false, reason: 'error' }, { status: 500 });
  }
}
