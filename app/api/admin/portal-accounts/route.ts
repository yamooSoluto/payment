import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { getAdminFromRequest, hasPermission } from '@/lib/admin-auth';
import { createAdminPortalAccount } from '@/lib/manager-auth';
import { addAdminLog } from '@/lib/admin-log';
import type { ManagerTenantAccess } from '@/lib/manager-auth';

// GET: 특정 어드민의 포탈 계정 조회 (?managerId=xxx)
export async function GET(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!hasPermission(admin, 'admins:read')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const managerId = searchParams.get('managerId');

    const db = adminDb || initializeFirebaseAdmin();
    if (!db) return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });

    if (managerId) {
      const doc = await db.collection('users_managers').doc(managerId).get();
      if (!doc.exists || !doc.data()!.createdByAdmin) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }
      const data = doc.data()!;
      return NextResponse.json({
        portalAccount: {
          managerId: data.managerId,
          loginId: data.loginId,
          name: data.name,
          active: data.active,
          adminId: data.adminId,
          tenants: data.tenants || [],
        },
      });
    }

    // 전체 어드민 포탈 계정 목록
    const snapshot = await db.collection('users_managers')
      .where('createdByAdmin', '==', true)
      .get();

    const accounts = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        managerId: data.managerId,
        loginId: data.loginId,
        name: data.name,
        active: data.active,
        adminId: data.adminId,
        tenantCount: (data.tenants || []).length,
      };
    });

    return NextResponse.json({ accounts });
  } catch (error) {
    console.error('Get portal accounts error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST: 포탈 계정 생성 — 비밀번호는 어드민 계정과 동일 (hash 복사)
export async function POST(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!hasPermission(admin, 'admins:write')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const db = adminDb || initializeFirebaseAdmin();
    if (!db) return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });

    const body = await request.json();
    const { targetAdminId, name, tenants } = body;

    if (!targetAdminId || !name) {
      return NextResponse.json({ error: '필수 항목을 모두 입력해주세요.' }, { status: 400 });
    }

    // 대상 어드민 확인
    const adminDocRef = db.collection('admins').doc(targetAdminId);
    const adminDoc = await adminDocRef.get();
    if (!adminDoc.exists) {
      return NextResponse.json({ error: '관리자를 찾을 수 없습니다.' }, { status: 404 });
    }

    // 이미 포탈 계정이 있는지 확인
    if (adminDoc.data()!.portalAccountId) {
      return NextResponse.json({ error: '이미 포탈 계정이 연결되어 있습니다.' }, { status: 400 });
    }

    // 어드민 username → 포탈 loginId, passwordHash → 그대로 복사
    const loginId: string = adminDoc.data()!.username || adminDoc.data()!.loginId;
    const passwordHash: string = adminDoc.data()!.passwordHash;
    if (!loginId) {
      return NextResponse.json({ error: '관리자 아이디를 찾을 수 없습니다.' }, { status: 400 });
    }
    if (!passwordHash) {
      return NextResponse.json({ error: '관리자 비밀번호 정보가 없습니다.' }, { status: 400 });
    }

    const portalAccount = await createAdminPortalAccount(targetAdminId, adminDocRef, {
      loginId,
      passwordHash,
      name,
      tenants: (tenants as ManagerTenantAccess[]) || [],
    });

    await addAdminLog(db, admin, {
      action: 'admin_create',
      targetAdminId,
      targetAdminName: adminDoc.data()!.name || targetAdminId,
      details: {
        note: `포탈 계정 생성: ${loginId} (${portalAccount.managerId})`,
        portalAccountId: portalAccount.managerId,
        loginId,
      },
    });

    return NextResponse.json({ success: true, portalAccount });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Internal server error';
    if (msg === 'loginId already exists') {
      return NextResponse.json({ error: '이미 사용 중인 아이디입니다.' }, { status: 400 });
    }
    console.error('Create portal account error:', error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
