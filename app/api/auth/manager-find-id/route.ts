import { NextRequest, NextResponse } from 'next/server';
import { findManagerLoginId } from '@/lib/manager-auth';

// POST: 매니저 아이디 찾기 (이름 + 전화번호)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, phone, phoneVerified } = body;

    if (!name || !phone) {
      return NextResponse.json({ error: '이름과 전화번호를 입력해주세요.' }, { status: 400 });
    }

    if (!phoneVerified) {
      return NextResponse.json({ error: '전화번호 인증이 필요합니다.' }, { status: 400 });
    }

    const results = await findManagerLoginId(name, phone);

    if (!results || results.length === 0) {
      return NextResponse.json({ error: '일치하는 계정을 찾을 수 없습니다.' }, { status: 404 });
    }

    return NextResponse.json({
      accounts: results.map(r => ({ maskedLoginId: r.maskedLoginId })),
    });
  } catch (error) {
    console.error('Manager find ID error:', error);
    return NextResponse.json({ error: 'Failed to find account' }, { status: 500 });
  }
}
