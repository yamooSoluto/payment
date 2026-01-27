import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminFromRequest, hasPermission } from '@/lib/admin-auth';
import { addAdminLog } from '@/lib/admin-log';

// 관리자: 삭제된 매장 복구
export async function POST(
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

    // 매장 존재 여부 확인
    const tenantDoc = await db.collection('tenants').doc(tenantId).get();
    if (!tenantDoc.exists) {
      return NextResponse.json({ error: '매장을 찾을 수 없습니다.' }, { status: 404 });
    }

    const tenantData = tenantDoc.data();
    if (!tenantData?.deleted) {
      return NextResponse.json({ error: '삭제되지 않은 매장입니다.' }, { status: 400 });
    }

    const now = new Date();

    // 1. tenants 컬렉션 복구
    await db.collection('tenants').doc(tenantId).update({
      deleted: FieldValue.delete(),
      deletedAt: FieldValue.delete(),
      deletedBy: FieldValue.delete(),
      deletedByDetails: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: 'admin',
      updatedByAdminId: admin.adminId,
      restoredAt: now,
      restoredBy: admin.adminId,
    });

    // 2. tenant_deletions 문서 삭제 (아직 영구 삭제되지 않은 것만)
    const deletionDocs = await db.collection('tenant_deletions')
      .where('tenantId', '==', tenantId)
      .get();

    for (const doc of deletionDocs.docs) {
      const data = doc.data();
      // 아직 영구 삭제되지 않은 경우만 삭제
      if (!data.permanentlyDeletedAt) {
        await doc.ref.delete();
      }
    }

    // 3. 관리자 로그 기록
    // users 컬렉션에서 phone 조회
    let userPhone = tenantData?.phone || '';
    if (tenantData?.email) {
      const userDoc = await db.collection('users').doc(tenantData.email).get();
      if (userDoc.exists) {
        const userData = userDoc.data();
        if (!userPhone) userPhone = userData?.phone || '';
      }
    }

    await addAdminLog(db, admin, {
      action: 'tenant_restore',
      tenantId,
      userId: tenantData?.userId || null,
      brandName: tenantData?.brandName || null,
      email: tenantData?.email || null,
      phone: userPhone || null,
      details: {
        restoredData: {
          brandName: tenantData?.brandName || '',
          email: tenantData?.email || '',
          deletedAt: tenantData?.deletedAt,
          deletedBy: tenantData?.deletedBy,
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: '매장이 복구되었습니다.',
      restoredAt: now.toISOString(),
    });
  } catch (error) {
    console.error('Failed to restore tenant:', error);
    return NextResponse.json(
      { error: '매장 복구에 실패했습니다.' },
      { status: 500 }
    );
  }
}
