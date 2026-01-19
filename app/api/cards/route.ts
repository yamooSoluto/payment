import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin, getAdminAuth } from '@/lib/firebase-admin';
import { verifyToken } from '@/lib/auth';
import { isN8NNotificationEnabled } from '@/lib/n8n';

// 카드 아이템 인터페이스 (배열 내 개별 카드)
export interface CardItem {
  id: string;
  billingKey: string;
  cardInfo: {
    company: string;
    number: string;
    cardType?: string;
    ownerType?: string;
  };
  alias?: string | null;
  isPrimary: boolean;
  createdAt: Date;
}

// 테넌트별 카드 문서 인터페이스
export interface TenantCardsDocument {
  tenantId: string;
  email: string;
  brandName?: string;
  cards: CardItem[];
  updatedAt: Date;
}

// API 응답용 카드 인터페이스 (기존 호환성 유지)
export interface Card {
  id: string;
  tenantId: string;
  email: string;
  billingKey?: string;
  cardInfo: {
    company: string;
    number: string;
    cardType?: string;
    ownerType?: string;
  };
  alias?: string | null;
  isPrimary: boolean;
  createdAt: Date;
}

// 카드 ID 생성
function generateCardId(): string {
  return `card_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// Firebase ID Token에서 이메일 추출
async function getEmailFromAuthHeader(authHeader: string | null): Promise<string | null> {
  if (!authHeader?.startsWith('Bearer ')) return null;

  try {
    initializeFirebaseAdmin();
    const auth = getAdminAuth();
    if (!auth) return null;

    const idToken = authHeader.replace('Bearer ', '');
    const decodedToken = await auth.verifyIdToken(idToken);
    return decodedToken.email || null;
  } catch {
    return null;
  }
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

    // 1. SSO 토큰으로 인증
    if (token) {
      email = await verifyToken(token);
    }
    // 2. Firebase ID Token으로 인증 (Authorization 헤더)
    if (!email) {
      const authHeader = request.headers.get('authorization');
      email = await getEmailFromAuthHeader(authHeader);
    }
    // 3. email 파라미터 (fallback)
    if (!email && emailParam) {
      email = emailParam;
    }

    if (!email) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId is required' }, { status: 400 });
    }

    // 새 구조: tenantId를 문서 ID로 사용
    const cardsDoc = await db.collection('cards').doc(tenantId).get();

    let cards: Card[] = [];

    if (cardsDoc.exists) {
      // 새 구조에서 카드 목록 반환
      const data = cardsDoc.data() as TenantCardsDocument;
      cards = (data.cards || []).map((card) => ({
        id: card.id,
        tenantId,
        email: data.email,
        cardInfo: card.cardInfo,
        alias: card.alias,
        isPrimary: card.isPrimary || false,
        createdAt: (card.createdAt as unknown as { toDate?: () => Date })?.toDate?.() || card.createdAt,
      }));
    } else {
      // 기존 구조에서 마이그레이션 시도
      const oldCardsSnapshot = await db
        .collection('cards')
        .where('tenantId', '==', tenantId)
        .get();

      if (!oldCardsSnapshot.empty) {
        // 기존 구조 → 새 구조로 마이그레이션
        const now = new Date();
        const oldCards = oldCardsSnapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id, // 기존 문서 ID를 카드 ID로 사용
            billingKey: data.billingKey,
            cardInfo: data.cardInfo,
            alias: data.alias || null,
            isPrimary: data.isPrimary || false,
            createdAt: data.createdAt?.toDate?.() || data.createdAt || now,
          };
        });

        const firstDocData = oldCardsSnapshot.docs[0].data();

        // 새 구조로 저장
        await db.collection('cards').doc(tenantId).set({
          tenantId,
          email: firstDocData.email,
          cards: oldCards,
          updatedAt: now,
        });

        // 기존 문서들 삭제
        const batch = db.batch();
        oldCardsSnapshot.docs.forEach((doc) => batch.delete(doc.ref));
        await batch.commit();

        cards = oldCards.map((card) => ({
          id: card.id,
          tenantId,
          email: firstDocData.email,
          cardInfo: card.cardInfo,
          alias: card.alias,
          isPrimary: card.isPrimary,
          createdAt: card.createdAt,
        }));
      } else {
        // cards 컬렉션이 비어있으면 subscriptions에서 기존 카드 마이그레이션
        const subscriptionDoc = await db.collection('subscriptions').doc(tenantId).get();
        if (subscriptionDoc.exists) {
          const subscription = subscriptionDoc.data();
          if (subscription?.billingKey && subscription?.cardInfo) {
            const now = new Date();
            const cardId = generateCardId();

            // 새 구조로 저장
            await db.collection('cards').doc(tenantId).set({
              tenantId,
              email: subscription.email,
              cards: [{
                id: cardId,
                billingKey: subscription.billingKey,
                cardInfo: subscription.cardInfo,
                alias: subscription.cardAlias || null,
                isPrimary: true,
                createdAt: subscription.cardUpdatedAt?.toDate?.() || subscription.createdAt?.toDate?.() || now,
              }],
              updatedAt: now,
            });

            // subscription에 primaryCardId 추가
            await db.collection('subscriptions').doc(tenantId).update({
              primaryCardId: cardId,
            });

            cards = [{
              id: cardId,
              tenantId,
              email: subscription.email,
              cardInfo: subscription.cardInfo,
              alias: subscription.cardAlias || null,
              isPrimary: true,
              createdAt: subscription.cardUpdatedAt?.toDate?.() || subscription.createdAt?.toDate?.() || now,
            }];
          }
        }
      }
    }

    return NextResponse.json({ cards });
  } catch (error) {
    console.error('Failed to fetch cards:', error);
    return NextResponse.json({ error: 'Failed to fetch cards' }, { status: 500 });
  }
}

// 새 카드 추가
export async function POST(request: NextRequest) {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { token, email: emailParam, tenantId, billingKey, cardInfo, alias, setAsPrimary } = body;

    let email: string | null = null;

    // 1. SSO 토큰으로 인증
    if (token) {
      email = await verifyToken(token);
    }
    // 2. Firebase ID Token으로 인증 (Authorization 헤더)
    if (!email) {
      const authHeader = request.headers.get('authorization');
      email = await getEmailFromAuthHeader(authHeader);
    }
    // 3. email 파라미터 (fallback)
    if (!email && emailParam) {
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

    const now = new Date();
    let newCardId: string = '';
    let shouldSetPrimary = false;
    const brandName = subscription?.brandName || '';

    // 트랜잭션으로 카드 추가
    await db.runTransaction(async (transaction) => {
      const cardsDocRef = db.collection('cards').doc(tenantId);
      const cardsDoc = await transaction.get(cardsDocRef);

      let cards: CardItem[] = [];
      let docEmail = email!;
      let docBrandName = brandName;

      if (cardsDoc.exists) {
        const data = cardsDoc.data() as TenantCardsDocument;
        cards = data.cards || [];
        docEmail = data.email;
        docBrandName = data.brandName || brandName;
      }

      // 중복 카드 체크
      if (cards.some((card) => card.cardInfo.number === cardInfo.number)) {
        throw new Error('Card already registered');
      }

      // 최대 5개 제한
      if (cards.length >= 5) {
        throw new Error('Maximum 5 cards allowed');
      }

      const isFirstCard = cards.length === 0;
      shouldSetPrimary = setAsPrimary || isFirstCard;

      // 새 카드가 primary로 설정되면 기존 primary 해제
      if (shouldSetPrimary && !isFirstCard) {
        cards = cards.map((card) => ({ ...card, isPrimary: false }));
      }

      // 새 카드 추가
      newCardId = generateCardId();
      cards.push({
        id: newCardId,
        billingKey,
        cardInfo,
        alias: alias || null,
        isPrimary: shouldSetPrimary,
        createdAt: now,
      });

      // 카드 문서 저장
      transaction.set(cardsDocRef, {
        tenantId,
        email: docEmail,
        brandName: docBrandName,
        cards,
        updatedAt: now,
      });

      // 구독의 primary 카드 정보 업데이트
      if (shouldSetPrimary) {
        const subscriptionRef = db.collection('subscriptions').doc(tenantId);
        transaction.update(subscriptionRef, {
          billingKey,
          cardInfo,
          cardAlias: alias || null,
          primaryCardId: newCardId,
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
          const brandName = subscription.brandName || '';
          const orderName = brandName
            ? `YAMOO ${getPlanName(subscription.plan)} 플랜 (${brandName})`
            : `YAMOO ${getPlanName(subscription.plan)} 플랜`;

          const effectiveAmount = getEffectiveAmount({
            plan: subscription.plan,
            amount: subscription.amount,
            baseAmount: subscription.baseAmount,
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
      cardId: newCardId,
      autoRetry: retryResult,
    });
  } catch (error) {
    console.error('Failed to add card:', error);
    const message = error instanceof Error ? error.message : 'Failed to add card';

    if (message === 'Card already registered') {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    if (message === 'Maximum 5 cards allowed') {
      return NextResponse.json({ error: message }, { status: 400 });
    }

    return NextResponse.json({ error: 'Failed to add card' }, { status: 500 });
  }
}
