import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth-session';
import { createInvitation, getMasterTenantIds } from '@/lib/manager-auth';
import type { ManagerTenantAccess } from '@/lib/manager-auth';

// POST: 초대 토큰 생성
export async function POST(request: NextRequest) {
  const sessionId = request.cookies.get('auth_session')?.value;
  if (!sessionId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const session = await getAuthSession(sessionId);
  if (!session?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const { tenants } = body as { tenants: ManagerTenantAccess[] };

    if (!tenants || !Array.isArray(tenants) || tenants.length === 0) {
      return NextResponse.json({ error: '매장을 선택해주세요.' }, { status: 400 });
    }

    // 내 매장인지 검증
    const myTenantIds = await getMasterTenantIds(session.email);
    const allMine = tenants.every(t => myTenantIds.includes(t.tenantId));
    if (!allMine) {
      return NextResponse.json({ error: '권한이 없는 매장이 포함되어 있습니다.' }, { status: 403 });
    }

    const inviteToken = await createInvitation(session.email, tenants);
    return NextResponse.json({ inviteToken }, { status: 201 });
  } catch (error) {
    console.error('Create invitation error:', error);
    return NextResponse.json({ error: 'Failed to create invitation' }, { status: 500 });
  }
}
