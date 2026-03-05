import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth-session';
import { getMasterTenantIds, updateManagerTenantPermissions, removeManagerFromTenant } from '@/lib/manager-auth';
import type { ManagerPermissions } from '@/lib/manager-permissions';

async function getMasterEmail(request: NextRequest): Promise<string | null> {
  const sessionId = request.cookies.get('auth_session')?.value;
  if (!sessionId) return null;
  const session = await getAuthSession(sessionId);
  return session?.email || null;
}

// PATCH: 매니저 권한 수정 (내 매장만)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; tenantId: string }> }
) {
  const masterEmail = await getMasterEmail(request);
  if (!masterEmail) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id, tenantId } = await params;
    const body = await request.json();
    const { permissions } = body as { permissions: ManagerPermissions };

    // 내 매장인지 검증
    const myTenantIds = await getMasterTenantIds(masterEmail);
    if (!myTenantIds.includes(tenantId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await updateManagerTenantPermissions(id, tenantId, permissions);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update permissions';
    console.error('Update manager tenant permissions error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE: 매니저 초대 해제 (내 매장에서)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; tenantId: string }> }
) {
  const masterEmail = await getMasterEmail(request);
  if (!masterEmail) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id, tenantId } = await params;

    // 내 매장인지 검증
    const myTenantIds = await getMasterTenantIds(masterEmail);
    if (!myTenantIds.includes(tenantId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await removeManagerFromTenant(id, tenantId);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to remove manager';
    console.error('Remove manager from tenant error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
