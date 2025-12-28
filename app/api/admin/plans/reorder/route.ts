import { NextRequest, NextResponse } from 'next/server';
import { getAdminFromRequest, hasPermission } from '@/lib/admin-auth';
import { initializeFirebaseAdmin } from '@/lib/firebase-admin';

// PATCH: 플랜 순서 일괄 변경
export async function PATCH(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);

    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(admin, 'plans:write')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const db = initializeFirebaseAdmin();
    if (!db) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
    }

    const body = await request.json();
    const { orders } = body; // { planId: order } 형태

    if (!orders || typeof orders !== 'object') {
      return NextResponse.json(
        { error: '순서 정보가 필요합니다.' },
        { status: 400 }
      );
    }

    const batch = db.batch();
    const now = new Date();

    for (const [planId, order] of Object.entries(orders)) {
      const docRef = db.collection('plans').doc(planId);
      batch.update(docRef, {
        order: order as number,
        updatedAt: now,
        updatedBy: admin.adminId,
      });
    }

    await batch.commit();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Reorder plans error:', error);
    return NextResponse.json(
      { error: '순서를 변경하는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
