import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { issueBillingKey, payWithBillingKey } from '@/lib/toss';
import { syncNewSubscription } from '@/lib/tenant-sync';
import { getPlanById } from '@/lib/auth';

// 빌링키 발급 및 첫 결제 처리
// 토스 카드 등록 성공 후 리다이렉트됨
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const authKey = searchParams.get('authKey');
  const customerKey = searchParams.get('customerKey');
  const plan = searchParams.get('plan');
  const amount = searchParams.get('amount');
  const tenantId = searchParams.get('tenantId');
  const token = searchParams.get('token');
  const emailParam = searchParams.get('email');
  const mode = searchParams.get('mode'); // 'reserve' for trial reservation

  // 인증 파라미터 생성 (리다이렉트 시 사용)
  const authParam = token ? `token=${token}` : emailParam ? `email=${encodeURIComponent(emailParam)}` : '';
  const isReserveMode = mode === 'reserve';

  console.log('Billing confirm received:', { authKey, customerKey, plan, amount, tenantId, mode, hasToken: !!token });

  // 필수 파라미터 검증
  if (!authKey || !customerKey || !plan || !tenantId) {
    const authQuery = authParam ? `&${authParam}` : '';
    return NextResponse.redirect(
      new URL(`/checkout?plan=${plan || 'basic'}&tenantId=${tenantId || ''}${authQuery}&error=missing_params`, request.url)
    );
  }

  const db = adminDb || initializeFirebaseAdmin();
  if (!db) {
    const authQuery = authParam ? `&${authParam}` : '';
    return NextResponse.redirect(
      new URL(`/checkout?plan=${plan}&tenantId=${tenantId}${authQuery}&error=database_unavailable`, request.url)
    );
  }

  try {
    // 1. authKey로 빌링키 발급
    console.log('Issuing billing key for:', customerKey);
    const billingResponse = await issueBillingKey(authKey, customerKey);
    const billingKey = billingResponse.billingKey;

    console.log('Billing key issued:', billingKey?.slice(0, 10) + '...');

    // 2. 플랜 정보 조회 (Firestore에서 동적으로)
    const planInfo = await getPlanById(plan);
    if (!planInfo) {
      const authQuery = authParam ? `&${authParam}` : '';
      return NextResponse.redirect(
        new URL(`/checkout?plan=${plan}&tenantId=${tenantId}${authQuery}&error=invalid_plan`, request.url)
      );
    }

    // 3. 결제 금액 확인 (URL에서 전달된 금액이 있으면 사용, 없으면 플랜 가격)
    const paymentAmount = amount ? parseInt(amount) : planInfo.price;
    const email = customerKey;

    // tenant 정보 조회 (매장명, 이름, 전화번호 가져오기)
    let tenantName = '';
    let brandName = '';
    let ownerName = '';
    let phone = '';
    try {
      const tenantDoc = await db.collection('tenants').doc(tenantId).get();
      if (tenantDoc.exists) {
        const tenantData = tenantDoc.data();
        brandName = tenantData?.brandName || '';
        ownerName = tenantData?.name || '';
        phone = tenantData?.phone || '';
        tenantName = brandName || ownerName || '';
      }
    } catch {
      // 무시
    }

    // 예약 모드: 빌링키만 저장하고 결제하지 않음
    if (isReserveMode) {
      console.log('Reserve mode: registering billing key without payment');

      const now = new Date();

      // 1. subscriptions 컬렉션에서 조회
      const subscriptionRef = db.collection('subscriptions').doc(tenantId);
      let subscriptionDoc = await subscriptionRef.get();
      let subscriptionData = subscriptionDoc.exists ? subscriptionDoc.data() : null;

      // 2. subscriptions 컬렉션에 없으면 tenants 컬렉션에서 조회 (폴백)
      if (!subscriptionData) {
        const tenantSnapshot = await db
          .collection('tenants')
          .where('tenantId', '==', tenantId)
          .limit(1)
          .get();

        if (!tenantSnapshot.empty) {
          const tenantData = tenantSnapshot.docs[0].data();

          if (tenantData.subscription) {
            // tenants 컬렉션의 subscription을 subscriptions 형식으로 변환
            let trialEndDate = tenantData.trialEndsAt || tenantData.subscription?.trial?.trialEndsAt;
            let startDate = tenantData.subscription.startedAt;

            // startDate를 Date 객체로 변환
            if (startDate && startDate.toDate) {
              startDate = startDate.toDate();
            } else if (startDate && startDate._seconds) {
              startDate = new Date(startDate._seconds * 1000);
            }

            // trialEndDate를 Date 객체로 변환
            if (trialEndDate && trialEndDate.toDate) {
              trialEndDate = trialEndDate.toDate();
            } else if (trialEndDate && trialEndDate._seconds) {
              trialEndDate = new Date(trialEndDate._seconds * 1000);
            }

            subscriptionData = {
              tenantId,
              email: tenantData.email || email,
              brandName: tenantData.brandName,
              name: tenantData.name,
              phone: tenantData.phone,
              plan: tenantData.subscription.plan || tenantData.plan || 'trial',
              status: tenantData.subscription.status === 'trialing' ? 'trial' : tenantData.subscription.status,
              trialEndDate,
              currentPeriodStart: startDate,
              currentPeriodEnd: trialEndDate || tenantData.subscription.renewsAt,
              nextBillingDate: tenantData.subscription.renewsAt,
              createdAt: tenantData.createdAt || now,
              updatedAt: now,
            };

            // subscriptions 컬렉션에 문서 생성
            await subscriptionRef.set(subscriptionData);
            console.log('Created subscription document from tenants collection data');
          }
        }
      }

      if (!subscriptionData) {
        const authQuery = authParam ? `&${authParam}` : '';
        return NextResponse.redirect(
          new URL(`/checkout?plan=${plan}&tenantId=${tenantId}${authQuery}&error=${encodeURIComponent('Subscription not found')}`, request.url)
        );
      }

      // Trial 종료일 또는 현재 구독 종료일 (첫 결제일)
      // Date 객체로 변환하는 헬퍼
      const toDate = (value: unknown): Date | null => {
        if (!value) return null;
        if (value instanceof Date) return value;
        if (typeof value === 'object' && 'toDate' in value && typeof (value as { toDate: () => Date }).toDate === 'function') {
          return (value as { toDate: () => Date }).toDate();
        }
        if (typeof value === 'string' || typeof value === 'number') {
          const d = new Date(value);
          return isNaN(d.getTime()) ? null : d;
        }
        return null;
      };

      const trialEndDate = toDate(subscriptionData?.trialEndDate);
      const nextBillingDateValue = toDate(subscriptionData?.nextBillingDate);
      const isTrial = subscriptionData?.status === 'trial';

      // pendingChangeAt 계산:
      // - Trial 사용자: trialEndDate + 1 (무료체험 마지막 날 다음날)
      // - Active 사용자: nextBillingDate 그대로 (다음 결제일이 곧 새 플랜 시작일)
      let pendingChangeAt: Date;
      if (isTrial && trialEndDate) {
        pendingChangeAt = new Date(trialEndDate);
        pendingChangeAt.setDate(pendingChangeAt.getDate() + 1);
      } else if (nextBillingDateValue) {
        pendingChangeAt = new Date(nextBillingDateValue);
      } else {
        // 폴백: 30일 후
        pendingChangeAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      }

      // subscription 업데이트: pendingPlan 추가
      await subscriptionRef.update({
        billingKey,
        cardInfo: billingResponse.card || null,
        pendingPlan: plan,
        pendingAmount: paymentAmount,
        pendingChangeAt,
        updatedAt: now,
      });

      console.log('✅ Billing key registered, pending plan set:', { plan, pendingChangeAt: pendingChangeAt.toISOString() });

      // 성공 페이지로 리다이렉트 (예약 모드)
      const authQuery = authParam ? `&${authParam}` : '';
      const tenantNameQuery = tenantName ? `&tenantName=${encodeURIComponent(tenantName)}` : '';
      return NextResponse.redirect(
        new URL(`/checkout/success?plan=${plan}&tenantId=${tenantId}&reserved=true&start=${encodeURIComponent(pendingChangeAt.toISOString())}${tenantNameQuery}${authQuery}`, request.url)
      );
    }

    // 일반 모드: 첫 결제 수행
    const orderId = `SUB_${Date.now()}_${tenantId}`;
    const orderName = `YAMOO ${planInfo.name} 플랜 - 첫 결제`;

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

    // 구독 정보 저장 (tenantId를 document ID로 사용)
    const now = new Date();
    const nextBillingDate = new Date(now);
    nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);

    // 트랜잭션으로 구독 및 결제 내역 저장 (원자성 보장)
    const paymentDocId = `${orderId}_${Date.now()}`;

    await db.runTransaction(async (transaction) => {
      // 구독 정보 저장
      const subscriptionRef = db.collection('subscriptions').doc(tenantId);
      transaction.set(subscriptionRef, {
        tenantId,
        brandName: brandName || null,  // 한글 매장명
        name: ownerName || null,        // 담당자 이름
        phone: phone || null,           // 전화번호
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
        type: 'subscription',  // 신규 구독
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

    // n8n 웹훅 호출 (구독 성공 알림)
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

    // 성공 페이지로 리다이렉트 (실제 이용 기간 전달)
    const authQuery = authParam ? `&${authParam}` : '';
    const tenantNameQuery = tenantName ? `&tenantName=${encodeURIComponent(tenantName)}` : '';
    const periodStart = now.toISOString();
    const periodEnd = nextBillingDate.toISOString();
    return NextResponse.redirect(
      new URL(`/checkout/success?plan=${plan}&tenantId=${tenantId}&orderId=${orderId}&start=${encodeURIComponent(periodStart)}&end=${encodeURIComponent(periodEnd)}${tenantNameQuery}${authQuery}`, request.url)
    );
  } catch (error) {
    console.error('Billing confirm failed:', error);

    // 에러 메시지 추출
    let errorMessage = 'unknown_error';
    if (error instanceof Error) {
      errorMessage = error.message;
    }

    const authQuery = authParam ? `&${authParam}` : '';
    return NextResponse.redirect(
      new URL(`/checkout?plan=${plan}&tenantId=${tenantId}${authQuery}&error=${encodeURIComponent(errorMessage)}`, request.url)
    );
  }
}
