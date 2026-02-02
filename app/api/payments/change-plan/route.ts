import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin, getAdminAuth } from '@/lib/firebase-admin';
import { payWithBillingKey, cancelPayment, getPayment, getPlanName, PLAN_PRICES } from '@/lib/toss';
import { syncPlanChange } from '@/lib/tenant-sync';
import { isN8NNotificationEnabled } from '@/lib/n8n';
import { findExistingPayment } from '@/lib/idempotency';
import { verifyToken } from '@/lib/auth';
import { handleSubscriptionChange } from '@/lib/subscription-history';

// 인증 함수: SSO 토큰 또는 Firebase Auth 토큰 검증
async function authenticateRequest(request: NextRequest): Promise<string | null> {
  const authHeader = request.headers.get('Authorization');

  if (!authHeader) {
    return null;
  }

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
  const email = await verifyToken(authHeader);
  return email;
}

// 일할계산 함수
function calculateProration(
  currentAmount: number,
  currentAmountPeriodDays: number,  // 원래 결제 기간 일수
  newPlanPrice: number,
  currentPeriodStart: Date,
  nextBillingDate: Date
): { creditAmount: number; proratedNewAmount: number; newAmountPeriodDays: number } {
  const startDateOnly = new Date(currentPeriodStart);
  startDateOnly.setHours(0, 0, 0, 0);
  const nextDateOnly = new Date(nextBillingDate);
  nextDateOnly.setHours(0, 0, 0, 0);

  // 현재 기간의 총 일수 (currentPeriodStart ~ nextBillingDate) - 실제 기간
  const totalDaysInPeriod = Math.round((nextDateOnly.getTime() - startDateOnly.getTime()) / (1000 * 60 * 60 * 24));

  // 사용 일수 (오늘 포함, KST 기준)
  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const today = new Date(Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate()));
  const usedDays = Math.round((today.getTime() - startDateOnly.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  // 남은 일수
  const daysLeft = Math.max(0, totalDaysInPeriod - usedDays);

  // 새 플랜의 이용 일수 (오늘부터 종료일까지)
  const newPlanDays = daysLeft + 1;

  // 0 나누기 방지
  if (currentAmountPeriodDays <= 0) {
    return { creditAmount: 0, proratedNewAmount: 0, newAmountPeriodDays: newPlanDays };
  }

  // 기존 플랜 환불 금액: 원래 결제 기간 기준으로 남은 일수만큼 환불
  const dailyCreditRate = currentAmount / currentAmountPeriodDays;
  const creditAmount = Math.round(dailyCreditRate * daysLeft);

  // 새 플랜 결제 금액: 원래 결제 기간 기준으로 이용할 일수만큼 결제
  const dailyNewPlanRate = newPlanPrice / currentAmountPeriodDays;
  const proratedNewAmount = Math.round(dailyNewPlanRate * newPlanDays);

  return { creditAmount, proratedNewAmount, newAmountPeriodDays: newPlanDays };
}

export async function POST(request: NextRequest) {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
  }

  try {
    // 인증 검증
    const authenticatedEmail = await authenticateRequest(request);
    if (!authenticatedEmail) {
      return NextResponse.json({ error: 'Unauthorized - valid token required' }, { status: 401 });
    }

    const body = await request.json();
    const { tenantId, newPlan, idempotencyKey } = body;
    // email, newAmount, creditAmount, proratedNewAmount는 클라이언트에서 받지만 무시하고 서버에서 계산

    if (!tenantId || !newPlan) {
      return NextResponse.json({ error: 'Missing required fields: tenantId, newPlan' }, { status: 400 });
    }

    // 플랜 가격 검증
    const newPlanPrice = PLAN_PRICES[newPlan];
    if (newPlanPrice === undefined) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
    }

    // 멱등성 체크: 이미 처리된 결제가 있으면 기존 결과 반환
    if (idempotencyKey) {
      const existingPayment = await findExistingPayment(db, idempotencyKey);
      if (existingPayment) {
        console.log('Duplicate plan change detected, returning existing result:', existingPayment.orderId);
        return NextResponse.json({
          success: true,
          orderId: existingPayment.orderId,
          refundAmount: 0,
          paidAmount: existingPayment.amount || 0,
          message: `이미 처리된 플랜 변경입니다.`,
          duplicate: true,
        });
      }
    }

    // 구독 정보 조회
    const subscriptionDoc = await db.collection('subscriptions').doc(tenantId).get();
    if (!subscriptionDoc.exists) {
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
    }

    const subscription = subscriptionDoc.data();

    // 권한 확인: 토큰에서 추출한 이메일과 구독 이메일 비교
    if (subscription?.email !== authenticatedEmail) {
      return NextResponse.json({ error: 'Unauthorized - not your subscription' }, { status: 403 });
    }

    if (!subscription?.billingKey) {
      return NextResponse.json({ error: 'Billing key not found' }, { status: 400 });
    }

    if (subscription.status !== 'active') {
      return NextResponse.json({ error: 'No active subscription' }, { status: 400 });
    }

    // amountPeriodDays 검증 (필수 필드)
    const currentAmountPeriodDays = subscription.amountPeriodDays;
    if (!currentAmountPeriodDays || currentAmountPeriodDays <= 0) {
      return NextResponse.json({
        error: 'amountPeriodDays not found. 기존 구독 데이터를 삭제 후 새로 생성해주세요.'
      }, { status: 400 });
    }

    const previousPlan = subscription.plan;
    // Enterprise는 협의 금액이라 환불 대상이 아님
    const previousAmount = previousPlan === 'enterprise' ? 0 : (subscription.amount || PLAN_PRICES[previousPlan] || 0);
    const now = new Date();
    const timestamp = Date.now();

    // 매장명 가져오기 (subscription에 있으면 사용, 없으면 tenant 조회)
    let brandName = subscription.brandName || '';
    if (!brandName) {
      const tenantDoc = await db.collection('tenants').doc(tenantId).get();
      if (tenantDoc.exists) {
        brandName = tenantDoc.data()?.brandName || '';
      }
    }

    // 서버에서 일할계산 수행
    let creditAmount = 0;
    let proratedNewAmount = 0;

    // currentPeriodStart와 nextBillingDate가 있으면 일할계산
    const currentPeriodStart = subscription.currentPeriodStart?.toDate?.() ||
                               (subscription.currentPeriodStart ? new Date(subscription.currentPeriodStart) : null);
    const nextBillingDate = subscription.nextBillingDate?.toDate?.() ||
                            (subscription.nextBillingDate ? new Date(subscription.nextBillingDate) : null);

    // newAmountPeriodDays: 플랜 변경 후 저장할 기간 일수
    let newAmountPeriodDays = currentAmountPeriodDays;

    if (currentPeriodStart && nextBillingDate) {
      const proration = calculateProration(previousAmount, currentAmountPeriodDays, newPlanPrice, currentPeriodStart, nextBillingDate);
      creditAmount = proration.creditAmount;
      proratedNewAmount = proration.proratedNewAmount;
      newAmountPeriodDays = proration.newAmountPeriodDays;
    } else {
      // 기간 정보가 없으면 전체 금액 사용
      proratedNewAmount = newPlanPrice;
    }

    console.log('Processing plan change:', {
      tenantId,
      previousPlan,
      newPlan,
      creditAmount,
      proratedNewAmount,
      authenticatedEmail,
    });

    // 1. 기존 결제에서 미사용분 부분 환불
    let refundResult = null;
    let originalPaymentId = null;
    let actualRefundedAmount = 0; // 실제 환불된 금액

    // 업그레이드/다운그레이드 판별
    const isUpgrade = newPlanPrice > previousAmount;

    if (creditAmount > 0) {
      // 가장 최근 원결제 내역 조회 (환불이나 플랜변경 제외)
      const paymentsSnapshot = await db
        .collection('payments')
        .where('tenantId', '==', tenantId)
        .where('status', '==', 'done')
        .orderBy('createdAt', 'desc')
        .limit(5) // 여러 개 가져와서 필터링
        .get();

      if (!paymentsSnapshot.empty) {
        // 환불 레코드 제외하고 실제 결제(charge) 찾기
        const excludeTypes = ['plan_change_refund', 'refund', 'cancel_refund', 'downgrade_refund'];
        const originalPaymentDoc = paymentsSnapshot.docs.find(doc => {
          const data = doc.data();
          // transactionType이 'refund'인 레코드 제외 (플랜 변경 환불 레코드는 type이 'upgrade'/'downgrade'라 excludeTypes에 안 걸림)
          if (data.transactionType === 'refund') return false;
          // 음수 금액 레코드 제외 (환불 레코드 안전장치)
          if ((data.amount || 0) < 0) return false;
          return !excludeTypes.includes(data.type || '');
        });

        if (originalPaymentDoc) {
          const lastPayment = originalPaymentDoc.data();
          originalPaymentId = originalPaymentDoc.id;

          // 이미 환불된 금액 확인
          const alreadyRefunded = lastPayment.refundedAmount || 0;
          const refundableAmount = lastPayment.amount - alreadyRefunded;

          console.log('Refund check:', {
            originalPaymentId,
            paymentAmount: lastPayment.amount,
            alreadyRefunded,
            refundableAmount,
            requestedRefund: creditAmount,
          });

          // 부분 환불 시도
          if (lastPayment.paymentKey) {
            try {
              // Toss에서 실제 취소 가능 금액 확인
              const tossPayment = await getPayment(lastPayment.paymentKey);
              const tossCancellable = tossPayment.cancels
                ? tossPayment.totalAmount - tossPayment.cancels.reduce((sum: number, c: { cancelAmount: number }) => sum + c.cancelAmount, 0)
                : tossPayment.totalAmount;

              console.log('Toss payment check:', {
                paymentKey: lastPayment.paymentKey,
                totalAmount: tossPayment.totalAmount,
                tossCancellable,
                dbRefundable: refundableAmount,
                requestedRefund: creditAmount,
              });

              // 환불 가능한 금액이 없는 경우
              if (tossCancellable <= 0) {
                console.log('No cancellable amount in Toss, skipping refund');
              } else {
                // 실제 환불 금액 (요청 금액, DB 환불 가능 금액, Toss 취소 가능 금액 중 가장 작은 값)
                actualRefundedAmount = Math.min(creditAmount, refundableAmount, tossCancellable);

                if (actualRefundedAmount > 0) {
                  refundResult = await cancelPayment(
                    lastPayment.paymentKey,
                    `플랜 변경: ${getPlanName(previousPlan)} → ${getPlanName(newPlan)} (미사용분 환불)`,
                    actualRefundedAmount
                  );
                  console.log('Refund processed:', refundResult);
                }
              }
            } catch (refundError) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const tossError = (refundError as any)?.response?.data;
              console.error('Refund failed:', {
                error: refundError,
                tossError,
                paymentKey: lastPayment.paymentKey,
              });

              // Toss 에러 메시지 추출
              const errorMessage = tossError?.message || '기존 플랜 환불 처리에 실패했습니다.';

              return NextResponse.json({
                error: `환불 실패: ${errorMessage}`,
                tossErrorCode: tossError?.code,
              }, { status: 500 });
            }
          } else {
            console.log('No paymentKey found, skipping refund');
          }
        } else {
          console.log('No original payment found (all are refund/plan_change types)');
        }
      } else {
        console.log('No previous payment found for refund');
      }
    }

    // 2. 새 플랜 결제 (일할계산)
    let paymentResponse = null;
    const changeGroupId = `CHG_${timestamp}`;  // 환불과 결제를 묶는 그룹 ID
    const refundOrderId = `CHG_${timestamp}_refund`;  // 환불용 orderId
    const paymentOrderId = `CHG_${timestamp}_charge`;  // 결제용 orderId

    if (proratedNewAmount && proratedNewAmount > 0) {
      const orderName = brandName
        ? `YAMOO ${getPlanName(previousPlan)} → ${getPlanName(newPlan)} 변경 (${brandName})`
        : `YAMOO ${getPlanName(previousPlan)} → ${getPlanName(newPlan)} 변경`;

      try {
        paymentResponse = await payWithBillingKey(
          subscription.billingKey,
          authenticatedEmail,
          proratedNewAmount,
          paymentOrderId,
          orderName,
          authenticatedEmail
        );
        console.log('New plan payment completed:', paymentResponse.status);
      } catch (paymentError) {
        console.error('New plan payment failed:', paymentError);
        // 결제 실패 시 에러 반환 (환불은 이미 처리됨 - 관리자 수동 처리 필요)
        return NextResponse.json({
          error: '새 플랜 결제에 실패했습니다. 고객센터에 문의해주세요.',
          refundProcessed: !!refundResult,
          refundAmount: creditAmount,
        }, { status: 500 });
      }
    }

    // 3. 트랜잭션으로 데이터 업데이트
    await db.runTransaction(async (transaction) => {
      // === 모든 읽기 먼저 수행 ===
      let existingRefunded = 0;
      let originalPaymentRef = null;

      if (actualRefundedAmount > 0 && refundResult && originalPaymentId) {
        originalPaymentRef = db.collection('payments').doc(originalPaymentId);
        const originalPaymentDoc = await transaction.get(originalPaymentRef);
        if (originalPaymentDoc.exists) {
          existingRefunded = originalPaymentDoc.data()?.refundedAmount || 0;
        }
      }

      // === 모든 쓰기 수행 ===

      // 환불 내역 저장 (기존 플랜)
      if (actualRefundedAmount > 0 && refundResult) {
        const refundDocId = `${refundOrderId}_${Date.now()}`;
        const refundRef = db.collection('payments').doc(refundDocId);
        const refundOrderName = brandName
          ? `YAMOO ${getPlanName(previousPlan)} 환불 - ${getPlanName(newPlan)} 변경 (${brandName})`
          : `YAMOO ${getPlanName(previousPlan)} 환불 - ${getPlanName(newPlan)} 변경`;
        transaction.set(refundRef, {
          tenantId,
          userId: subscription?.userId || '',
          email: authenticatedEmail,
          orderId: refundOrderId,
          orderName: refundOrderName,
          paymentKey: refundResult.paymentKey || null,
          amount: -actualRefundedAmount, // 음수로 저장 (환불)
          plan: previousPlan,
          category: 'change',
          type: isUpgrade ? 'upgrade' : 'downgrade',
          transactionType: 'refund',
          initiatedBy: 'user',
          changeGroupId,
          previousPlan,
          status: 'done',
          refundReason: `${getPlanName(previousPlan)} → ${getPlanName(newPlan)} 플랜 변경 (미사용분)`,
          originalPaymentId,
          receiptUrl: refundResult.receipt?.url || null,
          paidAt: now,
          createdAt: now,
        });

        // 원결제 문서에 환불 정보 업데이트
        if (originalPaymentRef) {
          transaction.update(originalPaymentRef, {
            refundedAmount: existingRefunded + actualRefundedAmount,
            lastRefundAt: now,
            lastRefundReason: `${getPlanName(previousPlan)} → ${getPlanName(newPlan)} 플랜 변경`,
            updatedAt: now,
            updatedBy: 'user',
          });
        }
      }

      // 새 플랜 결제 내역 저장 (멱등성 키 포함)
      if (proratedNewAmount && proratedNewAmount > 0 && paymentResponse) {
        const paymentDocId = `${paymentOrderId}_${Date.now()}`;
        const paymentRef = db.collection('payments').doc(paymentDocId);
        const chargeOrderName = brandName
          ? `YAMOO ${getPlanName(newPlan)} 결제 - ${getPlanName(previousPlan)}에서 변경 (${brandName})`
          : `YAMOO ${getPlanName(newPlan)} 결제 - ${getPlanName(previousPlan)}에서 변경`;
        transaction.set(paymentRef, {
          tenantId,
          userId: subscription?.userId || '',
          email: authenticatedEmail,
          orderId: paymentOrderId,
          orderName: chargeOrderName,
          paymentKey: paymentResponse.paymentKey,
          amount: proratedNewAmount,
          plan: newPlan,
          category: 'change',
          type: isUpgrade ? 'upgrade' : 'downgrade',
          transactionType: 'charge',
          initiatedBy: 'user',
          changeGroupId,
          previousPlan,
          status: 'done',
          method: paymentResponse.method,
          cardInfo: paymentResponse.card || null,
          receiptUrl: paymentResponse.receipt?.url || null,
          idempotencyKey: idempotencyKey || null,
          paidAt: now,
          createdAt: now,
        });
      }

      // 구독 정보 업데이트
      const subscriptionRef = db.collection('subscriptions').doc(tenantId);
      transaction.update(subscriptionRef, {
        plan: newPlan,
        amount: proratedNewAmount, // 이번에 실제 결제한 금액 (일할계산)
        amountPeriodDays: newAmountPeriodDays, // 이번 결제 금액에 해당하는 기간 일수
        baseAmount: newPlanPrice,  // 플랜 기본가 (정기결제 금액, UI 표시용)
        previousPlan,
        previousAmount,
        planChangedAt: now,
        currentPeriodStart: now, // 플랜 변경 시 구독 기간 시작일도 업데이트
        updatedAt: now,
        updatedBy: 'user',
        updatedByAdminId: null,
        pendingPlan: null,
        pendingAmount: null,
        pendingMode: null,
      });
    });

    // tenants 컬렉션 동기화
    await syncPlanChange(tenantId, newPlan);

    // subscription_history에 기록 추가
    try {
      await handleSubscriptionChange(db, {
        tenantId,
        userId: subscription?.userId || '',
        email: authenticatedEmail,
        brandName,
        newPlan,
        newStatus: 'active',
        amount: newPlanPrice,
        periodStart: now,
        periodEnd: subscription.currentPeriodEnd?.toDate?.() || null,
        billingDate: proratedNewAmount && proratedNewAmount > 0 ? now : undefined,
        changeType: isUpgrade ? 'upgrade' : 'downgrade',
        changedBy: 'user',
        previousPlan,
        previousStatus: 'active',
        orderId: proratedNewAmount && proratedNewAmount > 0 ? paymentOrderId : undefined,
      });
      console.log('✅ Subscription history recorded for plan change');
    } catch (historyError) {
      console.error('Failed to record subscription history:', historyError);
    }

    // n8n 웹훅
    if (isN8NNotificationEnabled()) {
      try {
        await fetch(process.env.N8N_WEBHOOK_URL!, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event: 'plan_changed',
            tenantId,
            email: authenticatedEmail,
            previousPlan,
            newPlan,
            refundAmount: actualRefundedAmount,
            newPlanAmount: proratedNewAmount || 0,
          }),
        });
      } catch {
        // 웹훅 실패 무시
      }
    }

    return NextResponse.json({
      success: true,
      changeGroupId,
      orderId: paymentOrderId,
      refundOrderId: actualRefundedAmount > 0 ? refundOrderId : null,
      refundAmount: actualRefundedAmount,
      paidAmount: proratedNewAmount || 0,
      message: `${getPlanName(newPlan)} 플랜으로 변경되었습니다.`,
    });
  } catch (error) {
    console.error('Plan change failed:', error);

    let errorMessage = 'Failed to change plan';
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
