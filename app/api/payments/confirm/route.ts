import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { issueBillingKey, payWithBillingKey, getPlanName } from '@/lib/toss';
import { getPlanById } from '@/lib/auth';
import { isN8NNotificationEnabled } from '@/lib/n8n';
import { findExistingPayment } from '@/lib/idempotency';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const authKey = searchParams.get('authKey');
  const customerKey = searchParams.get('customerKey');
  const plan = searchParams.get('plan');
  const idempotencyKey = searchParams.get('idempotencyKey');

  if (!authKey || !customerKey || !plan) {
    return NextResponse.redirect(
      `${request.nextUrl.origin}/fail?error=missing_params`
    );
  }

  const db = adminDb || initializeFirebaseAdmin();
  if (!db) {
    return NextResponse.redirect(
      `${request.nextUrl.origin}/fail?error=database_unavailable`
    );
  }

  try {
    // 멱등성 체크: 이미 처리된 결제가 있으면 바로 성공 페이지로
    if (idempotencyKey) {
      const existingPayment = await findExistingPayment(db, idempotencyKey);
      if (existingPayment) {
        console.log('Duplicate payment detected, returning existing result:', existingPayment.orderId);
        return NextResponse.redirect(
          `https://app.yamoo.ai.kr/mypage?payment=success`
        );
      }
    }

    // 1. 토스 빌링키 발급
    const billingData = await issueBillingKey(authKey, customerKey);
    const { billingKey, card } = billingData;

    // 2. 플랜 정보 조회 (Firestore에서 동적으로)
    const planInfo = await getPlanById(plan);
    if (!planInfo) {
      return NextResponse.redirect(
        `${request.nextUrl.origin}/fail?error=invalid_plan`
      );
    }

    // 3. 첫 결제 진행
    const amount = planInfo.price;
    const orderId = `SUB_${Date.now()}`;
    const orderName = `YAMOO ${getPlanName(plan)} 플랜`;

    const paymentResponse = await payWithBillingKey(
      billingKey,
      customerKey,
      amount,
      orderId,
      orderName,
      customerKey
    );

    // 3. Firestore 구독 정보 업데이트
    const now = new Date();
    const nextBillingDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    await db.collection('subscriptions').doc(customerKey).set(
      {
        email: customerKey,
        status: 'active',
        plan,
        amount,
        billingKey,
        currentPeriodStart: now,
        currentPeriodEnd: nextBillingDate,
        nextBillingDate,
        cardCompany: card.company,
        cardNumber: card.number,
        updatedAt: now,
      },
      { merge: true }
    );

    // 4. 결제 내역 저장 (멱등성 키 포함)
    await db.collection('payments').add({
      email: customerKey,
      orderId,
      paymentKey: paymentResponse.paymentKey,
      amount,
      plan,
      category: 'subscription',
      type: 'first_payment',
      status: 'done',
      method: paymentResponse.method,
      cardCompany: card.company,
      cardNumber: card.number,
      receiptUrl: paymentResponse.receipt?.url || null,
      idempotencyKey: idempotencyKey || null,  // 멱등성 키 저장
      paidAt: now,
      createdAt: now,
    });

    // 5. n8n 웹훅 호출 (비즈엠 알림톡)
    if (isN8NNotificationEnabled()) {
      try {
        await fetch(process.env.N8N_WEBHOOK_URL!, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event: 'payment_success',
            email: customerKey,
            plan,
            amount,
          }),
        });
      } catch (webhookError) {
        console.error('Webhook call failed:', webhookError);
        // 웹훅 실패해도 결제는 성공 처리
      }
    }

    // 6. 포탈로 리다이렉트
    return NextResponse.redirect(
      `https://app.yamoo.ai.kr/mypage?payment=success`
    );
  } catch (error) {
    console.error('Payment confirmation failed:', error);

    const errorMessage = error instanceof Error ? error.message : 'unknown_error';
    return NextResponse.redirect(
      `${request.nextUrl.origin}/fail?error=${encodeURIComponent(errorMessage)}`
    );
  }
}
