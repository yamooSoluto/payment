import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { handleSubscriptionChange } from '@/lib/subscription-history';
import { addAdminLog } from '@/lib/admin-log';
import { getAdminFromRequest } from '@/lib/admin-auth';

// 플랜별 금액
const PLAN_PRICES: Record<string, number> = {
  trial: 0,
  basic: 39000,
  business: 99000,
  enterprise: 199000,
};

const VALID_PLANS = ['basic', 'business', 'enterprise'];

// 플랜 변경 API (trial은 제외 - 플랜 변경이 아닌 구독 시작으로 처리)
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
      newPlan,    // 'basic' | 'business' | 'enterprise'
      applyNow,   // true: 즉시 적용, false: 다음 결제일부터
      reason,
    } = body;

    // 필수 필드 검증
    if (!newPlan || !VALID_PLANS.includes(newPlan)) {
      return NextResponse.json({ error: '변경할 플랜을 선택해주세요.' }, { status: 400 });
    }

    if (typeof applyNow !== 'boolean') {
      return NextResponse.json({ error: '적용 시점을 선택해주세요.' }, { status: 400 });
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
    if (!subscriptionDoc.exists) {
      return NextResponse.json({ error: '구독 정보가 없습니다. 먼저 구독을 시작해주세요.' }, { status: 400 });
    }

    const existingSubscription = subscriptionDoc.data()!;
    const currentStatus = existingSubscription.status;
    const currentPlan = existingSubscription.plan;

    // 활성 구독만 플랜 변경 가능
    if (!['active', 'trial', 'trialing', 'pending_cancel'].includes(currentStatus)) {
      return NextResponse.json(
        { error: '활성화된 구독만 플랜을 변경할 수 있습니다.' },
        { status: 400 }
      );
    }

    // 동일 플랜 변경 불가
    if (currentPlan === newPlan) {
      return NextResponse.json({ error: '현재와 동일한 플랜입니다.' }, { status: 400 });
    }

    const newAmount = PLAN_PRICES[newPlan];
    const now = new Date();

    if (applyNow) {
      // 즉시 적용
      const updateData: Record<string, unknown> = {
        plan: newPlan,
        amount: newAmount,
        baseAmount: newAmount,
        // pending 필드 초기화
        pendingPlan: null,
        pendingAmount: null,
        pendingChangeAt: null,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: 'admin',
      };

      // Enterprise는 후불 결제이므로 자동결제일 제거
      if (newPlan === 'enterprise') {
        updateData.nextBillingDate = null;
      }

      await db.collection('subscriptions').doc(tenantId).update(updateData);

      // tenants 컬렉션도 업데이트
      await db.collection('tenants').doc(tenantId).update({
        plan: newPlan,  // 상위 plan 필드
        'subscription.plan': newPlan,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: 'admin',
      });

      // subscription_history에 기록 (기존 레코드 완료 + 새 레코드 추가)
      const changeType = PLAN_PRICES[newPlan] > PLAN_PRICES[currentPlan] ? 'upgrade' : 'downgrade';
      await handleSubscriptionChange(db, {
        tenantId,
        userId: tenantData?.userId || existingSubscription.userId || '',
        email: tenantData?.email || '',
        brandName: tenantData?.brandName || '',
        newPlan: newPlan,
        newStatus: currentStatus,
        amount: newAmount,
        periodStart: existingSubscription.currentPeriodStart?.toDate?.() || existingSubscription.currentPeriodStart || new Date(),
        periodEnd: existingSubscription.currentPeriodEnd?.toDate?.() || existingSubscription.currentPeriodEnd || null,
        billingDate: existingSubscription.nextBillingDate?.toDate?.() || existingSubscription.nextBillingDate || null,
        changeType,
        changedBy: 'admin',
        previousPlan: currentPlan,
        previousStatus: currentStatus,
        note: reason || `관리자에 의해 플랜 즉시 변경 (${currentPlan} → ${newPlan})`,
      });

      // 관리자 로그 기록
      await addAdminLog(db, admin, {
        action: 'subscription_change_plan',
        tenantId,
        userId: tenantData?.userId || null,
        brandName: tenantData?.brandName || null,
        email: tenantData?.email || null,
        details: {
          previousPlan: currentPlan,
          newPlan,
          applyMode: 'immediate',
          note: reason || null,
        },
      });

      return NextResponse.json({
        success: true,
        message: `플랜이 ${newPlan === 'business' ? 'Business' : 'Basic'}으로 변경되었습니다.`,
        appliedAt: 'now',
        subscription: {
          plan: newPlan,
          amount: newAmount,
        },
      });
    } else {
      // 다음 결제일부터 적용 (pendingPlan 설정)
      const nextBillingDate = existingSubscription.nextBillingDate;

      await db.collection('subscriptions').doc(tenantId).update({
        pendingPlan: newPlan,
        pendingAmount: newAmount,
        pendingMode: 'scheduled',  // cron에서 감지하기 위해 필수
        pendingChangeAt: nextBillingDate || existingSubscription.currentPeriodEnd,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: 'admin',
      });

      // subscription_history는 실제 적용 시점(cron)에서 기록

      // 관리자 로그 기록
      await addAdminLog(db, admin, {
        action: 'subscription_change_plan',
        tenantId,
        userId: tenantData?.userId || null,
        brandName: tenantData?.brandName || null,
        email: tenantData?.email || null,
        details: {
          previousPlan: currentPlan,
          newPlan,
          applyMode: 'scheduled',
          note: reason || null,
        },
      });

      return NextResponse.json({
        success: true,
        message: `다음 결제일부터 ${newPlan === 'business' ? 'Business' : 'Basic'} 플랜으로 변경됩니다.`,
        appliedAt: nextBillingDate || existingSubscription.currentPeriodEnd,
        subscription: {
          currentPlan: currentPlan,
          pendingPlan: newPlan,
          pendingAmount: newAmount,
        },
      });
    }
  } catch (error) {
    console.error('Failed to change plan:', error);
    return NextResponse.json(
      { error: '플랜 변경에 실패했습니다.' },
      { status: 500 }
    );
  }
}
