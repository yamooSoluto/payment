import { NextRequest, NextResponse } from 'next/server';
import { getAdminFromRequest, hasPermission } from '@/lib/admin-auth';
import { initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { addAdminLog } from '@/lib/admin-log';

// GET: 단일 템플릿 조회
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await getAdminFromRequest(request);

    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(admin, 'siteSettings:read')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const db = initializeFirebaseAdmin();
    if (!db) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
    }

    const { id } = await params;
    const doc = await db.collection('vector_templates').doc(id).get();

    if (!doc.exists) {
      return NextResponse.json({ error: '템플릿을 찾을 수 없습니다.' }, { status: 404 });
    }

    const data = doc.data();
    return NextResponse.json({
      template: {
        id: doc.id,
        ...data,
        createdAt: data?.createdAt?.toDate?.() || data?.createdAt,
        updatedAt: data?.updatedAt?.toDate?.() || data?.updatedAt,
      },
    });
  } catch (error) {
    console.error('Get vector template error:', error);
    return NextResponse.json(
      { error: '템플릿을 불러오는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// PUT: 템플릿 수정
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await getAdminFromRequest(request);

    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(admin, 'siteSettings:write')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const db = initializeFirebaseAdmin();
    if (!db) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
    }

    const { id } = await params;
    const body = await request.json();

    const docRef = db.collection('vector_templates').doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json({ error: '템플릿을 찾을 수 없습니다.' }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
      updatedBy: admin.adminId,
    };

    // 허용된 필드만 업데이트
    const allowedFields = [
      'categoryName', 'expectedQuestions', 'keyDataMapping', 'isActive',
      'questions', 'source', 'topic', 'itemPattern', 'facet', 'sectionId', 'category',
      'keyDataSources',
      // FAQ 응답 설정
      'answer', 'guide', 'faqTopic', 'tags',
      // 처리 방식 (Weaviate 연동)
      'handlerType', 'handler', 'rule',
    ];
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }
    // questions와 expectedQuestions 동기화
    if (body.questions) {
      updateData.expectedQuestions = body.questions;
    }

    await docRef.update(updateData);

    await addAdminLog(db, admin, {
      action: 'settings_site_update',
      details: { type: 'vector_template_update', templateId: id, updatedFields: Object.keys(updateData) },
    });

    // 브로드캐스트는 별도 버튼으로 수동 실행 (자동 실행 안함)

    return NextResponse.json({
      success: true,
      message: '템플릿이 수정되었습니다.',
    });
  } catch (error) {
    console.error('Update vector template error:', error);
    return NextResponse.json(
      { error: '템플릿을 수정하는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// DELETE: 템플릿 삭제
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await getAdminFromRequest(request);

    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(admin, 'siteSettings:write')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const db = initializeFirebaseAdmin();
    if (!db) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
    }

    const { id } = await params;
    const docRef = db.collection('vector_templates').doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json({ error: '템플릿을 찾을 수 없습니다.' }, { status: 404 });
    }

    const data = doc.data();
    await docRef.delete();

    await addAdminLog(db, admin, {
      action: 'settings_site_update',
      details: { type: 'vector_template_delete', templateId: id, category: data?.category },
    });

    return NextResponse.json({
      success: true,
      message: '템플릿이 삭제되었습니다.',
    });
  } catch (error) {
    console.error('Delete vector template error:', error);
    return NextResponse.json(
      { error: '템플릿을 삭제하는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}