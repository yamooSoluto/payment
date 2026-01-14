import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { verifyToken } from '@/lib/auth';
import { isN8NNotificationEnabled } from '@/lib/n8n';
import { TenantCardsDocument } from '../../route';

// 주 결제 카드 설정
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ cardId: string }> }
) {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
  }

  try {
    const { cardId } = await params;
    const body = await request.json();
    const { token, email: emailParam, tenantId } = body;

    let email: string | null = null;

    if (token) {
      email = await verifyToken(token);
    } else if (emailParam) {
      email = emailParam;
    }

    if (!email) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    if (!cardId || !tenantId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const now = new Date();
    let cardCompanyForWebhook: string | null = null;

    // 트랜잭션으로 primary 카드 변경
    await db.runTransaction(async (transaction) => {
      const cardsDocRef = db.collection('cards').doc(tenantId);
      const cardsDoc = await transaction.get(cardsDocRef);

      if (!cardsDoc.exists) {
        throw new Error('Card not found');
      }

      const data = cardsDoc.data() as TenantCardsDocument;

      // 권한 확인
      if (data.email !== email) {
        throw new Error('Unauthorized');
      }

      const cards = data.cards || [];
      const cardIndex = cards.findIndex((card) => card.id === cardId);

      if (cardIndex === -1) {
        throw new Error('Card not found');
      }

      const targetCard = cards[cardIndex];

      // 이미 primary인 경우
      if (targetCard.isPrimary) {
        throw new Error('Already primary');
      }

      // 웹훅용 카드사 정보 저장
      cardCompanyForWebhook = targetCard.cardInfo?.company || null;

      // 모든 카드의 isPrimary 플래그 업데이트
      const updatedCards = cards.map((card) => ({
        ...card,
        isPrimary: card.id === cardId,
      }));

      transaction.update(cardsDocRef, {
        cards: updatedCards,
        updatedAt: now,
      });

      // 구독 정보 업데이트
      transaction.update(db.collection('subscriptions').doc(tenantId), {
        billingKey: targetCard.billingKey,
        cardInfo: targetCard.cardInfo,
        cardAlias: targetCard.alias || null,
        primaryCardId: cardId,
        cardUpdatedAt: now,
        updatedAt: now,
      });
    });

    // n8n 웹훅 호출 (주 결제 카드 변경 알림)
    if (isN8NNotificationEnabled()) {
      try {
        await fetch(process.env.N8N_WEBHOOK_URL!, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event: 'primary_card_changed',
            tenantId,
            email,
            cardCompany: cardCompanyForWebhook,
          }),
        });
      } catch {
        // 웹훅 실패 무시
      }
    }

    return NextResponse.json({ success: true, message: 'Primary card updated' });
  } catch (error) {
    console.error('Failed to set primary card:', error);
    const message = error instanceof Error ? error.message : 'Failed to set primary card';

    if (message === 'Card not found') {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    if (message === 'Unauthorized') {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    if (message === 'Already primary') {
      return NextResponse.json({ message: 'Card is already primary' });
    }

    return NextResponse.json({ error: 'Failed to set primary card' }, { status: 500 });
  }
}
