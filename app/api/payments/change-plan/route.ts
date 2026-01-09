import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { payWithBillingKey, cancelPayment, getPlanName } from '@/lib/toss';
import { syncPlanChange } from '@/lib/tenant-sync';

export async function POST(request: NextRequest) {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { email, tenantId, newPlan, newAmount, creditAmount, proratedNewAmount } = body;

    if (!email || !tenantId || !newPlan || newAmount === undefined) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // 구독 정보 조회
    const subscriptionDoc = await db.collection('subscriptions').doc(tenantId).get();
    if (!subscriptionDoc.exists) {
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
    }

    const subscription = subscriptionDoc.data();

    // 권한 확인
    if (subscription?.email !== email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    if (!subscription?.billingKey) {
      return NextResponse.json({ error: 'Billing key not found' }, { status: 400 });
    }

    if (subscription.status !== 'active') {
      return NextResponse.json({ error: 'No active subscription' }, { status: 400 });
    }

    const previousPlan = subscription.plan;
    const previousAmount = subscription.amount;
    const now = new Date();
    const timestamp = Date.now();

    console.log('Processing plan change:', {
      tenantId,
      previousPlan,
      newPlan,
      creditAmount,
      proratedNewAmount,
    });

    // 1. 기존 결제에서 미사용분 부분 환불
    let refundResult = null;
    let originalPaymentId = null;
    const refundOrderId = `REFUND_${timestamp}_${tenantId}`;

    if (creditAmount && creditAmount > 0) {
      // 가장 최근 결제 내역 조회
      const paymentsSnapshot = await db
        .collection('payments')
        .where('tenantId', '==', tenantId)
        .where('status', '==', 'done')
        .orderBy('createdAt', 'desc')
        .limit(1)
        .get();

      if (!paymentsSnapshot.empty) {
        const lastPaymentDoc = paymentsSnapshot.docs[0];
        const lastPayment = lastPaymentDoc.data();
        originalPaymentId = lastPaymentDoc.id;

        // 부분 환불 시도
        if (lastPayment.paymentKey) {
          try {
            refundResult = await cancelPayment(
              lastPayment.paymentKey,
              `플랜 변경: ${getPlanName(previousPlan)} → ${getPlanName(newPlan)} (미사용분 환불)`,
              creditAmount
            );
            console.log('Refund processed:', refundResult);
          } catch (refundError) {
            console.error('Refund failed:', refundError);
            // 환불 실패 시 에러 반환 (결제 진행하지 않음)
            return NextResponse.json({
              error: '기존 플랜 환불 처리에 실패했습니다. 잠시 후 다시 시도해주세요.'
            }, { status: 500 });
          }
        }
      }
    }

    // 2. 새 플랜 결제 (일할계산)
    let paymentResponse = null;
    const paymentOrderId = `${newPlan.toUpperCase()}_${timestamp}_${tenantId}`;

    if (proratedNewAmount && proratedNewAmount > 0) {
      const orderName = `YAMOO ${getPlanName(newPlan)} 플랜`;

      try {
        paymentResponse = await payWithBillingKey(
          subscription.billingKey,
          email,
          proratedNewAmount,
          paymentOrderId,
          orderName,
          email
        );
        console.log('New plan payment completed:', paymentResponse.status);
      } catch (paymentError) {
        console.error('New plan payment failed:', paymentError);
        // 결제 실패 시 에러 반환 (환불은 이미 처리됨 - 관리자 수동 처리 필요)
        return NextResponse.json({
          error: '새 플랜 결제에 실패했습니다. 고객센터에 문의해주세요.',
          refundProcessed: !!refundResult,
          refundAmount: creditAmount,
        }, { status: 500 });
      }
    }

    // 3. 트랜잭션으로 데이터 업데이트
    await db.runTransaction(async (transaction) => {
      // 환불 내역 저장 (기존 플랜)
      if (creditAmount && creditAmount > 0 && refundResult) {
        const refundDocId = `${refundOrderId}_${Date.now()}`;
        const refundRef = db.collection('payments').doc(refundDocId);
        transaction.set(refundRef, {
          tenantId,
          email,
          orderId: refundOrderId,
          paymentKey: refundResult.paymentKey || null,
          amount: -creditAmount, // 음수로 저장 (환불)
          plan: previousPlan,
          type: 'plan_change_refund',
          previousPlan,
          newPlan,
          status: 'refunded',
          refundAmount: creditAmount,
          refundReason: `${getPlanName(previousPlan)} → ${getPlanName(newPlan)} 플랜 변경 (미사용분)`,
          originalPaymentId,
          paidAt: now,
          createdAt: now,
        });

        // 원결제 문서에 환불 정보 업데이트
        if (originalPaymentId) {
          const originalPaymentRef = db.collection('payments').doc(originalPaymentId);
          const originalPaymentDoc = await transaction.get(originalPaymentRef);
          if (originalPaymentDoc.exists) {
            const existingRefunded = originalPaymentDoc.data()?.refundedAmount || 0;
            transaction.update(originalPaymentRef, {
              refundedAmount: existingRefunded + creditAmount,
              lastRefundAt: now,
              lastRefundReason: `${getPlanName(previousPlan)} → ${getPlanName(newPlan)} 플랜 변경`,
              updatedAt: now,
            });
          }
        }
      }

      // 새 플랜 결제 내역 저장
      if (proratedNewAmount && proratedNewAmount > 0 && paymentResponse) {
        const paymentDocId = `${paymentOrderId}_${Date.now()}`;
        const paymentRef = db.collection('payments').doc(paymentDocId);
        transaction.set(paymentRef, {
          tenantId,
          email,
          orderId: paymentOrderId,
          paymentKey: paymentResponse.paymentKey,
          amount: proratedNewAmount,
          plan: newPlan,
          type: 'plan_change',
          previousPlan,
          status: 'done',
          method: paymentResponse.method,
          cardInfo: paymentResponse.card || null,
          receiptUrl: paymentResponse.receipt?.url || null,
          paidAt: now,
          createdAt: now,
        });
      }

      // 구독 정보 업데이트
      const subscriptionRef = db.collection('subscriptions').doc(tenantId);
      transaction.update(subscriptionRef, {
        plan: newPlan,
        amount: newAmount,
        previousPlan,
        previousAmount,
        planChangedAt: now,
        updatedAt: now,
        pendingPlan: null,
        pendingAmount: null,
        pendingMode: null,
      });
    });

    // tenants 컬렉션 동기화
    await syncPlanChange(tenantId, newPlan);

    // n8n 웹훅
    if (process.env.N8N_WEBHOOK_URL) {
      try {
        await fetch(process.env.N8N_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event: 'plan_changed',
            tenantId,
            email,
            previousPlan,
            newPlan,
            refundAmount: creditAmount || 0,
            newPlanAmount: proratedNewAmount || 0,
          }),
        });
      } catch {
        // 웹훅 실패 무시
      }
    }

    return NextResponse.json({
      success: true,
      orderId: paymentOrderId,
      refundAmount: creditAmount || 0,
      paidAmount: proratedNewAmount || 0,
      message: `${getPlanName(newPlan)} 플랜으로 변경되었습니다.`,
    });
  } catch (error) {
    console.error('Plan change failed:', error);

    let errorMessage = 'Failed to change plan';
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((error as any)?.response?.data?.message) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      errorMessage = (error as any).response.data.message;
    }

    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
