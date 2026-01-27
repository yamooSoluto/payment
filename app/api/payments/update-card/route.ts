import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { issueBillingKey } from '@/lib/toss';
import { verifyToken } from '@/lib/auth';
import { isN8NNotificationEnabled } from '@/lib/n8n';
import { CardItem, TenantCardsDocument } from '@/app/api/cards/route';

// 카드 ID 생성
function generateCardId(): string {
  return `card_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// 카드 추가/변경 처리 (새 빌링키 발급 후 카드 컬렉션에 저장)
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const authKey = searchParams.get('authKey');
  const customerKey = searchParams.get('customerKey');
  const token = searchParams.get('token');
  const emailParam = searchParams.get('email');
  const cardAlias = searchParams.get('cardAlias');
  const tenantId = searchParams.get('tenantId');
  const setAsPrimary = searchParams.get('setAsPrimary') !== 'false'; // 기본값 true

  // email 결정
  let email = customerKey || emailParam;
  if (token) {
    const tokenEmail = await verifyToken(token);
    if (tokenEmail) email = tokenEmail;
  }

  console.log('Card update received:', { authKey, customerKey, token, email, cardAlias, tenantId });

  const authParam = token ? `token=${token}` : `email=${encodeURIComponent(email || '')}`;
  const tenantParam = tenantId ? `&tenantId=${encodeURIComponent(tenantId)}` : '';

  if (!authKey || !email || !tenantId) {
    return NextResponse.redirect(
      new URL(`/account/change-card?${authParam}${tenantParam}&error=missing_params`, request.url)
    );
  }

  const db = adminDb || initializeFirebaseAdmin();
  if (!db) {
    return NextResponse.redirect(
      new URL(`/account/change-card?${authParam}${tenantParam}&error=database_unavailable`, request.url)
    );
  }

  try {
    // 구독 정보 확인 (tenantId로 조회)
    const subscriptionDoc = await db.collection('subscriptions').doc(tenantId).get();
    if (!subscriptionDoc.exists) {
      return NextResponse.redirect(
        new URL(`/account/change-card?${authParam}${tenantParam}&error=subscription_not_found`, request.url)
      );
    }

    const subscription = subscriptionDoc.data();

    // 해당 사용자의 구독인지 확인
    if (subscription?.email !== email) {
      return NextResponse.redirect(
        new URL(`/account/change-card?${authParam}${tenantParam}&error=unauthorized`, request.url)
      );
    }

    // 새 빌링키 발급
    console.log('Issuing new billing key for:', email);
    const billingResponse = await issueBillingKey(authKey, email);
    const newBillingKey = billingResponse.billingKey;
    const cardInfo = billingResponse.card || null;

    console.log('New billing key issued:', newBillingKey?.slice(0, 10) + '...');

    // users 컬렉션에서 userId 조회
    const userDoc = await db.collection('users').doc(email!).get();
    const userId = userDoc.exists ? userDoc.data()?.userId : '';

    const now = new Date();
    let newCardId = '';
    const brandName = subscription?.brandName || '';

    // 트랜잭션으로 카드 추가
    await db.runTransaction(async (transaction) => {
      const cardsDocRef = db.collection('cards').doc(tenantId);
      const cardsDoc = await transaction.get(cardsDocRef);

      let cards: CardItem[] = [];
      let docEmail = email!;
      let docBrandName = brandName;
      let docUserId = userId;

      if (cardsDoc.exists) {
        const data = cardsDoc.data() as TenantCardsDocument;
        cards = data.cards || [];
        docEmail = data.email;
        docBrandName = data.brandName || brandName;
        docUserId = data.userId || userId;
      }

      // 중복 카드 체크
      if (cards.some((card) => card.cardInfo.number === cardInfo?.number)) {
        throw new Error('card_already_exists');
      }

      // 최대 5개 제한
      if (cards.length >= 5) {
        throw new Error('max_cards_exceeded');
      }

      const isFirstCard = cards.length === 0;
      const shouldSetPrimary = setAsPrimary || isFirstCard;

      // 새 카드가 primary로 설정되면 기존 primary 해제
      if (shouldSetPrimary && !isFirstCard) {
        cards = cards.map((card) => ({ ...card, isPrimary: false }));
      }

      // 새 카드 추가
      newCardId = generateCardId();
      cards.push({
        id: newCardId,
        billingKey: newBillingKey,
        cardInfo,
        alias: cardAlias || null,
        isPrimary: shouldSetPrimary,
        createdAt: now,
      });

      // 카드 문서 저장
      transaction.set(cardsDocRef, {
        tenantId,
        userId: docUserId,
        email: docEmail,
        brandName: docBrandName,
        cards,
        updatedAt: now,
        updatedBy: 'user',
      });

      // 구독의 primary 카드 정보 업데이트
      if (shouldSetPrimary) {
        const subscriptionRef = db.collection('subscriptions').doc(tenantId);
        transaction.update(subscriptionRef, {
          billingKey: newBillingKey,
          cardInfo,
          cardAlias: cardAlias || null,
          primaryCardId: newCardId,
          cardUpdatedAt: now,
          updatedAt: now,
          updatedBy: 'user',
        });
      }
    });

    // n8n 웹훅 호출 (카드 추가 알림)
    if (isN8NNotificationEnabled()) {
      try {
        await fetch(process.env.N8N_WEBHOOK_URL!, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event: 'card_added',
            tenantId,
            email,
            cardCompany: cardInfo?.company || null,
            isPrimary: setAsPrimary,
          }),
        });
      } catch {
        // 웹훅 실패 무시
      }
    }

    // 성공 시 매장 구독 관리 페이지로 리다이렉트
    return NextResponse.redirect(
      new URL(`/account/${tenantId}?${authParam}&success=card_added`, request.url)
    );
  } catch (error) {
    console.error('Card update failed:', error);

    const message = error instanceof Error ? error.message : '';

    if (message === 'card_already_exists') {
      return NextResponse.redirect(
        new URL(`/account/${tenantId}?${authParam}&error=card_already_exists`, request.url)
      );
    }
    if (message === 'max_cards_exceeded') {
      return NextResponse.redirect(
        new URL(`/account/${tenantId}?${authParam}&error=max_cards_exceeded`, request.url)
      );
    }

    return NextResponse.redirect(
      new URL(`/account/change-card?${authParam}${tenantParam}&error=card_update_failed`, request.url)
    );
  }
}
