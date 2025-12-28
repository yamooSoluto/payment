import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { payWithBillingKey, getPlanName, getEffectiveAmount } from '@/lib/toss';
import { syncPaymentSuccess, syncPaymentFailure, syncTrialExpired, syncPlanChange } from '@/lib/tenant-sync';

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
    // ========== 1. Trial 만료 처리 ==========
    const expiredTrials: { tenantId: string; email: string }[] = [];

    // trial 플랜이면서 trialEndDate가 오늘 이전인 구독 찾기
    const trialSubscriptions = await db
      .collection('subscriptions')
      .where('plan', '==', 'trial')
      .get();

    for (const doc of trialSubscriptions.docs) {
      const subscription = doc.data();
      const tenantId = doc.id;
      const trialEndDate = subscription.trialEndDate?.toDate?.() || subscription.trialEndDate;

      if (trialEndDate && new Date(trialEndDate) <= today) {
        // Trial 만료 처리
        await db.collection('subscriptions').doc(tenantId).update({
          status: 'expired',
          expiredAt: new Date(),
          updatedAt: new Date(),
        });

        // tenants 컬렉션 동기화
        await syncTrialExpired(tenantId);

        // N8N 웹훅 알림
        if (process.env.N8N_WEBHOOK_URL) {
          try {
            await fetch(process.env.N8N_WEBHOOK_URL, {
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
        console.log(`Trial expired for tenant: ${tenantId}`);
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
          if (process.env.N8N_WEBHOOK_URL) {
            try {
              await fetch(process.env.N8N_WEBHOOK_URL, {
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
        if (process.env.N8N_WEBHOOK_URL) {
          try {
            await fetch(process.env.N8N_WEBHOOK_URL, {
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

    // ========== 3. 정기결제 처리 ==========
    // 오늘 결제일인 구독 찾기
    const subscriptionsSnapshot = await db
      .collection('subscriptions')
      .where('status', '==', 'active')
      .where('nextBillingDate', '<=', today)
      .get();

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
        // 빌링키로 자동 결제
        const orderId = `AUTO_${Date.now()}_${tenantId}`;
        const orderName = `YAMOO ${getPlanName(subscription.plan)} 플랜 - 정기결제`;

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
            currentPeriodStart: subscription.currentPeriodEnd,
            currentPeriodEnd: nextBillingDate,
            nextBillingDate,
            retryCount: 0,
            updatedAt: new Date(),
          });

          // 결제 내역 저장
          await db.collection('payments').add({
            tenantId,
            email,
            orderId,
            paymentKey: response.paymentKey,
            amount: effectiveAmount,
            plan: subscription.plan,
            status: 'done',
            method: response.method,
            receiptUrl: response.receipt?.url || null,
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
          if (process.env.N8N_WEBHOOK_URL) {
            try {
              await fetch(process.env.N8N_WEBHOOK_URL, {
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

        if (retryCount >= 2) {
          // 3회 실패 시 구독 정지
          await db.collection('subscriptions').doc(tenantId).update({
            status: 'past_due',
            lastPaymentError: errorMessage,
            lastPaymentFailedAt: new Date(),
            updatedAt: new Date(),
          });

          // tenants 컬렉션에 결제 실패 동기화
          await syncPaymentFailure(tenantId);

          // 최종 실패 알림 (구독 정지)
          if (process.env.N8N_WEBHOOK_URL) {
            try {
              await fetch(process.env.N8N_WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  event: 'payment_failed_final',
                  tenantId,
                  email,
                  plan: subscription.plan,
                  amount: subscription.amount,
                  retryCount: newRetryCount,
                  errorMessage,
                  cardInfo: subscription.cardInfo || null,
                  status: 'suspended',
                  timestamp: new Date().toISOString(),
                }),
              });
            } catch {
              // 웹훅 실패 무시
            }
          }

          results.push({ tenantId, email, status: 'suspended', error: errorMessage });
        } else {
          // 재시도 카운트 증가
          await db.collection('subscriptions').doc(tenantId).update({
            retryCount: newRetryCount,
            lastPaymentError: errorMessage,
            lastPaymentFailedAt: new Date(),
            updatedAt: new Date(),
          });

          // 재시도 알림 (1회차, 2회차)
          if (process.env.N8N_WEBHOOK_URL) {
            try {
              await fetch(process.env.N8N_WEBHOOK_URL, {
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
      trialExpired: expiredTrials.length,
      cardExpiringAlerts: cardExpiringAlerts.length,
      pendingPlansApplied: appliedPendingPlans.length,
      paymentsProcessed: results.length,
      details: {
        expiredTrials,
        cardExpiringAlerts,
        appliedPendingPlans,
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
