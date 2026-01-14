import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { verifyToken } from '@/lib/auth';
import { payWithBillingKey, getPlanName } from '@/lib/toss';
import { syncPaymentSuccess } from '@/lib/tenant-sync';
import { isN8NNotificationEnabled } from '@/lib/n8n';

// 결제 실패 후 수동 재시도
export async function POST(request: NextRequest) {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { token, email: emailParam, tenantId } = body;

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

    // past_due 상태인 경우에만 재시도 허용
    if (subscription?.status !== 'past_due') {
      return NextResponse.json({ error: 'Only past_due subscriptions can be retried' }, { status: 400 });
    }

    if (!subscription?.billingKey) {
      return NextResponse.json({ error: 'Billing key not found' }, { status: 400 });
    }

    // 결제 시도
    const orderId = `REC_${Date.now()}`;
    const brandName = subscription.brandName || '';
    const orderName = brandName
      ? `YAMOO ${getPlanName(subscription.plan)} 플랜 (${brandName})`
      : `YAMOO ${getPlanName(subscription.plan)} 플랜`;

    console.log('Processing retry payment:', {
      orderId,
      tenantId,
      amount: subscription.amount,
      plan: subscription.plan,
    });

    const paymentResponse = await payWithBillingKey(
      subscription.billingKey,
      email,
      subscription.amount,
      orderId,
      orderName,
      email
    );

    if (paymentResponse.status === 'DONE') {
      // 결제 성공 - 구독 상태 복구
      const now = new Date();
      const nextBillingDate = new Date(now);
      nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);

      // 트랜잭션으로 구독 정보 및 결제 내역 업데이트
      await db.runTransaction(async (transaction) => {
        // 구독 상태 업데이트
        const subscriptionRef = db.collection('subscriptions').doc(tenantId);
        transaction.update(subscriptionRef, {
          status: 'active',
          currentPeriodStart: now,
          currentPeriodEnd: nextBillingDate,
          nextBillingDate,
          retryCount: 0,
          lastPaymentError: null,
          lastPaymentFailedAt: null,
          updatedAt: now,
        });

        // 결제 내역 저장
        const paymentDocId = `${orderId}_${Date.now()}`;
        const paymentRef = db.collection('payments').doc(paymentDocId);
        transaction.set(paymentRef, {
          tenantId,
          email,
          orderId,
          paymentKey: paymentResponse.paymentKey,
          amount: subscription.amount,
          plan: subscription.plan,
          category: 'recurring',
          type: 'retry',
          status: 'done',
          method: paymentResponse.method,
          cardInfo: paymentResponse.card || null,
          receiptUrl: paymentResponse.receipt?.url || null,
          paidAt: now,
          createdAt: now,
        });
      });

      // tenants 컬렉션에 결제 성공 동기화
      await syncPaymentSuccess(tenantId, nextBillingDate);

      // n8n 웹훅 호출 (재결제 성공 알림)
      if (isN8NNotificationEnabled()) {
        try {
          await fetch(process.env.N8N_WEBHOOK_URL!, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              event: 'payment_retry_success',
              tenantId,
              email,
              plan: subscription.plan,
              amount: subscription.amount,
            }),
          });
        } catch {
          // 웹훅 실패 무시
        }
      }

      return NextResponse.json({
        success: true,
        message: '결제가 성공적으로 처리되었습니다.',
        orderId,
      });
    } else {
      // 결제 실패
      return NextResponse.json({
        success: false,
        error: '결제에 실패했습니다. 카드 정보를 확인해주세요.',
      }, { status: 400 });
    }
  } catch (error) {
    console.error('Payment retry failed:', error);

    // 에러 메시지 추출
    let errorMessage = '결제 재시도에 실패했습니다.';
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
