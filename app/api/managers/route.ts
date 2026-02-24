import { NextRequest, NextResponse } from 'next/server';
import { getAuthSessionIdFromCookie, getAuthSession } from '@/lib/auth-session';
import { getManagersByMaster, createManager } from '@/lib/manager-auth';

// 마스터 인증 헬퍼
async function getMasterEmail(request: NextRequest): Promise<string | null> {
  const sessionId = request.cookies.get('auth_session')?.value;
  if (!sessionId) return null;
  const session = await getAuthSession(sessionId);
  return session?.email || null;
}

// GET: 내 매니저 목록 (마스터 인증 필요)
export async function GET(request: NextRequest) {
  const masterEmail = await getMasterEmail(request);
  if (!masterEmail) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const managers = await getManagersByMaster(masterEmail);

  // passwordHash 제외하고 반환
  return NextResponse.json(
    managers.map(m => ({
      managerId: m.managerId,
      loginId: m.loginId,
      name: m.name,
      phone: m.phone,
      slackUserId: m.slackUserId,
      active: m.active,
      tenants: m.tenants,
      createdAt: m.createdAt.toISOString(),
      updatedAt: m.updatedAt.toISOString(),
    }))
  );
}

// POST: 매니저 생성
export async function POST(request: NextRequest) {
  const masterEmail = await getMasterEmail(request);
  if (!masterEmail) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { loginId, password, name, phone, tenants } = body;

    if (!loginId || !password || !name) {
      return NextResponse.json({ error: 'loginId, password, name required' }, { status: 400 });
    }

    if (loginId.includes('@')) {
      return NextResponse.json({ error: 'loginId cannot contain @' }, { status: 400 });
    }

    const manager = await createManager(masterEmail, { loginId, password, name, phone, tenants });

    return NextResponse.json({
      managerId: manager.managerId,
      loginId: manager.loginId,
      name: manager.name,
      phone: manager.phone,
      active: manager.active,
      tenants: manager.tenants,
      createdAt: manager.createdAt.toISOString(),
      updatedAt: manager.updatedAt.toISOString(),
    }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create manager';

    if (message === 'loginId already exists') {
      return NextResponse.json({ error: '이미 사용 중인 아이디입니다.' }, { status: 400 });
    }

    console.error('Create manager error:', error);
    return NextResponse.json({ error: 'Failed to create manager' }, { status: 500 });
  }
}
