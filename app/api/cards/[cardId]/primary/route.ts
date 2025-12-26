import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { verifyToken } from '@/lib/auth';

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

    // 카드 정보 확인
    const cardDoc = await db.collection('cards').doc(cardId).get();
    if (!cardDoc.exists) {
      return NextResponse.json({ error: 'Card not found' }, { status: 404 });
    }

    const card = cardDoc.data();
    if (card?.tenantId !== tenantId || card?.email !== email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    if (card?.isPrimary) {
      return NextResponse.json({ message: 'Card is already primary' });
    }

    // 해당 tenant의 모든 카드 조회
    const cardsSnapshot = await db
      .collection('cards')
      .where('tenantId', '==', tenantId)
      .get();

    const now = new Date();

    // 트랜잭션으로 primary 카드 변경
    await db.runTransaction(async (transaction) => {
      // 기존 primary 카드 해제
      for (const doc of cardsSnapshot.docs) {
        if (doc.id !== cardId && doc.data().isPrimary) {
          transaction.update(doc.ref, { isPrimary: false });
        }
      }

      // 새 primary 카드 설정
      transaction.update(db.collection('cards').doc(cardId), { isPrimary: true });

      // 구독 정보 업데이트
      transaction.update(db.collection('subscriptions').doc(tenantId), {
        billingKey: card.billingKey,
        cardInfo: card.cardInfo,
        cardAlias: card.alias || null,
        primaryCardId: cardId,
        cardUpdatedAt: now,
        updatedAt: now,
      });
    });

    // n8n 웹훅 호출 (주 결제 카드 변경 알림)
    if (process.env.N8N_WEBHOOK_URL) {
      try {
        await fetch(process.env.N8N_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event: 'primary_card_changed',
            tenantId,
            email,
            cardCompany: card.cardInfo?.company || null,
          }),
        });
      } catch {
        // 웹훅 실패 무시
      }
    }

    return NextResponse.json({ success: true, message: 'Primary card updated' });
  } catch (error) {
    console.error('Failed to set primary card:', error);
    return NextResponse.json({ error: 'Failed to set primary card' }, { status: 500 });
  }
}
