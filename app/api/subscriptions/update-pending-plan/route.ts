import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { verifyToken, getPlanById } from '@/lib/auth';

// 예약된 플랜 변경 (billingKey가 이미 있는 경우)
export async function POST(request: NextRequest) {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { token, email: emailParam, tenantId, newPlan } = body;

    let email: string | null = null;

    if (token) {
      email = await verifyToken(token);
    } else if (emailParam) {
      email = emailParam;
    }

    if (!email) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    if (!tenantId || !newPlan) {
      return NextResponse.json({ error: 'tenantId and newPlan are required' }, { status: 400 });
    }

    // 플랜 정보 조회
    const planInfo = await getPlanById(newPlan);
    if (!planInfo) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
    }

    // 구독 정보 조회
    const subscriptionRef = db.collection('subscriptions').doc(tenantId);
    const subscriptionDoc = await subscriptionRef.get();

    if (!subscriptionDoc.exists) {
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
    }

    const subscription = subscriptionDoc.data();

    // 권한 확인
    if (subscription?.email !== email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // billingKey 확인
    if (!subscription?.billingKey) {
      return NextResponse.json({ error: 'No billing key found. Please register a card first.' }, { status: 400 });
    }

    // Date 객체로 변환하는 헬퍼
    const toDate = (value: unknown): Date | null => {
      if (!value) return null;
      if (value instanceof Date) return value;
      if (typeof value === 'object' && 'toDate' in value && typeof (value as { toDate: () => Date }).toDate === 'function') {
        return (value as { toDate: () => Date }).toDate();
      }
      if (typeof value === 'string' || typeof value === 'number') {
        const d = new Date(value);
        return isNaN(d.getTime()) ? null : d;
      }
      return null;
    };

    const currentPeriodEnd = toDate(subscription.currentPeriodEnd);
    const nextBillingDate = toDate(subscription.nextBillingDate);
    const isTrial = subscription.status === 'trial';

    // pendingChangeAt 계산:
    // - Trial 사용자: currentPeriodEnd + 1 (무료체험 마지막 날 다음날)
    // - Active 사용자: nextBillingDate 그대로 (다음 결제일이 곧 새 플랜 시작일)
    let pendingChangeAt: Date;
    if (isTrial && currentPeriodEnd) {
      pendingChangeAt = new Date(currentPeriodEnd);
      pendingChangeAt.setDate(pendingChangeAt.getDate() + 1);
    } else if (nextBillingDate) {
      pendingChangeAt = new Date(nextBillingDate);
    } else {
      // 폴백: 30일 후
      pendingChangeAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    }

    // 예약 플랜 업데이트
    await subscriptionRef.update({
      pendingPlan: newPlan,
      pendingAmount: planInfo.price,
      pendingChangeAt,
      updatedAt: new Date(),
      updatedBy: 'user',
      updatedByAdminId: null,
    });

    return NextResponse.json({
      success: true,
      pendingPlan: newPlan,
      pendingAmount: planInfo.price,
      pendingChangeAt: pendingChangeAt instanceof Date ? pendingChangeAt.toISOString() : pendingChangeAt,
      message: '예약 플랜이 변경되었습니다.',
    });
  } catch (error) {
    console.error('Update pending plan failed:', error);
    return NextResponse.json(
      { error: 'Failed to update pending plan' },
      { status: 500 }
    );
  }
}
