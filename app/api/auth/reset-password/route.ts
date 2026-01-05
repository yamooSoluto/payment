import { NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin, getAdminAuth } from '@/lib/firebase-admin';

/**
 * 비밀번호 재설정 API
 * SMS 인증 완료 후 새 비밀번호를 설정합니다.
 */
export async function POST(request: Request) {
  try {
    const { email, phone, newPassword } = await request.json();

    if (!email || !phone || !newPassword) {
      return NextResponse.json(
        { error: '이메일, 전화번호, 새 비밀번호를 모두 입력해주세요.' },
        { status: 400 }
      );
    }

    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: '비밀번호는 6자 이상이어야 합니다.' },
        { status: 400 }
      );
    }

    const normalizedPhone = phone.replace(/-/g, '');

    const db = adminDb || initializeFirebaseAdmin();
    if (!db) {
      return NextResponse.json(
        { error: '서버 오류가 발생했습니다.' },
        { status: 500 }
      );
    }

    // 이메일과 전화번호가 일치하는 사용자인지 확인
    const [userDoc, tenantsSnapshot] = await Promise.all([
      db.collection('users').doc(email).get(),
      db.collection('tenants').where('email', '==', email).limit(1).get(),
    ]);

    let userPhone = '';
    if (userDoc.exists) {
      userPhone = userDoc.data()?.phone || '';
    } else if (!tenantsSnapshot.empty) {
      userPhone = tenantsSnapshot.docs[0].data()?.phone || '';
    }

    if (userPhone !== normalizedPhone) {
      return NextResponse.json(
        { error: '이메일과 전화번호가 일치하지 않습니다.' },
        { status: 400 }
      );
    }

    // Firebase Auth에서 사용자 찾기
    const auth = getAdminAuth();
    if (!auth) {
      return NextResponse.json(
        { error: '서버 오류가 발생했습니다.' },
        { status: 500 }
      );
    }

    try {
      const userRecord = await auth.getUserByEmail(email);

      // 비밀번호 업데이트
      await auth.updateUser(userRecord.uid, {
        password: newPassword,
      });

      return NextResponse.json({
        success: true,
        message: '비밀번호가 성공적으로 변경되었습니다.',
      });
    } catch (authError: unknown) {
      const error = authError as { code?: string };
      console.error('Firebase Auth 오류:', authError);

      if (error.code === 'auth/user-not-found') {
        return NextResponse.json(
          { error: '등록되지 않은 이메일입니다.' },
          { status: 400 }
        );
      }

      throw authError;
    }

  } catch (error) {
    console.error('비밀번호 재설정 오류:', error);
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
