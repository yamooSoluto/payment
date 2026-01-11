import { NextResponse } from 'next/server';
import { generateToken } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const { email, rememberMe } = await request.json();

    if (!email) {
      return NextResponse.json(
        { error: '이메일이 필요합니다.' },
        { status: 400 }
      );
    }

    // 로그인 토큰 생성
    const token = generateToken(email, 'account', rememberMe);

    return NextResponse.json({
      success: true,
      token,
    });

  } catch (error) {
    console.error('토큰 생성 오류:', error);
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
