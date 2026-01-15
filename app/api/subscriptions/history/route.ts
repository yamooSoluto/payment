import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin, getAdminAuth } from '@/lib/firebase-admin';
import { verifyToken } from '@/lib/auth';
import { getSubscriptionHistory } from '@/lib/subscription-history';

// 인증 함수
async function authenticateRequest(request: NextRequest): Promise<string | null> {
  const authHeader = request.headers.get('Authorization');

  if (authHeader) {
    if (authHeader.startsWith('Bearer ')) {
      const idToken = authHeader.substring(7);
      try {
        const auth = getAdminAuth();
        if (!auth) return null;
        const decodedToken = await auth.verifyIdToken(idToken);
        return decodedToken.email || null;
      } catch {
        return null;
      }
    }
    return await verifyToken(authHeader);
  }

  return null;
}

export async function GET(request: NextRequest) {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
  }

  try {
    const email = await authenticateRequest(request);
    if (!email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get('tenantId');

    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId is required' }, { status: 400 });
    }

    // 해당 사용자의 tenant인지 확인
    const subscriptionDoc = await db.collection('subscriptions').doc(tenantId).get();
    if (!subscriptionDoc.exists) {
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
    }

    const subscription = subscriptionDoc.data();
    if (subscription?.email !== email) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // subscription_history에서 히스토리 조회
    const history = await getSubscriptionHistory(db, tenantId);

    // 날짜를 ISO 문자열로 변환
    const formattedHistory = history.map(record => ({
      ...record,
      periodStart: record.periodStart instanceof Date
        ? record.periodStart.toISOString()
        : record.periodStart,
      periodEnd: record.periodEnd instanceof Date
        ? record.periodEnd.toISOString()
        : record.periodEnd,
      billingDate: record.billingDate instanceof Date
        ? record.billingDate.toISOString()
        : record.billingDate,
      changedAt: record.changedAt instanceof Date
        ? record.changedAt.toISOString()
        : record.changedAt,
    }));

    return NextResponse.json({
      success: true,
      history: formattedHistory,
    });
  } catch (error) {
    console.error('Failed to fetch subscription history:', error);
    return NextResponse.json(
      { error: 'Failed to fetch subscription history' },
      { status: 500 }
    );
  }
}
