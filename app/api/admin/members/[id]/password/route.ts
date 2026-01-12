import { NextRequest, NextResponse } from 'next/server';
import { getAdminFromRequest, hasPermission } from '@/lib/admin-auth';
import { getAdminAuth } from '@/lib/firebase-admin';

// PUT: 회원 비밀번호 변경
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await getAdminFromRequest(request);
    const { id } = await params;

    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(admin, 'members:write')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const adminAuth = getAdminAuth();
    if (!adminAuth) {
      return NextResponse.json({ error: 'Auth service unavailable' }, { status: 500 });
    }

    // URL 디코딩된 이메일
    const email = decodeURIComponent(id);

    const body = await request.json();
    const { newPassword } = body;

    if (!newPassword) {
      return NextResponse.json(
        { error: '새 비밀번호를 입력해주세요.' },
        { status: 400 }
      );
    }

    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: '비밀번호는 최소 6자 이상이어야 합니다.' },
        { status: 400 }
      );
    }

    try {
      // 이메일로 Firebase Auth 사용자 조회
      const userRecord = await adminAuth.getUserByEmail(email);

      // 비밀번호 업데이트
      await adminAuth.updateUser(userRecord.uid, {
        password: newPassword,
      });

      return NextResponse.json({ success: true });
    } catch (authError: unknown) {
      console.error('Firebase Auth password update error:', authError);

      if (authError && typeof authError === 'object' && 'code' in authError) {
        if (authError.code === 'auth/user-not-found') {
          return NextResponse.json(
            { error: '해당 이메일의 사용자를 찾을 수 없습니다.' },
            { status: 404 }
          );
        }
      }

      return NextResponse.json(
        { error: '비밀번호 변경에 실패했습니다.' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Change password error:', error);
    return NextResponse.json(
      { error: '비밀번호 변경 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
