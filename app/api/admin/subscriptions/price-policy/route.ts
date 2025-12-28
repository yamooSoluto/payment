import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { PricePolicy, PLAN_PRICES } from '@/lib/toss';

// 개별 구독자 가격 정책 변경
export async function PUT(request: NextRequest) {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { tenantId, pricePolicy, priceProtectedUntil, amount } = body;

    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId is required' }, { status: 400 });
    }

    if (!pricePolicy || !['grandfathered', 'protected_until', 'standard'].includes(pricePolicy)) {
      return NextResponse.json({ error: 'Invalid pricePolicy' }, { status: 400 });
    }

    // 구독 정보 조회
    const subscriptionDoc = await db.collection('subscriptions').doc(tenantId).get();
    if (!subscriptionDoc.exists) {
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
    }

    const subscription = subscriptionDoc.data();

    // 업데이트할 데이터
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: Record<string, any> = {
      pricePolicy,
      updatedAt: new Date(),
    };

    // 가격 정책에 따른 추가 필드 설정
    if (pricePolicy === 'protected_until') {
      if (!priceProtectedUntil) {
        return NextResponse.json({ error: 'priceProtectedUntil is required for protected_until policy' }, { status: 400 });
      }
      updateData.priceProtectedUntil = new Date(priceProtectedUntil);
    } else {
      // 다른 정책으로 변경 시 보호 기간 필드 제거
      updateData.priceProtectedUntil = null;
    }

    // 금액 변경이 있는 경우
    if (amount !== undefined && amount !== null) {
      updateData.amount = amount;
      // 원래 금액 기록 (최초 1회)
      if (!subscription?.originalAmount) {
        updateData.originalAmount = subscription?.amount || amount;
      }
    }

    // 'standard' 정책으로 변경 시 최신 플랜 가격으로 업데이트
    if (pricePolicy === 'standard') {
      const currentPlanPrice = PLAN_PRICES[subscription?.plan] || subscription?.amount || 0;
      updateData.amount = currentPlanPrice;
    }

    await db.collection('subscriptions').doc(tenantId).update(updateData);

    return NextResponse.json({
      success: true,
      message: '가격 정책이 변경되었습니다.',
      data: updateData,
    });
  } catch (error) {
    console.error('Failed to update price policy:', error);
    return NextResponse.json(
      { error: 'Failed to update price policy' },
      { status: 500 }
    );
  }
}

// 플랜별 구독자 일괄 가격 정책 변경
export async function POST(request: NextRequest) {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { plan, pricePolicy, priceProtectedUntil, newPlanPrice } = body;

    if (!plan) {
      return NextResponse.json({ error: 'plan is required' }, { status: 400 });
    }

    if (!pricePolicy || !['grandfathered', 'protected_until', 'standard'].includes(pricePolicy)) {
      return NextResponse.json({ error: 'Invalid pricePolicy' }, { status: 400 });
    }

    // 해당 플랜의 모든 활성 구독자 조회
    const subscriptionsSnapshot = await db
      .collection('subscriptions')
      .where('plan', '==', plan)
      .where('status', '==', 'active')
      .get();

    if (subscriptionsSnapshot.empty) {
      return NextResponse.json({
        success: true,
        message: '해당 플랜의 활성 구독자가 없습니다.',
        updatedCount: 0,
      });
    }

    const batch = db.batch();
    let updatedCount = 0;

    subscriptionsSnapshot.docs.forEach((doc) => {
      const subscription = doc.data();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updateData: Record<string, any> = {
        pricePolicy,
        updatedAt: new Date(),
      };

      if (pricePolicy === 'protected_until' && priceProtectedUntil) {
        updateData.priceProtectedUntil = new Date(priceProtectedUntil);
      } else {
        updateData.priceProtectedUntil = null;
      }

      // 원래 금액 기록 (최초 1회)
      if (!subscription.originalAmount) {
        updateData.originalAmount = subscription.amount;
      }

      // 'standard' 정책이고 새 플랜 가격이 지정된 경우
      if (pricePolicy === 'standard' && newPlanPrice !== undefined) {
        updateData.amount = newPlanPrice;
      }

      batch.update(doc.ref, updateData);
      updatedCount++;
    });

    await batch.commit();

    return NextResponse.json({
      success: true,
      message: `${updatedCount}명의 구독자 가격 정책이 변경되었습니다.`,
      updatedCount,
    });
  } catch (error) {
    console.error('Failed to bulk update price policy:', error);
    return NextResponse.json(
      { error: 'Failed to bulk update price policy' },
      { status: 500 }
    );
  }
}

// 플랜별 구독자 통계 조회
export async function GET(request: NextRequest) {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const plan = searchParams.get('plan');

    if (!plan) {
      return NextResponse.json({ error: 'plan is required' }, { status: 400 });
    }

    // 해당 플랜의 활성 구독자 조회
    const subscriptionsSnapshot = await db
      .collection('subscriptions')
      .where('plan', '==', plan)
      .where('status', '==', 'active')
      .get();

    // 가격 정책별 통계
    const stats: Record<PricePolicy, { count: number; totalAmount: number }> = {
      grandfathered: { count: 0, totalAmount: 0 },
      protected_until: { count: 0, totalAmount: 0 },
      standard: { count: 0, totalAmount: 0 },
    };

    subscriptionsSnapshot.docs.forEach((doc) => {
      const subscription = doc.data();
      const policy: PricePolicy = subscription.pricePolicy || 'standard';
      const amount = subscription.amount || 0;

      if (stats[policy]) {
        stats[policy].count++;
        stats[policy].totalAmount += amount;
      }
    });

    const currentPlanPrice = PLAN_PRICES[plan] || 0;

    return NextResponse.json({
      plan,
      currentPlanPrice,
      totalSubscribers: subscriptionsSnapshot.size,
      stats,
    });
  } catch (error) {
    console.error('Failed to get price policy stats:', error);
    return NextResponse.json(
      { error: 'Failed to get price policy stats' },
      { status: 500 }
    );
  }
}
