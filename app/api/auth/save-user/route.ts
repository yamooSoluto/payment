import { NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';

export async function POST(request: Request) {
  try {
    const { email, name, phone } = await request.json();

    if (!email || !name || !phone) {
      return NextResponse.json(
        { error: '필수 정보가 누락되었습니다.' },
        { status: 400 }
      );
    }

    // Firestore 초기화 확인
    const db = adminDb || initializeFirebaseAdmin();
    if (!db) {
      return NextResponse.json(
        { error: '서버 오류가 발생했습니다.' },
        { status: 500 }
      );
    }

    // 이메일/연락처 중복 확인 - users, tenants 둘 다 체크
    const [existingUserEmail, existingTenantEmail, existingUserPhone, existingTenantPhone] = await Promise.all([
      db.collection('users').doc(email).get(),
      db.collection('tenants').where('email', '==', email).limit(1).get(),
      db.collection('users').where('phone', '==', phone).limit(1).get(),
      db.collection('tenants').where('phone', '==', phone).limit(1).get(),
    ]);

    if (existingUserEmail.exists || !existingTenantEmail.empty) {
      return NextResponse.json(
        { error: '이미 가입된 이메일입니다.' },
        { status: 400 }
      );
    }

    if (!existingUserPhone.empty || !existingTenantPhone.empty) {
      return NextResponse.json(
        { error: '이미 가입된 연락처입니다.' },
        { status: 400 }
      );
    }

    // users 컬렉션에 저장 (tenant는 나중에 생성)
    const now = new Date();
    await db.collection('users').doc(email).set({
      email,
      name,
      phone,
      createdAt: now,
      updatedAt: now,
    });

    return NextResponse.json({
      success: true,
      message: '회원가입이 완료되었습니다.'
    });

  } catch (error) {
    console.error('사용자 정보 저장 오류:', error);
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
