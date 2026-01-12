import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin, getAdminAuth } from '@/lib/firebase-admin';
import { payWithBillingKey, cancelPayment, getPayment, getPlanName, PLAN_PRICES } from '@/lib/toss';
import { syncPlanChange } from '@/lib/tenant-sync';
import { isN8NNotificationEnabled } from '@/lib/n8n';
import { findExistingPayment } from '@/lib/idempotency';
import { verifyToken } from '@/lib/auth';

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
  newPlanPrice: number,
  currentPeriodStart: Date,
  nextBillingDate: Date
): { creditAmount: number; proratedNewAmount: number } {
  const startDateOnly = new Date(currentPeriodStart);
  startDateOnly.setHours(0, 0, 0, 0);
  const nextDateOnly = new Date(nextBillingDate);
  nextDateOnly.setHours(0, 0, 0, 0);

  // 총 기간 일수
  const totalDaysInPeriod = Math.round((nextDateOnly.getTime() - startDateOnly.getTime()) / (1000 * 60 * 60 * 24));

  // 사용 일수 (오늘 포함)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const usedDays = Math.round((today.getTime() - startDateOnly.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  // 남은 일수
  const daysLeft = Math.max(0, totalDaysInPeriod - usedDays);

  // 0 나누기 방지
  if (totalDaysInPeriod <= 0) {
    return { creditAmount: 0, proratedNewAmount: 0 };
  }

  // 기존 플랜 환불 금액: 남은 일수 비율로 계산
  const creditAmount = Math.round((currentAmount / totalDaysInPeriod) * daysLeft);

  // 새 플랜 결제 금액: (남은 일수 + 오늘) 비율로 계산
  const proratedNewAmount = Math.round((newPlanPrice / totalDaysInPeriod) * (daysLeft + 1));

  return { creditAmount, proratedNewAmount };
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
          refundAmount: existingPayment.refundAmount || 0,
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

    const previousPlan = subscription.plan;
    const previousAmount = subscription.amount || PLAN_PRICES[previousPlan] || 0;
    const now = new Date();
    const timestamp = Date.now();

    // 서버에서 일할계산 수행
    let creditAmount = 0;
    let proratedNewAmount = 0;

    // currentPeriodStart와 nextBillingDate가 있으면 일할계산
    const currentPeriodStart = subscription.currentPeriodStart?.toDate?.() ||
                               (subscription.currentPeriodStart ? new Date(subscription.currentPeriodStart) : null);
    const nextBillingDate = subscription.nextBillingDate?.toDate?.() ||
                            (subscription.nextBillingDate ? new Date(subscription.nextBillingDate) : null);

    if (currentPeriodStart && nextBillingDate) {
      const proration = calculateProration(previousAmount, newPlanPrice, currentPeriodStart, nextBillingDate);
      creditAmount = proration.creditAmount;
      proratedNewAmount = proration.proratedNewAmount;
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
    const refundOrderId = `REF_${timestamp}`;

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
        // 환불 레코드 타입만 제외하고 원결제 찾기 (plan_change도 환불 가능한 결제임)
        const excludeTypes = ['plan_change_refund', 'refund', 'cancel_refund', 'downgrade_refund'];
        const originalPaymentDoc = paymentsSnapshot.docs.find(doc => {
          const data = doc.data();
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
    const paymentOrderId = `CHG_${timestamp}`;

    if (proratedNewAmount && proratedNewAmount > 0) {
      const orderName = `YAMOO ${getPlanName(previousPlan)} → ${getPlanName(newPlan)} 변경`;

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
        transaction.set(refundRef, {
          tenantId,
          email: authenticatedEmail,
          orderId: refundOrderId,
          paymentKey: refundResult.paymentKey || null,
          amount: -actualRefundedAmount, // 음수로 저장 (환불)
          plan: previousPlan,
          category: 'refund',
          type: 'partial',
          previousPlan,
          newPlan,
          status: 'refunded',
          refundAmount: actualRefundedAmount,
          refundReason: `${getPlanName(previousPlan)} → ${getPlanName(newPlan)} 플랜 변경 (미사용분)`,
          originalPaymentId,
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
          });
        }
      }

      // 새 플랜 결제 내역 저장 (멱등성 키 포함)
      if (proratedNewAmount && proratedNewAmount > 0 && paymentResponse) {
        const paymentDocId = `${paymentOrderId}_${Date.now()}`;
        const paymentRef = db.collection('payments').doc(paymentDocId);
        transaction.set(paymentRef, {
          tenantId,
          email: authenticatedEmail,
          orderId: paymentOrderId,
          paymentKey: paymentResponse.paymentKey,
          amount: proratedNewAmount,
          plan: newPlan,
          category: 'change',
          type: isUpgrade ? 'upgrade' : 'downgrade',
          previousPlan,
          status: 'done',
          method: paymentResponse.method,
          cardInfo: paymentResponse.card || null,
          receiptUrl: paymentResponse.receipt?.url || null,
          idempotencyKey: idempotencyKey || null,  // 멱등성 키 저장
          paidAt: now,
          createdAt: now,
        });
      }

      // 구독 정보 업데이트
      const subscriptionRef = db.collection('subscriptions').doc(tenantId);
      transaction.update(subscriptionRef, {
        plan: newPlan,
        amount: newPlanPrice,
        previousPlan,
        previousAmount,
        planChangedAt: now,
        updatedAt: now,
        pendingPlan: null,
        pendingAmount: null,
        pendingMode: null,
      });
    });

    // tenants 컬렉션 동기화
    await syncPlanChange(tenantId, newPlan);

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
      orderId: paymentOrderId,
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
