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
    const { email, tenantId, newPlan, newAmount, proratedAmount, isDowngrade, refundAmount, creditAmount, proratedNewAmount } = body;

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
    const orderId = `CHANGE_${Date.now()}_${tenantId}`;

    if (isDowngrade && refundAmount > 0) {
      // 다운그레이드: 환불 처리
      console.log('Processing downgrade:', {
        orderId,
        tenantId,
        refundAmount,
        previousPlan,
        newPlan,
      });

      // 가장 최근 결제 내역 조회
      const paymentsSnapshot = await db
        .collection('payments')
        .where('tenantId', '==', tenantId)
        .where('status', '==', 'done')
        .orderBy('createdAt', 'desc')
        .limit(1)
        .get();

      let refundResult = null;
      let originalPaymentId = null;
      if (!paymentsSnapshot.empty) {
        const lastPaymentDoc = paymentsSnapshot.docs[0];
        const lastPayment = lastPaymentDoc.data();
        originalPaymentId = lastPaymentDoc.id;

        // 부분 환불 시도 (마지막 결제에서 환불액만큼 취소)
        if (lastPayment.paymentKey && lastPayment.amount >= refundAmount) {
          try {
            refundResult = await cancelPayment(
              lastPayment.paymentKey,
              `플랜 다운그레이드: ${getPlanName(previousPlan)} → ${getPlanName(newPlan)}`,
              refundAmount
            );
            console.log('Refund processed:', refundResult);
          } catch (refundError) {
            console.error('Refund failed, continuing with plan change:', refundError);
            // 환불 실패해도 플랜 변경은 진행 (크레딧으로 처리 가능)
          }
        }
      }

      // 트랜잭션으로 데이터 업데이트
      await db.runTransaction(async (transaction) => {
        // 환불 내역 저장
        const paymentDocId = `${orderId}_${Date.now()}`;
        const paymentRef = db.collection('payments').doc(paymentDocId);
        transaction.set(paymentRef, {
          tenantId,
          email,
          orderId,
          paymentKey: refundResult?.paymentKey || null,
          amount: -refundAmount, // 음수로 저장 (환불)
          plan: newPlan,
          type: 'downgrade_refund',
          previousPlan,
          status: refundResult ? 'refunded' : 'pending_refund',
          refundAmount,
          refundReason: `플랜 다운그레이드: ${getPlanName(previousPlan)} → ${getPlanName(newPlan)}`,
          originalPaymentId,
          paidAt: now,
          createdAt: now,
        });

        // 구독 정보 업데이트
        const subscriptionRef = db.collection('subscriptions').doc(tenantId);
        transaction.update(subscriptionRef, {
          plan: newPlan,
          amount: newAmount,
          currentPeriodStart: now,  // 플랜 변경일부터 새로운 결제 주기 시작
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
              event: 'plan_downgraded',
              tenantId,
              email,
              previousPlan,
              newPlan,
              refundAmount,
              newAmount,
            }),
          });
        } catch {
          // 웹훅 실패 무시
        }
      }

      return NextResponse.json({
        success: true,
        orderId,
        refundAmount,
        message: `${getPlanName(newPlan)} 플랜으로 변경되었습니다. ${refundAmount.toLocaleString()}원이 환불됩니다.`,
      });
    } else {
      // 업그레이드: 차액 결제
      let paymentResponse = null;

      if (proratedAmount > 0) {
        const orderName = `YAMOO ${getPlanName(previousPlan)} → ${getPlanName(newPlan)} 변경`;

        console.log('Processing upgrade payment:', {
          orderId,
          tenantId,
          amount: proratedAmount,
          previousPlan,
          newPlan,
        });

        paymentResponse = await payWithBillingKey(
          subscription.billingKey,
          email,
          proratedAmount,
          orderId,
          orderName,
          email
        );

        console.log('Upgrade payment completed:', paymentResponse.status);
      }

      // 트랜잭션으로 데이터 업데이트
      await db.runTransaction(async (transaction) => {
        // 결제 내역 저장
        if (proratedAmount > 0 && paymentResponse) {
          const paymentDocId = `${orderId}_${Date.now()}`;
          const paymentRef = db.collection('payments').doc(paymentDocId);
          transaction.set(paymentRef, {
            tenantId,
            email,
            orderId,
            paymentKey: paymentResponse.paymentKey,
            amount: proratedAmount,
            plan: newPlan,
            type: 'upgrade',
            previousPlan,
            status: 'done',
            method: paymentResponse.method,
            cardInfo: paymentResponse.card || null,
            receiptUrl: paymentResponse.receipt?.url || null,
            paidAt: now,
            createdAt: now,
            // 업그레이드 상세 정보 (크레딧 표시용)
            creditAmount: creditAmount || 0, // 기존 플랜 미사용분 크레딧
            proratedNewAmount: proratedNewAmount || 0, // 새 플랜 일할 금액
          });
        }

        // 구독 정보 업데이트
        const subscriptionRef = db.collection('subscriptions').doc(tenantId);
        transaction.update(subscriptionRef, {
          plan: newPlan,
          amount: newAmount,
          currentPeriodStart: now,  // 플랜 변경일부터 새로운 결제 주기 시작
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
              event: 'plan_upgraded',
              tenantId,
              email,
              previousPlan,
              newPlan,
              proratedAmount,
              newAmount,
            }),
          });
        } catch {
          // 웹훅 실패 무시
        }
      }

      return NextResponse.json({
        success: true,
        orderId,
        message: `${getPlanName(newPlan)} 플랜으로 변경되었습니다.`,
      });
    }
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
