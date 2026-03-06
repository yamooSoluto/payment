import { NextRequest, NextResponse } from 'next/server';
import { resetManagerPassword } from '@/lib/manager-auth';

// POST: 매니저 비밀번호 재설정 (loginId + 이름 + 전화번호 확인)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { loginId, name, phone, newPassword, phoneVerified } = body;

    if (!loginId || !name || !phone || !newPassword) {
      return NextResponse.json({ error: '모든 항목을 입력해주세요.' }, { status: 400 });
    }

    if (!phoneVerified) {
      return NextResponse.json({ error: '전화번호 인증이 필요합니다.' }, { status: 400 });
    }

    if (newPassword.length < 6 || !/[!@#$%^&*(),.?":{}|<>_\-+=\[\]\\\/~\`';]/.test(newPassword)) {
      return NextResponse.json({ error: '비밀번호는 6자 이상, 특수기호를 포함해야 합니다.' }, { status: 400 });
    }

    await resetManagerPassword(loginId, name, phone, newPassword);

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';

    if (message === 'No matching account') {
      return NextResponse.json({ error: '입력한 정보와 일치하는 계정을 찾을 수 없습니다.' }, { status: 404 });
    }

    console.error('Manager reset password error:', error);
    return NextResponse.json({ error: 'Failed to reset password' }, { status: 500 });
  }
}
