import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminFromRequest, hasPermission } from '@/lib/admin-auth';

interface MetaFieldSchema {
  name: string;
  label: string;
  type: 'text' | 'number' | 'boolean' | 'select';
  options?: string[]; // for select type
  order: number;
}

// GET: 관리자 메타 필드 스키마 조회
export async function GET(request: NextRequest) {
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

    const schemaDoc = await db.collection('admin_settings').doc('tenant_meta_schema').get();

    if (!schemaDoc.exists) {
      return NextResponse.json({
        fields: [],
      });
    }

    const data = schemaDoc.data();
    return NextResponse.json({
      fields: data?.fields || [],
    });
  } catch (error) {
    console.error('Get tenant meta schema error:', error);
    return NextResponse.json(
      { error: '스키마를 불러오는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// PUT: 관리자 메타 필드 스키마 저장
export async function PUT(request: NextRequest) {
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

    const body = await request.json();
    const { fields } = body as { fields: MetaFieldSchema[] };

    if (!Array.isArray(fields)) {
      return NextResponse.json({ error: 'fields 배열이 필요합니다.' }, { status: 400 });
    }

    // 필드 유효성 검사
    for (const field of fields) {
      if (!field.name || !field.label || !field.type) {
        return NextResponse.json({ error: '모든 필드에 name, label, type이 필요합니다.' }, { status: 400 });
      }
    }

    await db.collection('admin_settings').doc('tenant_meta_schema').set({
      fields,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: admin.adminId,
    });

    return NextResponse.json({
      success: true,
      message: '스키마가 저장되었습니다.',
    });
  } catch (error) {
    console.error('Update tenant meta schema error:', error);
    return NextResponse.json(
      { error: '스키마를 저장하는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// POST: 새 필드 추가
export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const { name, label, type, options } = body as MetaFieldSchema;

    if (!name || !label || !type) {
      return NextResponse.json({ error: 'name, label, type이 필요합니다.' }, { status: 400 });
    }

    // 기존 스키마 조회
    const schemaDoc = await db.collection('admin_settings').doc('tenant_meta_schema').get();
    const existingFields: MetaFieldSchema[] = schemaDoc.exists ? (schemaDoc.data()?.fields || []) : [];

    // 중복 체크
    if (existingFields.some(f => f.name === name)) {
      return NextResponse.json({ error: '이미 존재하는 필드명입니다.' }, { status: 400 });
    }

    // 새 필드 추가
    const newField: MetaFieldSchema = {
      name,
      label,
      type,
      options: type === 'select' ? options : undefined,
      order: existingFields.length,
    };

    const updatedFields = [...existingFields, newField];

    await db.collection('admin_settings').doc('tenant_meta_schema').set({
      fields: updatedFields,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: admin.adminId,
    });

    return NextResponse.json({
      success: true,
      message: '필드가 추가되었습니다.',
      field: newField,
    });
  } catch (error) {
    console.error('Add tenant meta field error:', error);
    return NextResponse.json(
      { error: '필드를 추가하는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// DELETE: 필드 삭제
export async function DELETE(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const fieldName = searchParams.get('name');

    if (!fieldName) {
      return NextResponse.json({ error: '삭제할 필드명이 필요합니다.' }, { status: 400 });
    }

    // 기존 스키마 조회
    const schemaDoc = await db.collection('admin_settings').doc('tenant_meta_schema').get();
    if (!schemaDoc.exists) {
      return NextResponse.json({ error: '스키마가 없습니다.' }, { status: 404 });
    }

    const existingFields: MetaFieldSchema[] = schemaDoc.data()?.fields || [];
    const updatedFields = existingFields.filter(f => f.name !== fieldName);

    if (existingFields.length === updatedFields.length) {
      return NextResponse.json({ error: '해당 필드를 찾을 수 없습니다.' }, { status: 404 });
    }

    // order 재정렬
    updatedFields.forEach((f, idx) => {
      f.order = idx;
    });

    await db.collection('admin_settings').doc('tenant_meta_schema').set({
      fields: updatedFields,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: admin.adminId,
    });

    return NextResponse.json({
      success: true,
      message: '필드가 삭제되었습니다.',
    });
  } catch (error) {
    console.error('Delete tenant meta field error:', error);
    return NextResponse.json(
      { error: '필드를 삭제하는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
