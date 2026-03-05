import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth-session';
import { searchManagerByLoginId } from '@/lib/manager-auth';

// GET: loginId로 매니저 검색 (초대용)
export async function GET(request: NextRequest) {
  const sessionId = request.cookies.get('auth_session')?.value;
  if (!sessionId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const session = await getAuthSession(sessionId);
  if (!session?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const loginId = searchParams.get('loginId');

  if (!loginId) {
    return NextResponse.json({ error: 'loginId required' }, { status: 400 });
  }

  const result = await searchManagerByLoginId(loginId);

  if (!result) {
    return NextResponse.json({ error: '매니저를 찾을 수 없습니다.' }, { status: 404 });
  }

  return NextResponse.json(result);
}
