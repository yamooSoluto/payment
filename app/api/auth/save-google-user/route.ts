import { NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { generateUniqueUserId } from '@/lib/user-utils';

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

    // 새 userId 생성
    const userId = await generateUniqueUserId(db);

    await db.collection('users').doc(email).set({
      userId,
      email,
      displayName: displayName || '',
      group: 'normal', // 회원 그룹 (기본: 일반)
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
