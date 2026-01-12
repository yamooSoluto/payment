import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { verifyToken } from '@/lib/auth';
import { isN8NNotificationEnabled } from '@/lib/n8n';

export interface Card {
  id: string;
  tenantId: string;
  email: string;
  billingKey: string;
  cardInfo: {
    company: string;
    number: string;
    cardType?: string;
    ownerType?: string;
  };
  alias?: string;
  isPrimary: boolean;
  createdAt: Date;
}

// 카드 목록 조회
export async function GET(request: NextRequest) {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');
    const emailParam = searchParams.get('email');
    const tenantId = searchParams.get('tenantId');

    let email: string | null = null;

    if (token) {
      email = await verifyToken(token);
    } else if (emailParam) {
      email = emailParam;
    }

    if (!email) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId is required' }, { status: 400 });
    }

    // 해당 tenant의 카드 목록 조회
    const cardsSnapshot = await db
      .collection('cards')
      .where('tenantId', '==', tenantId)
      .get();

    let cards = cardsSnapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        tenantId: data.tenantId,
        email: data.email,
        cardInfo: data.cardInfo,
        alias: data.alias,
        isPrimary: data.isPrimary || false,
        createdAt: data.createdAt?.toDate?.() || data.createdAt,
      };
    });

    // cards 컬렉션이 비어있으면 subscriptions에서 기존 카드 마이그레이션
    if (cards.length === 0) {
      const subscriptionDoc = await db.collection('subscriptions').doc(tenantId).get();
      if (subscriptionDoc.exists) {
        const subscription = subscriptionDoc.data();
        if (subscription?.billingKey && subscription?.cardInfo) {
          // 기존 카드를 cards 컬렉션으로 마이그레이션
          const now = new Date();
          const cardRef = db.collection('cards').doc();

          await cardRef.set({
            tenantId,
            email: subscription.email,
            billingKey: subscription.billingKey,
            cardInfo: subscription.cardInfo,
            alias: subscription.cardAlias || null,
            isPrimary: true,
            createdAt: subscription.cardUpdatedAt || subscription.createdAt || now,
          });

          // subscription에 primaryCardId 추가
          await db.collection('subscriptions').doc(tenantId).update({
            primaryCardId: cardRef.id,
          });

          cards = [{
            id: cardRef.id,
            tenantId,
            email: subscription.email,
            cardInfo: subscription.cardInfo,
            alias: subscription.cardAlias || null,
            isPrimary: true,
            createdAt: subscription.cardUpdatedAt || subscription.createdAt || now,
          }];
        }
      }
    }

    return NextResponse.json({ cards });
  } catch (error) {
    console.error('Failed to fetch cards:', error);
    return NextResponse.json({ error: 'Failed to fetch cards' }, { status: 500 });
  }
}

