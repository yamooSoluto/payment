import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { verifyToken } from '@/lib/auth';

// 내 매장 목록 조회 (각 매장의 구독 상태 포함)
export async function GET(request: NextRequest) {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');
    const emailParam = searchParams.get('email');

    let email: string | null = null;

    if (token) {
      email = await verifyToken(token);
    } else if (emailParam) {
      email = emailParam;
    }

    if (!email) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // tenants 컬렉션에서 email로 매장 목록 조회
    const tenantsSnapshot = await db
      .collection('tenants')
      .where('email', '==', email)
      .get();

    if (tenantsSnapshot.empty) {
      return NextResponse.json({ tenants: [] });
    }

    // 각 매장에 대한 구독 정보 조회
    const tenants = await Promise.all(
      tenantsSnapshot.docs.map(async (doc) => {
        const tenantData = doc.data();
        const tenantId = tenantData.tenantId || doc.id;

        // 해당 매장의 구독 정보 조회
        const subscriptionDoc = await db
          .collection('subscriptions')
          .doc(tenantId)
          .get();

        const subscription = subscriptionDoc.exists
          ? subscriptionDoc.data()
          : null;

        // Timestamp를 ISO string으로 변환
        const serializeTimestamp = (val: unknown): unknown => {
          if (!val) return null;
          if (typeof val === 'object' && val !== null) {
            if ('toDate' in val && typeof (val as { toDate: () => Date }).toDate === 'function') {
              return (val as { toDate: () => Date }).toDate().toISOString();
            }
            if ('_seconds' in val) {
              return new Date((val as { _seconds: number })._seconds * 1000).toISOString();
            }
          }
          return val;
        };

        return {
          id: doc.id,
          tenantId,
          brandName: tenantData.brandName || '이름 없음',
          email: tenantData.email,
          createdAt: serializeTimestamp(tenantData.createdAt),
          subscription: subscription
            ? {
                plan: subscription.plan,
                status: subscription.status,
                amount: subscription.amount,
                nextBillingDate: serializeTimestamp(subscription.nextBillingDate),
                currentPeriodEnd: serializeTimestamp(subscription.currentPeriodEnd),
                canceledAt: serializeTimestamp(subscription.canceledAt),
              }
            : null,
        };
      })
    );

    return NextResponse.json({ tenants });
  } catch (error) {
    console.error('Failed to fetch tenants:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tenants' },
      { status: 500 }
    );
  }
}
