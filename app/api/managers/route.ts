import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth-session';
import { getMasterTenantIds, getManagersByTenantIds } from '@/lib/manager-auth';

async function getMasterEmail(request: NextRequest): Promise<string | null> {
  const sessionId = request.cookies.get('auth_session')?.value;
  if (!sessionId) return null;
  const session = await getAuthSession(sessionId);
  return session?.email || null;
}

// GET: 내 매장의 매니저 목록 (마스터 인증 필요)
export async function GET(request: NextRequest) {
  const masterEmail = await getMasterEmail(request);
  if (!masterEmail) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const tenantIds = await getMasterTenantIds(masterEmail);
  const managers = await getManagersByTenantIds(tenantIds);

  return NextResponse.json(
    managers.map(m => ({
      managerId: m.managerId,
      loginId: m.loginId,
      name: m.name,
      phone: m.phone,
      slackUserId: m.slackUserId,
      active: m.active,
      createdByAdmin: m.createdByAdmin || false,
      tenants: m.tenants,
      createdAt: m.createdAt.toISOString(),
      updatedAt: m.updatedAt.toISOString(),
    }))
  );
}
