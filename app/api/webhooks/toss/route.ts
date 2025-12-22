import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';

// 토스페이먼츠 웹훅 처리
// 결제 취소, 환불 등의 이벤트를 수신
export async function POST(request: NextRequest) {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
  }

  try {
    const body = await request.json();
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
            if (status === 'CANCELED' || eventType.includes('CANCELED')) {
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
