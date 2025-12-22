import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { issueBillingKey } from '@/lib/toss';

// 카드 변경 처리 (새 빌링키 발급 후 구독 정보 업데이트)
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const authKey = searchParams.get('authKey');
  const customerKey = searchParams.get('customerKey');
  const token = searchParams.get('token');
  const emailParam = searchParams.get('email');

  // email 결정
  const email = customerKey || emailParam;

  console.log('Card update received:', { authKey, customerKey, token, email });

  if (!authKey || !email) {
    const authParam = token ? `token=${token}` : `email=${encodeURIComponent(email || '')}`;
    return NextResponse.redirect(
      new URL(`/account/change-card?${authParam}&error=missing_params`, request.url)
    );
  }

  const db = adminDb || initializeFirebaseAdmin();
  if (!db) {
    const authParam = token ? `token=${token}` : `email=${encodeURIComponent(email)}`;
    return NextResponse.redirect(
      new URL(`/account/change-card?${authParam}&error=database_unavailable`, request.url)
    );
  }

  try {
    // 구독 정보 확인
    const subscriptionDoc = await db.collection('subscriptions').doc(email).get();
    if (!subscriptionDoc.exists) {
      const authParam = token ? `token=${token}` : `email=${encodeURIComponent(email)}`;
      return NextResponse.redirect(
        new URL(`/account/change-card?${authParam}&error=subscription_not_found`, request.url)
      );
    }

    // 새 빌링키 발급
    console.log('Issuing new billing key for:', email);
    const billingResponse = await issueBillingKey(authKey, email);
    const newBillingKey = billingResponse.billingKey;

    console.log('New billing key issued:', newBillingKey?.slice(0, 10) + '...');

    // 구독 정보 업데이트 (새 빌링키와 카드 정보)
    await db.collection('subscriptions').doc(email).update({
      billingKey: newBillingKey,
      cardInfo: billingResponse.card || null,
      cardUpdatedAt: new Date(),
      updatedAt: new Date(),
    });

    // 카드 변경 내역 저장
    await db.collection('card_changes').add({
      email,
      newCardInfo: billingResponse.card || null,
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
            email,
            cardCompany: billingResponse.card?.company || null,
          }),
        });
      } catch {
        // 웹훅 실패 무시
      }
    }

    // 성공 시 마이페이지로 리다이렉트
    const authParam = token ? `token=${token}` : `email=${encodeURIComponent(email)}`;
    return NextResponse.redirect(
      new URL(`/account?${authParam}&success=card_updated`, request.url)
    );
  } catch (error) {
    console.error('Card update failed:', error);

    const authParam = token ? `token=${token}` : `email=${encodeURIComponent(email)}`;
    return NextResponse.redirect(
      new URL(`/account/change-card?${authParam}&error=card_update_failed`, request.url)
    );
  }
}
