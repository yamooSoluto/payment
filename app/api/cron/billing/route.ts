import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { payWithBillingKey, getPlanName } from '@/lib/toss';

// Vercel Cron Job에서 호출되는 정기결제 API
// 매일 00:00 (KST) 실행
export async function GET(request: NextRequest) {
  // Vercel Cron Job Secret 검증
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = adminDb || initializeFirebaseAdmin();
  if (!db) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  try {
    // 오늘 결제일인 구독 찾기
    const subscriptionsSnapshot = await db
      .collection('subscriptions')
      .where('status', '==', 'active')
      .where('nextBillingDate', '<=', today)
      .get();

    interface BillingResult {
      email: string;
      status: 'success' | 'retry' | 'suspended';
      error?: string;
    }

    const results: BillingResult[] = [];

    for (const doc of subscriptionsSnapshot.docs) {
      const subscription = doc.data();
      const email = doc.id;

      try {
        // 빌링키로 자동 결제
        const orderId = `AUTO_${Date.now()}_${email.replace('@', '_at_')}`;
        const orderName = `YAMOO ${getPlanName(subscription.plan)} 플랜 - 정기결제`;

        const response = await payWithBillingKey(
          subscription.billingKey,
          email,
          subscription.amount,
          orderId,
          orderName,
          email
        );

        // 결제 성공
        if (response.status === 'DONE') {
          const nextBillingDate = new Date(subscription.nextBillingDate.toDate());
          nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);

          // 구독 정보 업데이트
          await db.collection('subscriptions').doc(email).update({
            currentPeriodStart: subscription.currentPeriodEnd,
            currentPeriodEnd: nextBillingDate,
            nextBillingDate,
            retryCount: 0,
            updatedAt: new Date(),
          });

          // 결제 내역 저장
          await db.collection('payments').add({
            email,
            orderId,
            paymentKey: response.paymentKey,
            amount: subscription.amount,
            plan: subscription.plan,
            status: 'done',
            method: response.method,
            paidAt: new Date(),
            createdAt: new Date(),
          });

          // n8n 웹훅 (정기결제 성공 알림)
          if (process.env.N8N_WEBHOOK_URL) {
            try {
              await fetch(process.env.N8N_WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  event: 'recurring_payment_success',
                  email,
                  plan: subscription.plan,
                  amount: subscription.amount,
                }),
              });
            } catch {
              // 웹훅 실패 무시
            }
          }

          results.push({ email, status: 'success' });
        }
      } catch (error) {
        // 결제 실패 처리
        console.error(`Payment failed for ${email}:`, error);

        const retryCount = subscription.retryCount || 0;

        if (retryCount >= 2) {
          // 3회 실패 시 구독 정지
          await db.collection('subscriptions').doc(email).update({
            status: 'past_due',
            updatedAt: new Date(),
          });

          // 실패 알림
          if (process.env.N8N_WEBHOOK_URL) {
            try {
              await fetch(process.env.N8N_WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  event: 'payment_failed',
                  email,
                  plan: subscription.plan,
                  retryCount: retryCount + 1,
                }),
              });
            } catch {
              // 웹훅 실패 무시
            }
          }

          results.push({ email, status: 'suspended' });
        } else {
          // 재시도 카운트 증가
          await db.collection('subscriptions').doc(email).update({
            retryCount: retryCount + 1,
            updatedAt: new Date(),
          });

          results.push({ email, status: 'retry' });
        }
      }
    }

    return NextResponse.json({
      success: true,
      processed: results.length,
      results,
    });
  } catch (error) {
    console.error('Cron billing job failed:', error);
    return NextResponse.json(
      { error: 'Billing job failed' },
      { status: 500 }
    );
  }
}
