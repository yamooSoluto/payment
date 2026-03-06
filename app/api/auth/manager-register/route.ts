import { NextRequest, NextResponse } from 'next/server';
import { registerManager } from '@/lib/manager-auth';

// POST: 매니저 자체 회원가입
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { loginId, password, name, phone, agreedToTerms, phoneVerified } = body;

    if (!loginId || !password || !name || !phone) {
      return NextResponse.json({ error: 'loginId, password, name, phone required' }, { status: 400 });
    }

    if (!phoneVerified) {
      return NextResponse.json({ error: '전화번호 인증이 필요합니다.' }, { status: 400 });
    }

    if (!agreedToTerms) {
      return NextResponse.json({ error: '이용약관 및 개인정보처리방침에 동의해주세요.' }, { status: 400 });
    }

    if (loginId.includes('@')) {
      return NextResponse.json({ error: 'loginId cannot contain @' }, { status: 400 });
    }

    if (password.length < 6 || !/[!@#$%^&*(),.?":{}|<>_\-+=\[\]\\\/~\`';]/.test(password)) {
      return NextResponse.json({ error: '비밀번호는 6자 이상, 특수기호를 포함해야 합니다.' }, { status: 400 });
    }

    const manager = await registerManager({ loginId, password, name, phone });

    return NextResponse.json({
      managerId: manager.managerId,
      loginId: manager.loginId,
      name: manager.name,
      phone: manager.phone,
    }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to register';

    if (message === 'loginId already exists') {
      return NextResponse.json({ error: '이미 사용 중인 아이디입니다.' }, { status: 400 });
    }

    console.error('Manager register error:', error);
    return NextResponse.json({ error: 'Failed to register' }, { status: 500 });
  }
}
