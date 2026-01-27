import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { verifyToken } from '@/lib/auth';

// 카드 별칭 수정 API
export async function POST(request: NextRequest) {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
  }

  try {
    const { token, email: directEmail, tenantId, cardAlias } = await request.json();

    let email: string | null = null;

    if (token) {
      email = await verifyToken(token);
    } else if (directEmail) {
      email = directEmail;
    }

    if (!email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId is required' }, { status: 400 });
    }

    // 별칭 유효성 검사 (최대 20자)
    if (cardAlias && cardAlias.length > 20) {
      return NextResponse.json({ error: '별칭은 20자 이내로 입력해주세요.' }, { status: 400 });
    }

    // 구독 정보 확인 (tenantId로)
    const subscriptionDoc = await db.collection('subscriptions').doc(tenantId).get();
    if (!subscriptionDoc.exists) {
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
    }

    const subscription = subscriptionDoc.data();

    // 해당 사용자의 구독인지 확인
    if (subscription?.email !== email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // 카드 별칭 업데이트
    await db.collection('subscriptions').doc(tenantId).update({
      cardAlias: cardAlias || null,
      updatedAt: new Date(),
      updatedBy: 'user',
    });

    return NextResponse.json({
      success: true,
      message: '카드 별칭이 수정되었습니다.',
      cardAlias: cardAlias || null,
    });
  } catch (error) {
    console.error('Update card alias error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
