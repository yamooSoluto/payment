import { NextRequest, NextResponse } from 'next/server';
import { getAdminFromRequest, hasPermission, hashPassword } from '@/lib/admin-auth';
import { initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { addAdminLog } from '@/lib/admin-log';

// GET: 운영진 상세 조회
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await getAdminFromRequest(request);
    const { id } = await params;

    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(admin, 'admins:read')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const db = initializeFirebaseAdmin();
    if (!db) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
    }

    const doc = await db.collection('admins').doc(id).get();
    if (!doc.exists) {
      return NextResponse.json({ error: '운영진을 찾을 수 없습니다.' }, { status: 404 });
    }

    const data = doc.data();
    return NextResponse.json({
      id: doc.id,
      username: data?.username,
      name: data?.name,
      email: data?.email,
      role: data?.role,
      createdAt: data?.createdAt?.toDate?.()?.toISOString() || null,
      lastLoginAt: data?.lastLoginAt?.toDate?.()?.toISOString() || null,
    });
  } catch (error) {
    console.error('Get admin error:', error);
    return NextResponse.json(
      { error: '운영진 정보를 불러오는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// PUT: 운영진 수정
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

    if (!hasPermission(admin, 'admins:write')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const db = initializeFirebaseAdmin();
    if (!db) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
    }

    const body = await request.json();
    const { username, name, email, role, password } = body;

    // 수정 대상 관리자 정보 확인
    const targetAdminDoc = await db.collection('admins').doc(id).get();
    if (!targetAdminDoc.exists) {
      return NextResponse.json({ error: '운영진을 찾을 수 없습니다.' }, { status: 404 });
    }

    const targetAdmin = targetAdminDoc.data();
    const currentUsername = targetAdmin?.username || targetAdmin?.loginId;

    // 소유자의 역할은 변경 불가
    if (targetAdmin?.role === 'owner' && role !== undefined && role !== 'owner') {
      return NextResponse.json(
        { error: '소유자의 역할은 변경할 수 없습니다.' },
        { status: 400 }
      );
    }

    // 소유자의 비밀번호는 본인만 변경 가능
    if (targetAdmin?.role === 'owner' && password && admin.adminId !== id) {
      return NextResponse.json(
        { error: '소유자의 비밀번호는 본인만 변경할 수 있습니다.' },
        { status: 403 }
      );
    }

    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
      updatedBy: admin.adminId,
    };

    // 아이디 변경 (중복 확인 필요)
    if (username !== undefined && username !== currentUsername) {
      // 중복 체크 (username과 loginId 둘 다 확인)
      const existingSnapshot = await db.collection('admins')
        .where('username', '==', username)
        .limit(1)
        .get();

      if (!existingSnapshot.empty) {
        return NextResponse.json(
          { error: '이미 사용 중인 아이디입니다.' },
          { status: 400 }
        );
      }
      updateData.username = username;
      updateData.loginId = username; // 호환성을 위해 둘 다 업데이트
    }

    if (name !== undefined) updateData.name = name;
    if (email !== undefined) updateData.email = email;
    // 소유자가 아닌 경우에만 역할 변경 허용
    if (role !== undefined && targetAdmin?.role !== 'owner') updateData.role = role;

    // 비밀번호 변경
    if (password) {
      updateData.passwordHash = await hashPassword(password);
    }

    await db.collection('admins').doc(id).update(updateData);

    // 비밀번호 변경 시 연결된 포탈 계정도 동기화
    if (password && targetAdmin?.portalAccountId) {
      db.collection('users_managers').doc(targetAdmin.portalAccountId).update({
        passwordHash: updateData.passwordHash,
        updatedAt: new Date(),
      }).catch(err => console.error('Portal account password sync error:', err));
    }

    // 관리자 로그 기록
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    if (username !== undefined && username !== currentUsername) {
      changes.username = { from: currentUsername, to: username };
    }
    if (name !== undefined && targetAdmin?.name !== name) {
      changes.name = { from: targetAdmin?.name || '', to: name };
    }
    if (email !== undefined && targetAdmin?.email !== email) {
      changes.email = { from: targetAdmin?.email || '', to: email };
    }
    if (role !== undefined && targetAdmin?.role !== role && targetAdmin?.role !== 'owner') {
      changes.role = { from: targetAdmin?.role || '', to: role };
    }
    if (password) {
      changes.password = { from: '********', to: '(변경됨)' };
    }

    if (Object.keys(changes).length > 0) {
      await addAdminLog(db, admin, {
        action: 'admin_update',
        targetAdminId: id,
        targetAdminName: name || targetAdmin?.name || '',
        changes,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update admin error:', error);
    return NextResponse.json(
      { error: '운영진 정보를 수정하는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// DELETE: 운영진 삭제
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await getAdminFromRequest(request);
    const { id } = await params;

    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(admin, 'admins:write')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // 자기 자신은 삭제 불가
    if (admin.adminId === id) {
      return NextResponse.json(
        { error: '자기 자신은 삭제할 수 없습니다.' },
        { status: 400 }
      );
    }

    const db = initializeFirebaseAdmin();
    if (!db) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
    }

    // 삭제 대상 관리자 정보 확인
    const targetAdminDoc = await db.collection('admins').doc(id).get();
    if (!targetAdminDoc.exists) {
      return NextResponse.json({ error: '운영진을 찾을 수 없습니다.' }, { status: 404 });
    }

    const targetAdmin = targetAdminDoc.data();

    // 소유자(owner)는 삭제 불가
    if (targetAdmin?.role === 'owner') {
      return NextResponse.json(
        { error: '소유자 계정은 삭제할 수 없습니다.' },
        { status: 400 }
      );
    }

    await db.collection('admins').doc(id).delete();

    // 관리자 로그 기록
    await addAdminLog(db, admin, {
      action: 'admin_delete',
      targetAdminId: id,
      targetAdminName: targetAdmin?.name || '',
      details: {
        deletedData: {
          username: targetAdmin?.username || '',
          name: targetAdmin?.name || '',
          email: targetAdmin?.email || '',
          role: targetAdmin?.role || '',
        },
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete admin error:', error);
    return NextResponse.json(
      { error: '운영진을 삭제하는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
