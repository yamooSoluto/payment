import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { verifyToken } from '@/lib/auth';
import { cancelPayment } from '@/lib/toss';
import { syncSubscriptionCancellation, syncSubscriptionExpired } from '@/lib/tenant-sync';
import { isN8NNotificationEnabled } from '@/lib/n8n';

export async function POST(request: NextRequest) {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { token, email: emailParam, tenantId, reason, mode, refundAmount } = body;

    let email: string | null = null;

    // 토큰으로 인증 (포탈 SSO)
    if (token) {
      email = await verifyToken(token);
    }
    // 이메일로 직접 인증 (Firebase Auth)
    else if (emailParam) {
      email = emailParam;
    }

    if (!email) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId is required' }, { status: 400 });
    }

    // 구독 정보 조회 (tenantId로)
    const subscriptionDoc = await db.collection('subscriptions').doc(tenantId).get();
    if (!subscriptionDoc.exists) {
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
    }

    const subscription = subscriptionDoc.data();

    // 해당 사용자의 구독인지 확인
    if (subscription?.email !== email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    if (subscription?.status !== 'active') {
      return NextResponse.json({ error: 'No active subscription' }, { status: 400 });
    }

    const now = new Date();
    const isImmediate = mode === 'immediate';

    if (isImmediate) {
      // 즉시 취소: 환불 처리 후 즉시 만료
      let refundResult = null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let latestPayment: any = null;
      let latestPaymentId: string | null = null;

      // 환불 금액이 있으면 부분 취소 시도
      if (refundAmount && refundAmount > 0) {
        // 최근 결제 내역에서 paymentKey 조회
        const paymentsSnapshot = await db
          .collection('payments')
          .where('tenantId', '==', tenantId)
          .where('status', '==', 'done')
          .limit(10)
          .get();

        // 가장 최근 결제 찾기
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

        if (latestPayment?.paymentKey) {
          try {
            console.log('Processing immediate cancel refund:', {
              paymentKey: latestPayment.paymentKey,
              refundAmount,
            });

            refundResult = await cancelPayment(
              latestPayment.paymentKey,
              `구독 즉시 해지 환불 (${reason || 'User requested'})`,
              refundAmount
            );

            console.log('Immediate cancel refund result:', refundResult);
          } catch (refundError) {
            console.error('Immediate cancel refund failed:', refundError);
            // 환불 실패해도 취소는 진행
          }
        }
      }

      // 트랜잭션으로 구독 상태 및 환불 내역 저장
      await db.runTransaction(async (transaction) => {
        // 환불 내역 저장 (성공한 경우에만)
        if (refundResult && refundAmount && refundAmount > 0) {
          const refundDocId = `CANCEL_REFUND_${Date.now()}_${tenantId}`;
          const refundRef = db.collection('refunds').doc(refundDocId);
          transaction.set(refundRef, {
            tenantId,
            email,
            refundAmount,
            cancelReason: reason || 'User requested',
            refundedAt: now,
            tossResponse: refundResult,
          });

          // 결제 내역에도 환불 기록 추가
          const paymentDocId = `REFUND_${Date.now()}_${tenantId}`;
          const paymentRef = db.collection('payments').doc(paymentDocId);
          transaction.set(paymentRef, {
            tenantId,
            email,
            orderId: `CANCEL_REFUND_${Date.now()}_${tenantId}`,
            amount: -refundAmount,
            plan: subscription.plan,
            type: 'cancel_refund',  // 구독 해지 환불
            status: 'done',
            cancelReason: reason || 'User requested',
            refundReason: `구독 즉시 해지 (${reason || 'User requested'})`,
            originalPaymentId: latestPaymentId,  // 원결제 ID 연결
            paidAt: now,
            createdAt: now,
          });
        }

        // 구독 상태를 expired로 변경 (즉시 종료)
        const subscriptionRef = db.collection('subscriptions').doc(tenantId);
        transaction.update(subscriptionRef, {
          status: 'expired',
          canceledAt: now,
          expiredAt: now,
          currentPeriodEnd: now,  // 실제 종료일을 현재로 설정
          cancelReason: reason || 'User requested',
          cancelMode: 'immediate',
          refundAmount: refundAmount || 0,
          refundProcessed: !!refundResult,
          updatedAt: now,
        });
      });

      // tenants 컬렉션에 만료 상태 동기화
      if (typeof syncSubscriptionExpired === 'function') {
        await syncSubscriptionExpired(tenantId);
      } else {
        await syncSubscriptionCancellation(tenantId);
      }

      // n8n 웹훅 호출 (즉시 해지 알림)
      if (isN8NNotificationEnabled()) {
        try {
          await fetch(process.env.N8N_WEBHOOK_URL!, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              event: 'subscription_canceled_immediate',
              tenantId,
              email,
              plan: subscription.plan,
              reason: reason || 'User requested',
              refundAmount: refundAmount || 0,
              refundProcessed: !!refundResult,
            }),
          });
        } catch (webhookError) {
          console.error('Webhook call failed:', webhookError);
        }
      }

      return NextResponse.json({
        success: true,
        mode: 'immediate',
        refundAmount: refundResult ? refundAmount : 0,
        refundProcessed: !!refundResult,
      });
    } else {
      // 예약 취소: 기간 종료 후 취소
      await db.collection('subscriptions').doc(tenantId).update({
        status: 'canceled',
        canceledAt: now,
        cancelReason: reason || 'User requested',
        cancelMode: 'scheduled',
        updatedAt: now,
      });

      // tenants 컬렉션에 취소 상태 동기화
      await syncSubscriptionCancellation(tenantId);

      // n8n 웹훅 호출 (해지 예약 알림)
      if (isN8NNotificationEnabled()) {
        try {
          await fetch(process.env.N8N_WEBHOOK_URL!, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              event: 'subscription_canceled_scheduled',
              tenantId,
              email,
              plan: subscription.plan,
              reason: reason || 'User requested',
              effectiveDate: subscription.currentPeriodEnd,
            }),
          });
        } catch (webhookError) {
          console.error('Webhook call failed:', webhookError);
        }
      }

      return NextResponse.json({
        success: true,
        mode: 'scheduled',
      });
    }
  } catch (error) {
    console.error('Subscription cancel failed:', error);
    return NextResponse.json(
      { error: 'Failed to cancel subscription' },
      { status: 500 }
    );
  }
}
