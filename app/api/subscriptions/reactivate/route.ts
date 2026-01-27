import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { verifyToken } from '@/lib/auth';
import { syncSubscriptionReactivation } from '@/lib/tenant-sync';
import { updateCurrentHistoryStatus } from '@/lib/subscription-history';

export async function POST(request: NextRequest) {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
  }

  try {
    const { token, email: directEmail, tenantId } = await request.json();

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

    // 구독 정보 조회 (tenantId로)
    const subscriptionDoc = await db.collection('subscriptions').doc(tenantId).get();
    if (!subscriptionDoc.exists) {
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
    }

    const subscription = subscriptionDoc.data();

    // 해당 사용자의 구독인지 확인
    if (subscription?.email !== email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // pending_cancel (해지 예정) 상태에서만 재활성화 가능
    // canceled (즉시 해지)는 이미 서비스가 종료되어 재활성화 불가
    if (subscription?.status !== 'pending_cancel') {
      return NextResponse.json({ error: 'Subscription is not pending cancellation' }, { status: 400 });
    }

    // 만료일이 지났는지 확인
    const currentPeriodEnd = subscription.currentPeriodEnd?.toDate?.() || new Date(subscription.currentPeriodEnd);
    if (new Date() > currentPeriodEnd) {
      return NextResponse.json({
        error: 'Subscription period has ended. Please subscribe again.',
        expired: true
      }, { status: 400 });
    }

    // nextBillingDate 복구 (Timestamp → Date 변환)
    let restoredNextBillingDate = null;
    if (subscription.previousNextBillingDate) {
      restoredNextBillingDate = subscription.previousNextBillingDate.toDate
        ? subscription.previousNextBillingDate.toDate()
        : new Date(subscription.previousNextBillingDate);
    }

    // 구독 상태를 active로 변경
    await db.collection('subscriptions').doc(tenantId).update({
      status: 'active',
      canceledAt: null,
      cancelReason: null,
      cancelMode: null,
      // nextBillingDate 복구
      nextBillingDate: restoredNextBillingDate,
      previousNextBillingDate: null,
      reactivatedAt: new Date(),
      updatedAt: new Date(),
      updatedBy: 'user',
    });

    // tenants 컬렉션에 재활성화 상태 동기화 (복구된 nextBillingDate 사용)
    await syncSubscriptionReactivation(tenantId, subscription.plan, restoredNextBillingDate);

    // subscription_history 상태 업데이트 (재활성화)
    try {
      await updateCurrentHistoryStatus(db, tenantId, 'active', {
        note: 'User reactivated subscription',
      });
      console.log('✅ Subscription history updated for reactivation');
    } catch (historyError) {
      console.error('Failed to update subscription history:', historyError);
    }

    return NextResponse.json({
      success: true,
      message: '구독이 다시 활성화되었습니다.'
    });
  } catch (error) {
    console.error('Reactivate subscription error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
