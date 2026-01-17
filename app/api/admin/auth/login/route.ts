import { NextRequest, NextResponse } from 'next/server';
import {
  findAdminByLoginId,
  verifyPassword,
  createAdminSession,
  updateLastLogin,
  SESSION_COOKIE_NAME,
} from '@/lib/admin-auth';
import { initializeFirebaseAdmin } from '@/lib/firebase-admin';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { loginId, password } = body;

    // 입력 검증
    if (!loginId || !password) {
      return NextResponse.json(
        { error: '아이디와 비밀번호를 입력해주세요.' },
        { status: 400 }
      );
    }

    // 관리자 찾기
    const admin = await findAdminByLoginId(loginId);
    if (!admin) {
      return NextResponse.json(
        { error: '아이디 또는 비밀번호가 올바르지 않습니다.' },
        { status: 401 }
      );
    }

    // 비밀번호 검증
    const isValidPassword = verifyPassword(password, admin.passwordHash);
    if (!isValidPassword) {
      return NextResponse.json(
        { error: '아이디 또는 비밀번호가 올바르지 않습니다.' },
        { status: 401 }
      );
    }

    // 'admin' 계정을 소유자(owner)로 자동 업그레이드
    let effectiveRole = admin.role;
    if (admin.loginId === 'admin' && admin.role !== 'owner') {
      const db = initializeFirebaseAdmin();
      if (db) {
        await db.collection('admins').doc(admin.id).update({
          role: 'owner',
          updatedAt: new Date(),
        });
        effectiveRole = 'owner';
      }
    }

    // 세션 생성
    const sessionToken = await createAdminSession(
      admin.id,
      admin.loginId,
      admin.name,
      effectiveRole
    );

    // 마지막 로그인 시간 업데이트
    await updateLastLogin(admin.id);

    // 응답 생성
    const response = NextResponse.json({
      success: true,
      admin: {
        id: admin.id,
        loginId: admin.loginId,
        name: admin.name,
        role: effectiveRole,
      },
    });

    // 세션 쿠키 설정 (30일)
    response.cookies.set(SESSION_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60, // 30일
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: '로그인 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
