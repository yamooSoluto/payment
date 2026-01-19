import { NextRequest, NextResponse } from 'next/server';
import { getAdminFromRequest, hasPermission } from '@/lib/admin-auth';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { payWithBillingKey, PLAN_PRICES, getPlanName } from '@/lib/toss';
import { isN8NNotificationEnabled } from '@/lib/n8n';
import { TenantCardsDocument } from '@/app/api/cards/route';

// POST: 관리자 수동 결제 처리
export async function POST(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);

    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(admin, 'payments:write')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const db = adminDb || initializeFirebaseAdmin();
    if (!db) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
    }

    const body = await request.json();
    const { tenantId, plan, amount, reason, cardId } = body;

    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId is required' }, { status: 400 });
    }

    if (!plan) {
      return NextResponse.json({ error: 'plan is required' }, { status: 400 });
    }

    if (!amount || amount <= 0) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
    }

    // 구독 정보 조회
    const subscriptionDoc = await db.collection('subscriptions').doc(tenantId).get();
    if (!subscriptionDoc.exists) {
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
    }

    const subscription = subscriptionDoc.data();
    const customerEmail = subscription?.email;

    // billingKey 결정: cardId가 있으면 해당 카드 사용, 없으면 기본 카드 사용
    let billingKey: string | null = null;
    let selectedCardInfo = null;

    if (cardId && cardId !== 'subscription') {
      // 특정 카드 선택된 경우 - 새 구조에서 조회
      const cardsDoc = await db.collection('cards').doc(tenantId).get();
      if (!cardsDoc.exists) {
        return NextResponse.json({ error: 'Card not found' }, { status: 404 });
      }

      const data = cardsDoc.data() as TenantCardsDocument;
      const card = (data.cards || []).find((c) => c.id === cardId);

      if (!card) {
        return NextResponse.json({ error: 'Card not found' }, { status: 404 });
      }

      billingKey = card.billingKey;
      selectedCardInfo = card.cardInfo;
    } else {
      // 기본 카드 사용
      billingKey = subscription?.billingKey;
      selectedCardInfo = subscription?.cardInfo;
    }

    if (!billingKey) {
      return NextResponse.json(
        { error: '등록된 결제 카드가 없습니다. 고객이 먼저 카드를 등록해야 합니다.' },
        { status: 400 }
      );
    }

    // 결제 수행
    const orderId = `ADMIN_${Date.now()}`;
    const brandName = subscription?.brandName || '';
    const orderName = brandName
      ? `YAMOO ${getPlanName(plan)} 플랜 (${brandName}) - 관리자 수동 결제`
      : `YAMOO ${getPlanName(plan)} 플랜 - 관리자 수동 결제`;

    console.log('Admin manual charge:', {
      orderId,
      amount,
      tenantId,
      adminId: admin.adminId,
      reason: reason || '관리자 수동 결제',
      cardId: cardId || 'primary',
      cardInfo: selectedCardInfo,
    });

    const paymentResponse = await payWithBillingKey(
      billingKey,
      customerEmail,
      amount,
      orderId,
      orderName,
      customerEmail
    );

    console.log('Admin manual charge completed:', paymentResponse.status);

    // 결제 성공 후 구독 정보 업데이트 및 결제 내역 저장
    const now = new Date();
    const nextBillingDate = new Date(now);
    nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);

    const paymentDocId = `${orderId}_${Date.now()}`;

    await db.runTransaction(async (transaction) => {
      // 구독 정보 업데이트
      const subscriptionRef = db.collection('subscriptions').doc(tenantId);
      transaction.update(subscriptionRef, {
        plan,
        amount,
        status: 'active',
        currentPeriodStart: now,
        currentPeriodEnd: nextBillingDate,
        nextBillingDate,
        // pending 관련 필드 제거
        pendingPlan: null,
        pendingAmount: null,
        pendingChangeAt: null,
        // 취소 상태 제거 (환불 후 재결제의 경우)
        canceledAt: null,
        cancelReason: null,
        updatedAt: now,
        updatedBy: admin.adminId,
      });

      // 결제 내역 저장
      const paymentRef = db.collection('payments').doc(paymentDocId);
      transaction.set(paymentRef, {
        tenantId,
        email: customerEmail,
        orderId,
        orderName,
        paymentKey: paymentResponse.paymentKey,
        amount,
        plan,
        category: 'recurring',
        type: 'admin_manual',
        transactionType: 'charge',
        initiatedBy: 'admin',
        adminId: admin.adminId,
        adminName: admin.name || '',
        status: 'done',
        method: paymentResponse.method,
        cardInfo: paymentResponse.card || null,
        receiptUrl: paymentResponse.receipt?.url || null,
        reason: reason || '관리자 수동 결제',
        paidAt: now,
        createdAt: now,
      });
    });

    // tenants 컬렉션 동기화
    try {
      await db.collection('tenants').doc(tenantId).update({
        subscriptionPlan: plan,
        subscriptionStatus: 'active',
        updatedAt: now,
      });
    } catch {
      // tenants 업데이트 실패해도 무시
    }

    // n8n 웹훅 호출 (선택적)
    if (isN8NNotificationEnabled()) {
      try {
        await fetch(process.env.N8N_WEBHOOK_URL!, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event: 'admin_manual_charge',
            tenantId,
            email: customerEmail,
            plan,
            amount,
            adminId: admin.adminId,
            reason: reason || '관리자 수동 결제',
          }),
        });
      } catch {
        // 웹훅 실패 무시
      }
    }

    return NextResponse.json({
      success: true,
      orderId,
      paymentKey: paymentResponse.paymentKey,
      amount,
      plan,
      message: `${amount.toLocaleString()}원 결제가 완료되었습니다.`,
    });
  } catch (error) {
    console.error('Admin manual charge failed:', error);
    const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
    return NextResponse.json(
      { error: `결제 처리 중 오류가 발생했습니다: ${errorMessage}` },
      { status: 500 }
    );
  }
}

