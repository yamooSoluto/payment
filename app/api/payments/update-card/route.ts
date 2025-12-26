import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { issueBillingKey } from '@/lib/toss';
import { verifyToken } from '@/lib/auth';

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

    // 같은 카드번호로 이미 등록된 카드가 있는지 확인
    const existingCardSnapshot = await db
      .collection('cards')
      .where('tenantId', '==', tenantId)
      .where('cardInfo.number', '==', cardInfo?.number)
      .get();

    if (!existingCardSnapshot.empty) {
      return NextResponse.redirect(
        new URL(`/account/${tenantId}?${authParam}&error=card_already_exists`, request.url)
      );
    }

    // 카드 개수 확인 (최대 5개)
    const cardCountSnapshot = await db
      .collection('cards')
      .where('tenantId', '==', tenantId)
      .get();

    if (cardCountSnapshot.size >= 5) {
      return NextResponse.redirect(
        new URL(`/account/${tenantId}?${authParam}&error=max_cards_exceeded`, request.url)
      );
    }

    const now = new Date();
    const isFirstCard = cardCountSnapshot.empty;
    const shouldSetPrimary = setAsPrimary || isFirstCard;

    // 트랜잭션으로 카드 추가 및 관련 업데이트
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

      // 새 카드를 cards 컬렉션에 추가
      const cardRef = db.collection('cards').doc();
      transaction.set(cardRef, {
        tenantId,
        email,
        billingKey: newBillingKey,
        cardInfo,
        alias: cardAlias || null,
        isPrimary: shouldSetPrimary,
        createdAt: now,
      });

      // 구독의 primary 카드 정보 업데이트
      if (shouldSetPrimary) {
        const subscriptionRef = db.collection('subscriptions').doc(tenantId);
        transaction.update(subscriptionRef, {
          billingKey: newBillingKey,
          cardInfo,
          cardAlias: cardAlias || null,
          primaryCardId: cardRef.id,
          cardUpdatedAt: now,
          updatedAt: now,
        });
      }

      // 카드 변경 내역 저장
      const changeRef = db.collection('card_changes').doc();
      transaction.set(changeRef, {
        tenantId,
        email,
        newCardInfo: cardInfo,
        cardAlias: cardAlias || null,
        action: isFirstCard ? 'added' : shouldSetPrimary ? 'added_as_primary' : 'added',
        changedAt: now,
      });
    });

    // n8n 웹훅 호출 (카드 추가 알림)
    if (process.env.N8N_WEBHOOK_URL) {
      try {
        await fetch(process.env.N8N_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event: isFirstCard ? 'card_added' : 'card_updated',
            tenantId,
            email,
            cardCompany: cardInfo?.company || null,
            isPrimary: shouldSetPrimary,
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

    return NextResponse.redirect(
      new URL(`/account/change-card?${authParam}${tenantParam}&error=card_update_failed`, request.url)
    );
  }
}
