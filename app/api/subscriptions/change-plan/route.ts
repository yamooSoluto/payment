import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { verifyToken } from '@/lib/auth';
import { PLAN_PRICES, cancelPayment } from '@/lib/toss';
import { syncPlanChange } from '@/lib/tenant-sync';

export async function POST(request: NextRequest) {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { token, email: emailParam, tenantId, newPlan, newAmount, mode, refundAmount } = body;

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

    // 플랜 유효성 검증
    if (!newPlan || PLAN_PRICES[newPlan] === undefined) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
    }

    // 모드 검증
    if (!mode || !['immediate', 'scheduled'].includes(mode)) {
      return NextResponse.json({ error: 'Invalid mode' }, { status: 400 });
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

    const currentAmount = subscription.amount || PLAN_PRICES[subscription.plan] || 0;
    const isUpgrade = newAmount > currentAmount;

    if (mode === 'immediate') {
      // 즉시 변경
      if (isUpgrade) {
        // 업그레이드: 새 결제 필요 (차액 결제)
        await db.collection('subscriptions').doc(tenantId).update({
          pendingPlan: newPlan,
          pendingAmount: newAmount,
          pendingMode: 'immediate',
          updatedAt: new Date(),
        });

        return NextResponse.json({
          success: true,
          requiresPayment: true,
          message: '즉시 업그레이드를 위해 차액 결제가 필요합니다.',
        });
      } else {
        // 다운그레이드 즉시 변경: 부분 환불 처리 후 새 플랜 적용
        let refundResult = null;

        // 환불 금액이 있으면 부분 취소 시도
        if (refundAmount && refundAmount > 0) {
          // 최근 결제 내역에서 paymentKey 조회 (tenantId로)
          const paymentsSnapshot = await db
            .collection('payments')
            .where('tenantId', '==', tenantId)
            .where('status', '==', 'done')
            .limit(10)
            .get();

          // 가장 최근 결제 찾기 (createdAt 기준)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let latestPayment: any = null;
          let latestDate = new Date(0);

          paymentsSnapshot.docs.forEach((doc) => {
            const payment = doc.data();
            const createdAt = payment.createdAt?.toDate?.() || new Date(payment.createdAt);
            if (createdAt > latestDate) {
              latestDate = createdAt;
              latestPayment = payment;
            }
          });

          if (latestPayment?.paymentKey) {
            try {
              console.log('Attempting partial refund:', {
                paymentKey: latestPayment.paymentKey,
                refundAmount,
              });

              refundResult = await cancelPayment(
                latestPayment.paymentKey,
                `플랜 다운그레이드 환불 (${subscription.plan} → ${newPlan})`,
                refundAmount
              );

              console.log('Partial refund result:', refundResult);

              // 환불 내역 저장 (refunds 컬렉션)
              await db.collection('refunds').add({
                tenantId,
                email,
                paymentKey: latestPayment.paymentKey,
                refundAmount,
                cancelReason: `플랜 다운그레이드 (${subscription.plan} → ${newPlan})`,
                previousPlan: subscription.plan,
                newPlan,
                refundedAt: new Date(),
                tossResponse: refundResult,
              });

              // 결제 내역에도 환불 기록 추가 (PaymentHistory에 표시)
              await db.collection('payments').add({
                tenantId,
                email,
                orderId: `REFUND_${Date.now()}_${tenantId}`,
                paymentKey: latestPayment.paymentKey,
                amount: -refundAmount, // 음수로 표시
                plan: newPlan,
                previousPlan: subscription.plan,
                type: 'refund',
                status: 'done',
                refundReason: `${subscription.plan} → ${newPlan} 다운그레이드`,
                paidAt: new Date(),
                createdAt: new Date(),
              });
            } catch (refundError) {
              console.error('Partial refund failed:', refundError);
              // 환불 실패해도 플랜 변경은 진행 (관리자가 수동 처리)
            }
          } else {
            console.log('No payment found for refund');
          }
        }

        // 플랜 변경
        await db.collection('subscriptions').doc(tenantId).update({
          plan: newPlan,
          amount: newAmount,
          planChangedAt: new Date(),
          previousPlan: subscription.plan,
          previousAmount: currentAmount,
          refundAmount: refundAmount || 0,
          refundProcessed: !!refundResult,
          updatedAt: new Date(),
        });

        // tenants 컬렉션에 플랜 변경 동기화
        await syncPlanChange(tenantId, newPlan);

        // n8n 웹훅 호출
        if (process.env.N8N_WEBHOOK_URL) {
          try {
            await fetch(process.env.N8N_WEBHOOK_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                event: 'plan_changed_immediate',
                tenantId,
                email,
                previousPlan: subscription.plan,
                newPlan,
                mode: 'immediate',
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
          requiresPayment: false,
          refundProcessed: !!refundResult,
          refundAmount: refundAmount || 0,
          message: refundResult
            ? `플랜이 즉시 변경되었습니다. ${refundAmount.toLocaleString()}원이 환불됩니다.`
            : '플랜이 즉시 변경되었습니다.',
        });
      }
    } else {
      // 예약 변경 (scheduled): 다음 결제일부터 적용
      await db.collection('subscriptions').doc(tenantId).update({
        pendingPlan: newPlan,
        pendingAmount: newAmount,
        pendingMode: 'scheduled',
        pendingChangeAt: subscription.nextBillingDate,
        updatedAt: new Date(),
      });

      // n8n 웹훅 호출 (플랜 변경 예약 알림)
      if (process.env.N8N_WEBHOOK_URL) {
        try {
          await fetch(process.env.N8N_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              event: 'plan_change_scheduled',
              tenantId,
              email,
              currentPlan: subscription.plan,
              newPlan,
              effectiveDate: subscription.nextBillingDate,
            }),
          });
        } catch (webhookError) {
          console.error('Webhook call failed:', webhookError);
        }
      }

      return NextResponse.json({
        success: true,
        requiresPayment: false,
        message: '다음 결제일부터 새 플랜이 적용됩니다.',
      });
    }
  } catch (error) {
    console.error('Plan change failed:', error);
    return NextResponse.json(
      { error: 'Failed to change plan' },
      { status: 500 }
    );
  }
}
