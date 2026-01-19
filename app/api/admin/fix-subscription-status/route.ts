import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';

// Timestamp를 ISO string으로 변환
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeTimestamp(val: any): string | null {
  if (!val) return null;
  if (typeof val === 'object' && val !== null) {
    if ('toDate' in val && typeof val.toDate === 'function') {
      return val.toDate().toISOString();
    }
    if ('_seconds' in val) {
      return new Date(val._seconds * 1000).toISOString();
    }
  }
  return val;
}

// 관리자: 특정 매장의 구독 상태/데이터 조회
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

    const subscriptionRef = db.collection('subscriptions').doc(tenantId);
    const subscriptionDoc = await subscriptionRef.get();

    if (!subscriptionDoc.exists) {
      return NextResponse.json({ error: `Subscription not found for tenant: ${tenantId}` }, { status: 404 });
    }

    const data = subscriptionDoc.data();

    return NextResponse.json({
      success: true,
      tenantId,
      subscription: {
        ...data,
        currentPeriodStart: serializeTimestamp(data?.currentPeriodStart),
        currentPeriodEnd: serializeTimestamp(data?.currentPeriodEnd),
        nextBillingDate: serializeTimestamp(data?.nextBillingDate),
        canceledAt: serializeTimestamp(data?.canceledAt),
        expiredAt: serializeTimestamp(data?.expiredAt),
        planChangedAt: serializeTimestamp(data?.planChangedAt),
        createdAt: serializeTimestamp(data?.createdAt),
        updatedAt: serializeTimestamp(data?.updatedAt),
      },
    });
  } catch (error) {
    console.error('Get subscription status error:', error);
    return NextResponse.json(
      { error: 'Failed to get subscription status' },
      { status: 500 }
    );
  }
}

// 관리자: 특정 매장의 구독 상태/데이터 수정
export async function POST(request: NextRequest) {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { brandName, tenantId: inputTenantId, newStatus, updates } = body;

    // tenantId 직접 지정 또는 brandName으로 찾기
    let tenantId = inputTenantId;

    if (!tenantId && brandName) {
      const tenantsSnapshot = await db.collection('tenants')
        .where('brandName', '==', brandName)
        .limit(1)
        .get();

      if (tenantsSnapshot.empty) {
        return NextResponse.json({ error: `Tenant not found: ${brandName}` }, { status: 404 });
      }

      const tenantDoc = tenantsSnapshot.docs[0];
      const tenantData = tenantDoc.data();
      tenantId = tenantData.tenantId || tenantDoc.id;
    }

    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId or brandName is required' }, { status: 400 });
    }

    // subscription 조회
    const subscriptionRef = db.collection('subscriptions').doc(tenantId);
    const subscriptionDoc = await subscriptionRef.get();

    if (!subscriptionDoc.exists) {
      return NextResponse.json({ error: `Subscription not found for tenant: ${tenantId}` }, { status: 404 });
    }

    const oldData = subscriptionDoc.data();

    // 업데이트할 데이터 준비
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (newStatus) {
      updateData.status = newStatus;
    }

    // 추가 업데이트 필드 처리
    if (updates) {
      for (const [key, value] of Object.entries(updates)) {
        // Date 문자열 변환
        if (typeof value === 'string' && (key.includes('Date') || key.includes('At') || key.includes('Start') || key.includes('End'))) {
          updateData[key] = new Date(value);
        } else {
          updateData[key] = value;
        }
      }
    }

    await subscriptionRef.update(updateData);

    // tenants 컬렉션에 변경사항 동기화
    const tenantUpdateData: Record<string, unknown> = {};
    if (newStatus) {
      tenantUpdateData['subscription.status'] = newStatus;
      tenantUpdateData['status'] = newStatus;
    }
    if (updates?.plan) {
      tenantUpdateData['subscription.plan'] = updates.plan;
      tenantUpdateData['plan'] = updates.plan;
    }
    if (updates?.currentPeriodStart) {
      tenantUpdateData['subscription.startedAt'] = new Date(updates.currentPeriodStart);
    }
    // renewsAt은 nextBillingDate와 매핑됨 (currentPeriodEnd 아님)
    if (updates?.nextBillingDate) {
      tenantUpdateData['subscription.renewsAt'] = new Date(updates.nextBillingDate);
    }

    if (Object.keys(tenantUpdateData).length > 0) {
      try {
        await db.collection('tenants').doc(tenantId).update(tenantUpdateData);
        console.log('✅ Tenant subscription synced for fix-subscription-status');
      } catch (syncError) {
        console.error('Failed to sync tenant subscription:', syncError);
      }
    }

    return NextResponse.json({
      success: true,
      tenantId,
      oldData: {
        status: oldData?.status,
        plan: oldData?.plan,
        currentPeriodStart: oldData?.currentPeriodStart?.toDate?.()?.toISOString() || oldData?.currentPeriodStart,
        currentPeriodEnd: oldData?.currentPeriodEnd?.toDate?.()?.toISOString() || oldData?.currentPeriodEnd,
      },
      updates: updateData,
    });
  } catch (error) {
    console.error('Fix subscription status error:', error);
    return NextResponse.json(
      { error: 'Failed to fix subscription status' },
      { status: 500 }
    );
  }
}
