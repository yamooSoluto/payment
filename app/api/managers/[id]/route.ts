import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth-session';
import { getManagerById, getMasterTenantIds } from '@/lib/manager-auth';

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
  const tenantIds = await getMasterTenantIds(masterEmail);
  const manager = await getManagerById(id, tenantIds);

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
