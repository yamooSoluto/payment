import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

// 플랜별 금액
const PLAN_PRICES: Record<string, number> = {
  trial: 0,
  basic: 39000,
  business: 99000,
  enterprise: 199000,
};

const VALID_PLANS = ['trial', 'basic', 'business', 'enterprise'];

// 구독 시작 API
export async function POST(
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
      plan,                    // 'trial' | 'basic' | 'business' | 'enterprise'
      currentPeriodStart,      // ISO date string (optional)
      currentPeriodEnd,        // ISO date string (optional)
      nextBillingDate,         // ISO date string | null (optional)
      reason,
    } = body;

    // 필수 필드 검증
    if (!plan || !VALID_PLANS.includes(plan)) {
      return NextResponse.json({ error: '플랜을 선택해주세요.' }, { status: 400 });
    }

    // 매장 존재 여부 확인
    const tenantDoc = await db.collection('tenants').doc(tenantId).get();
    if (!tenantDoc.exists) {
      return NextResponse.json({ error: '매장을 찾을 수 없습니다.' }, { status: 404 });
    }

    const tenantData = tenantDoc.data();
    if (tenantData?.deleted) {
      return NextResponse.json({ error: '삭제된 매장입니다.' }, { status: 400 });
    }

    // 기존 구독 상태 확인
    const subscriptionDoc = await db.collection('subscriptions').doc(tenantId).get();
    const existingSubscription = subscriptionDoc.exists ? subscriptionDoc.data() : null;

    // 이미 활성 구독이 있는지 확인
    if (existingSubscription) {
      const status = existingSubscription.status;
      if (status === 'active' || status === 'trial' || status === 'trialing' || status === 'pending_cancel') {
        return NextResponse.json(
          { error: '이미 활성화된 구독이 있습니다. 플랜 변경 또는 해지 후 다시 시도해주세요.' },
          { status: 400 }
        );
      }
    }

    // 날짜 계산
    const now = new Date();
    const startDate = currentPeriodStart ? new Date(currentPeriodStart) : now;

    // 종료일 계산: 시작일 + 1개월 - 1일
    let endDate: Date;
    if (currentPeriodEnd) {
      endDate = new Date(currentPeriodEnd);
    } else {
      endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + 1);
      endDate.setDate(endDate.getDate() - 1);
    }

    // 다음 결제일 계산
    const isTrial = plan === 'trial';
    let billingDate: Date | null = null;
    if (nextBillingDate === null) {
      // 명시적으로 null이면 결제일 없음
      billingDate = null;
    } else if (nextBillingDate) {
      billingDate = new Date(nextBillingDate);
    } else if (!isTrial) {
      // 유료 플랜이면 시작일 + 1개월
      billingDate = new Date(startDate);
      billingDate.setMonth(billingDate.getMonth() + 1);
    }
    // trial이고 nextBillingDate가 없으면 null 유지

    // 상태 및 금액 결정
    const status = isTrial ? 'trial' : 'active';
    const amount = PLAN_PRICES[plan] || 0;

    // 구독 데이터 생성/업데이트
    const subscriptionData = {
      tenantId,
      brandName: tenantData?.brandName || '',
      email: tenantData?.email || '',
      plan,
      status,
      amount,
      currentPeriodStart: startDate,
      currentPeriodEnd: endDate,
      nextBillingDate: billingDate,
      // pending 필드 초기화
      pendingPlan: null,
      pendingAmount: null,
      pendingChangeAt: null,
      // 해지 관련 필드 초기화
      cancelAt: null,
      canceledAt: null,
      cancelReason: null,
      // 메타데이터
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: 'admin',
    };

    // subscriptions 컬렉션 업데이트
    if (subscriptionDoc.exists) {
      await db.collection('subscriptions').doc(tenantId).update(subscriptionData);
    } else {
      await db.collection('subscriptions').doc(tenantId).set({
        ...subscriptionData,
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    // tenants 컬렉션의 subscription 필드도 업데이트
    await db.collection('tenants').doc(tenantId).update({
      'subscription.plan': plan,
      'subscription.status': status,
      'subscription.currentPeriodStart': startDate,
      'subscription.currentPeriodEnd': endDate,
      'subscription.nextBillingDate': billingDate,
      updatedAt: FieldValue.serverTimestamp(),
    });

    // subscription_history에 기록
    await db.collection('subscription_history').add({
      tenantId,
      brandName: tenantData?.brandName || '',
      email: tenantData?.email || '',
      plan,
      status,
      amount,
      periodStart: startDate,
      periodEnd: endDate,
      billingDate,
      changeType: isTrial ? 'trial_start' : 'new',
      previousPlan: existingSubscription?.plan || null,
      previousStatus: existingSubscription?.status || null,
      changedAt: FieldValue.serverTimestamp(),
      changedBy: 'admin',
      note: reason || `관리자에 의해 ${isTrial ? 'Trial' : plan} 구독 시작`,
    });

    return NextResponse.json({
      success: true,
      message: `${isTrial ? 'Trial이' : '구독이'} 시작되었습니다.`,
      subscription: {
        tenantId,
        plan,
        status,
        amount,
        currentPeriodStart: startDate.toISOString(),
        currentPeriodEnd: endDate.toISOString(),
        nextBillingDate: billingDate?.toISOString() || null,
      },
    });
  } catch (error) {
    console.error('Failed to start subscription:', error);
    return NextResponse.json(
      { error: '구독 시작에 실패했습니다.' },
      { status: 500 }
    );
  }
}
