import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { payWithBillingKey } from '@/lib/toss';
import { syncNewSubscription } from '@/lib/tenant-sync';
import { getPlanById, verifyToken } from '@/lib/auth';

// Trial에서 즉시 유료 전환 (기존 billingKey 사용)
export async function POST(request: NextRequest) {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { email: emailParam, tenantId, plan, amount, token } = body;

    // 인증 확인
    let email: string | null = null;
    if (token) {
      email = await verifyToken(token);
    } else if (emailParam) {
      email = emailParam;
    }

    if (!email) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    if (!tenantId || !plan) {
      return NextResponse.json({ error: 'tenantId and plan are required' }, { status: 400 });
    }

    // 플랜 정보 조회
    const planInfo = await getPlanById(plan);
    if (!planInfo) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
    }

    // 구독 정보 조회
    const subscriptionRef = db.collection('subscriptions').doc(tenantId);
    const subscriptionDoc = await subscriptionRef.get();

    if (!subscriptionDoc.exists) {
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
    }

    const subscription = subscriptionDoc.data();

    // 권한 확인
    if (subscription?.email !== email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // billingKey 확인
    if (!subscription?.billingKey) {
      return NextResponse.json({ error: 'No billing key found. Please register a card first.' }, { status: 400 });
    }

    // Trial 상태 확인
    if (subscription?.status !== 'trial') {
      return NextResponse.json({ error: 'This endpoint is only for trial to paid conversion' }, { status: 400 });
    }

    const billingKey = subscription.billingKey;
    const paymentAmount = amount || planInfo.price;

    // 결제 수행
    const orderId = `CONVERT_${Date.now()}_${tenantId}`;
    const orderName = `YAMOO ${planInfo.name} 플랜 - 즉시 전환`;

    console.log('Processing immediate conversion payment:', { orderId, paymentAmount, tenantId });

    const paymentResponse = await payWithBillingKey(
      billingKey,
      email,
      paymentAmount,
      orderId,
      orderName,
      email
    );

    console.log('Immediate conversion payment completed:', paymentResponse.status);

    // 구독 정보 업데이트
    const now = new Date();
    const nextBillingDate = new Date(now);
    nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);

    const paymentDocId = `${orderId}_${Date.now()}`;

    await db.runTransaction(async (transaction) => {
      // 구독 정보 업데이트
      transaction.update(subscriptionRef, {
        plan,
        status: 'active',
        amount: paymentAmount,
        currentPeriodStart: now,
        currentPeriodEnd: nextBillingDate,
        nextBillingDate,
        // pendingPlan 관련 필드 제거
        pendingPlan: null,
        pendingAmount: null,
        pendingChangeAt: null,
        updatedAt: now,
      });

      // 결제 내역 저장
      const paymentRef = db.collection('payments').doc(paymentDocId);
      transaction.set(paymentRef, {
        tenantId,
        email,
        orderId,
        paymentKey: paymentResponse.paymentKey,
        amount: paymentAmount,
        plan,
        type: 'conversion',  // Trial에서 전환
        status: 'done',
        method: paymentResponse.method,
        cardInfo: paymentResponse.card || null,
        receiptUrl: paymentResponse.receipt?.url || null,
        paidAt: now,
        createdAt: now,
      });
    });

    // tenants 컬렉션에 구독 정보 동기화
    await syncNewSubscription(tenantId, plan, nextBillingDate);

    // n8n 웹훅 호출 (선택적)
    if (process.env.N8N_WEBHOOK_URL) {
      try {
        await fetch(process.env.N8N_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event: 'subscription_converted',
            tenantId,
            email,
            plan,
            amount: paymentAmount,
          }),
        });
      } catch {
        // 웹훅 실패 무시
      }
    }

    return NextResponse.json({
      success: true,
      orderId,
      paymentKey: paymentResponse.paymentKey,
      amount: paymentAmount,
      plan,
    });
  } catch (error) {
    console.error('Immediate conversion failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process payment' },
      { status: 500 }
    );
  }
}
