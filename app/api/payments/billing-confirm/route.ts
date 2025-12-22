import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { issueBillingKey, payWithBillingKey, getPlanName, getPlanAmount } from '@/lib/toss';

// 빌링키 발급 및 첫 결제 처리
// 토스 카드 등록 성공 후 리다이렉트됨
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const authKey = searchParams.get('authKey');
  const customerKey = searchParams.get('customerKey');
  const plan = searchParams.get('plan');
  const amount = searchParams.get('amount');

  console.log('Billing confirm received:', { authKey, customerKey, plan, amount });

  // 필수 파라미터 검증
  if (!authKey || !customerKey || !plan) {
    return NextResponse.redirect(
      new URL(`/checkout?plan=${plan || 'basic'}&error=missing_params`, request.url)
    );
  }

  const db = adminDb || initializeFirebaseAdmin();
  if (!db) {
    return NextResponse.redirect(
      new URL(`/checkout?plan=${plan}&error=database_unavailable`, request.url)
    );
  }

  try {
    // 1. authKey로 빌링키 발급
    console.log('Issuing billing key for:', customerKey);
    const billingResponse = await issueBillingKey(authKey, customerKey);
    const billingKey = billingResponse.billingKey;

    console.log('Billing key issued:', billingKey?.slice(0, 10) + '...');

    // 2. 결제 금액 확인
    const paymentAmount = amount ? parseInt(amount) : getPlanAmount(plan);
    const email = customerKey;

    // 3. 첫 결제 수행
    const orderId = `SUB_${Date.now()}_${email.replace('@', '_at_')}`;
    const orderName = `YAMOO ${getPlanName(plan)} 플랜 - 첫 결제`;

    console.log('Processing first payment:', { orderId, paymentAmount });

    const paymentResponse = await payWithBillingKey(
      billingKey,
      customerKey,
      paymentAmount,
      orderId,
      orderName,
      email
    );

    console.log('First payment completed:', paymentResponse.status);

    // 4. 구독 정보 저장
    const now = new Date();
    const nextBillingDate = new Date(now);
    nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);

    await db.collection('subscriptions').doc(email).set({
      email,
      plan,
      billingKey,
      status: 'active',
      amount: paymentAmount,
      currentPeriodStart: now,
      currentPeriodEnd: nextBillingDate,
      nextBillingDate,
      cardInfo: billingResponse.card || null,
      createdAt: now,
      updatedAt: now,
    });

    // 5. 결제 내역 저장
    await db.collection('payments').add({
      email,
      orderId,
      paymentKey: paymentResponse.paymentKey,
      amount: paymentAmount,
      plan,
      status: 'done',
      method: paymentResponse.method,
      cardInfo: paymentResponse.card || null,
      paidAt: now,
      createdAt: now,
    });

    // 6. n8n 웹훅 호출 (구독 성공 알림)
    if (process.env.N8N_WEBHOOK_URL) {
      try {
        await fetch(process.env.N8N_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event: 'subscription_created',
            email,
            plan,
            amount: paymentAmount,
          }),
        });
      } catch {
        // 웹훅 실패 무시
      }
    }

    // 성공 페이지로 리다이렉트
    return NextResponse.redirect(
      new URL(`/checkout/success?plan=${plan}&orderId=${orderId}`, request.url)
    );
  } catch (error) {
    console.error('Billing confirm failed:', error);

    // 에러 메시지 추출
    let errorMessage = 'unknown_error';
    if (error instanceof Error) {
      errorMessage = error.message;
    }

    return NextResponse.redirect(
      new URL(`/checkout?plan=${plan}&error=${encodeURIComponent(errorMessage)}`, request.url)
    );
  }
}
