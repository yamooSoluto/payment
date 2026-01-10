import { NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';

export async function POST(request: Request) {
  try {
    const { email, displayName } = await request.json();

    if (!email) {
      return NextResponse.json(
        { error: '이메일이 필요합니다.' },
        { status: 400 }
      );
    }

    const db = adminDb || initializeFirebaseAdmin();
    if (!db) {
      return NextResponse.json(
        { error: '서버 오류가 발생했습니다.' },
        { status: 500 }
      );
    }

    // 이미 users에 존재하는지 확인
    const userDoc = await db.collection('users').doc(email).get();

    if (userDoc.exists) {
      // 이미 존재하면 아무것도 안 함 (이미 가입된 사용자)
      return NextResponse.json({ success: true, existing: true });
    }

    // 기본 정보만 저장 (프로필 미완성 상태)
    const now = new Date();
    await db.collection('users').doc(email).set({
      email,
      displayName: displayName || '',
      provider: 'google',
      createdAt: now,
      updatedAt: now,
      // name, phone은 아직 없음 - 프로필 미완성 상태
    });

    return NextResponse.json({
      success: true,
      message: 'Google 사용자 기본 정보 저장 완료'
    });

  } catch (error) {
    console.error('Google 사용자 저장 오류:', error);
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
