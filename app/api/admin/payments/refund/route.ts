import { NextRequest, NextResponse } from 'next/server';
import { getAdminFromRequest, hasPermission } from '@/lib/admin-auth';
import { initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { cancelPayment } from '@/lib/toss';
import { FieldValue } from 'firebase-admin/firestore';
import { syncSubscriptionExpired } from '@/lib/tenant-sync';
import { updateCurrentHistoryStatus } from '@/lib/subscription-history';

export async function POST(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);

    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(admin, 'payments:write')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const db = initializeFirebaseAdmin();
    if (!db) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
    }

    const body = await request.json();
    const {
      paymentId,       // 원본 결제 문서 ID
      paymentKey,      // Toss paymentKey
      refundAmount,    // 환불 금액
      refundReason: refundReasonInput,    // 환불 사유 (선택)
      cancelSubscription, // 구독 취소 여부
      tenantId,        // 매장 ID (구독 취소용)
    } = body;

    // 환불 사유 기본값 처리
    const refundReason = refundReasonInput || '관리자 환불 처리';

    if (!paymentId || !paymentKey || !refundAmount) {
      return NextResponse.json(
        { error: '필수 정보가 누락되었습니다.' },
        { status: 400 }
      );
    }

    // 원본 결제 정보 조회
    const paymentDoc = await db.collection('payments').doc(paymentId).get();
    if (!paymentDoc.exists) {
      return NextResponse.json(
        { error: '결제 정보를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    const paymentData = paymentDoc.data()!;
    const originalAmount = paymentData.amount || 0;

    // 이미 환불된 금액 계산
    const refundsSnapshot = await db.collection('payments')
      .where('originalPaymentId', '==', paymentId)
      .where('transactionType', '==', 'refund')
      .get();

    let totalRefunded = 0;
    refundsSnapshot.docs.forEach(doc => {
      const data = doc.data();
      totalRefunded += Math.abs(data.amount || 0);
    });

    const availableRefund = originalAmount - totalRefunded;

    if (refundAmount > availableRefund) {
      return NextResponse.json(
        { error: `환불 가능 금액(${availableRefund.toLocaleString()}원)을 초과했습니다.` },
        { status: 400 }
      );
    }

    // Toss 결제 취소 API 호출
    let tossResponse;
    try {
      tossResponse = await cancelPayment(paymentKey, refundReason, refundAmount);
    } catch (tossError) {
      console.error('Toss cancel error:', tossError);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const errorMessage = (tossError as any)?.response?.data?.message || 'Toss 환불 처리 중 오류가 발생했습니다.';
      return NextResponse.json({ error: errorMessage }, { status: 500 });
    }

    const now = new Date();
    const refundOrderId = `REF_${Date.now()}`;

    // 환불 기록 저장
    const refundDocId = `${refundOrderId}_${Date.now()}`;
    await db.collection('payments').doc(refundDocId).set({
      // 환불 정보
      transactionType: 'refund',
      category: 'refund',
      orderId: refundOrderId,
      originalPaymentId: paymentId,
      originalOrderId: paymentData.orderId,
      paymentKey: tossResponse.paymentKey,

      // 금액 (음수로 저장)
      amount: -Math.abs(refundAmount),

      // 결제 관련 정보 복사
      tenantId: paymentData.tenantId,
      email: paymentData.email,
      userId: paymentData.userId,
      plan: paymentData.plan || paymentData.planId,
      planId: paymentData.plan || paymentData.planId,

      // 환불 상세
      refundReason,
      cancelReason: refundReason,
      status: 'refunded',

      // 관리자 정보
      initiatedBy: 'admin',
      adminId: admin.adminId,
      adminName: admin.name,

      // 카드 정보
      cardInfo: paymentData.cardInfo || null,

      // 영수증
      receiptUrl: tossResponse.receipt?.url || null,

      // 타임스탬프
      refundedAt: now,
      paidAt: now,
      createdAt: now,
    });

    // 구독 즉시 해지가 요청된 경우 (subscription cancel immediate와 동일한 패턴)
    if (cancelSubscription && tenantId) {
      try {
        const subscriptionRef = db.collection('subscriptions').doc(tenantId);
        const subscriptionDoc = await subscriptionRef.get();

        if (subscriptionDoc.exists) {
          await subscriptionRef.update({
            status: 'expired',
            canceledAt: now,
            expiredAt: now,
            currentPeriodEnd: now,
            cancelReason: `환불 처리 (${refundReason})`,
            cancelMode: 'immediate',
            refundAmount: refundAmount,
            refundProcessed: true,
            // 예약된 플랜 삭제
            pendingPlan: FieldValue.delete(),
            pendingAmount: FieldValue.delete(),
            pendingMode: FieldValue.delete(),
            pendingChangeAt: FieldValue.delete(),
            updatedAt: now,
            updatedBy: admin.adminId,
          });

          // tenants 컬렉션에 만료 상태 동기화
          await syncSubscriptionExpired(tenantId);

          // subscription_history 상태 업데이트
          try {
            await updateCurrentHistoryStatus(db, tenantId, 'expired', {
              periodEnd: now,
              changedAt: now,
              changedBy: 'admin',
              changedByAdminId: admin.adminId,
              note: `관리자 환불 처리 (${refundReason})`,
            });
          } catch (historyError) {
            console.error('Failed to update subscription history:', historyError);
          }
        }
      } catch (subError) {
        console.error('Subscription cancel error:', subError);
        // 환불은 성공했으므로 구독 취소 실패는 경고만
      }
    }

    return NextResponse.json({
      success: true,
      refundId: refundDocId,
      refundAmount,
      message: '환불이 완료되었습니다.',
    });
  } catch (error) {
    console.error('Refund error:', error);
    return NextResponse.json(
      { error: '환불 처리 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
