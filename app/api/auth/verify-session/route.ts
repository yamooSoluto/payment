import { NextResponse } from 'next/server';
import { getAuthSessionIdFromCookie, getAuthSession } from '@/lib/auth-session';
import { getManagerFromCookie } from '@/lib/manager-auth';

// GET: 세션 쿠키 유효성 검증 (마스터 auth_session + 매니저 manager_session 모두 확인)
export async function GET() {
  try {
    // 1. 마스터 세션 확인
    const sessionId = await getAuthSessionIdFromCookie();
    if (sessionId) {
      const session = await getAuthSession(sessionId);
      if (session) {
        return NextResponse.json({ valid: true, type: 'master', email: session.email });
      }
    }

    // 2. 매니저 세션 확인 (홈페이지 SSO 경유 시 설정된 쿠키)
    const managerSession = await getManagerFromCookie();
    if (managerSession) {
      return NextResponse.json({ valid: true, type: 'manager', managerId: managerSession.managerId });
    }

    return NextResponse.json({ valid: false, reason: 'no_session' });
  } catch (error) {
    console.error('Session verification error:', error);
    return NextResponse.json({ valid: false, reason: 'error' }, { status: 500 });
  }
}
