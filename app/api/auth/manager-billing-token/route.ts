import { NextRequest, NextResponse } from 'next/server';
import { verifyManagerSession, generateManagerBillingToken } from '@/lib/manager-auth';

// POST: 마이페이지 SSO용 단기 JWT 발급 (포탈 서버 호출용)
// 포탈이 이 토큰을 받아 브라우저를 /api/auth/manager-sso?token=xxx 로 리다이렉트
// body: { sessionId }
export async function POST(request: NextRequest) {
  try {
    const { sessionId } = await request.json();

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
    }

    const session = await verifyManagerSession(sessionId);
    if (!session) {
      return NextResponse.json({ error: 'Invalid or expired session' }, { status: 401 });
    }

    const token = generateManagerBillingToken(session);
    return NextResponse.json({ token });
  } catch (error) {
    console.error('Manager billing token error:', error);
    return NextResponse.json({ error: 'Failed to generate token' }, { status: 500 });
  }
}
