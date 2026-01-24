import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

// 기간 조정 API
export async function PATCH(
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
      currentPeriodStart,  // ISO date string (optional)
      currentPeriodEnd,    // ISO date string (optional)
      nextBillingDate,     // ISO date string | null (optional)
      syncNextBilling,     // boolean: 종료일 변경 시 결제일도 동기화
      reason,              // 필수
    } = body;

    // 필수 필드 검증
    if (!reason || typeof reason !== 'string' || reason.trim() === '') {
      return NextResponse.json({ error: '변경 사유를 입력해주세요.' }, { status: 400 });
    }

    // 최소 하나의 날짜 변경 필요
    if (!currentPeriodStart && !currentPeriodEnd && nextBillingDate === undefined) {
      return NextResponse.json({ error: '변경할 날짜를 선택해주세요.' }, { status: 400 });
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
      return NextResponse.json({ error: '구독 정보가 없습니다.' }, { status: 400 });
    }

    const existingSubscription = subscriptionDoc.data()!;

    // 업데이트 데이터 준비
    const updateData: Record<string, unknown> = {
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: 'admin',
    };

    const tenantUpdateData: Record<string, unknown> = {
      updatedAt: FieldValue.serverTimestamp(),
    };

    // 변경 내역 추적
    const changes: string[] = [];

    // 시작일 변경
    if (currentPeriodStart) {
      const newStart = new Date(currentPeriodStart);
      updateData.currentPeriodStart = newStart;
      tenantUpdateData['subscription.currentPeriodStart'] = newStart;
      changes.push(`시작일: ${currentPeriodStart}`);
    }

    // 종료일 변경
    let newEndDate: Date | null = null;
    if (currentPeriodEnd) {
      newEndDate = new Date(currentPeriodEnd);
      updateData.currentPeriodEnd = newEndDate;
      tenantUpdateData['subscription.currentPeriodEnd'] = newEndDate;
      changes.push(`종료일: ${currentPeriodEnd}`);

      // syncNextBilling이 true이면 결제일도 종료일 + 1일로 동기화
      if (syncNextBilling) {
        const syncedBillingDate = new Date(newEndDate);
        syncedBillingDate.setDate(syncedBillingDate.getDate() + 1);
        updateData.nextBillingDate = syncedBillingDate;
        tenantUpdateData['subscription.nextBillingDate'] = syncedBillingDate;
        changes.push(`결제일: ${syncedBillingDate.toISOString().split('T')[0]} (동기화)`);
      }
    }

    // 결제일 변경 (명시적으로 지정된 경우, syncNextBilling보다 우선)
    if (nextBillingDate !== undefined && !syncNextBilling) {
      if (nextBillingDate === null) {
        updateData.nextBillingDate = null;
        tenantUpdateData['subscription.nextBillingDate'] = null;
        changes.push('결제일: 없음');
      } else {
        const newBillingDate = new Date(nextBillingDate);
        updateData.nextBillingDate = newBillingDate;
        tenantUpdateData['subscription.nextBillingDate'] = newBillingDate;
        changes.push(`결제일: ${nextBillingDate}`);
      }
    }

    // subscriptions 컬렉션 업데이트
    await db.collection('subscriptions').doc(tenantId).update(updateData);

    // tenants 컬렉션 업데이트
    await db.collection('tenants').doc(tenantId).update(tenantUpdateData);

    // subscription_history에 기록
    await db.collection('subscription_history').add({
      tenantId,
      brandName: tenantData?.brandName || '',
      email: tenantData?.email || '',
      plan: existingSubscription.plan,
      status: existingSubscription.status,
      amount: existingSubscription.amount,
      periodStart: updateData.currentPeriodStart || existingSubscription.currentPeriodStart,
      periodEnd: updateData.currentPeriodEnd || existingSubscription.currentPeriodEnd,
      billingDate: updateData.nextBillingDate !== undefined
        ? updateData.nextBillingDate
        : existingSubscription.nextBillingDate,
      changeType: 'admin_period_adjust',
      previousPlan: existingSubscription.plan,
      previousStatus: existingSubscription.status,
      changedAt: FieldValue.serverTimestamp(),
      changedBy: 'admin',
      note: `관리자에 의해 기간 조정: ${changes.join(', ')}. 사유: ${reason}`,
    });

    return NextResponse.json({
      success: true,
      message: '구독 기간이 조정되었습니다.',
      changes,
    });
  } catch (error) {
    console.error('Failed to adjust period:', error);
    return NextResponse.json(
      { error: '기간 조정에 실패했습니다.' },
      { status: 500 }
    );
  }
}
