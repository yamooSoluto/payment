import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin, getAdminAuth } from '@/lib/firebase-admin';
import { verifyToken } from '@/lib/auth';
import { cancelPayment, PLAN_PRICES } from '@/lib/toss';
import { syncSubscriptionCancellation, syncSubscriptionExpired } from '@/lib/tenant-sync';
import { isN8NNotificationEnabled } from '@/lib/n8n';
import { FieldValue } from 'firebase-admin/firestore';

// 인증 함수: SSO 토큰 또는 Firebase Auth 토큰 검증
async function authenticateRequest(request: NextRequest, bodyToken?: string): Promise<string | null> {
  // 1. body에서 token 확인 (SSO 토큰)
  if (bodyToken) {
    const email = await verifyToken(bodyToken);
    if (email) return email;
  }

  // 2. Authorization 헤더 확인
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) {
    return null;
  }

  // Bearer 토큰인 경우 Firebase Auth로 처리
  if (authHeader.startsWith('Bearer ')) {
    const idToken = authHeader.substring(7);
    try {
      const auth = getAdminAuth();
      if (!auth) {
        console.error('Firebase Admin Auth not initialized');
        return null;
      }
      const decodedToken = await auth.verifyIdToken(idToken);
      return decodedToken.email || null;
    } catch (error) {
      console.error('Firebase Auth token verification failed:', error);
      return null;
    }
  }

  // 그 외는 SSO 토큰으로 처리
  const email = await verifyToken(authHeader);
  return email;
}

// 환불 금액 계산 함수
function calculateRefundAmount(
  currentAmount: number,
  currentPeriodStart: Date,
  nextBillingDate: Date
): number {
  const startDateOnly = new Date(currentPeriodStart);
  startDateOnly.setHours(0, 0, 0, 0);
  const nextDateOnly = new Date(nextBillingDate);
  nextDateOnly.setHours(0, 0, 0, 0);

  // 총 기간 일수
  const totalDaysInPeriod = Math.round((nextDateOnly.getTime() - startDateOnly.getTime()) / (1000 * 60 * 60 * 24));

  // 사용 일수 (오늘 포함)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const usedDays = Math.round((today.getTime() - startDateOnly.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  // 남은 일수
  const daysLeft = Math.max(0, totalDaysInPeriod - usedDays);

  // 0 나누기 방지
  if (totalDaysInPeriod <= 0) {
    return 0;
  }

  // 환불 금액: 남은 일수 비율로 계산
  return Math.round((currentAmount / totalDaysInPeriod) * daysLeft);
}

export async function POST(request: NextRequest) {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { token, tenantId, reason, mode } = body;
    // emailParam, refundAmount는 클라이언트에서 받지만 무시

    // 인증 검증
    const email = await authenticateRequest(request, token);
    if (!email) {
      return NextResponse.json({ error: 'Authentication required - valid token required' }, { status: 401 });
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

      // 환불 금액 서버에서 계산
      let refundAmount = 0;
      const currentAmount = subscription.amount || PLAN_PRICES[subscription.plan] || 0;
      const currentPeriodStart = subscription.currentPeriodStart?.toDate?.() ||
                                 (subscription.currentPeriodStart ? new Date(subscription.currentPeriodStart) : null);
      const nextBillingDate = subscription.nextBillingDate?.toDate?.() ||
                              (subscription.nextBillingDate ? new Date(subscription.nextBillingDate) : null);

      if (currentPeriodStart && nextBillingDate && currentAmount > 0) {
        refundAmount = calculateRefundAmount(currentAmount, currentPeriodStart, nextBillingDate);
      }

      // 환불 금액이 있으면 부분 취소 시도
      if (refundAmount > 0) {
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
          // 예약된 플랜 삭제
          pendingPlan: FieldValue.delete(),
          pendingAmount: FieldValue.delete(),
          pendingMode: FieldValue.delete(),
          pendingChangeAt: FieldValue.delete(),
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
        // 예약된 플랜 삭제
        pendingPlan: FieldValue.delete(),
        pendingAmount: FieldValue.delete(),
        pendingMode: FieldValue.delete(),
        pendingChangeAt: FieldValue.delete(),
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
