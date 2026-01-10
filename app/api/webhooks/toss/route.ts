import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import crypto from 'crypto';
import { isN8NNotificationEnabled } from '@/lib/n8n';

// HMAC 서명 검증 함수
function verifyWebhookSignature(
  rawBody: string,
  signature: string | null,
  secretKey: string
): boolean {
  if (!signature) {
    console.warn('Webhook signature missing');
    return false;
  }

  const expectedSignature = crypto
    .createHmac('sha256', secretKey)
    .update(rawBody)
    .digest('base64');

  // 타이밍 공격 방지를 위한 안전한 비교
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch {
    return false;
  }
}

// 토스페이먼츠 웹훅 처리
// 결제 취소, 환불 등의 이벤트를 수신
export async function POST(request: NextRequest) {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
  }

  try {
    // Raw body를 먼저 읽어서 서명 검증에 사용
    const rawBody = await request.text();
    const body = JSON.parse(rawBody);

    // HMAC 서명 검증 (프로덕션 환경에서만)
    const webhookSecret = process.env.TOSS_WEBHOOK_SECRET;
    if (webhookSecret) {
      const signature = request.headers.get('X-Tosspayments-Signature');

      if (!verifyWebhookSignature(rawBody, signature, webhookSecret)) {
        console.error('Webhook signature verification failed');
        return NextResponse.json(
          { error: 'Invalid webhook signature' },
          { status: 401 }
        );
      }
      console.log('Webhook signature verified successfully');
    } else {
      console.warn('TOSS_WEBHOOK_SECRET not set - skipping signature verification');
    }

    console.log('Toss webhook received:', JSON.stringify(body, null, 2));

    const { eventType, data } = body;

    // 웹훅 로그 저장
    await db.collection('webhook_logs').add({
      source: 'toss',
      eventType,
      data,
      receivedAt: new Date(),
    });

    switch (eventType) {
      case 'PAYMENT_STATUS_CHANGED':
      case 'PAYMENT.CANCELED':
      case 'CANCELED': {
        // 결제 취소 처리
        const paymentKey = data?.paymentKey;
        const status = data?.status;

        if (paymentKey) {
          // 해당 paymentKey로 결제 내역 찾기
          const paymentsSnapshot = await db
            .collection('payments')
            .where('paymentKey', '==', paymentKey)
            .get();

          if (!paymentsSnapshot.empty) {
            const paymentDoc = paymentsSnapshot.docs[0];
            const payment = paymentDoc.data();
            const email = payment.email;

            // 결제 상태 업데이트
            await paymentDoc.ref.update({
              status: 'canceled',
              canceledAt: new Date(),
              cancelData: data,
              updatedAt: new Date(),
            });

            console.log('Payment marked as canceled:', paymentKey);

            // 구독 상태도 업데이트 (취소된 경우)
            if (status === 'CANCELED' || (typeof eventType === 'string' && eventType.includes('CANCELED'))) {
              const subscriptionDoc = await db.collection('subscriptions').doc(email).get();

              if (subscriptionDoc.exists) {
                const subscription = subscriptionDoc.data();

                // 최근 결제가 취소되었고, 다른 활성 결제가 없으면 구독 상태 변경
                const activePayments = await db
                  .collection('payments')
                  .where('email', '==', email)
                  .where('status', '==', 'done')
                  .get();

                if (activePayments.empty) {
                  await db.collection('subscriptions').doc(email).update({
                    status: 'canceled',
                    canceledAt: new Date(),
                    cancelReason: 'Payment canceled via Toss',
                    updatedAt: new Date(),
                  });
                  console.log('Subscription marked as canceled for:', email);
                }
              }
            }
          }
        }
        break;
      }

      case 'PAYMENT.DONE':
      case 'DONE': {
        // 결제 완료 처리 (필요시)
        console.log('Payment completed:', data?.paymentKey);
        break;
      }

      case 'CANCEL_STATUS_CHANGED': {
        // 취소 상태 변경
        const paymentKey = data?.paymentKey;
        console.log('Cancel status changed:', paymentKey, data?.cancelStatus);

        if (paymentKey) {
          const paymentsSnapshot = await db
            .collection('payments')
            .where('paymentKey', '==', paymentKey)
            .get();

          if (!paymentsSnapshot.empty) {
            const paymentDoc = paymentsSnapshot.docs[0];
            await paymentDoc.ref.update({
              cancelStatus: data?.cancelStatus,
              cancelData: data,
              updatedAt: new Date(),
            });
          }
        }
        break;
      }

      case 'BILLING_DELETED': {
        // 빌링키 삭제 (사용자가 토스에서 카드 삭제)
        const billingKey = data?.billingKey;
        const customerKey = data?.customerKey;
        console.log('Billing key deleted:', billingKey, customerKey);

        if (customerKey) {
          // customerKey는 보통 email
          const subscriptionDoc = await db.collection('subscriptions').doc(customerKey).get();

          if (subscriptionDoc.exists) {
            await db.collection('subscriptions').doc(customerKey).update({
              billingKey: null,
              cardInfo: null,
              cardAlias: null,
              billingDeletedAt: new Date(),
              updatedAt: new Date(),
            });
            console.log('Billing key removed from subscription:', customerKey);
          }
        }
        break;
      }

      case 'BILLING_SUSPENDED': {
        // 빌링 정지 (결제 실패 등)
        const customerKey = data?.customerKey;
        console.log('Billing suspended for:', customerKey);

        if (customerKey) {
          await db.collection('subscriptions').doc(customerKey).update({
            status: 'past_due',
            updatedAt: new Date(),
          });

          // N8N 웹훅 호출 (결제 실패 알림)
          if (isN8NNotificationEnabled()) {
            try {
              await fetch(process.env.N8N_WEBHOOK_URL!, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  event: 'billing_suspended',
                  email: customerKey,
                  timestamp: new Date().toISOString(),
                }),
              });
            } catch (webhookError) {
              console.error('N8N webhook call failed:', webhookError);
            }
          }
        }
        break;
      }

      default:
        console.log('Unhandled webhook event:', eventType);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Toss webhook processing failed:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}

// 웹훅 검증을 위한 GET (토스 웹훅 설정 시 사용)
export async function GET() {
  return NextResponse.json({ status: 'ok', message: 'Toss webhook endpoint' });
}
