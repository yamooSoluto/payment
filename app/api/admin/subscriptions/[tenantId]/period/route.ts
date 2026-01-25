import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { updateCurrentHistoryStatus } from '@/lib/subscription-history';

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
      reason,              // 선택
    } = body;

    const reasonText = reason?.trim() || '';

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

    // 변경 내역 추적
    const changes: string[] = [];

    // 시작일 변경
    if (currentPeriodStart) {
      const newStart = new Date(currentPeriodStart);
      updateData.currentPeriodStart = newStart;
      changes.push(`시작일: ${currentPeriodStart}`);
    }

    // 종료일 변경
    if (currentPeriodEnd) {
      const newEndDate = new Date(currentPeriodEnd);
      updateData.currentPeriodEnd = newEndDate;
      changes.push(`종료일: ${currentPeriodEnd}`);
    }

    // 결제일 변경
    if (nextBillingDate !== undefined) {
      if (nextBillingDate === null) {
        updateData.nextBillingDate = null;
        changes.push('결제일: 없음');
      } else {
        const newBillingDate = new Date(nextBillingDate);
        updateData.nextBillingDate = newBillingDate;
        changes.push(`결제일: ${nextBillingDate}`);
      }
    }

    // subscriptions 컬렉션만 업데이트 (tenants는 subscription 필드 없음)
    await db.collection('subscriptions').doc(tenantId).update(updateData);

    // subscription_history에서 현재 활성 레코드의 기간 정보만 업데이트 (새 레코드 생성 안함)
    const historyUpdateData: Record<string, unknown> = {
      note: `관리자에 의해 기간 조정: ${changes.join(', ')}${reasonText ? `. 사유: ${reasonText}` : ''}`,
    };

    if (updateData.currentPeriodStart) {
      historyUpdateData.periodStart = updateData.currentPeriodStart;
    }
    if (updateData.currentPeriodEnd) {
      historyUpdateData.periodEnd = updateData.currentPeriodEnd;
    }
    if (updateData.nextBillingDate !== undefined) {
      historyUpdateData.billingDate = updateData.nextBillingDate;
    }

    await updateCurrentHistoryStatus(
      db,
      tenantId,
      existingSubscription.status, // 상태는 그대로 유지
      historyUpdateData
    );

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
