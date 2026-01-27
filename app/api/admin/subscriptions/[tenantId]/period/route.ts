import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { updateCurrentHistoryStatus } from '@/lib/subscription-history';
import { addAdminLog } from '@/lib/admin-log';
import { getAdminFromRequest } from '@/lib/admin-auth';

// 기간 조정 API
export async function PATCH(
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
      currentPeriodStart,  // ISO date string (optional)
      currentPeriodEnd,    // ISO date string (optional)
      // nextBillingDate는 더 이상 사용하지 않음 - 결제일은 종료일 + 1일로 자동 계산
      reason,              // 선택
    } = body;

    const reasonText = reason?.trim() || '';

    // 최소 하나의 날짜 변경 필요
    if (!currentPeriodStart && !currentPeriodEnd) {
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
      updatedByAdminId: admin.adminId,
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

      // 과거 날짜 검증 (오늘보다 이전이면 경고)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (newEndDate < today) {
        return NextResponse.json({
          error: '종료일은 오늘 이후 날짜로 설정해주세요.',
          hint: '과거 날짜로 설정하면 즉시 결제가 시도될 수 있습니다.'
        }, { status: 400 });
      }

      updateData.currentPeriodEnd = newEndDate;
      changes.push(`종료일: ${currentPeriodEnd}`);

      // 종료일 변경 시 결제일도 자동 업데이트 (종료일 + 1일)
      // 단, Trial 플랜(결제일 없음)이 아닌 경우에만
      const isTrial = existingSubscription.plan === 'trial' || existingSubscription.status === 'trial';
      if (!isTrial) {
        const newBillingDate = new Date(newEndDate);
        newBillingDate.setDate(newBillingDate.getDate() + 1);
        updateData.nextBillingDate = newBillingDate;
        changes.push(`결제일: ${newBillingDate.toISOString().split('T')[0]} (자동)`);
      }
    }
    // 결제일 단독 변경은 허용하지 않음
    // 결제일은 항상 종료일 + 1일로 자동 계산됨

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

    // 관리자 로그 기록
    const logChanges: Record<string, { from: unknown; to: unknown }> = {};
    if (currentPeriodStart) {
      logChanges.currentPeriodStart = {
        from: existingSubscription.currentPeriodStart?.toDate?.()?.toISOString?.() || null,
        to: currentPeriodStart,
      };
    }
    if (currentPeriodEnd) {
      logChanges.currentPeriodEnd = {
        from: existingSubscription.currentPeriodEnd?.toDate?.()?.toISOString?.() || null,
        to: currentPeriodEnd,
      };
    }
    if (updateData.nextBillingDate !== undefined) {
      const newBillingStr = updateData.nextBillingDate instanceof Date
        ? updateData.nextBillingDate.toISOString()
        : updateData.nextBillingDate;
      logChanges.nextBillingDate = {
        from: existingSubscription.nextBillingDate?.toDate?.()?.toISOString?.() || null,
        to: newBillingStr,
      };
    }

    await addAdminLog(db, admin, {
      action: 'subscription_update',
      tenantId,
      userId: tenantData?.userId || null,
      brandName: tenantData?.brandName || null,
      email: tenantData?.email || null,
      changes: logChanges,
      details: {
        note: reasonText || null,
        updateType: 'period_adjustment',
      },
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
