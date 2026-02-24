import { NextRequest, NextResponse } from 'next/server';
import { getAdminFromRequest, hashPassword, verifyPassword } from '@/lib/admin-auth';
import { initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { addAdminLog } from '@/lib/admin-log';

// PATCH: 본인 비밀번호 변경 (권한 불필요, 현재 비밀번호 확인 필수)
export async function PATCH(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { currentPassword, newPassword } = body;

    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: '현재 비밀번호와 새 비밀번호를 입력해주세요.' }, { status: 400 });
    }
    if (newPassword.length < 6) {
      return NextResponse.json({ error: '새 비밀번호는 6자 이상이어야 합니다.' }, { status: 400 });
    }

    const db = initializeFirebaseAdmin();
    if (!db) return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });

    const doc = await db.collection('admins').doc(admin.adminId).get();
    if (!doc.exists) return NextResponse.json({ error: '계정을 찾을 수 없습니다.' }, { status: 404 });

    const data = doc.data()!;
    const valid = verifyPassword(currentPassword, data.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: '현재 비밀번호가 올바르지 않습니다.' }, { status: 400 });
    }

    const newHash = await hashPassword(newPassword);

    // 어드민 비밀번호 업데이트
    await db.collection('admins').doc(admin.adminId).update({
      passwordHash: newHash,
      updatedAt: new Date(),
    });

    // 연결된 포탈 계정 비밀번호도 동기화
    const portalAccountId = data.portalAccountId;
    if (portalAccountId) {
      db.collection('users_managers').doc(portalAccountId).update({
        passwordHash: newHash,
        updatedAt: new Date(),
      }).catch(err => console.error('Portal account password sync error:', err));
    }

    await addAdminLog(db, admin, {
      action: 'admin_update',
      targetAdminId: admin.adminId,
      targetAdminName: admin.name || '',
      changes: { password: { from: '********', to: '(변경됨)' } },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Change password error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
