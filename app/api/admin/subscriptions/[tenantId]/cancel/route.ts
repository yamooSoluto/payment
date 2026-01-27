import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { addSubscriptionHistoryRecord } from '@/lib/subscription-history';
import { addAdminLog } from '@/lib/admin-log';
import { getAdminFromRequest } from '@/lib/admin-auth';

// 구독 해지 API
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
      cancelMode,  // 'scheduled' | 'immediate'
      reason,      // 선택
    } = body;

    // 필수 필드 검증
    if (!cancelMode || !['scheduled', 'immediate'].includes(cancelMode)) {
      return NextResponse.json({ error: '해지 방식을 선택해주세요.' }, { status: 400 });
    }

    const reasonText = reason?.trim() || '';

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
      return NextResponse.json({ error: '구독 정보가 없습니다.' }, { status: 400 });
    }

    const existingSubscription = subscriptionDoc.data()!;
    const currentStatus = existingSubscription.status;

    // 이미 해지된 구독 확인
    if (currentStatus === 'canceled' || currentStatus === 'expired') {
      return NextResponse.json(
        { error: '이미 해지되었거나 만료된 구독입니다.' },
        { status: 400 }
      );
    }

    // 활성 구독만 해지 가능
    if (!['active', 'trial', 'trialing', 'pending_cancel'].includes(currentStatus)) {
      return NextResponse.json(
        { error: '활성화된 구독만 해지할 수 있습니다.' },
        { status: 400 }
      );
    }

    const now = new Date();

    if (cancelMode === 'scheduled') {
      // 예약 해지: 현재 이용기간 종료 후 해지
      const cancelAt = existingSubscription.currentPeriodEnd
        ? new Date(existingSubscription.currentPeriodEnd.toDate ? existingSubscription.currentPeriodEnd.toDate() : existingSubscription.currentPeriodEnd)
        : now;

      await db.collection('subscriptions').doc(tenantId).update({
        status: 'pending_cancel',
        cancelAt,
        cancelReason: reasonText,
        cancelRequestedAt: now,
        cancelRequestedBy: 'admin',
        // pending 필드 초기화
        pendingPlan: null,
        pendingAmount: null,
        pendingChangeAt: null,
        // 원래 결제일 저장 (취소 시 복구용)
        previousNextBillingDate: existingSubscription.nextBillingDate || null,
        // 다음 결제일 제거 (자동 결제 방지)
        nextBillingDate: null,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: 'admin',
      });

      // tenants 컬렉션 업데이트
      await db.collection('tenants').doc(tenantId).update({
        'subscription.status': 'pending_cancel',
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: 'admin',
      });

      // subscription_history에 기록 (서브컬렉션 구조)
      await addSubscriptionHistoryRecord(db, {
        tenantId,
        userId: tenantData?.userId || existingSubscription.userId || '',
        email: tenantData?.email || '',
        brandName: tenantData?.brandName || '',
        plan: existingSubscription.plan,
        status: 'pending_cancel',
        amount: existingSubscription.amount,
        periodStart: existingSubscription.currentPeriodStart?.toDate?.() || existingSubscription.currentPeriodStart || new Date(),
        periodEnd: existingSubscription.currentPeriodEnd?.toDate?.() || existingSubscription.currentPeriodEnd || null,
        billingDate: null,
        changeType: 'cancel',
        changedAt: new Date(),
        changedBy: 'admin',
        previousPlan: existingSubscription.plan,
        previousStatus: currentStatus,
        note: `관리자에 의해 해지 예약. 해지 예정일: ${cancelAt.toISOString().split('T')[0]}${reasonText ? `. 사유: ${reasonText}` : ''}`,
      });

      // 관리자 로그 기록
      await addAdminLog(db, admin, {
        action: 'subscription_cancel',
        tenantId,
        userId: tenantData?.userId || null,
        brandName: tenantData?.brandName || null,
        email: tenantData?.email || null,
        details: {
          cancelMode: 'scheduled',
          previousPlan: existingSubscription.plan,
          note: reasonText || null,
        },
      });

      return NextResponse.json({
        success: true,
        message: '구독 해지가 예약되었습니다.',
        cancelMode: 'scheduled',
        cancelAt: cancelAt.toISOString(),
      });
    } else {
      // 즉시 해지
      await db.collection('subscriptions').doc(tenantId).update({
        status: 'canceled',
        cancelAt: null,
        canceledAt: now,
        cancelReason: reasonText,
        cancelRequestedAt: now,
        cancelRequestedBy: 'admin',
        // pending 필드 초기화
        pendingPlan: null,
        pendingAmount: null,
        pendingChangeAt: null,
        // 다음 결제일 제거
        nextBillingDate: null,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: 'admin',
      });

      // tenants 컬렉션 업데이트
      await db.collection('tenants').doc(tenantId).update({
        'subscription.status': 'canceled',
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: 'admin',
      });

      // subscription_history에 기록 (서브컬렉션 구조)
      await addSubscriptionHistoryRecord(db, {
        tenantId,
        userId: tenantData?.userId || existingSubscription.userId || '',
        email: tenantData?.email || '',
        brandName: tenantData?.brandName || '',
        plan: existingSubscription.plan,
        status: 'canceled',
        amount: existingSubscription.amount,
        periodStart: existingSubscription.currentPeriodStart?.toDate?.() || existingSubscription.currentPeriodStart || new Date(),
        periodEnd: existingSubscription.currentPeriodEnd?.toDate?.() || existingSubscription.currentPeriodEnd || null,
        billingDate: null,
        changeType: 'cancel',
        changedAt: new Date(),
        changedBy: 'admin',
        previousPlan: existingSubscription.plan,
        previousStatus: currentStatus,
        note: `관리자에 의해 즉시 해지${reasonText ? `. 사유: ${reasonText}` : ''}`,
      });

      // 관리자 로그 기록
      await addAdminLog(db, admin, {
        action: 'subscription_cancel',
        tenantId,
        userId: tenantData?.userId || null,
        brandName: tenantData?.brandName || null,
        email: tenantData?.email || null,
        details: {
          cancelMode: 'immediate',
          previousPlan: existingSubscription.plan,
          note: reasonText || null,
        },
      });

      return NextResponse.json({
        success: true,
        message: '구독이 즉시 해지되었습니다.',
        cancelMode: 'immediate',
        canceledAt: now.toISOString(),
      });
    }
  } catch (error) {
    console.error('Failed to cancel subscription:', error);
    return NextResponse.json(
      { error: '구독 해지에 실패했습니다.' },
      { status: 500 }
    );
  }
}
