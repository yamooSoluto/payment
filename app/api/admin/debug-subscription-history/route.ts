import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';

// 디버그: 특정 tenant의 subscription_history 확인
export async function GET(request: NextRequest) {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get('tenantId');

    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId is required' }, { status: 400 });
    }

    // subscription_history 조회
    const historyRef = db.collection('subscription_history').doc(tenantId).collection('records');
    const historySnapshot = await historyRef.orderBy('changedAt', 'desc').get();

    const history = historySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        periodStart: data.periodStart?.toDate?.()?.toISOString() || data.periodStart,
        periodEnd: data.periodEnd?.toDate?.()?.toISOString() || data.periodEnd,
        billingDate: data.billingDate?.toDate?.()?.toISOString() || data.billingDate,
        changedAt: data.changedAt?.toDate?.()?.toISOString() || data.changedAt,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt,
      };
    });

    // subscriptions 컬렉션도 함께 조회
    const subscriptionDoc = await db.collection('subscriptions').doc(tenantId).get();
    const subscription = subscriptionDoc.exists ? subscriptionDoc.data() : null;

    const serializedSubscription = subscription ? {
      ...subscription,
      currentPeriodStart: subscription.currentPeriodStart?.toDate?.()?.toISOString() || subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd?.toDate?.()?.toISOString() || subscription.currentPeriodEnd,
      nextBillingDate: subscription.nextBillingDate?.toDate?.()?.toISOString() || subscription.nextBillingDate,
      planChangedAt: subscription.planChangedAt?.toDate?.()?.toISOString() || subscription.planChangedAt,
      createdAt: subscription.createdAt?.toDate?.()?.toISOString() || subscription.createdAt,
      updatedAt: subscription.updatedAt?.toDate?.()?.toISOString() || subscription.updatedAt,
    } : null;

    return NextResponse.json({
      success: true,
      tenantId,
      historyCount: history.length,
      history,
      subscription: serializedSubscription,
    });
  } catch (error) {
    console.error('Debug subscription history error:', error);
    return NextResponse.json(
      { error: 'Failed to debug subscription history' },
      { status: 500 }
    );
  }
}
