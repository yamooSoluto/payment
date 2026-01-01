import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { payWithBillingKey } from '@/lib/toss';
import { syncNewSubscription } from '@/lib/tenant-sync';

// Trial 만료 확인 및 자동 전환 Cron Job
// 매일 자정에 실행
export async function GET(request: NextRequest) {
  // Cron secret 검증 (보안)
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = adminDb || initializeFirebaseAdmin();
  if (!db) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
  }

  const now = new Date();
  const results = {
    checked: 0,
    converted: 0,
    expired: 0,
    errors: [] as string[],
  };

  try {
    // trial 상태인 구독 조회
    const subscriptionsSnapshot = await db
      .collection('subscriptions')
      .where('status', '==', 'trial')
      .get();

    results.checked = subscriptionsSnapshot.size;
    console.log(`Checking ${results.checked} trial subscriptions...`);

    for (const doc of subscriptionsSnapshot.docs) {
      const subscription = doc.data();
      const tenantId = doc.id;

      try {
        // Trial 종료일 확인
        const trialEndDate = subscription.trialEndDate?.toDate?.() || subscription.trialEndDate;
        if (!trialEndDate || new Date(trialEndDate) > now) {
          continue; // 아직 만료되지 않음
        }

        console.log(`Trial expired for tenant: ${tenantId}`);

        // pendingPlan이 있으면 자동 전환
        if (subscription.pendingPlan && subscription.billingKey) {
          console.log(`Converting to pending plan: ${subscription.pendingPlan}`);

          const plan = subscription.pendingPlan;
          const amount = subscription.pendingAmount || 0;
          const billingKey = subscription.billingKey;
          const email = subscription.email;

          // 첫 결제 수행
          const orderId = `TRIAL_CONVERT_${Date.now()}_${tenantId}`;
          const orderName = `YAMOO ${plan} 플랜 - 무료체험 전환`;

          const paymentResponse = await payWithBillingKey(
            billingKey,
            email,
            amount,
            orderId,
            orderName,
            email
          );

          console.log(`Payment completed for ${tenantId}:`, paymentResponse.status);

          // 구독 업데이트
          const nextBillingDate = new Date(now);
          nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);

          await db.runTransaction(async (transaction) => {
            // 구독 상태 변경
            transaction.update(doc.ref, {
              plan,
              status: 'active',
              amount,
              currentPeriodStart: now,
              currentPeriodEnd: nextBillingDate,
              nextBillingDate,
              pendingPlan: null,
              pendingAmount: null,
              pendingChangeAt: null,
              updatedAt: now,
            });

            // 결제 내역 저장
            const paymentRef = db.collection('payments').doc(`${orderId}_${Date.now()}`);
            transaction.set(paymentRef, {
              tenantId,
              email,
              orderId,
              paymentKey: paymentResponse.paymentKey,
              amount,
              plan,
              type: 'trial_conversion',
              status: 'done',
              method: paymentResponse.method,
              cardInfo: paymentResponse.card || null,
              receiptUrl: paymentResponse.receipt?.url || null,
              paidAt: now,
              createdAt: now,
            });
          });

          // tenants 컬렉션 동기화
          await syncNewSubscription(tenantId, plan, nextBillingDate);

          results.converted++;
          console.log(`✅ Successfully converted ${tenantId} to ${plan}`);
        } else {
          // pendingPlan 없으면 expired 상태로 변경
          await doc.ref.update({
            status: 'expired',
            updatedAt: now,
          });

          results.expired++;
          console.log(`⏸️ Trial expired without pending plan: ${tenantId}`);
        }
      } catch (error) {
        console.error(`Error processing ${tenantId}:`, error);
        results.errors.push(`${tenantId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    console.log('Trial expiry check completed:', results);
    return NextResponse.json({
      success: true,
      ...results,
      timestamp: now.toISOString(),
    });
  } catch (error) {
    console.error('Trial expiry cron failed:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
        ...results,
      },
      { status: 500 }
    );
  }
}
