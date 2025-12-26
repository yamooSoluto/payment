import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { verifyToken } from '@/lib/auth';

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

    // 카드 정보 확인
    const cardDoc = await db.collection('cards').doc(cardId).get();
    if (!cardDoc.exists) {
      return NextResponse.json({ error: 'Card not found' }, { status: 404 });
    }

    const card = cardDoc.data();
    if (card?.tenantId !== tenantId || card?.email !== email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // 별칭 업데이트
    await db.collection('cards').doc(cardId).update({
      alias: alias || null,
      updatedAt: new Date(),
    });

    // primary 카드인 경우 구독 정보도 업데이트
    if (card?.isPrimary) {
      const subscriptionRef = db.collection('subscriptions').doc(tenantId);
      const subscriptionDoc = await subscriptionRef.get();
      if (subscriptionDoc.exists) {
        await subscriptionRef.update({
          cardAlias: alias || null,
          updatedAt: new Date(),
        });
      }
    }

    return NextResponse.json({ success: true, message: 'Card alias updated successfully' });
  } catch (error) {
    console.error('Failed to update card alias:', error);
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

    // 카드 정보 확인
    const cardDoc = await db.collection('cards').doc(cardId).get();
    if (!cardDoc.exists) {
      return NextResponse.json({ error: 'Card not found' }, { status: 404 });
    }

    const card = cardDoc.data();
    if (card?.tenantId !== tenantId || card?.email !== email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // 해당 tenant의 카드 개수 확인
    const cardsSnapshot = await db
      .collection('cards')
      .where('tenantId', '==', tenantId)
      .get();

    // 활성 구독이 있을 때 마지막 카드는 삭제 불가
    const subscriptionDoc = await db.collection('subscriptions').doc(tenantId).get();
    const subscription = subscriptionDoc.data();

    if (
      cardsSnapshot.size === 1 &&
      subscription?.status === 'active' &&
      subscription?.plan !== 'trial'
    ) {
      return NextResponse.json(
        { error: 'Cannot delete the last card with an active subscription' },
        { status: 400 }
      );
    }

    const isPrimary = card?.isPrimary;

    // 트랜잭션으로 카드 삭제 및 필요시 새 primary 설정
    await db.runTransaction(async (transaction) => {
      // 카드 삭제
      transaction.delete(db.collection('cards').doc(cardId));

      // 삭제된 카드가 primary였으면 다른 카드를 primary로 설정
      if (isPrimary && cardsSnapshot.size > 1) {
        const otherCards = cardsSnapshot.docs.filter((doc) => doc.id !== cardId);
        if (otherCards.length > 0) {
          const newPrimaryCard = otherCards[0];
          const newPrimaryData = newPrimaryCard.data();

          transaction.update(newPrimaryCard.ref, { isPrimary: true });

          // 구독 정보 업데이트
          transaction.update(db.collection('subscriptions').doc(tenantId), {
            billingKey: newPrimaryData.billingKey,
            cardInfo: newPrimaryData.cardInfo,
            cardAlias: newPrimaryData.alias || null,
            primaryCardId: newPrimaryCard.id,
            updatedAt: new Date(),
          });
        }
      }
    });

    return NextResponse.json({ success: true, message: 'Card deleted successfully' });
  } catch (error) {
    console.error('Failed to delete card:', error);
    return NextResponse.json({ error: 'Failed to delete card' }, { status: 500 });
  }
}
