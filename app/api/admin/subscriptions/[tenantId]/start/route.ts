import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { addSubscriptionHistoryRecord } from '@/lib/subscription-history';
import { addAdminLog } from '@/lib/admin-log';
import { getAdminFromRequest } from '@/lib/admin-auth';
import { addOneMonth } from '@/lib/utils';

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

  // 관리자 인증
  const admin = await getAdminFromRequest(request);
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { tenantId } = await params;
    const body = await request.json();
    const {
      plan,                    // 'trial' | 'basic' | 'business' | 'enterprise'
      currentPeriodStart,      // ISO date string (optional)
      currentPeriodEnd,        // ISO date string (optional)
      // nextBillingDate는 더 이상 사용하지 않음 - 유료 플랜은 무조건 시작일+1개월로 자동 계산
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
      endDate = addOneMonth(startDate);
      endDate.setDate(endDate.getDate() - 1);
    }

    // 다음 결제일 계산
    // - Trial 플랜: 결제일 없음 (null)
    // - 유료 플랜: 종료일 + 1일 (관리자가 임의 설정 불가)
    // 이유: 결제일 = 종료일 다음날이어야 기간 공백 없이 연속됨
    const isTrial = plan === 'trial';
    let billingDate: Date | null = null;
    if (!isTrial) {
      // 유료 플랜이면 종료일 + 1일
      billingDate = new Date(endDate);
      billingDate.setDate(billingDate.getDate() + 1);
    }
    // trial은 null 유지

    // 상태 및 금액 결정
    const status = isTrial ? 'trial' : 'active';
    const amount = PLAN_PRICES[plan] || 0;
    const baseAmount = amount; // 플랜 기본 가격 (정기결제 금액, UI 표시용)

    // amountPeriodDays 계산: 이번 결제 금액에 해당하는 기간 일수
    // 실제 이용 기간(startDate ~ endDate) 기준으로 계산 (billingDate와 무관)
    const periodEndPlusOne = new Date(endDate);
    periodEndPlusOne.setDate(periodEndPlusOne.getDate() + 1);
    const amountPeriodDays = Math.round((periodEndPlusOne.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

    // 구독 데이터 생성/업데이트
    const subscriptionData = {
      tenantId,
      userId: tenantData?.userId || null,
      brandName: tenantData?.brandName || '',
      name: tenantData?.name || null,
      phone: tenantData?.phone || null,
      email: tenantData?.email || '',
      plan,
      status,
      amount,
      amountPeriodDays,  // 이번 결제 금액에 해당하는 기간 일수
      baseAmount,
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
      updatedByAdminId: admin.adminId,
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
      plan,
      'subscription.plan': plan,
      'subscription.status': status,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: 'admin',
    });

    // subscription_history에 기록 (서브컬렉션 구조 사용)
    await addSubscriptionHistoryRecord(db, {
      tenantId,
      userId: tenantData?.userId || '',
      email: tenantData?.email || '',
      brandName: tenantData?.brandName || '',
      plan,
      status,
      amount,
      periodStart: startDate,
      periodEnd: endDate,
      billingDate,
      changeType: 'new',
      changedAt: new Date(),
      changedBy: 'admin',
      previousPlan: existingSubscription?.plan || null,
      previousStatus: existingSubscription?.status || null,
      note: reason || `관리자에 의해 ${isTrial ? 'Trial' : plan} 구독 시작`,
    });

    // 관리자 로그 기록
    await addAdminLog(db, admin, {
      action: 'subscription_start',
      tenantId,
      userId: tenantData?.userId || null,
      brandName: tenantData?.brandName || null,
      email: tenantData?.email || null,
      details: {
        newPlan: plan,
        previousPlan: existingSubscription?.plan || null,
        note: reason || null,
      },
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
