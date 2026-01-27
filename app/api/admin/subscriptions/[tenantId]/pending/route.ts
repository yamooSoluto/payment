import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

// 예약 취소 API
// - pendingPlan 취소: pendingPlan, pendingAmount, pendingChangeAt 초기화
// - pending_cancel 취소: status를 이전 상태로 복구, cancelAt 초기화
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
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type'); // 'plan' | 'cancel'

    if (!type || !['plan', 'cancel'].includes(type)) {
      return NextResponse.json(
        { error: '취소 유형을 지정해주세요. (type=plan 또는 type=cancel)' },
        { status: 400 }
      );
    }

    // 매장 존재 여부 확인
    const tenantDoc = await db.collection('tenants').doc(tenantId).get();
    if (!tenantDoc.exists) {
      return NextResponse.json({ error: '매장을 찾을 수 없습니다.' }, { status: 404 });
    }

    const tenantData = tenantDoc.data();
    if (tenantData?.deleted) {
      return NextResponse.json({ error: '삭제된 매장입니다.' }, { status: 400 });
    }

    // 구독 정보 확인
    const subscriptionDoc = await db.collection('subscriptions').doc(tenantId).get();
    if (!subscriptionDoc.exists) {
      return NextResponse.json({ error: '구독 정보가 없습니다.' }, { status: 400 });
    }

    const subscription = subscriptionDoc.data()!;

    if (type === 'plan') {
      // 플랜 변경 예약 취소
      if (!subscription.pendingPlan) {
        return NextResponse.json(
          { error: '예약된 플랜 변경이 없습니다.' },
          { status: 400 }
        );
      }

      await db.collection('subscriptions').doc(tenantId).update({
        pendingPlan: null,
        pendingAmount: null,
        pendingMode: null,
        pendingChangeAt: null,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: 'admin',
      });

      return NextResponse.json({
        success: true,
        message: '플랜 변경 예약이 취소되었습니다.',
        canceledPlan: subscription.pendingPlan,
      });
    } else {
      // 해지 예약 취소 (pending_cancel → active 복구)
      if (subscription.status !== 'pending_cancel') {
        return NextResponse.json(
          { error: '해지 예약 상태가 아닙니다.' },
          { status: 400 }
        );
      }

      // active로 복구 (trial이었으면 trial로)
      const restoredStatus = subscription.plan === 'trial' ? 'trial' : 'active';

      // nextBillingDate 복구 (Timestamp → Date 변환)
      let restoredNextBillingDate = null;
      if (subscription.previousNextBillingDate) {
        restoredNextBillingDate = subscription.previousNextBillingDate.toDate
          ? subscription.previousNextBillingDate.toDate()
          : new Date(subscription.previousNextBillingDate);
      }

      await db.collection('subscriptions').doc(tenantId).update({
        status: restoredStatus,
        cancelAt: null,
        cancelMode: null,
        cancelReason: null,
        cancelRequestedAt: null,
        cancelRequestedBy: null,
        // nextBillingDate 복구
        nextBillingDate: restoredNextBillingDate,
        previousNextBillingDate: null,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: 'admin',
      });

      // tenants 컬렉션도 업데이트
      await db.collection('tenants').doc(tenantId).update({
        'subscription.status': restoredStatus,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: 'admin',
      });

      return NextResponse.json({
        success: true,
        message: '해지 예약이 취소되었습니다. 구독이 복구되었습니다.',
        restoredStatus,
        restoredNextBillingDate: restoredNextBillingDate
          ? restoredNextBillingDate.toISOString()
          : null,
      });
    }
  } catch (error) {
    console.error('Failed to cancel pending:', error);
    return NextResponse.json(
      { error: '예약 취소에 실패했습니다.' },
      { status: 500 }
    );
  }
}
