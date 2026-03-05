import { NextRequest, NextResponse } from 'next/server';
import { verifyManagerSession, updateManagerProfile } from '@/lib/manager-auth';

// PATCH: 매니저 본인 프로필 수정 (manager_session 인증)
export async function PATCH(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
    }

    const session = await verifyManagerSession(sessionId);
    if (!session) {
      return NextResponse.json({ error: 'Invalid or expired session' }, { status: 401 });
    }

    const body = await request.json();
    const { name, phone, password } = body;

    if (password && (password.length < 6 || !/[!@#$%^&*(),.?":{}|<>_\-+=\[\]\\\/~\`';]/.test(password))) {
      return NextResponse.json({ error: '비밀번호는 6자 이상, 특수기호를 포함해야 합니다.' }, { status: 400 });
    }

    await updateManagerProfile(session.managerId, { name, phone, password });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Manager profile update error:', error);
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
  }
}
