import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminFromRequest, hasPermission } from '@/lib/admin-auth';

// GET: 테넌트별 관리자 필드 데이터 조회
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  try {
    const admin = await getAdminFromRequest(request);
    const { tenantId } = await params;

    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(admin, 'tenants:read')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const db = adminDb || initializeFirebaseAdmin();
    if (!db) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
    }

    // tenant_admin_fields 컬렉션에서 테넌트별 데이터 조회
    const adminFieldsDoc = await db.collection('tenant_admin_fields').doc(tenantId).get();

    if (!adminFieldsDoc.exists) {
      return NextResponse.json({
        data: {},
      });
    }

    const docData = adminFieldsDoc.data();
    // updatedAt, updatedBy 등 메타 필드 제외하고 실제 필드 데이터만 반환
    const { updatedAt, updatedBy, ...fieldData } = docData || {};

    return NextResponse.json({
      data: fieldData,
      updatedAt: updatedAt?.toDate?.()?.toISOString() || null,
      updatedBy,
    });
  } catch (error) {
    console.error('Get tenant admin fields error:', error);
    return NextResponse.json(
      { error: '관리자 필드를 불러오는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// PUT: 테넌트별 관리자 필드 데이터 저장
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  try {
    const admin = await getAdminFromRequest(request);
    const { tenantId } = await params;

    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(admin, 'tenants:write')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const db = adminDb || initializeFirebaseAdmin();
    if (!db) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
    }

    const body = await request.json();
    const { data } = body as { data: Record<string, unknown> };

    if (!data || typeof data !== 'object') {
      return NextResponse.json({ error: 'data 객체가 필요합니다.' }, { status: 400 });
    }

    // tenant_admin_fields 컬렉션에 저장 (merge 옵션으로 기존 데이터 유지)
    await db.collection('tenant_admin_fields').doc(tenantId).set(
      {
        ...data,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: admin.adminId,
      },
      { merge: true }
    );

    return NextResponse.json({
      success: true,
      message: '관리자 필드가 저장되었습니다.',
    });
  } catch (error) {
    console.error('Update tenant admin fields error:', error);
    return NextResponse.json(
      { error: '관리자 필드를 저장하는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// PATCH: 특정 필드만 업데이트
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  try {
    const admin = await getAdminFromRequest(request);
    const { tenantId } = await params;

    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(admin, 'tenants:write')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const db = adminDb || initializeFirebaseAdmin();
    if (!db) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
    }

    const body = await request.json();
    const { fieldName, value } = body as { fieldName: string; value: unknown };

    if (!fieldName) {
      return NextResponse.json({ error: 'fieldName이 필요합니다.' }, { status: 400 });
    }

    // 단일 필드만 업데이트
    await db.collection('tenant_admin_fields').doc(tenantId).set(
      {
        [fieldName]: value,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: admin.adminId,
      },
      { merge: true }
    );

    return NextResponse.json({
      success: true,
      message: '필드가 업데이트되었습니다.',
    });
  } catch (error) {
    console.error('Patch tenant admin field error:', error);
    return NextResponse.json(
      { error: '필드를 업데이트하는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
