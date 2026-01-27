import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { handleSubscriptionChange } from '@/lib/subscription-history';

const VALID_PLANS = ['trial', 'basic', 'business', 'enterprise'];
const VALID_STATUSES = ['trial', 'active', 'canceled', 'past_due', 'expired'];
const PLAN_PRICES: Record<string, number> = {
  trial: 0,
  basic: 39000,
  business: 99000,
  enterprise: 199000,
};

// 관리자: 구독 정보 수정
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
  }

  try {
    const { tenantId } = await params;
    const body = await request.json();
    const {
      plan,
      status,
      amount,
      currentPeriodStart,
      currentPeriodEnd,
      nextBillingDate,
    } = body;

    // 매장 존재 여부 확인
    const tenantDoc = await db.collection('tenants').doc(tenantId).get();
    if (!tenantDoc.exists) {
      return NextResponse.json({ error: '매장을 찾을 수 없습니다.' }, { status: 404 });
    }

    // 유효성 검증
    if (plan && !VALID_PLANS.includes(plan)) {
      return NextResponse.json({ error: '유효하지 않은 플랜입니다.' }, { status: 400 });
    }

    if (status && !VALID_STATUSES.includes(status)) {
      return NextResponse.json({ error: '유효하지 않은 상태입니다.' }, { status: 400 });
    }

    // 구독 문서 존재 여부 확인
    const subscriptionDoc = await db.collection('subscriptions').doc(tenantId).get();
    const existingData = subscriptionDoc.exists ? subscriptionDoc.data() : null;

    // 업데이트할 데이터 구성
    const updateData: Record<string, unknown> = {
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: 'admin',
    };

    if (plan !== undefined) {
      updateData.plan = plan;
      // 플랜 변경 시 항상 해당 플랜 금액으로 업데이트 (amount가 별도로 지정되지 않은 경우)
      if (amount === undefined) {
        updateData.amount = PLAN_PRICES[plan] || 0;
      }
    }

    if (status !== undefined) {
      updateData.status = status;
    }

    if (amount !== undefined) {
      updateData.amount = amount;
    }

    if (currentPeriodStart !== undefined) {
      updateData.currentPeriodStart = currentPeriodStart ? new Date(currentPeriodStart) : null;
    }

    if (currentPeriodEnd !== undefined) {
      updateData.currentPeriodEnd = currentPeriodEnd ? new Date(currentPeriodEnd) : null;
    }

    if (nextBillingDate !== undefined) {
      updateData.nextBillingDate = nextBillingDate ? new Date(nextBillingDate) : null;
    }

    // 구독 문서가 없으면 생성, 있으면 업데이트
    const tenantData = tenantDoc.data();

    // users 컬렉션에서 사용자 정보 조회
    let userData: { name?: string; phone?: string; userId?: string } = {};
    if (tenantData?.email) {
      const userDoc = await db.collection('users').doc(tenantData.email).get();
      if (userDoc.exists) {
        const userInfo = userDoc.data();
        userData = {
          name: userInfo?.name,
          phone: userInfo?.phone,
          userId: userInfo?.userId,
        };
      }
    }

    if (!subscriptionDoc.exists) {
      // 새 구독 생성
      const newSubscription = {
        tenantId,
        email: tenantData?.email,
        brandName: tenantData?.brandName,
        name: userData.name || tenantData?.name || '',
        phone: userData.phone || tenantData?.phone || '',
        userId: userData.userId || tenantData?.userId || '',
        plan: plan || 'basic',
        status: status || 'active',
        amount: amount ?? PLAN_PRICES[plan || 'basic'] ?? 39000,
        createdAt: FieldValue.serverTimestamp(),
        ...updateData,
      };
      await db.collection('subscriptions').doc(tenantId).set(newSubscription);
    } else {
      // 기존 구독 업데이트 (userId가 없으면 추가)
      const existingUserId = existingData?.userId;
      if (!existingUserId && userData.userId) {
        updateData.userId = userData.userId;
        updateData.name = userData.name || '';
        updateData.phone = userData.phone || '';
      }
      await db.collection('subscriptions').doc(tenantId).update(updateData);
    }

    // tenants 컬렉션의 subscription 필드도 함께 업데이트 (plan, status만)
    const tenantSubscriptionUpdate: Record<string, unknown> = {};
    if (plan !== undefined) {
      tenantSubscriptionUpdate['subscription.plan'] = plan;
    }
    if (status !== undefined) {
      tenantSubscriptionUpdate['subscription.status'] = status;
    }

    if (Object.keys(tenantSubscriptionUpdate).length > 0) {
      tenantSubscriptionUpdate.updatedAt = FieldValue.serverTimestamp();
      tenantSubscriptionUpdate.updatedBy = 'admin';
      await db.collection('tenants').doc(tenantId).update(tenantSubscriptionUpdate);
    }

    // trial 플랜/상태로 변경 시 users 컬렉션에 trialApplied 기록
    const isTrial = (plan === 'trial' || status === 'trial');
    const wasTrial = existingData?.plan === 'trial' || existingData?.status === 'trial';

    if (isTrial && !wasTrial && tenantData?.email) {
      const userRef = db.collection('users').doc(tenantData.email);
      const userDoc = await userRef.get();

      if (userDoc.exists && !userDoc.data()?.trialApplied) {
        await userRef.update({
          trialApplied: true,
          trialAppliedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: 'admin',
        });
      }
    }

    // 변경 로그 기록
    await db.collection('subscription_changes').add({
      tenantId,
      userId: userData.userId || existingData?.userId || '',
      brandName: tenantData?.brandName,
      changedBy: 'admin',
      changedAt: new Date(),
      previousData: existingData || null,
      newData: updateData,
      reason: body.reason || '관리자 수정',
    });

    // subscription_history 기록 (플랜 또는 상태가 변경된 경우)
    const previousPlan = existingData?.plan;
    const previousStatus = existingData?.status;
    const newPlan = plan || previousPlan || 'basic';
    const newStatus = status || previousStatus || 'active';
    const newAmount = updateData.amount as number ?? existingData?.amount ?? PLAN_PRICES[newPlan] ?? 0;

    // 플랜이 변경되었거나 상태가 변경된 경우에만 히스토리 기록
    if (plan !== undefined || status !== undefined) {
      // changeType 결정
      let changeType: 'admin_edit' | 'upgrade' | 'downgrade' | 'cancel' | 'expire' | 'reactivate' = 'admin_edit';
      const planOrder = { trial: 0, basic: 1, business: 2, enterprise: 3 };

      if (plan && previousPlan && plan !== previousPlan) {
        const prevOrder = planOrder[previousPlan as keyof typeof planOrder] ?? 0;
        const newOrder = planOrder[plan as keyof typeof planOrder] ?? 0;
        changeType = newOrder > prevOrder ? 'upgrade' : 'downgrade';
      } else if (status === 'canceled') {
        changeType = 'cancel';
      } else if (status === 'expired') {
        changeType = 'expire';
      } else if ((previousStatus === 'canceled' || previousStatus === 'expired') && status === 'active') {
        changeType = 'reactivate';
      }

      try {
        await handleSubscriptionChange(db, {
          tenantId,
          userId: userData.userId || existingData?.userId || '',
          email: tenantData?.email || '',
          brandName: tenantData?.brandName,
          newPlan,
          newStatus,
          amount: newAmount,
          periodStart: currentPeriodStart ? new Date(currentPeriodStart) : (existingData?.currentPeriodStart?.toDate?.() || new Date()),
          periodEnd: currentPeriodEnd ? new Date(currentPeriodEnd) : (existingData?.currentPeriodEnd?.toDate?.() || null),
          billingDate: nextBillingDate ? new Date(nextBillingDate) : (existingData?.nextBillingDate?.toDate?.() || null),
          changeType,
          changedBy: 'admin',
          previousPlan: previousPlan || null,
          previousStatus: previousStatus || null,
          note: body.reason || '관리자 수정',
        });
      } catch (historyError) {
        console.error('Failed to record subscription history:', historyError);
        // 히스토리 기록 실패는 무시하고 진행
      }
    }

    return NextResponse.json({
      success: true,
      message: '구독 정보가 수정되었습니다.',
    });
  } catch (error) {
    console.error('Failed to update subscription:', error);
    return NextResponse.json(
      { error: '구독 정보 수정에 실패했습니다.' },
      { status: 500 }
    );
  }
}

