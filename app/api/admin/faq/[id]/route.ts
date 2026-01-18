import { NextRequest, NextResponse } from 'next/server';
import { getAdminFromRequest, hasPermission } from '@/lib/admin-auth';
import { initializeFirebaseAdmin } from '@/lib/firebase-admin';

// PUT: FAQ 수정
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await getAdminFromRequest(request);

    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(admin, 'settings:write')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const db = initializeFirebaseAdmin();
    if (!db) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
    }

    const { id } = await params;
    const body = await request.json();
    const { question, answer, category, subcategory, order, visible } = body;

    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
      updatedBy: admin.adminId,
    };

    if (question !== undefined) updateData.question = question;
    if (answer !== undefined) updateData.answer = answer;
    if (category !== undefined) updateData.category = category;
    if (subcategory !== undefined) updateData.subcategory = subcategory;
    if (order !== undefined) updateData.order = order;
    if (visible !== undefined) updateData.visible = visible;

    await db.collection('web_faq').doc(id).update(updateData);

    return NextResponse.json({
      success: true,
      message: 'FAQ가 수정되었습니다.',
    });
  } catch (error) {
    console.error('Update FAQ error:', error);
    return NextResponse.json(
      { error: 'FAQ를 수정하는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// DELETE: FAQ 삭제
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await getAdminFromRequest(request);

    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(admin, 'settings:write')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const db = initializeFirebaseAdmin();
    if (!db) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
    }

    const { id } = await params;
    await db.collection('web_faq').doc(id).delete();

    return NextResponse.json({
      success: true,
      message: 'FAQ가 삭제되었습니다.',
    });
  } catch (error) {
    console.error('Delete FAQ error:', error);
    return NextResponse.json(
      { error: 'FAQ를 삭제하는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
