import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { payWithBillingKey, getPlanName } from '@/lib/toss';
import { syncPlanChange } from '@/lib/tenant-sync';

export async function POST(request: NextRequest) {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { email, tenantId, newPlan, newAmount, proratedAmount } = body;

    if (!email || !tenantId || !newPlan || !newAmount || proratedAmount === undefined) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
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

    if (!subscription?.billingKey) {
      return NextResponse.json({ error: 'Billing key not found' }, { status: 400 });
    }

    if (subscription.status !== 'active') {
      return NextResponse.json({ error: 'No active subscription' }, { status: 400 });
    }

    const previousPlan = subscription.plan;
    const previousAmount = subscription.amount;

    // 차액 결제 (proratedAmount가 0보다 클 때만)
    let paymentResponse = null;
    const orderId = `UPGRADE_${Date.now()}_${tenantId}`;

    if (proratedAmount > 0) {
      const orderName = `YAMOO ${getPlanName(previousPlan)} → ${getPlanName(newPlan)} 업그레이드`;

      console.log('Processing upgrade payment:', {
        orderId,
        tenantId,
        amount: proratedAmount,
        previousPlan,
        newPlan,
      });

      paymentResponse = await payWithBillingKey(
        subscription.billingKey,
        email, // customerKey
        proratedAmount,
        orderId,
        orderName,
        email
      );

      console.log('Upgrade payment completed:', paymentResponse.status);

      // 결제 내역 저장
      await db.collection('payments').add({
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
        paidAt: new Date(),
        createdAt: new Date(),
      });
    }

    // 구독 정보 업데이트 (플랜 변경, nextBillingDate는 유지)
    await db.collection('subscriptions').doc(tenantId).update({
      plan: newPlan,
      amount: newAmount,
      previousPlan,
      previousAmount,
      planChangedAt: new Date(),
      updatedAt: new Date(),
      // pendingPlan 관련 필드 제거
      pendingPlan: null,
      pendingAmount: null,
      pendingMode: null,
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
      message: `${getPlanName(newPlan)} 플랜으로 업그레이드 되었습니다.`,
    });
  } catch (error) {
    console.error('Upgrade payment failed:', error);

    // Toss 에러 메시지 추출
    let errorMessage = 'Failed to process upgrade';
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
