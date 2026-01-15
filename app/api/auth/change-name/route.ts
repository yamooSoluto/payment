import { NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { verifyBearerToken } from '@/lib/auth';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * 이름 변경 API
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

    const { email, newName } = await request.json();

    if (!email || !newName) {
      return NextResponse.json(
        { error: '이메일과 새 이름을 입력해주세요.' },
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

    const trimmedName = newName.trim();

    if (trimmedName.length < 2) {
      return NextResponse.json(
        { error: '이름은 2자 이상 입력해주세요.' },
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

    // users 컬렉션 업데이트
    const userDoc = await db.collection('users').doc(email).get();
    if (userDoc.exists) {
      const currentName = userDoc.data()?.name;
      await db.collection('users').doc(email).update({
        name: trimmedName,
        // 이전 이름을 previousNames 배열에 추가 (중복 자동 방지)
        ...(currentName && currentName !== trimmedName && { previousNames: FieldValue.arrayUnion(currentName) }),
        updatedAt: new Date(),
      });
    }

    // tenants 컬렉션 업데이트 (해당 이메일의 모든 테넌트)
    const tenantsSnapshot = await db.collection('tenants').where('email', '==', email).get();
    const batch = db.batch();

    tenantsSnapshot.docs.forEach((doc) => {
      batch.update(doc.ref, {
        name: trimmedName,
        updatedAt: new Date(),
      });
    });

    await batch.commit();

    return NextResponse.json({
      success: true,
      message: '이름이 변경되었습니다.',
    });

  } catch (error) {
    console.error('이름 변경 오류:', error);
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
