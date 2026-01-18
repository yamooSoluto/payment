import { NextRequest, NextResponse } from 'next/server';
import { getAdminFromRequest, hasPermission } from '@/lib/admin-auth';
import { initializeFirebaseAdmin } from '@/lib/firebase-admin';

// PUT: FAQ 순서 변경
export async function PUT(request: NextRequest) {
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

    const body = await request.json();
    const { orders } = body; // [{ id: string, order: number }]

    if (!orders || !Array.isArray(orders)) {
      return NextResponse.json({ error: '순서 데이터가 필요합니다.' }, { status: 400 });
    }

    const batch = db.batch();

    for (const item of orders) {
      const docRef = db.collection('web_faq').doc(item.id);
      batch.update(docRef, {
        order: item.order,
        updatedAt: new Date(),
        updatedBy: admin.adminId,
      });
    }

    await batch.commit();

    return NextResponse.json({
      success: true,
      message: '순서가 변경되었습니다.',
    });
  } catch (error) {
    console.error('Reorder FAQ error:', error);
    return NextResponse.json(
      { error: '순서를 변경하는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
