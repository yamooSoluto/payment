import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';

function getDb() {
  return adminDb || initializeFirebaseAdmin();
}

// 토스페이먼츠 웹훅 처리
export async function POST(request: NextRequest) {
  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { eventType, data } = body;

    console.log('Webhook received:', eventType, data);

    switch (eventType) {
      case 'PAYMENT_STATUS_CHANGED':
        await handlePaymentStatusChange(db, data);
        break;

      case 'BILLING_SUSPENDED':
        await handleBillingSuspended(db, data);
        break;

      default:
        console.log('Unhandled webhook event:', eventType);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Webhook processing failed:', error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

async function handlePaymentStatusChange(db: FirebaseFirestore.Firestore, data: {
  paymentKey: string;
  status: string;
  customerKey?: string;
}) {
  const { paymentKey, status, customerKey } = data;

  // 결제 내역 업데이트
  const paymentsSnapshot = await db
    .collection('payments')
    .where('paymentKey', '==', paymentKey)
    .limit(1)
    .get();

  if (!paymentsSnapshot.empty) {
    const doc = paymentsSnapshot.docs[0];
    await doc.ref.update({
      status: status.toLowerCase(),
      updatedAt: new Date(),
    });

    // 결제 취소된 경우 환불 금액 기록
    if (status === 'CANCELED' && customerKey) {
      await doc.ref.update({
        refundedAt: new Date(),
      });
    }
  }
}

async function handleBillingSuspended(db: FirebaseFirestore.Firestore, data: { customerKey: string }) {
  const { customerKey } = data;

  // 구독 상태를 past_due로 변경
  await db.collection('subscriptions').doc(customerKey).update({
    status: 'past_due',
    updatedAt: new Date(),
  });

  // n8n 웹훅 호출 (결제 실패 알림)
  if (process.env.N8N_WEBHOOK_URL) {
    try {
      await fetch(process.env.N8N_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'billing_suspended',
          email: customerKey,
        }),
      });
    } catch (webhookError) {
      console.error('Webhook call failed:', webhookError);
    }
  }
}
