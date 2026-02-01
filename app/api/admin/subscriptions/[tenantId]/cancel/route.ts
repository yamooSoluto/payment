import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { updateCurrentHistoryStatus } from '@/lib/subscription-history';
import { addAdminLog } from '@/lib/admin-log';
import { getAdminFromRequest } from '@/lib/admin-auth';
import { cancelPayment, PLAN_PRICES } from '@/lib/toss';
import { calculateRefundAmount } from '@/lib/refund';

// 구독 해지 API
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
  }

  // 관리자 인증
  const admin = await getAdminFromRequest(request);
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { tenantId } = await params;
    const body = await request.json();
    const {
      cancelMode,  // 'scheduled' | 'immediate'
      reason,      // 선택
      processRefund,  // boolean - 즉시 해지 시 환불 여부
      refundAmount: requestedRefundAmount,  // number - 환불 금액 (관리자 지정)
      refundReason,  // string - 환불 사유
    } = body;

    // 필수 필드 검증
    if (!cancelMode || !['scheduled', 'immediate'].includes(cancelMode)) {
      return NextResponse.json({ error: '해지 방식을 선택해주세요.' }, { status: 400 });
    }

    const reasonText = reason?.trim() || '';

    // 매장 존재 여부 확인
    const tenantDoc = await db.collection('tenants').doc(tenantId).get();
    if (!tenantDoc.exists) {
      return NextResponse.json({ error: '매장을 찾을 수 없습니다.' }, { status: 404 });
    }

    const tenantData = tenantDoc.data();
    if (tenantData?.deleted) {
      return NextResponse.json({ error: '삭제된 매장입니다.' }, { status: 400 });
    }

    // 기존 구독 상태 확인
    const subscriptionDoc = await db.collection('subscriptions').doc(tenantId).get();
    if (!subscriptionDoc.exists) {
      return NextResponse.json({ error: '구독 정보가 없습니다.' }, { status: 400 });
    }

    const existingSubscription = subscriptionDoc.data()!;
    const currentStatus = existingSubscription.status;

    // 이미 해지된 구독 확인
    if (currentStatus === 'canceled' || currentStatus === 'expired') {
      return NextResponse.json(
        { error: '이미 해지되었거나 만료된 구독입니다.' },
        { status: 400 }
      );
    }

    // 활성 구독만 해지 가능
    if (!['active', 'trial', 'trialing', 'pending_cancel'].includes(currentStatus)) {
      return NextResponse.json(
        { error: '활성화된 구독만 해지할 수 있습니다.' },
        { status: 400 }
      );
    }

    const now = new Date();

    if (cancelMode === 'scheduled') {
      // 예약 해지: 현재 이용기간 종료 후 해지
      const cancelAt = existingSubscription.currentPeriodEnd
        ? new Date(existingSubscription.currentPeriodEnd.toDate ? existingSubscription.currentPeriodEnd.toDate() : existingSubscription.currentPeriodEnd)
        : now;

      await db.collection('subscriptions').doc(tenantId).update({
        status: 'pending_cancel',
        previousStatus: currentStatus,
        canceledAt: now,
        cancelReason: reasonText,
        cancelMode: 'scheduled',
        cancelRequestedAt: now,
        cancelRequestedBy: 'admin',
        // pending 필드 초기화
        pendingPlan: null,
        pendingAmount: null,
        pendingMode: null,
        pendingChangeAt: null,
        // 원래 결제일 저장 (취소 시 복구용)
        previousNextBillingDate: existingSubscription.nextBillingDate || null,
        // 다음 결제일 제거 (자동 결제 방지)
        nextBillingDate: null,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: 'admin',
        updatedByAdminId: admin.adminId,
      });

      // tenants 컬렉션 업데이트
      await db.collection('tenants').doc(tenantId).update({
        'subscription.status': 'pending_cancel',
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: 'admin',
        updatedByAdminId: admin.adminId,
      });

      // subscription_history 상태 업데이트 (기존 레코드 수정)
      try {
        await updateCurrentHistoryStatus(db, tenantId, 'pending_cancel', {
          changeType: 'cancel',
          changedBy: 'admin',
          note: `관리자에 의해 해지 예약. 해지 예정일: ${cancelAt.toISOString().split('T')[0]}${reasonText ? `. 사유: ${reasonText}` : ''}`,
        });
      } catch (historyError) {
        console.error('Failed to update subscription history:', historyError);
      }

      // 관리자 로그 기록
      await addAdminLog(db, admin, {
        action: 'subscription_cancel',
        tenantId,
        userId: tenantData?.userId || null,
        brandName: tenantData?.brandName || null,
        email: tenantData?.email || null,
        details: {
          cancelMode: 'scheduled',
          previousPlan: existingSubscription.plan,
          note: reasonText || null,
        },
      });

      return NextResponse.json({
        success: true,
        message: '구독 해지가 예약되었습니다.',
        cancelMode: 'scheduled',
        cancelAt: cancelAt.toISOString(),
      });
    } else {
      // 즉시 해지
      let refundResult = null;
      let refundAmount = 0;
      let noPaymentFound = false;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let latestPayment: any = null;
      let latestPaymentId: string | null = null;

      // 환불 처리
      if (processRefund) {
        // 관리자가 금액을 지정한 경우 해당 금액 사용, 아니면 서버에서 계산
        if (requestedRefundAmount !== undefined && requestedRefundAmount >= 0) {
          refundAmount = requestedRefundAmount;
        } else {
          const currentAmount = existingSubscription.amount || PLAN_PRICES[existingSubscription.plan] || 0;
          const currentPeriodStart = existingSubscription.currentPeriodStart?.toDate?.() ||
            (existingSubscription.currentPeriodStart ? new Date(existingSubscription.currentPeriodStart) : null);
          const nextBillingDate = existingSubscription.nextBillingDate?.toDate?.() ||
            (existingSubscription.nextBillingDate ? new Date(existingSubscription.nextBillingDate) : null);

          if (currentPeriodStart && nextBillingDate && currentAmount > 0) {
            refundAmount = calculateRefundAmount(currentAmount, currentPeriodStart, nextBillingDate);
          }
        }

        // 환불 금액이 있으면 부분 취소 시도
        if (refundAmount > 0) {
          const paymentsSnapshot = await db
            .collection('payments')
            .where('tenantId', '==', tenantId)
            .where('status', '==', 'done')
            .limit(10)
            .get();

          let latestDate = new Date(0);
          paymentsSnapshot.docs.forEach((doc) => {
            const payment = doc.data();
            const createdAt = payment.createdAt?.toDate?.() || new Date(payment.createdAt);
            if (createdAt > latestDate) {
              latestDate = createdAt;
              latestPayment = payment;
              latestPaymentId = doc.id;
            }
          });

          if (!latestPayment?.paymentKey) {
            noPaymentFound = true;
          } else {
            try {
              const cancelReasonText = refundReason
                ? `관리자 즉시 해지 환불 (${refundReason})`
                : `관리자 즉시 해지 환불 (${reasonText || 'Admin requested'})`;

              refundResult = await cancelPayment(
                latestPayment.paymentKey,
                cancelReasonText,
                refundAmount
              );
              console.log('Admin immediate cancel refund result:', refundResult);
            } catch (refundError) {
              console.error('Admin immediate cancel refund failed:', refundError);
              // 환불 실패해도 취소는 진행
            }
          }
        }
      }

      // 트랜잭션으로 구독 상태 및 환불 내역 저장
      await db.runTransaction(async (transaction) => {
        // 환불 내역 저장 (성공한 경우에만)
        if (refundResult && refundAmount > 0) {
          const timestamp = Date.now();
          const refundOrderId = `CAN_${timestamp}`;
          const paymentDocId = `${refundOrderId}_${tenantId}_payment`;
          const paymentRef = db.collection('payments').doc(paymentDocId);
          transaction.set(paymentRef, {
            tenantId,
            userId: existingSubscription.userId || tenantData?.userId || '',
            email: tenantData?.email || '',
            orderId: refundOrderId,
            orderName: `YAMOO ${existingSubscription.plan} 구독 즉시 취소 환불`,
            amount: -refundAmount,
            plan: existingSubscription.plan,
            category: 'cancel',
            type: 'cancel_refund',
            transactionType: 'refund',
            initiatedBy: 'admin',
            adminId: admin.adminId,
            adminName: admin.name || null,
            status: 'done',
            cancelReason: refundReason || reasonText || 'Admin requested',
            refundReason: refundReason || reasonText || '관리자 즉시 해지',
            originalPaymentId: latestPaymentId,
            paymentKey: refundResult.paymentKey || null,
            receiptUrl: refundResult.receipt?.url || null,
            paidAt: now,
            createdAt: now,
          });
        }

        // 구독 상태를 canceled로 변경
        const subscriptionRef = db.collection('subscriptions').doc(tenantId);
        transaction.update(subscriptionRef, {
          status: 'canceled',
          canceledAt: now,
          cancelReason: reasonText,
          cancelMode: 'immediate',
          cancelRequestedAt: now,
          cancelRequestedBy: 'admin',
          currentPeriodEnd: now,  // 즉시 해지: 종료일을 현재로 설정
          // pending 필드 초기화
          pendingPlan: null,
          pendingAmount: null,
          pendingMode: null,
          pendingChangeAt: null,
          // 다음 결제일 제거
          nextBillingDate: null,
          refundAmount: refundAmount || 0,
          refundProcessed: !!refundResult,
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: 'admin',
          updatedByAdminId: admin.adminId,
        });
      });

      // tenants 컬렉션 업데이트
      await db.collection('tenants').doc(tenantId).update({
        'subscription.status': 'canceled',
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: 'admin',
        updatedByAdminId: admin.adminId,
      });

      // subscription_history 상태 업데이트 (기존 레코드 수정)
      const refundNote = refundResult
        ? `. 환불 ${refundAmount.toLocaleString()}원 처리됨`
        : noPaymentFound
          ? '. 원결제 내역 없어 환불 미처리'
          : processRefund && refundAmount > 0
            ? `. 환불 ${refundAmount.toLocaleString()}원 시도 실패`
            : '';
      try {
        await updateCurrentHistoryStatus(db, tenantId, 'canceled', {
          periodEnd: now,
          changeType: 'cancel',
          changedBy: 'admin',
          note: `관리자에 의해 즉시 해지${reasonText ? `. 사유: ${reasonText}` : ''}${refundNote}`,
        });
      } catch (historyError) {
        console.error('Failed to update subscription history:', historyError);
      }

      // 관리자 로그 기록
      await addAdminLog(db, admin, {
        action: 'subscription_cancel',
        tenantId,
        userId: tenantData?.userId || null,
        brandName: tenantData?.brandName || null,
        email: tenantData?.email || null,
        details: {
          cancelMode: 'immediate',
          previousPlan: existingSubscription.plan,
          note: reasonText || null,
          refundAmount: refundAmount || 0,
          refundProcessed: !!refundResult,
          refundReason: refundReason || null,
        },
      });

      const message = refundResult
        ? `구독이 즉시 해지되었습니다. ${refundAmount.toLocaleString()}원 환불 처리됨.`
        : noPaymentFound
          ? '구독이 즉시 해지되었습니다. 원결제 내역이 없어 환불이 처리되지 않았습니다.'
          : processRefund && refundAmount > 0
            ? '구독이 즉시 해지되었습니다. 환불 처리에 실패했습니다.'
            : '구독이 즉시 해지되었습니다.';

      return NextResponse.json({
        success: true,
        message,
        cancelMode: 'immediate',
        canceledAt: now.toISOString(),
        refundAmount: refundResult ? refundAmount : 0,
        refundProcessed: !!refundResult,
        noPaymentFound,
      });
    }
  } catch (error) {
    console.error('Failed to cancel subscription:', error);
    return NextResponse.json(
      { error: '구독 해지에 실패했습니다.' },
      { status: 500 }
    );
  }
}
