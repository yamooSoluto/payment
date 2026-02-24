import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { getAdminFromRequest, hasPermission } from '@/lib/admin-auth';
import { updateAdminPortalAccount, deleteAdminPortalAccount } from '@/lib/manager-auth';
import { addAdminLog } from '@/lib/admin-log';

// PATCH: 포탈 계정 수정 (비밀번호, 이름, active, tenants)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!hasPermission(admin, 'admins:write')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id: managerId } = await params;
    const body = await request.json();
    const { name, password, active, tenants } = body;

    await updateAdminPortalAccount(managerId, { name, password, active, tenants });

    const db = adminDb || initializeFirebaseAdmin();
    if (db) {
      const doc = await db.collection('users_managers').doc(managerId).get();
      if (doc.exists) {
        await addAdminLog(db, admin, {
          action: 'admin_update',
          targetAdminId: doc.data()!.adminId || managerId,
          targetAdminName: doc.data()!.name || managerId,
          details: {
            note: `포탈 계정 수정 (${managerId})`,
            ...(active !== undefined ? { active } : {}),
            ...(tenants !== undefined ? { tenantCount: tenants.length } : {}),
          },
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Internal server error';
    if (msg === 'Portal account not found') {
      return NextResponse.json({ error: '포탈 계정을 찾을 수 없습니다.' }, { status: 404 });
    }
    console.error('Update portal account error:', error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE: 포탈 계정 삭제
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!hasPermission(admin, 'admins:delete')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id: managerId } = await params;
    const db = adminDb || initializeFirebaseAdmin();
    if (!db) return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });

    // 삭제 전 어드민 ID 조회 (로그용)
    const doc = await db.collection('users_managers').doc(managerId).get();
    if (!doc.exists || !doc.data()!.createdByAdmin) {
      return NextResponse.json({ error: '포탈 계정을 찾을 수 없습니다.' }, { status: 404 });
    }
    const { adminId, loginId, name } = doc.data()!;
    const adminDocRef = db.collection('admins').doc(adminId);

    await deleteAdminPortalAccount(managerId, adminDocRef);

    await addAdminLog(db, admin, {
      action: 'admin_delete',
      targetAdminId: adminId,
      targetAdminName: name || managerId,
      details: {
        note: `포탈 계정 삭제: ${loginId} (${managerId})`,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete portal account error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
