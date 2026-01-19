import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminFromRequest, hasPermission } from '@/lib/admin-auth';

// Firestore Timestamp를 ISO 문자열로 변환
function convertTimestamps(data: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === undefined) {
      result[key] = value;
    } else if (typeof value === 'object' && value !== null) {
      if ('toDate' in value && typeof (value as { toDate: () => Date }).toDate === 'function') {
        result[key] = (value as { toDate: () => Date }).toDate().toISOString();
      } else if (Array.isArray(value)) {
        result[key] = value.map(item =>
          typeof item === 'object' && item !== null ? convertTimestamps(item as Record<string, unknown>) : item
        );
      } else {
        result[key] = convertTimestamps(value as Record<string, unknown>);
      }
    } else {
      result[key] = value;
    }
  }

  return result;
}

// GET: 어드민 메타 데이터 조회
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  try {
    const admin = await getAdminFromRequest(request);

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

    const { tenantId } = await params;

    // 어드민 메타 문서 조회
    const metaDoc = await db.collection('tenant_admin_meta').doc(tenantId).get();

    if (!metaDoc.exists) {
      // 문서가 없으면 빈 객체 반환
      return NextResponse.json({
        adminMeta: {
          tenantId,
          fields: {},
        },
      });
    }

    const metaData = metaDoc.data() || {};
    const adminMeta = convertTimestamps(metaData);

    return NextResponse.json({
      adminMeta: {
        tenantId,
        ...adminMeta,
      },
    });
  } catch (error) {
    console.error('Get admin meta error:', error);
    return NextResponse.json(
      { error: '어드민 메타 정보를 불러오는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// PUT: 어드민 메타 데이터 수정/추가
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  try {
    const admin = await getAdminFromRequest(request);

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

    const { tenantId } = await params;
    const body = await request.json();

    // fields 객체로 저장 (동적 필드 지원)
    const { fields } = body;

    if (!fields || typeof fields !== 'object') {
      return NextResponse.json({ error: 'fields 객체가 필요합니다.' }, { status: 400 });
    }

    // 메타 데이터 준비
    const updateData: Record<string, unknown> = {
      fields,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: admin.adminId,
    };

    // 문서가 없으면 생성, 있으면 업데이트
    const metaRef = db.collection('tenant_admin_meta').doc(tenantId);
    const metaDoc = await metaRef.get();

    if (metaDoc.exists) {
      await metaRef.update(updateData);
    } else {
      await metaRef.set({
        tenantId,
        createdAt: FieldValue.serverTimestamp(),
        createdBy: admin.adminId,
        ...updateData,
      });
    }

    return NextResponse.json({
      success: true,
      message: '어드민 메타 정보가 저장되었습니다.',
    });
  } catch (error) {
    console.error('Update admin meta error:', error);
    return NextResponse.json(
      { error: '어드민 메타 정보를 저장하는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// DELETE: 특정 필드 삭제
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  try {
    const admin = await getAdminFromRequest(request);

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

    const { tenantId } = await params;
    const { searchParams } = new URL(request.url);
    const fieldName = searchParams.get('field');

    if (!fieldName) {
      return NextResponse.json({ error: '삭제할 필드명이 필요합니다.' }, { status: 400 });
    }

    const metaRef = db.collection('tenant_admin_meta').doc(tenantId);
    const metaDoc = await metaRef.get();

    if (!metaDoc.exists) {
      return NextResponse.json({ error: '메타 데이터가 없습니다.' }, { status: 404 });
    }

    // 필드 삭제
    await metaRef.update({
      [`fields.${fieldName}`]: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: admin.adminId,
    });

    return NextResponse.json({
      success: true,
      message: '필드가 삭제되었습니다.',
    });
  } catch (error) {
    console.error('Delete admin meta field error:', error);
    return NextResponse.json(
      { error: '필드 삭제 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
