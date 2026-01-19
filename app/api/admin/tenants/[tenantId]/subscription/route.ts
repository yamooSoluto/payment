import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { updateCurrentHistoryStatus } from '@/lib/subscription-history';

// 관리자: 구독 정보 수정
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
    const { currentPeriodStart, currentPeriodEnd, nextBillingDate, status } = body;

    // 매장 존재 여부 확인
    const tenantDoc = await db.collection('tenants').doc(tenantId).get();
    if (!tenantDoc.exists) {
      return NextResponse.json({ error: '매장을 찾을 수 없습니다.' }, { status: 404 });
    }

    // subscriptions 컬렉션 업데이트
    const subscriptionRef = db.collection('subscriptions').doc(tenantId);
    const subscriptionDoc = await subscriptionRef.get();

    if (!subscriptionDoc.exists) {
      return NextResponse.json({ error: '구독 정보를 찾을 수 없습니다.' }, { status: 404 });
    }

    // 업데이트할 데이터
    const updateData: Record<string, unknown> = {
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: 'admin',
    };

    if (currentPeriodStart !== undefined) {
      updateData.currentPeriodStart = currentPeriodStart ? new Date(currentPeriodStart) : null;
    }

    if (currentPeriodEnd !== undefined) {
      updateData.currentPeriodEnd = currentPeriodEnd ? new Date(currentPeriodEnd) : null;
    }

    if (nextBillingDate !== undefined) {
      updateData.nextBillingDate = nextBillingDate ? new Date(nextBillingDate) : null;
    }

    if (status !== undefined) {
      updateData.status = status;
    }

    const existingData = subscriptionDoc.data();
    await subscriptionRef.update(updateData);

    // tenants 컬렉션에 변경사항 동기화
    const tenantUpdateData: Record<string, unknown> = {};
    if (status !== undefined) {
      tenantUpdateData['subscription.status'] = status;
      tenantUpdateData['status'] = status;
    }
    if (currentPeriodStart !== undefined) {
      tenantUpdateData['subscription.startedAt'] = currentPeriodStart ? new Date(currentPeriodStart) : null;
    }
    // renewsAt은 nextBillingDate와 매핑됨 (currentPeriodEnd 아님)
    if (nextBillingDate !== undefined) {
      tenantUpdateData['subscription.renewsAt'] = nextBillingDate ? new Date(nextBillingDate) : null;
    }

    if (Object.keys(tenantUpdateData).length > 0) {
      await db.collection('tenants').doc(tenantId).update(tenantUpdateData);
      console.log('✅ Tenant subscription synced for admin edit');
    }

    // subscription_history 상태 업데이트 (상태가 변경된 경우)
    if (status !== undefined && status !== existingData?.status) {
      try {
        await updateCurrentHistoryStatus(db, tenantId, status, {
          periodStart: currentPeriodStart ? new Date(currentPeriodStart) : undefined,
          periodEnd: currentPeriodEnd ? new Date(currentPeriodEnd) : undefined,
          note: 'Admin manual edit',
        });
        console.log('✅ Subscription history updated for admin edit');
      } catch (historyError) {
        console.error('Failed to update subscription history:', historyError);
      }
    }

    return NextResponse.json({
      success: true,
      message: '구독 정보가 수정되었습니다.',
    });
  } catch (error) {
    console.error('Failed to update subscription:', error);
    return NextResponse.json(
      { error: '구독 정보 수정에 실패했습니다.' },
      { status: 500 }
    );
  }
}