// 관리자: 구독 삭제 (구독 해지)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
  }

  try {
    const { tenantId } = await params;

    // 구독 문서 존재 여부 확인
    const subscriptionDoc = await db.collection('subscriptions').doc(tenantId).get();
    if (!subscriptionDoc.exists) {
      return NextResponse.json({ error: '구독 정보를 찾을 수 없습니다.' }, { status: 404 });
    }

    const existingData = subscriptionDoc.data();

    // 구독 상태를 expired로 변경
    await db.collection('subscriptions').doc(tenantId).update({
      status: 'expired',
      canceledAt: new Date(),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: 'admin',
    });

    // tenants 컬렉션에 만료 상태 동기화
    const { syncSubscriptionExpired } = await import('@/lib/tenant-sync');
    await syncSubscriptionExpired(tenantId, 'admin');

    // 변경 로그 기록
    await db.collection('subscription_changes').add({
      tenantId,
      userId: existingData?.userId || '',
      brandName: existingData?.brandName,
      changedBy: 'admin',
      changedAt: new Date(),
      previousData: existingData,
      action: 'cancel',
      reason: '관리자 해지',
    });

    return NextResponse.json({
      success: true,
      message: '구독이 해지되었습니다.',
    });
  } catch (error) {
    console.error('Failed to cancel subscription:', error);
    return NextResponse.json(
      { error: '구독 해지에 실패했습니다.' },
      { status: 500 }
    );
  }
}
