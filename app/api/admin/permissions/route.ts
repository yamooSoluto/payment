import { NextRequest, NextResponse } from 'next/server';
import { getAdminFromRequest, hasPermission, PERMISSIONS, invalidatePermissionsCache } from '@/lib/admin-auth';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';

// 기본 권한 설정 (PERMISSIONS 객체 기반)
function getDefaultPermissions() {
  const permissions: Record<string, string[]> = {
    super: [],
    admin: [],
    viewer: [],
  };

  for (const [permission, roles] of Object.entries(PERMISSIONS)) {
    if (roles.includes('super')) permissions.super.push(permission);
    if (roles.includes('admin')) permissions.admin.push(permission);
    if (roles.includes('viewer')) permissions.viewer.push(permission);
  }

  return permissions;
}

// GET: 권한 설정 조회
export async function GET(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    if (!hasPermission(admin, 'admins:read')) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    const db = adminDb || initializeFirebaseAdmin();
    if (!db) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
    }

    // Firestore에서 권한 설정 조회
    const settingsDoc = await db.collection('settings').doc('role_permissions').get();

    if (settingsDoc.exists) {
      const data = settingsDoc.data();
      return NextResponse.json({
        permissions: data?.permissions || getDefaultPermissions(),
      });
    }

    // 설정이 없으면 기본값 반환
    return NextResponse.json({
      permissions: getDefaultPermissions(),
    });
  } catch (error) {
    console.error('Failed to fetch permissions:', error);
    return NextResponse.json({ error: '권한 설정 조회에 실패했습니다.' }, { status: 500 });
  }
}

// PUT: 권한 설정 수정
export async function PUT(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    // 권한 설정 수정은 super 이상만 가능
    if (!hasPermission(admin, 'admins:write')) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    const db = adminDb || initializeFirebaseAdmin();
    if (!db) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
    }

    const body = await request.json();
    const { permissions } = body;

    if (!permissions || typeof permissions !== 'object') {
      return NextResponse.json({ error: '유효하지 않은 권한 데이터입니다.' }, { status: 400 });
    }

    // 권한 데이터 검증
    const validRoles = ['super', 'admin', 'viewer'];
    for (const role of validRoles) {
      if (!Array.isArray(permissions[role])) {
        return NextResponse.json({ error: `${role} 권한이 유효하지 않습니다.` }, { status: 400 });
      }
    }

    // Firestore에 권한 설정 저장
    await db.collection('settings').doc('role_permissions').set({
      permissions,
      updatedAt: new Date(),
      updatedBy: admin.adminId,
    });

    // 캐시 무효화
    invalidatePermissionsCache();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to update permissions:', error);
    return NextResponse.json({ error: '권한 설정 수정에 실패했습니다.' }, { status: 500 });
  }
}
