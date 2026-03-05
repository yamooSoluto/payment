import { NextRequest, NextResponse } from 'next/server';
import { loginManager } from '@/lib/manager-auth';

// POST: 매니저 ID/PW 로그인 (포탈 서버 호출용)
export async function POST(request: NextRequest) {
  try {
    const { loginId, password } = await request.json();

    if (!loginId || !password) {
      return NextResponse.json({ error: 'loginId and password required' }, { status: 400 });
    }

    const result = await loginManager(loginId, password);

    return NextResponse.json({
      managerId: result.managerId,
      loginId: result.loginId,
      tenants: result.tenants,
      sessionId: result.sessionId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Login failed';

    if (message === 'Invalid credentials' || message === 'Account disabled') {
      return NextResponse.json({ error: message }, { status: 401 });
    }

    console.error('Manager login error:', error);
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}
