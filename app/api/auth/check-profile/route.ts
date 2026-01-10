import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';

export async function POST(request: NextRequest) {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
  }

  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    // users 컬렉션에서 사용자 조회
    const userDoc = await db.collection('users').doc(email).get();

    if (!userDoc.exists) {
      // 사용자 없음 - 프로필 완성 필요
      return NextResponse.json({ needsProfile: true });
    }

    const userData = userDoc.data();

    // 이름과 연락처가 있는지 확인
    if (!userData?.name || !userData?.phone) {
      return NextResponse.json({ needsProfile: true });
    }

    // 프로필 완성됨
    return NextResponse.json({ needsProfile: false });
  } catch (error) {
    console.error('Check profile failed:', error);
    return NextResponse.json(
      { error: 'Failed to check profile' },
      { status: 500 }
    );
  }
}
