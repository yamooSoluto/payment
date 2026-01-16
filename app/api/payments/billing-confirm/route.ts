import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { issueBillingKey, payWithBillingKey, getPlanName } from '@/lib/toss';
import { syncNewSubscription } from '@/lib/tenant-sync';
import { getPlanById, incrementLinkUsage } from '@/lib/auth';
import { isN8NNotificationEnabled } from '@/lib/n8n';
import { findExistingPayment } from '@/lib/idempotency';
import { handleSubscriptionChange } from '@/lib/subscription-history';

// 빌링키 발급 및 첫 결제 처리
// 토스 카드 등록 성공 후 리다이렉트됨
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const authKey = searchParams.get('authKey');
  const customerKey = searchParams.get('customerKey');
  const plan = searchParams.get('plan');
  const amount = searchParams.get('amount');
  let tenantId = searchParams.get('tenantId');
  const token = searchParams.get('token');
  const emailParam = searchParams.get('email');
  const mode = searchParams.get('mode'); // 'reserve' for trial reservation
  const idempotencyKey = searchParams.get('idempotencyKey');
  // 신규 매장 생성 파라미터
  const brandNameParam = searchParams.get('brandName');
  const industryParam = searchParams.get('industry');
  // 커스텀 결제 링크 파라미터
  const linkId = searchParams.get('linkId');
  const billingType = searchParams.get('billingType') as 'recurring' | 'onetime' | null;
  const subscriptionDaysParam = searchParams.get('subscriptionDays');

  // 인증 파라미터 생성 (리다이렉트 시 사용)
  // emailParam이 없으면 customerKey(이메일)를 폴백으로 사용
  const email = emailParam || customerKey || '';
  const authParam = token ? `token=${token}` : email ? `email=${encodeURIComponent(email)}` : '';
  const isReserveMode = mode === 'reserve';
  const isNewTenant = tenantId === 'new';

  console.log('Billing confirm received:', { authKey, customerKey, plan, amount, tenantId, mode, hasToken: !!token, isNewTenant, brandNameParam });

  // 필수 파라미터 검증
  if (!authKey || !customerKey || !plan || !tenantId) {
    const authQuery = authParam ? `&${authParam}` : '';
    return NextResponse.redirect(
      new URL(`/checkout?plan=${plan || 'basic'}&tenantId=${tenantId || ''}${authQuery}&error=missing_params`, request.url)
    );
  }

  // 신규 매장인 경우 brandName 필수
  if (isNewTenant && !brandNameParam) {
    const authQuery = authParam ? `&${authParam}` : '';
    return NextResponse.redirect(
      new URL(`/checkout?plan=${plan}&newTenant=true${authQuery}&error=missing_brand_name`, request.url)
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

    // 1.5. 신규 매장 생성 (tenantId가 'new'인 경우)
    if (isNewTenant && brandNameParam) {
      console.log('Creating new tenant:', { brandName: brandNameParam, industry: industryParam });

      // users 컬렉션에서 사용자 정보 조회 (name, phone)
      const userDoc = await db.collection('users').doc(email).get();
      const userData = userDoc.exists ? userDoc.data() : null;

      // n8n 웹훅 호출 (매장 생성)
      const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL;
      if (!n8nWebhookUrl) {
        console.error('N8N_WEBHOOK_URL이 설정되지 않았습니다.');
        const authQuery = authParam ? `&${authParam}` : '';
        return NextResponse.redirect(
          new URL(`/checkout?plan=${plan}&newTenant=true${authQuery}&error=system_configuration_error`, request.url)
        );
      }

      try {
        const timestamp = new Date().toISOString();
        const n8nResponse = await fetch(n8nWebhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            name: userData?.name || null,
            phone: userData?.phone || null,
            brandName: brandNameParam.trim(),
            industry: industryParam || '',
            timestamp,
            createdAt: timestamp,
            isTrialSignup: false, // 매장 추가용 (체험 신청 아님)
            isPaidSubscription: true, // 유료 구독용
          }),
        });

        if (!n8nResponse.ok) {
          console.error('n8n webhook 호출 실패:', n8nResponse.status);
          const authQuery = authParam ? `&${authParam}` : '';
          return NextResponse.redirect(
            new URL(`/checkout?plan=${plan}&newTenant=true${authQuery}&error=tenant_creation_failed`, request.url)
          );
        }

        const n8nData = await n8nResponse.json();
        console.log('신규 매장 생성 n8n webhook 성공:', n8nData);

        if (n8nData.tenantId) {
          tenantId = n8nData.tenantId;
          console.log('새 tenantId 생성됨:', tenantId);
        } else {
          console.error('n8n webhook에서 tenantId를 받지 못함');
          const authQuery = authParam ? `&${authParam}` : '';
          return NextResponse.redirect(
            new URL(`/checkout?plan=${plan}&newTenant=true${authQuery}&error=tenant_id_missing`, request.url)
          );
        }
      } catch (error) {
        console.error('n8n webhook 호출 오류:', error);
        const authQuery = authParam ? `&${authParam}` : '';
        return NextResponse.redirect(
          new URL(`/checkout?plan=${plan}&newTenant=true${authQuery}&error=tenant_creation_error`, request.url)
        );
      }
    }

    // tenantId null 체크 (위에서 검증했거나 새로 생성됨)
    if (!tenantId) {
      const authQuery = authParam ? `&${authParam}` : '';
      return NextResponse.redirect(
        new URL(`/checkout?plan=${plan}&newTenant=true${authQuery}&error=tenant_id_missing`, request.url)
      );
    }

    // TypeScript 타입 안전을 위해 non-null 변수 생성
    const validTenantId: string = tenantId;

    // 2. 플랜 정보 조회 (Firestore에서 동적으로)
    const planInfo = await getPlanById(plan);
    if (!planInfo) {
      const authQuery = authParam ? `&${authParam}` : '';
      return NextResponse.redirect(
        new URL(`/checkout?plan=${plan}&tenantId=${validTenantId}${authQuery}&error=invalid_plan`, request.url)
      );
    }

    // 3. 결제 금액 확인 (URL에서 전달된 금액이 있으면 사용, 없으면 플랜 가격)
    const paymentAmount = amount ? parseInt(amount) : planInfo.price;

    // tenant 정보 조회 (매장명, 이름, 전화번호 가져오기)
    let tenantName = '';
    let brandName = '';
    let ownerName = '';
    let phone = '';

    // 신규 매장인 경우 URL 파라미터에서 가져오기
    if (isNewTenant && brandNameParam) {
      brandName = brandNameParam.trim();
      tenantName = brandName;
      // 사용자 정보도 조회
      try {
        const userDoc = await db.collection('users').doc(email).get();
        if (userDoc.exists) {
          const userData = userDoc.data();
          ownerName = userData?.name || '';
          phone = userData?.phone || '';
        }
      } catch {
        // 무시
      }
    } else {
      // 기존 매장인 경우 Firestore에서 조회
      try {
        const tenantDoc = await db.collection('tenants').doc(validTenantId).get();
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
    }

    // 예약 모드: 빌링키만 저장하고 결제하지 않음
    if (isReserveMode) {
      console.log('Reserve mode: registering billing key without payment');

      const now = new Date();

      // 1. subscriptions 컬렉션에서 조회
      const subscriptionRef = db.collection('subscriptions').doc(validTenantId);
      let subscriptionDoc = await subscriptionRef.get();
      let subscriptionData = subscriptionDoc.exists ? subscriptionDoc.data() : null;

      // 2. subscriptions 컬렉션에 없으면 tenants 컬렉션에서 조회 (폴백)
      if (!subscriptionData) {
        const tenantSnapshot = await db
          .collection('tenants')
          .where('tenantId', '==', validTenantId)
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
              tenantId: validTenantId,
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
          new URL(`/checkout?plan=${plan}&tenantId=${validTenantId}${authQuery}&error=${encodeURIComponent('Subscription not found')}`, request.url)
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
        new URL(`/checkout/success?plan=${plan}&tenantId=${validTenantId}&reserved=true&start=${encodeURIComponent(pendingChangeAt.toISOString())}${tenantNameQuery}${authQuery}`, request.url)
      );
    }

    // 일반 모드: 첫 결제 수행
    // 멱등성 체크: 이미 처리된 결제가 있으면 성공 페이지로 리다이렉트
    if (idempotencyKey) {
      const existingPayment = await findExistingPayment(db, idempotencyKey);
      if (existingPayment) {
        console.log('Duplicate payment detected, returning existing result:', existingPayment.orderId);
        const authQuery = authParam ? `&${authParam}` : '';
        const tenantNameQuery = tenantName ? `&tenantName=${encodeURIComponent(tenantName)}` : '';
        return NextResponse.redirect(
          new URL(`/checkout/success?plan=${plan}&tenantId=${validTenantId}&orderId=${existingPayment.orderId}${tenantNameQuery}${authQuery}`, request.url)
        );
      }
    }

    const orderId = `SUB_${Date.now()}`;
    const orderName = brandName
      ? `YAMOO ${getPlanName(plan)} 플랜 (${brandName})`
      : `YAMOO ${getPlanName(plan)} 플랜`;

    console.log('Processing first payment:', { orderId, paymentAmount, tenantId: validTenantId });

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

    // 1회성 결제인 경우 subscriptionDays 기반으로 기간 계산
    const isOnetime = billingType === 'onetime';
    const subscriptionDays = subscriptionDaysParam ? parseInt(subscriptionDaysParam) : 30;

    if (isOnetime && subscriptionDays > 0) {
      // 1회성: 지정된 일수 후 종료
      nextBillingDate.setDate(nextBillingDate.getDate() + subscriptionDays);
    } else {
      // 정기: 1개월 후
      nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
    }

    // currentPeriodEnd는 nextBillingDate - 1일 (마지막 이용 가능일)
    const currentPeriodEnd = new Date(nextBillingDate);
    currentPeriodEnd.setDate(currentPeriodEnd.getDate() - 1);

    // 트랜잭션으로 구독 및 결제 내역 저장 (원자성 보장)
    const paymentDocId = `${orderId}_${Date.now()}`;

    await db.runTransaction(async (transaction) => {
      // 구독 정보 저장
      const subscriptionRef = db.collection('subscriptions').doc(validTenantId);
      transaction.set(subscriptionRef, {
        tenantId: validTenantId,
        brandName: brandName || null,  // 한글 매장명
        name: ownerName || null,        // 담당자 이름
        phone: phone || null,           // 전화번호
        email,
        plan,
        billingKey,
        status: 'active',
        amount: paymentAmount,
        baseAmount: planInfo.price,    // 플랜 기본 가격 (정기결제 금액, UI 표시용)
        currentPeriodStart: now,
        currentPeriodEnd,
        nextBillingDate,
        // 1회성 결제인 경우 기간 종료 시 자동 해지
        cancelAtPeriodEnd: isOnetime,
        billingType: isOnetime ? 'onetime' : 'recurring',
        cardInfo: billingResponse.card || null,
        createdAt: now,
        updatedAt: now,
      });

      // 결제 내역 저장 (멱등성 키 포함)
      const paymentRef = db.collection('payments').doc(paymentDocId);
      transaction.set(paymentRef, {
        tenantId: validTenantId,
        email,
        orderId,
        orderName,
        paymentKey: paymentResponse.paymentKey,
        amount: paymentAmount,
        plan,
        category: 'subscription',
        type: 'first_payment',
        transactionType: 'charge',
        initiatedBy: 'user',
        status: 'done',
        method: paymentResponse.method,
        cardInfo: paymentResponse.card || null,
        receiptUrl: paymentResponse.receipt?.url || null,
        idempotencyKey: idempotencyKey || null,
        paidAt: now,
        createdAt: now,
      });
    });

    // tenants 컬렉션에 구독 정보 동기화
    await syncNewSubscription(validTenantId, plan, nextBillingDate);

    // subscription_history에 기록 추가
    try {
      await handleSubscriptionChange(db, {
        tenantId: validTenantId,
        email,
        brandName: brandName || null,
        newPlan: plan,
        newStatus: 'active',
        amount: paymentAmount,
        periodStart: now,
        periodEnd: currentPeriodEnd,
        billingDate: now,
        changeType: 'new',
        changedBy: 'user',
        paymentId: paymentDocId,
        orderId,
      });
      console.log('✅ Subscription history recorded for new subscription');
    } catch (historyError) {
      console.error('Failed to record subscription history:', historyError);
      // 히스토리 기록 실패해도 결제는 완료됨
    }

    // users 컬렉션에 trialApplied 플래그 설정 (무료체험 재신청 방지)
    try {
      const userRef = db.collection('users').doc(email);
      const userDoc = await userRef.get();
      if (userDoc.exists) {
        await userRef.update({
          trialApplied: true,
          paidSubscriptionAt: now,
          updatedAt: now,
        });
      } else {
        await userRef.set({
          email,
          trialApplied: true,
          paidSubscriptionAt: now,
          createdAt: now,
          updatedAt: now,
        });
      }
      console.log('✅ User trialApplied flag set for:', email);
    } catch (userUpdateError) {
      console.error('Failed to update user trialApplied:', userUpdateError);
      // 실패해도 결제는 완료됨
    }

    // n8n 웹훅 호출 (구독 성공 알림)
    if (isN8NNotificationEnabled()) {
      try {
        await fetch(process.env.N8N_WEBHOOK_URL!, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event: 'subscription_created',
            tenantId: validTenantId,
            email,
            plan,
            amount: paymentAmount,
          }),
        });
      } catch {
        // 웹훅 실패 무시
      }
    }

    // 커스텀 링크 사용 시 사용횟수 증가
    if (linkId) {
      try {
        await incrementLinkUsage(linkId);
        console.log('✅ Custom link usage incremented:', linkId);
      } catch (linkError) {
        console.error('Failed to increment link usage:', linkError);
        // 사용횟수 증가 실패해도 결제는 완료됨
      }
    }

    // 성공 페이지로 리다이렉트 (실제 이용 기간 전달)
    const authQuery = authParam ? `&${authParam}` : '';
    const tenantNameQuery = tenantName ? `&tenantName=${encodeURIComponent(tenantName)}` : '';
    const periodStart = now.toISOString();
    const periodEnd = nextBillingDate.toISOString();
    return NextResponse.redirect(
      new URL(`/checkout/success?plan=${plan}&tenantId=${validTenantId}&orderId=${orderId}&start=${encodeURIComponent(periodStart)}&end=${encodeURIComponent(periodEnd)}${tenantNameQuery}${authQuery}`, request.url)
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
