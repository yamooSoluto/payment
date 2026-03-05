import { NextRequest, NextResponse } from 'next/server';
import { acceptInvitation, verifyManagerSession } from '@/lib/manager-auth';

// POST: 초대 수락
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { inviteToken, sessionId } = body;

    if (!inviteToken) {
      return NextResponse.json({ error: 'inviteToken required' }, { status: 400 });
    }

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
    }

    // 매니저 세션 검증
    const session = await verifyManagerSession(sessionId);
    if (!session) {
      return NextResponse.json({ error: 'Invalid or expired session' }, { status: 401 });
    }

    await acceptInvitation(inviteToken, session.managerId);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to accept invitation';

    if (message === 'Invitation not found') {
      return NextResponse.json({ error: '초대를 찾을 수 없습니다.' }, { status: 404 });
    }
    if (message === 'Invitation already used') {
      return NextResponse.json({ error: '이미 사용된 초대입니다.' }, { status: 400 });
    }
    if (message === 'Invitation expired') {
      return NextResponse.json({ error: '만료된 초대입니다.' }, { status: 400 });
    }

    console.error('Accept invitation error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