// GET: 수동 결제 가능 여부 확인 및 카드 목록 조회
export async function GET(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);

    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = adminDb || initializeFirebaseAdmin();
    if (!db) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get('tenantId');

    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId is required' }, { status: 400 });
    }

    // 구독 정보와 카드 목록 병렬 조회
    const [subscriptionDoc, cardsDoc] = await Promise.all([
      db.collection('subscriptions').doc(tenantId).get(),
      db.collection('cards').doc(tenantId).get(),
    ]);

    if (!subscriptionDoc.exists) {
      return NextResponse.json({
        canCharge: false,
        reason: '구독 정보가 없습니다.',
        cards: [],
      });
    }

    const subscription = subscriptionDoc.data();

    const cards: { id: string; cardInfo: unknown; alias: string | null; isPrimary: boolean }[] = [];

    if (cardsDoc.exists) {
      const data = cardsDoc.data() as TenantCardsDocument;
      (data.cards || []).forEach((card) => {
        cards.push({
          id: card.id,
          cardInfo: card.cardInfo,
          alias: card.alias || null,
          isPrimary: card.isPrimary || false,
        });
      });
    }

    // cards 컬렉션이 비어있으면 subscription의 카드 정보 사용
    if (cards.length === 0 && subscription?.billingKey) {
      cards.push({
        id: 'subscription',
        cardInfo: subscription.cardInfo,
        alias: subscription.cardAlias,
        isPrimary: true,
      });
    }

    if (cards.length === 0) {
      return NextResponse.json({
        canCharge: false,
        reason: '등록된 결제 카드가 없습니다.',
        cards: [],
      });
    }

    // isPrimary가 true인 카드를 맨 앞으로 정렬
    cards.sort((a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0));

    return NextResponse.json({
      canCharge: true,
      currentPlan: subscription?.plan,
      currentAmount: subscription?.amount || PLAN_PRICES[subscription?.plan] || 0,
      email: subscription?.email,
      status: subscription?.status,
      cards,
    });
  } catch (error) {
    console.error('Failed to check charge availability:', error);
    return NextResponse.json(
      { error: 'Failed to check charge availability' },
      { status: 500 }
    );
  }
}