// 새 카드 추가 (기존 update-card 로직을 확장)
export async function POST(request: NextRequest) {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { token, email: emailParam, tenantId, billingKey, cardInfo, alias, setAsPrimary } = body;

    let email: string | null = null;

    if (token) {
      email = await verifyToken(token);
    } else if (emailParam) {
      email = emailParam;
    }

    if (!email) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    if (!tenantId || !billingKey || !cardInfo) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // 구독 정보 확인
    const subscriptionDoc = await db.collection('subscriptions').doc(tenantId).get();
    if (!subscriptionDoc.exists) {
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
    }

    const subscription = subscriptionDoc.data();
    if (subscription?.email !== email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // 같은 카드번호로 이미 등록된 카드가 있는지 확인
    const existingCardSnapshot = await db
      .collection('cards')
      .where('tenantId', '==', tenantId)
      .where('cardInfo.number', '==', cardInfo.number)
      .get();

    if (!existingCardSnapshot.empty) {
      return NextResponse.json({ error: 'Card already registered' }, { status: 400 });
    }

    // 최대 5개 카드 제한
    const cardCountSnapshot = await db
      .collection('cards')
      .where('tenantId', '==', tenantId)
      .get();

    if (cardCountSnapshot.size >= 5) {
      return NextResponse.json({ error: 'Maximum 5 cards allowed' }, { status: 400 });
    }

    const now = new Date();
    const isFirstCard = cardCountSnapshot.empty;
    const shouldSetPrimary = setAsPrimary || isFirstCard;

    // 트랜잭션으로 카드 추가 및 primary 설정
    await db.runTransaction(async (transaction) => {
      // 새 카드가 primary로 설정되면 기존 primary 해제
      if (shouldSetPrimary && !isFirstCard) {
        const primaryCards = cardCountSnapshot.docs.filter(
          (doc) => doc.data().isPrimary === true
        );
        for (const doc of primaryCards) {
          transaction.update(doc.ref, { isPrimary: false });
        }
      }

      // 새 카드 추가
      const cardRef = db.collection('cards').doc();
      transaction.set(cardRef, {
        tenantId,
        email,
        billingKey,
        cardInfo,
        alias: alias || null,
        isPrimary: shouldSetPrimary,
        createdAt: now,
      });

      // 구독의 primary 카드 정보 업데이트
      if (shouldSetPrimary) {
        const subscriptionRef = db.collection('subscriptions').doc(tenantId);
        transaction.update(subscriptionRef, {
          billingKey,
          cardInfo,
          cardAlias: alias || null,
          primaryCardId: cardRef.id,
          cardUpdatedAt: now,
          updatedAt: now,
        });
      }
    });

    // 자동 재시도: past_due 상태이고 유예 기간 내라면 즉시 결제 재시도
    let retryResult = null;
    if (shouldSetPrimary && subscription?.status === 'past_due') {
      const retryCount = subscription.retryCount || 0;
      const gracePeriodUntil = subscription.gracePeriodUntil?.toDate?.() || subscription.gracePeriodUntil;

      // 재시도 가능 여부 확인 (3회 미만, 유예 기간 내)
      if (retryCount < 3 || (gracePeriodUntil && new Date(gracePeriodUntil) > new Date())) {
        try {
          const { payWithBillingKey, getPlanName, getEffectiveAmount } = await import('@/lib/toss');

          const orderId = `REC_${Date.now()}`;
          const orderName = `YAMOO ${getPlanName(subscription.plan)} 플랜`;

          const effectiveAmount = getEffectiveAmount({
            plan: subscription.plan,
            amount: subscription.amount,
            pricePolicy: subscription.pricePolicy,
            priceProtectedUntil: subscription.priceProtectedUntil?.toDate?.() || subscription.priceProtectedUntil,
          });

          const paymentResponse = await payWithBillingKey(
            billingKey,
            email,
            effectiveAmount,
            orderId,
            orderName,
            email
          );

          if (paymentResponse.status === 'DONE') {
            const nextBillingDate = new Date();
            nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);

            // 구독 상태 복구
            await db.collection('subscriptions').doc(tenantId).update({
              status: 'active',
              currentPeriodStart: now,
              currentPeriodEnd: nextBillingDate,
              nextBillingDate,
              retryCount: 0,
              gracePeriodUntil: null,
              lastPaymentError: null,
              updatedAt: now,
            });

            // 결제 내역 저장
            await db.collection('payments').add({
              tenantId,
              email,
              orderId,
              paymentKey: paymentResponse.paymentKey,
              amount: effectiveAmount,
              plan: subscription.plan,
              category: 'recurring',
              type: 'retry',
              status: 'done',
              method: paymentResponse.method,
              cardInfo: paymentResponse.card || null,
              receiptUrl: paymentResponse.receipt?.url || null,
              paidAt: now,
              createdAt: now,
            });

            // tenants 컬렉션 동기화
            const { syncPaymentSuccess } = await import('@/lib/tenant-sync');
            await syncPaymentSuccess(tenantId, nextBillingDate);

            // N8N 웹훅 알림
            if (isN8NNotificationEnabled()) {
              try {
                await fetch(process.env.N8N_WEBHOOK_URL!, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    event: 'card_update_retry_success',
                    tenantId,
                    email,
                    plan: subscription.plan,
                    amount: effectiveAmount,
                    previousRetryCount: retryCount,
                    timestamp: now.toISOString(),
                  }),
                });
              } catch {
                // 웹훅 실패 무시
              }
            }

            retryResult = { success: true, message: '결제가 성공적으로 완료되었습니다.' };
          }
        } catch (error) {
          console.error('Auto-retry payment failed:', error);
          retryResult = { success: false, message: '자동 재결제에 실패했습니다. 다음 재시도 일정에 다시 시도됩니다.' };
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Card added successfully',
      autoRetry: retryResult,
    });
  } catch (error) {
    console.error('Failed to add card:', error);
    return NextResponse.json({ error: 'Failed to add card' }, { status: 500 });
  }
}
