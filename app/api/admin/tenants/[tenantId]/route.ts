import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

// 관리자: 매장 수정
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
  }

  try {
    const { tenantId } = await params;
    const body = await request.json();
    const { brandName } = body;

    // 매장 존재 여부 확인
    const tenantDoc = await db.collection('tenants').doc(tenantId).get();
    if (!tenantDoc.exists) {
      return NextResponse.json({ error: '매장을 찾을 수 없습니다.' }, { status: 404 });
    }

    // 업데이트할 데이터
    const updateData: Record<string, unknown> = {
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: 'admin',
    };

    if (brandName && typeof brandName === 'string' && brandName.trim() !== '') {
      updateData.brandName = brandName.trim();
    }

    await db.collection('tenants').doc(tenantId).update(updateData);

    // subscriptions 컬렉션에도 brandName 업데이트 (존재하는 경우)
    if (updateData.brandName) {
      const subscriptionDoc = await db.collection('subscriptions').doc(tenantId).get();
      if (subscriptionDoc.exists) {
        await db.collection('subscriptions').doc(tenantId).update({
          brandName: updateData.brandName,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: '매장 정보가 수정되었습니다.',
    });
  } catch (error) {
    console.error('Failed to update tenant:', error);
    return NextResponse.json(
      { error: '매장 수정에 실패했습니다.' },
      { status: 500 }
    );
  }
}

// 관리자: 매장 삭제 (Soft Delete)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
  }

  try {
    const { tenantId } = await params;

    // 매장 존재 여부 확인
    const tenantDoc = await db.collection('tenants').doc(tenantId).get();
    if (!tenantDoc.exists) {
      return NextResponse.json({ error: '매장을 찾을 수 없습니다.' }, { status: 404 });
    }

    const tenantData = tenantDoc.data();
    if (tenantData?.deleted) {
      return NextResponse.json({ error: '이미 삭제된 매장입니다.' }, { status: 400 });
    }

    // Soft Delete 처리
    const now = new Date();
    const permanentDeleteAt = new Date(now);
    permanentDeleteAt.setDate(permanentDeleteAt.getDate() + 90); // 90일 후 영구 삭제

    await db.collection('tenants').doc(tenantId).update({
      deleted: true,
      deletedAt: now,
      deletedBy: 'admin',
      permanentDeleteAt,
      updatedAt: FieldValue.serverTimestamp(),
    });

    // 삭제 로그 기록
    await db.collection('tenant_deletions').add({
      tenantId,
      brandName: tenantData?.brandName,
      email: tenantData?.email,
      deletedAt: now,
      permanentDeleteAt,
      reason: 'admin_delete',
    });

    return NextResponse.json({
      success: true,
      message: '매장이 삭제되었습니다.',
      deletedAt: now.toISOString(),
      permanentDeleteAt: permanentDeleteAt.toISOString(),
    });
  } catch (error) {
    console.error('Failed to delete tenant:', error);
    return NextResponse.json(
      { error: '매장 삭제에 실패했습니다.' },
      { status: 500 }
    );
  }
}
