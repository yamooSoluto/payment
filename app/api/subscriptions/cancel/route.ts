import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { verifyToken } from '@/lib/auth';

export async function POST(request: NextRequest) {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { token, email: emailParam, reason } = body;

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

    // 구독 정보 조회
    const subscriptionDoc = await db.collection('subscriptions').doc(email).get();
    if (!subscriptionDoc.exists) {
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
    }

    const subscription = subscriptionDoc.data();
    if (subscription?.status !== 'active') {
      return NextResponse.json({ error: 'No active subscription' }, { status: 400 });
    }

    // 구독 상태를 canceled로 변경
    // (다음 결제일까지는 서비스 이용 가능)
    await db.collection('subscriptions').doc(email).update({
      status: 'canceled',
      canceledAt: new Date(),
      cancelReason: reason || 'User requested',
      updatedAt: new Date(),
    });

    // n8n 웹훅 호출 (해지 알림)
    if (process.env.N8N_WEBHOOK_URL) {
      try {
        await fetch(process.env.N8N_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event: 'subscription_canceled',
            email,
            plan: subscription.plan,
            reason: reason || 'User requested',
          }),
        });
      } catch (webhookError) {
        console.error('Webhook call failed:', webhookError);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Subscription cancel failed:', error);
    return NextResponse.json(
      { error: 'Failed to cancel subscription' },
      { status: 500 }
    );
  }
}
