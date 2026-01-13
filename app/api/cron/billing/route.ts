import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { payWithBillingKey, getPlanName, getEffectiveAmount } from '@/lib/toss';
import { syncPaymentSuccess, syncPaymentFailure, syncTrialExpired, syncPlanChange } from '@/lib/tenant-sync';
import { isN8NNotificationEnabled } from '@/lib/n8n';
import { findExistingPayment, generateIdempotencyKey } from '@/lib/idempotency';

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

  // 한국 시간(KST) 기준 오늘 날짜 계산
  const now = new Date();
  // KST로 변환 (UTC + 9시간)
  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  // KST 기준 오늘 날짜 문자열 (YYYY-MM-DD)
  const kstDateStr = kstNow.toISOString().split('T')[0];
  // KST 기준 오늘 하루 끝 → UTC로 변환 (Firestore 쿼리용)
  const today = new Date(`${kstDateStr}T23:59:59.999+09:00`);

  try {
    // ========== 1. Trial 만료 및 자동 전환 처리 ==========
    const expiredTrials: { tenantId: string; email: string }[] = [];
    const convertedTrials: { tenantId: string; plan: string }[] = [];

    // trial 상태인 구독 조회
    const trialSubscriptions = await db
      .collection('subscriptions')
      .where('status', '==', 'trial')
      .get();

    for (const doc of trialSubscriptions.docs) {
      const subscription = doc.data();
      const tenantId = doc.id;
      const trialEndDate = subscription.trialEndDate?.toDate?.() || subscription.trialEndDate;

      if (trialEndDate && new Date(trialEndDate) <= today) {
        // pendingPlan이 있으면 자동 전환
        if (subscription.pendingPlan && subscription.billingKey) {
          try {
            const plan = subscription.pendingPlan;
            const amount = subscription.pendingAmount || 0;
            const billingKey = subscription.billingKey;
            const email = subscription.email;

            // 멱등성 키 생성 (날짜 기반)
            const idempotencyKey = generateIdempotencyKey('TRIAL_CONVERT', tenantId);

            // 이미 오늘 처리된 결제가 있으면 스킵
            const existingPayment = await findExistingPayment(db, idempotencyKey);
            if (existingPayment) {
              console.log(`Trial conversion already processed today for ${tenantId}, skipping`);
              convertedTrials.push({ tenantId, plan });
              continue;
            }

            // 첫 결제 수행
            const orderId = `SUB_${Date.now()}`;
            const orderName = `YAMOO ${getPlanName(plan)} 플랜`;

            const paymentResponse = await payWithBillingKey(
              billingKey,
              email,
              amount,
              orderId,
              orderName,
              email
            );

            // 구독 업데이트
            const now = new Date();
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

              // 결제 내역 저장 (멱등성 키 포함)
              const paymentRef = db.collection('payments').doc(`${orderId}_${Date.now()}`);
              transaction.set(paymentRef, {
                tenantId,
                email,
                orderId,
                paymentKey: paymentResponse.paymentKey,
                amount,
                plan,
                category: 'subscription',
                type: 'trial_convert',
                status: 'done',
                method: paymentResponse.method,
                cardInfo: paymentResponse.card || null,
                receiptUrl: paymentResponse.receipt?.url || null,
                idempotencyKey,  // 멱등성 키 저장
                paidAt: now,
                createdAt: now,
              });
            });

            // tenants 컬렉션 동기화
            const { syncNewSubscription } = await import('@/lib/tenant-sync');
            await syncNewSubscription(tenantId, plan, nextBillingDate);

            convertedTrials.push({ tenantId, plan });
            console.log(`✅ Trial converted to ${plan}: ${tenantId}`);
          } catch (error) {
            console.error(`Trial conversion failed for ${tenantId}:`, error);
          }
        } else {
          // pendingPlan 없으면 expired 상태로 변경
          await db.collection('subscriptions').doc(tenantId).update({
            status: 'expired',
            expiredAt: new Date(),
            updatedAt: new Date(),
          });

          // tenants 컬렉션 동기화
          await syncTrialExpired(tenantId);

          // N8N 웹훅 알림
          if (isN8NNotificationEnabled()) {
            try {
              await fetch(process.env.N8N_WEBHOOK_URL!, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  event: 'trial_expired',
                  tenantId,
                  email: subscription.email,
                  trialEndDate: trialEndDate,
                }),
              });
            } catch {
              // 웹훅 실패 무시
            }
          }

          expiredTrials.push({ tenantId, email: subscription.email });
          console.log(`⏸️ Trial expired without pending plan: ${tenantId}`);
        }
      }
    }

    // ========== 2. 카드 만료 사전 알림 ==========
    const cardExpiringAlerts: { tenantId: string; email: string; daysUntilExpiry: number }[] = [];

    // 활성 구독 중 카드 만료일이 임박한 것 찾기
    const activeSubscriptions = await db
      .collection('subscriptions')
      .where('status', '==', 'active')
      .get();

    const currentMonth = today.getMonth() + 1; // 1-12
    const currentYear = today.getFullYear();

    for (const doc of activeSubscriptions.docs) {
      const subscription = doc.data();
      const tenantId = doc.id;

      // cardInfo에 만료 정보가 있는 경우에만 체크
      const cardExpiryMonth = subscription.cardExpiryMonth;
      const cardExpiryYear = subscription.cardExpiryYear;

      if (cardExpiryMonth && cardExpiryYear) {
        // 카드 만료일 계산 (해당 월의 마지막 날)
        const expiryDate = new Date(cardExpiryYear, cardExpiryMonth, 0);
        const diffTime = expiryDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        // 30일 전 또는 7일 전 알림
        if (diffDays === 30 || diffDays === 7) {
          // N8N 웹훅 알림
          if (isN8NNotificationEnabled()) {
            try {
              await fetch(process.env.N8N_WEBHOOK_URL!, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  event: 'card_expiring_soon',
                  tenantId,
                  email: subscription.email,
                  plan: subscription.plan,
                  daysUntilExpiry: diffDays,
                  cardInfo: subscription.cardInfo,
                  expiryMonth: cardExpiryMonth,
                  expiryYear: cardExpiryYear,
                  timestamp: new Date().toISOString(),
                }),
              });
            } catch {
              // 웹훅 실패 무시
            }
          }

          cardExpiringAlerts.push({ tenantId, email: subscription.email, daysUntilExpiry: diffDays });
          console.log(`Card expiring soon for tenant: ${tenantId} (${diffDays} days left)`);
        }
      }
    }

    // ========== 3. 예약된 플랜 변경 자동 적용 ==========
    const appliedPendingPlans: { tenantId: string; newPlan: string }[] = [];

    // pendingPlan이 있고 pendingChangeAt이 오늘 이전인 구독 찾기
    const pendingSubscriptions = await db
      .collection('subscriptions')
      .where('pendingMode', '==', 'scheduled')
      .get();

    for (const doc of pendingSubscriptions.docs) {
      const subscription = doc.data();
      const tenantId = doc.id;
      const pendingChangeAt = subscription.pendingChangeAt?.toDate?.() || subscription.pendingChangeAt;

      if (pendingChangeAt && new Date(pendingChangeAt) <= today && subscription.pendingPlan) {
        const previousPlan = subscription.plan;
        const newPlan = subscription.pendingPlan;
        const newAmount = subscription.pendingAmount;

        // 플랜 변경 적용
        await db.collection('subscriptions').doc(tenantId).update({
          plan: newPlan,
          amount: newAmount,
          previousPlan,
          previousAmount: subscription.amount,
          planChangedAt: new Date(),
          pendingPlan: null,
          pendingAmount: null,
          pendingMode: null,
          pendingChangeAt: null,
          updatedAt: new Date(),
        });

        // tenants 컬렉션 동기화
        await syncPlanChange(tenantId, newPlan);

        // N8N 웹훅 알림
        if (isN8NNotificationEnabled()) {
          try {
            await fetch(process.env.N8N_WEBHOOK_URL!, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                event: 'pending_plan_applied',
                tenantId,
                email: subscription.email,
                previousPlan,
                newPlan,
              }),
            });
          } catch {
            // 웹훅 실패 무시
          }
        }

        appliedPendingPlans.push({ tenantId, newPlan });
        console.log(`Pending plan applied for tenant: ${tenantId} (${previousPlan} → ${newPlan})`);
      }
    }

    // ========== 4. 유예 기간 만료 처리 ==========
    const expiredGracePeriods: { tenantId: string; email: string }[] = [];

    // 유예 기간이 만료된 구독 찾기
    const gracePeriodSubscriptions = await db
      .collection('subscriptions')
      .where('status', '==', 'past_due')
      .get();

    for (const doc of gracePeriodSubscriptions.docs) {
      const subscription = doc.data();
      const tenantId = doc.id;
      const gracePeriodUntil = subscription.gracePeriodUntil?.toDate?.() || subscription.gracePeriodUntil;

      if (gracePeriodUntil && new Date(gracePeriodUntil) < today) {
        // 유예 기간 만료 - 구독 정지 (D+7에 종료)
        await db.collection('subscriptions').doc(tenantId).update({
          status: 'suspended',
          suspendedAt: new Date(),
          updatedAt: new Date(),
        });

        // tenants 컬렉션 동기화
        const { syncSubscriptionSuspended } = await import('@/lib/tenant-sync');
        await syncSubscriptionSuspended(tenantId);

        // N8N 웹훅 알림
        if (isN8NNotificationEnabled()) {
          try {
            await fetch(process.env.N8N_WEBHOOK_URL!, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                event: 'grace_period_expired',
                tenantId,
                email: subscription.email,
                plan: subscription.plan,
                gracePeriodUntil: gracePeriodUntil,
                retryCount: subscription.retryCount || 0,
                timestamp: new Date().toISOString(),
              }),
            });
          } catch {
            // 웹훅 실패 무시
          }
        }

        expiredGracePeriods.push({ tenantId, email: subscription.email });
        console.log(`Grace period expired for tenant: ${tenantId}`);
      }
    }

    // ========== 5. 정기결제 처리 ==========
    // 오늘 결제일인 구독 찾기 (active 상태)
    console.log('🔍 Billing query - today:', today.toISOString());

    // 디버그: 먼저 active 구독 전체 조회
    const allActiveSnapshot = await db
      .collection('subscriptions')
      .where('status', '==', 'active')
      .get();

    console.log('📊 Total active subscriptions:', allActiveSnapshot.docs.length);
    allActiveSnapshot.docs.forEach(doc => {
      const data = doc.data();
      const nextBilling = data.nextBillingDate?.toDate?.() || data.nextBillingDate;
      console.log(`  - ${doc.id}: nextBillingDate=${nextBilling}, billingKey=${data.billingKey ? 'exists' : 'missing'}`);
    });

    const activeSubscriptionsSnapshot = await db
      .collection('subscriptions')
      .where('status', '==', 'active')
      .where('nextBillingDate', '<=', today)
      .get();

    console.log('📊 Subscriptions due for billing:', activeSubscriptionsSnapshot.docs.length);

    // 재시도 대기 중인 구독 찾기 (past_due 상태, 유예 기간 내)
    const pastDueSubscriptionsSnapshot = await db
      .collection('subscriptions')
      .where('status', '==', 'past_due')
      .get();

    // 두 쿼리 결과 합치기
    const allDocs = [...activeSubscriptionsSnapshot.docs];

    // past_due 중에서 재시도 대상만 필터링 (retryCount < 3)
    for (const doc of pastDueSubscriptionsSnapshot.docs) {
      const subscription = doc.data();
      const retryCount = subscription.retryCount || 0;
      const lastFailedAt = subscription.lastPaymentFailedAt?.toDate?.() || subscription.lastPaymentFailedAt;

      if (retryCount < 3 && lastFailedAt) {
        const daysSinceFailure = Math.floor((today.getTime() - new Date(lastFailedAt).getTime()) / (1000 * 60 * 60 * 24));

        // D+0 (1회차), D+1 (2회차), D+2 (3회차) 재시도
        if (daysSinceFailure === retryCount) {
          allDocs.push(doc);
        }
      }
    }

    const subscriptionsSnapshot = { docs: allDocs };

    interface BillingResult {
      tenantId: string;
      email: string;
      status: 'success' | 'retry' | 'suspended';
      error?: string;
      retryCount?: number;
    }

    const results: BillingResult[] = [];

    for (const doc of subscriptionsSnapshot.docs) {
      const subscription = doc.data();
      const tenantId = doc.id; // document ID가 tenantId
      const email = subscription.email;

      try {
        // 멱등성 키 생성 (날짜 기반)
        const idempotencyKey = generateIdempotencyKey('AUTO_BILLING', tenantId);

        // 이미 오늘 처리된 결제가 있으면 스킵
        const existingPayment = await findExistingPayment(db, idempotencyKey);
        if (existingPayment) {
          console.log(`Recurring billing already processed today for ${tenantId}, skipping`);
          results.push({ tenantId, email, status: 'success' });
          continue;
        }

        // 빌링키로 자동 결제
        const orderId = `REC_${Date.now()}`;
        const orderName = `YAMOO ${getPlanName(subscription.plan)} 플랜`;

        // 가격 정책에 따른 실제 결제 금액 계산
        const effectiveAmount = getEffectiveAmount({
          plan: subscription.plan,
          amount: subscription.amount,
          pricePolicy: subscription.pricePolicy,
          priceProtectedUntil: subscription.priceProtectedUntil?.toDate?.() || subscription.priceProtectedUntil,
        });

        const response = await payWithBillingKey(
          subscription.billingKey,
          email,
          effectiveAmount,
          orderId,
          orderName,
          email
        );

        // 결제 성공
        if (response.status === 'DONE') {
          const nextBillingDate = new Date(subscription.nextBillingDate.toDate());
          nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);

          // 구독 정보 업데이트
          await db.collection('subscriptions').doc(tenantId).update({
            status: 'active',
            currentPeriodStart: subscription.currentPeriodEnd,
            currentPeriodEnd: nextBillingDate,
            nextBillingDate,
            retryCount: 0,
            gracePeriodUntil: null,
            lastPaymentError: null,
            updatedAt: new Date(),
          });

          // 결제 내역 저장 (멱등성 키 포함)
          await db.collection('payments').add({
            tenantId,
            email,
            orderId,
            paymentKey: response.paymentKey,
            amount: effectiveAmount,
            plan: subscription.plan,
            category: 'recurring',
            type: 'auto',
            status: 'done',
            method: response.method,
            cardInfo: response.card || null,
            receiptUrl: response.receipt?.url || null,
            idempotencyKey,  // 멱등성 키 저장
            paidAt: new Date(),
            createdAt: new Date(),
          });

          // 가격 정책이 'protected_until'이고 보호 기간이 지났으면 subscription.amount도 업데이트
          if (subscription.pricePolicy === 'protected_until' && effectiveAmount !== subscription.amount) {
            await db.collection('subscriptions').doc(tenantId).update({
              amount: effectiveAmount,
              pricePolicy: 'standard', // 보호 기간 종료 후 일반으로 변경
              updatedAt: new Date(),
            });
          }

          // tenants 컬렉션에 결제 성공 동기화
          await syncPaymentSuccess(tenantId, nextBillingDate);

          // n8n 웹훅 (정기결제 성공 알림)
          if (isN8NNotificationEnabled()) {
            try {
              await fetch(process.env.N8N_WEBHOOK_URL!, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  event: 'recurring_payment_success',
                  tenantId,
                  email,
                  plan: subscription.plan,
                  amount: effectiveAmount,
                }),
              });
            } catch {
              // 웹훅 실패 무시
            }
          }

          results.push({ tenantId, email, status: 'success' });
        }
      } catch (error) {
        // 결제 실패 처리
        console.error(`Payment failed for tenantId ${tenantId}:`, error);

        const retryCount = subscription.retryCount || 0;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const newRetryCount = retryCount + 1;

        // 1회 실패 시 유예 기간 설정 (D+0부터 D+6까지 7일, D+7에 종료)
        const updateData: Record<string, unknown> = {
          status: 'past_due',
          retryCount: newRetryCount,
          lastPaymentError: errorMessage,
          lastPaymentFailedAt: new Date(),
          updatedAt: new Date(),
        };

        // 1회차 실패 시 유예 기간 시작
        if (newRetryCount === 1) {
          const gracePeriodUntil = new Date();
          gracePeriodUntil.setDate(gracePeriodUntil.getDate() + 6); // D+0부터 D+6까지 (7일)
          updateData.gracePeriodUntil = gracePeriodUntil;
        }

        await db.collection('subscriptions').doc(tenantId).update(updateData);

        // tenants 컬렉션에 결제 실패 동기화
        await syncPaymentFailure(tenantId);

        if (newRetryCount >= 3) {
          // 3회 실패 알림
          if (isN8NNotificationEnabled()) {
            try {
              await fetch(process.env.N8N_WEBHOOK_URL!, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  event: 'payment_failed_grace_period',
                  tenantId,
                  email,
                  plan: subscription.plan,
                  amount: subscription.amount,
                  retryCount: newRetryCount,
                  errorMessage,
                  cardInfo: subscription.cardInfo || null,
                  timestamp: new Date().toISOString(),
                }),
              });
            } catch {
              // 웹훅 실패 무시
            }
          }

          results.push({ tenantId, email, status: 'retry', retryCount: newRetryCount, error: errorMessage });
        } else {
          // 1~2회 실패 알림

          // 재시도 알림 (1회차, 2회차)
          if (isN8NNotificationEnabled()) {
            try {
              await fetch(process.env.N8N_WEBHOOK_URL!, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  event: `payment_retry_${newRetryCount}`,
                  tenantId,
                  email,
                  plan: subscription.plan,
                  amount: subscription.amount,
                  retryCount: newRetryCount,
                  remainingRetries: 3 - newRetryCount,
                  errorMessage,
                  cardInfo: subscription.cardInfo || null,
                  nextRetryDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 다음 날
                  timestamp: new Date().toISOString(),
                }),
              });
            } catch {
              // 웹훅 실패 무시
            }
          }

          results.push({ tenantId, email, status: 'retry', retryCount: newRetryCount });
        }
      }
    }

    return NextResponse.json({
      success: true,
      trialConverted: convertedTrials.length,
      trialExpired: expiredTrials.length,
      cardExpiringAlerts: cardExpiringAlerts.length,
      pendingPlansApplied: appliedPendingPlans.length,
      gracePeriodExpired: expiredGracePeriods.length,
      paymentsProcessed: results.length,
      details: {
        convertedTrials,
        expiredTrials,
        cardExpiringAlerts,
        appliedPendingPlans,
        expiredGracePeriods,
        billingResults: results,
      },
    });
  } catch (error) {
    console.error('Cron billing job failed:', error);
    return NextResponse.json(
      { error: 'Billing job failed' },
      { status: 500 }
    );
  }
}
