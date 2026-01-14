import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { verifyToken } from '@/lib/auth';
import { CardItem, TenantCardsDocument } from '../route';

// 카드 별칭 수정
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
    const { token, email: emailParam, tenantId, alias } = body;

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
    let isPrimaryCard = false;

    // 트랜잭션으로 카드 별칭 수정
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

      isPrimaryCard = cards[cardIndex].isPrimary;

      // 별칭 업데이트
      cards[cardIndex] = {
        ...cards[cardIndex],
        alias: alias || null,
      };

      transaction.update(cardsDocRef, {
        cards,
        updatedAt: now,
      });

      // primary 카드인 경우 구독 정보도 업데이트
      if (isPrimaryCard) {
        const subscriptionRef = db.collection('subscriptions').doc(tenantId);
        transaction.update(subscriptionRef, {
          cardAlias: alias || null,
          updatedAt: now,
        });
      }
    });

    return NextResponse.json({ success: true, message: 'Card alias updated successfully' });
  } catch (error) {
    console.error('Failed to update card alias:', error);
    const message = error instanceof Error ? error.message : 'Failed to update card alias';

    if (message === 'Card not found') {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    if (message === 'Unauthorized') {
      return NextResponse.json({ error: message }, { status: 403 });
    }

    return NextResponse.json({ error: 'Failed to update card alias' }, { status: 500 });
  }
}

// 카드 삭제
export async function DELETE(
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

    // 트랜잭션으로 카드 삭제
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

      const cardToDelete = cards[cardIndex];

      // 활성 구독이 있을 때 마지막 카드는 삭제 불가
      const subscriptionDoc = await transaction.get(db.collection('subscriptions').doc(tenantId));
      const subscription = subscriptionDoc.data();

      if (
        cards.length === 1 &&
        subscription?.status === 'active' &&
        subscription?.plan !== 'trial'
      ) {
        throw new Error('Cannot delete the last card with an active subscription');
      }

      // 카드 삭제
      const remainingCards = cards.filter((_, index) => index !== cardIndex);

      // 삭제된 카드가 primary였으면 다른 카드를 primary로 설정
      if (cardToDelete.isPrimary && remainingCards.length > 0) {
        remainingCards[0] = { ...remainingCards[0], isPrimary: true };

        // 구독 정보 업데이트
        transaction.update(db.collection('subscriptions').doc(tenantId), {
          billingKey: remainingCards[0].billingKey,
          cardInfo: remainingCards[0].cardInfo,
          cardAlias: remainingCards[0].alias || null,
          primaryCardId: remainingCards[0].id,
          updatedAt: now,
        });
      }

      // 카드 문서 업데이트
      if (remainingCards.length === 0) {
        // 모든 카드가 삭제되면 문서도 삭제
        transaction.delete(cardsDocRef);
      } else {
        transaction.update(cardsDocRef, {
          cards: remainingCards,
          updatedAt: now,
        });
      }
    });

    return NextResponse.json({ success: true, message: 'Card deleted successfully' });
  } catch (error) {
    console.error('Failed to delete card:', error);
    const message = error instanceof Error ? error.message : 'Failed to delete card';

    if (message === 'Card not found') {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    if (message === 'Unauthorized') {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    if (message === 'Cannot delete the last card with an active subscription') {
      return NextResponse.json({ error: message }, { status: 400 });
    }

    return NextResponse.json({ error: 'Failed to delete card' }, { status: 500 });
  }
}
