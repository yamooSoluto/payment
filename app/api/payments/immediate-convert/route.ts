import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin, getAdminAuth } from '@/lib/firebase-admin';
import { payWithBillingKey, getPlanName } from '@/lib/toss';
import { syncNewSubscription } from '@/lib/tenant-sync';
import { getPlanById, verifyToken } from '@/lib/auth';
import { isN8NNotificationEnabled } from '@/lib/n8n';
import { findExistingPayment } from '@/lib/idempotency';

// 인증 함수: Authorization 헤더 또는 body의 token 처리
async function authenticateRequest(request: NextRequest, bodyToken?: string, bodyEmail?: string): Promise<string | null> {
  const authHeader = request.headers.get('Authorization');

  // Authorization 헤더가 있으면 우선 처리
  if (authHeader) {
    // Bearer 토큰인 경우 Firebase Auth로 처리
    if (authHeader.startsWith('Bearer ')) {
      const idToken = authHeader.substring(7);
      try {
        const auth = getAdminAuth();
        if (!auth) {
          console.error('Firebase Admin Auth not initialized');
          return null;
        }
        const decodedToken = await auth.verifyIdToken(idToken);
        return decodedToken.email || null;
      } catch (error) {
        console.error('Firebase Auth token verification failed:', error);
        return null;
      }
    }
    // 그 외는 SSO 토큰으로 처리
    return await verifyToken(authHeader);
  }

  // body의 token 처리 (SSO 토큰)
  if (bodyToken) {
    return await verifyToken(bodyToken);
  }

  // body의 email 처리 (Firebase Auth - 이전 호환)
  if (bodyEmail) {
    return bodyEmail;
  }

  return null;
}

// Trial에서 즉시 유료 전환 (기존 billingKey 사용)
export async function POST(request: NextRequest) {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { email: emailParam, tenantId, plan, amount, token, idempotencyKey } = body;

    // 인증 처리
    const email = await authenticateRequest(request, token, emailParam);

    if (!email) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    if (!tenantId || !plan) {
      return NextResponse.json({ error: 'tenantId and plan are required' }, { status: 400 });
    }

    // 멱등성 체크: 이미 처리된 결제가 있으면 기존 결과 반환
    if (idempotencyKey) {
      const existingPayment = await findExistingPayment(db, idempotencyKey);
      if (existingPayment) {
        console.log('Duplicate conversion detected, returning existing result:', existingPayment.orderId);
        return NextResponse.json({
          success: true,
          orderId: existingPayment.orderId,
          paymentKey: existingPayment.paymentKey,
          amount: existingPayment.amount,
          plan: existingPayment.plan,
          duplicate: true,
        });
      }
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
    const orderId = `SUB_${Date.now()}`;
    const brandName = subscription?.brandName || '';
    const orderName = brandName
      ? `YAMOO ${getPlanName(plan)} 플랜 (${brandName})`
      : `YAMOO ${getPlanName(plan)} 플랜`;

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
        previousPlan: 'trial',  // Trial에서 전환
        planChangedAt: now,
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

      // 결제 내역 저장 (멱등성 키 포함)
      const paymentRef = db.collection('payments').doc(paymentDocId);
      transaction.set(paymentRef, {
        tenantId,
        email,
        orderId,
        paymentKey: paymentResponse.paymentKey,
        amount: paymentAmount,
        plan,
        previousPlan: 'trial',  // Trial에서 전환
        category: 'subscription',
        type: 'trial_convert',
        status: 'done',
        method: paymentResponse.method,
        cardInfo: paymentResponse.card || null,
        receiptUrl: paymentResponse.receipt?.url || null,
        idempotencyKey: idempotencyKey || null,  // 멱등성 키 저장
        paidAt: now,
        createdAt: now,
      });
    });

    // tenants 컬렉션에 구독 정보 동기화
    await syncNewSubscription(tenantId, plan, nextBillingDate);

    // n8n 웹훅 호출 (선택적)
    if (isN8NNotificationEnabled()) {
      try {
        await fetch(process.env.N8N_WEBHOOK_URL!, {
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
