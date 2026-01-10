import { NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { verifyBearerToken } from '@/lib/auth';

/**
 * 연락처 변경 API
 * SMS 인증 완료 후 새 연락처로 변경합니다.
 * users 컬렉션과 tenants 컬렉션 모두 업데이트합니다.
 */
export async function POST(request: Request) {
  try {
    // Bearer 토큰 인증
    const authHeader = request.headers.get('authorization');
    const authenticatedEmail = await verifyBearerToken(authHeader);

    if (!authenticatedEmail) {
      return NextResponse.json(
        { error: '인증이 필요합니다.' },
        { status: 401 }
      );
    }

    const { email, newPhone } = await request.json();

    if (!email || !newPhone) {
      return NextResponse.json(
        { error: '이메일과 새 연락처를 입력해주세요.' },
        { status: 400 }
      );
    }

    // 인증된 이메일과 요청 이메일이 일치하는지 확인
    if (authenticatedEmail !== email) {
      return NextResponse.json(
        { error: '권한이 없습니다.' },
        { status: 403 }
      );
    }

    const normalizedPhone = newPhone.replace(/-/g, '');

    const db = adminDb || initializeFirebaseAdmin();
    if (!db) {
      return NextResponse.json(
        { error: '서버 오류가 발생했습니다.' },
        { status: 500 }
      );
    }

    // 새 연락처가 이미 사용 중인지 확인
    const [existingUser, existingTenant] = await Promise.all([
      db.collection('users').where('phone', '==', normalizedPhone).limit(1).get(),
      db.collection('tenants').where('phone', '==', normalizedPhone).limit(1).get(),
    ]);

    if (!existingUser.empty || !existingTenant.empty) {
      return NextResponse.json(
        { error: '이미 사용 중인 연락처입니다.' },
        { status: 400 }
      );
    }

    // users 컬렉션 업데이트
    const userDoc = await db.collection('users').doc(email).get();
    if (userDoc.exists) {
      await db.collection('users').doc(email).update({
        phone: normalizedPhone,
        updatedAt: new Date(),
      });
    }

    // tenants 컬렉션 업데이트 (해당 이메일의 모든 테넌트)
    const tenantsSnapshot = await db.collection('tenants').where('email', '==', email).get();
    const batch = db.batch();

    tenantsSnapshot.docs.forEach((doc) => {
      batch.update(doc.ref, {
        phone: normalizedPhone,
        updatedAt: new Date(),
      });
    });

    await batch.commit();

    return NextResponse.json({
      success: true,
      message: '연락처가 변경되었습니다.',
    });

  } catch (error) {
    console.error('연락처 변경 오류:', error);
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
