import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { issueBillingKey, payWithBillingKey, getPlanName, getPlanAmount } from '@/lib/toss';
import { syncNewSubscription } from '@/lib/tenant-sync';
import { getSessionIdFromRequest, getCheckoutSession, updateCheckoutSession } from '@/lib/checkout-session';

// 빌링키 발급 및 첫 결제 처리
// 토스 카드 등록 성공 후 리다이렉트됨
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const authKey = searchParams.get('authKey');
  const customerKey = searchParams.get('customerKey');
  // URL에서 필수 파라미터 가져오기 (Toss callback에서 전달)
  const planFromUrl = searchParams.get('plan');
  const amount = searchParams.get('amount');
  const tenantIdFromUrl = searchParams.get('tenantId');

  // 세션에서 추가 정보 가져오기
  const sessionId = getSessionIdFromRequest(request);
  let session = sessionId ? await getCheckoutSession(sessionId) : null;

  // 세션 또는 URL에서 값 가져오기
  const plan = planFromUrl || session?.plan;
  const tenantId = tenantIdFromUrl || session?.tenantId;

  console.log('Billing confirm received:', { authKey, customerKey, plan, amount, tenantId, hasSession: !!session });

  // 필수 파라미터 검증
  if (!authKey || !customerKey || !plan || !tenantId) {
    return NextResponse.redirect(
      new URL('/checkout?error=missing_params', request.url)
    );
  }

  const db = adminDb || initializeFirebaseAdmin();
  if (!db) {
    return NextResponse.redirect(
      new URL('/checkout?error=database_unavailable', request.url)
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
    const orderId = `SUB_${Date.now()}_${tenantId}`;
    const orderName = `YAMOO ${getPlanName(plan)} 플랜 - 첫 결제`;

    console.log('Processing first payment:', { orderId, paymentAmount, tenantId });

    const paymentResponse = await payWithBillingKey(
      billingKey,
      customerKey,
      paymentAmount,
      orderId,
      orderName,
      email
    );

    console.log('First payment completed:', paymentResponse.status);

    // 4. 구독 정보 저장 (tenantId를 document ID로 사용)
    const now = new Date();
    const nextBillingDate = new Date(now);
    nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);

    // tenant 정보 조회 (매장명 가져오기)
    let tenantName = '';
    try {
      const tenantDoc = await db.collection('tenants').doc(tenantId).get();
      if (tenantDoc.exists) {
        tenantName = tenantDoc.data()?.name || '';
      }
    } catch {
      // 무시
    }

    // 4-5. 트랜잭션으로 구독 및 결제 내역 저장 (원자성 보장)
    const paymentDocId = `${orderId}_${Date.now()}`;

    await db.runTransaction(async (transaction) => {
      // 구독 정보 저장
      const subscriptionRef = db.collection('subscriptions').doc(tenantId);
      transaction.set(subscriptionRef, {
        tenantId,
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

      // 결제 내역 저장
      const paymentRef = db.collection('payments').doc(paymentDocId);
      transaction.set(paymentRef, {
        tenantId,
        email,
        orderId,
        paymentKey: paymentResponse.paymentKey,
        amount: paymentAmount,
        plan,
        status: 'done',
        method: paymentResponse.method,
        cardInfo: paymentResponse.card || null,
        receiptUrl: paymentResponse.receipt?.url || null,
        paidAt: now,
        createdAt: now,
      });
    });

    // 6. tenants 컬렉션에 구독 정보 동기화
    await syncNewSubscription(tenantId, plan, nextBillingDate);

    // 7. n8n 웹훅 호출 (구독 성공 알림)
    if (process.env.N8N_WEBHOOK_URL) {
      try {
        await fetch(process.env.N8N_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event: 'subscription_created',
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

    // 세션 업데이트 (성공 정보 저장)
    if (sessionId) {
      await updateCheckoutSession(sessionId, {
        status: 'success',
        orderId,
        tenantName,
        tenantId,
      });
    }

    // 성공 페이지로 리다이렉트 (클린 URL)
    return NextResponse.redirect(
      new URL('/checkout/success', request.url)
    );
  } catch (error) {
    console.error('Billing confirm failed:', error);

    // 에러 메시지 추출
    let errorMessage = 'unknown_error';
    if (error instanceof Error) {
      errorMessage = error.message;
    }

    return NextResponse.redirect(
      new URL(`/checkout?error=${encodeURIComponent(errorMessage)}`, request.url)
    );
  }
}
