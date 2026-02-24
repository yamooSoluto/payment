import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth-session';
import { getManagerById, updateManager, deleteManager } from '@/lib/manager-auth';

// 마스터 인증 헬퍼
async function getMasterEmail(request: NextRequest): Promise<string | null> {
  const sessionId = request.cookies.get('auth_session')?.value;
  if (!sessionId) return null;
  const session = await getAuthSession(sessionId);
  return session?.email || null;
}

// GET: 매니저 상세
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const masterEmail = await getMasterEmail(request);
  if (!masterEmail) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const manager = await getManagerById(id, masterEmail);

  if (!manager) {
    return NextResponse.json({ error: 'Manager not found' }, { status: 404 });
  }

  return NextResponse.json({
    managerId: manager.managerId,
    loginId: manager.loginId,
    name: manager.name,
    phone: manager.phone,
    slackUserId: manager.slackUserId,
    active: manager.active,
    tenants: manager.tenants,
    createdAt: manager.createdAt.toISOString(),
    updatedAt: manager.updatedAt.toISOString(),
  });
}

// PATCH: 매니저 정보/권한 수정
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const masterEmail = await getMasterEmail(request);
  if (!masterEmail) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const { name, phone, password, active, tenants } = body;

    await updateManager(id, masterEmail, { name, phone, password, active, tenants });
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update manager';

    if (message === 'Manager not found') {
      return NextResponse.json({ error: 'Manager not found' }, { status: 404 });
    }
    if (message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    console.error('Update manager error:', error);
    return NextResponse.json({ error: 'Failed to update manager' }, { status: 500 });
  }
}

// DELETE: 매니저 삭제
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const masterEmail = await getMasterEmail(request);
  if (!masterEmail) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await params;
    await deleteManager(id, masterEmail);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete manager';

    if (message === 'Manager not found') {
      return NextResponse.json({ error: 'Manager not found' }, { status: 404 });
    }
    if (message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    console.error('Delete manager error:', error);
    return NextResponse.json({ error: 'Failed to delete manager' }, { status: 500 });
  }
}
