import { NextRequest, NextResponse } from 'next/server';
import { verifyManagerSession, deleteManagerSession } from '@/lib/manager-auth';

// GET: 세션 유효성 확인 (포탈 서버 호출용)
// query: ?sessionId=ms_xxx
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get('sessionId');

  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
  }

  const session = await verifyManagerSession(sessionId);

  if (!session) {
    return NextResponse.json({ error: 'Invalid or expired session' }, { status: 401 });
  }

  return NextResponse.json({
    managerId: session.managerId,
    loginId: session.loginId,
    masterEmail: session.masterEmail,
    tenants: session.tenants,
    expiresAt: session.expiresAt.toISOString(),
  });
}

// DELETE: 매니저 로그아웃 (포탈 서버 호출용)
// body: { sessionId }
export async function DELETE(request: NextRequest) {
  try {
    const { sessionId } = await request.json();

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
    }

    await deleteManagerSession(sessionId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Manager session delete error:', error);
    return NextResponse.json({ error: 'Failed to delete session' }, { status: 500 });
  }
}
