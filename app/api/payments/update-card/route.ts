import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { issueBillingKey } from '@/lib/toss';
import { verifyToken } from '@/lib/auth';

// 카드 변경 처리 (새 빌링키 발급 후 구독 정보 업데이트)
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const authKey = searchParams.get('authKey');
  const customerKey = searchParams.get('customerKey');
  const token = searchParams.get('token');
  const emailParam = searchParams.get('email');
  const cardAlias = searchParams.get('cardAlias');
  const tenantId = searchParams.get('tenantId');

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

    console.log('New billing key issued:', newBillingKey?.slice(0, 10) + '...');

    // 구독 정보 업데이트 (새 빌링키와 카드 정보) - tenantId로 조회
    await db.collection('subscriptions').doc(tenantId).update({
      billingKey: newBillingKey,
      cardInfo: billingResponse.card || null,
      cardAlias: cardAlias || null,
      cardUpdatedAt: new Date(),
      updatedAt: new Date(),
    });

    // 카드 변경 내역 저장
    await db.collection('card_changes').add({
      tenantId,
      email,
      newCardInfo: billingResponse.card || null,
      cardAlias: cardAlias || null,
      changedAt: new Date(),
    });

    // n8n 웹훅 호출 (카드 변경 알림)
    if (process.env.N8N_WEBHOOK_URL) {
      try {
        await fetch(process.env.N8N_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event: 'card_updated',
            tenantId,
            email,
            cardCompany: billingResponse.card?.company || null,
          }),
        });
      } catch {
        // 웹훅 실패 무시
      }
    }

    // 성공 시 매장 구독 관리 페이지로 리다이렉트
    return NextResponse.redirect(
      new URL(`/account/${tenantId}?${authParam}&success=card_updated`, request.url)
    );
  } catch (error) {
    console.error('Card update failed:', error);

    return NextResponse.redirect(
      new URL(`/account/change-card?${authParam}${tenantParam}&error=card_update_failed`, request.url)
    );
  }
}
