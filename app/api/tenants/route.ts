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

    // 모든 tenant 데이터 수집
    const tenantDataList = tenantsSnapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        tenantId: data.tenantId || doc.id,
        brandName: data.brandName || '이름 없음',
        email: data.email,
        createdAt: serializeTimestamp(data.createdAt),
      };
    });

    // 구독 정보 한 번에 조회 (getAll 사용으로 N+1 문제 해결)
    const subscriptionRefs = tenantDataList.map((t) =>
      db.collection('subscriptions').doc(t.tenantId)
    );
    const subscriptionDocs = await db.getAll(...subscriptionRefs);

    // 구독 정보를 Map으로 변환
    const subscriptionMap = new Map<string, Record<string, unknown>>();
    subscriptionDocs.forEach((doc) => {
      if (doc.exists) {
        const data = doc.data();
        subscriptionMap.set(doc.id, {
          plan: data?.plan,
          status: data?.status,
          amount: data?.amount,
          nextBillingDate: serializeTimestamp(data?.nextBillingDate),
          currentPeriodEnd: serializeTimestamp(data?.currentPeriodEnd),
          canceledAt: serializeTimestamp(data?.canceledAt),
        });
      }
    });

    // 최종 결과 조합
    const tenants = tenantDataList.map((tenant) => ({
      ...tenant,
      subscription: subscriptionMap.get(tenant.tenantId) || null,
    }));

    return NextResponse.json({ tenants });
  } catch (error) {
    console.error('Failed to fetch tenants:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tenants' },
      { status: 500 }
    );
  }
}
