import { NextRequest, NextResponse } from 'next/server';
import { verifyManagerSession, deleteManagerAccount } from '@/lib/manager-auth';

// DELETE: 매니저 본인 계정 삭제 (manager_session 인증)
export async function DELETE(request: NextRequest) {
  try {
    const { sessionId } = await request.json();

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
    }

    const session = await verifyManagerSession(sessionId);
    if (!session) {
      return NextResponse.json({ error: 'Invalid or expired session' }, { status: 401 });
    }

    await deleteManagerAccount(session.managerId);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete account';
    console.error('Manager account delete error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
