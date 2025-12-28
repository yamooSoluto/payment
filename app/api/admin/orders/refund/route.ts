import { NextRequest, NextResponse } from 'next/server';
import { getAdminFromRequest, hasPermission } from '@/lib/admin-auth';
import { initializeFirebaseAdmin } from '@/lib/firebase-admin';

const TOSS_SECRET_KEY = process.env.TOSS_SECRET_KEY;

// POST: 결제 환불 처리
export async function POST(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);

    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(admin, 'orders:write')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const db = initializeFirebaseAdmin();
    if (!db) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
    }

    const body = await request.json();
    const { paymentId, paymentKey, tenantId, refundAmount, refundReason, cancelSubscription } = body;

    if (!paymentId || !refundAmount) {
      return NextResponse.json(
        { error: '필수 정보가 누락되었습니다.' },
        { status: 400 }
      );
    }

    // 결제 정보 조회
    const paymentDoc = await db.collection('payments').doc(paymentId).get();
    if (!paymentDoc.exists) {
      return NextResponse.json(
        { error: '결제 정보를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    const paymentData = paymentDoc.data();
    const originalAmount = paymentData?.amount || 0;
    const alreadyRefunded = paymentData?.refundedAmount || 0;
    const remainingAmount = originalAmount - alreadyRefunded;

    // 환불 가능 금액 확인
    if (refundAmount > remainingAmount) {
      return NextResponse.json(
        { error: `환불 가능 금액을 초과했습니다. (최대: ${remainingAmount.toLocaleString()}원)` },
        { status: 400 }
      );
    }

    // 토스페이먼츠 API로 환불 요청 (paymentKey가 있는 경우)
    if (paymentKey && TOSS_SECRET_KEY) {
      try {
        const response = await fetch(
          `https://api.tosspayments.com/v1/payments/${paymentKey}/cancel`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Basic ${Buffer.from(TOSS_SECRET_KEY + ':').toString('base64')}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              cancelReason: refundReason || '관리자 요청 환불',
              cancelAmount: refundAmount,
            }),
          }
        );

        if (!response.ok) {
          const errorData = await response.json();
          console.error('Toss refund error:', errorData);
          return NextResponse.json(
            { error: errorData.message || '토스 환불 처리에 실패했습니다.' },
            { status: 400 }
          );
        }
      } catch (err) {
        console.error('Toss API error:', err);
        return NextResponse.json(
          { error: '결제 취소 API 호출에 실패했습니다.' },
          { status: 500 }
        );
      }
    }

    const now = new Date();
    const newRefundedAmount = alreadyRefunded + refundAmount;
    const isFullyRefunded = newRefundedAmount >= originalAmount;

    // 결제 정보 업데이트
    await db.collection('payments').doc(paymentId).update({
      refundedAmount: newRefundedAmount,
      status: isFullyRefunded ? 'refunded' : (paymentData?.status || 'done'),
      lastRefundAt: now,
      lastRefundAmount: refundAmount,
      lastRefundReason: refundReason || '관리자 요청 환불',
      updatedAt: now,
      updatedBy: admin?.adminId || 'unknown',
    });

    // 환불 내역 기록 (별도 문서)
    await db.collection('payments').add({
      type: 'refund',
      originalPaymentId: paymentId,
      tenantId: tenantId || paymentData?.tenantId,
      email: paymentData?.email,
      plan: paymentData?.plan,
      amount: -refundAmount, // 음수로 기록
      status: 'done',
      refundReason: refundReason || '관리자 요청 환불',
      createdAt: now,
      paidAt: now,
      createdBy: admin?.adminId || 'unknown',
    });

    // 구독 취소 옵션이 선택된 경우에만 구독 상태 업데이트
    let subscriptionCanceled = false;
    if (cancelSubscription === true) {
      const subscriptionTenantId = tenantId || paymentData?.tenantId;
      const subscriptionEmail = paymentData?.email;

      // tenantId로 먼저 구독 찾기
      if (subscriptionTenantId) {
        const subscriptionDoc = await db.collection('subscriptions').doc(subscriptionTenantId).get();
        if (subscriptionDoc.exists) {
          await db.collection('subscriptions').doc(subscriptionTenantId).update({
            status: 'expired',
            canceledAt: now,
            cancelReason: refundReason || '관리자 요청 환불',
            updatedAt: now,
            updatedBy: admin?.adminId || 'unknown',
          });
          subscriptionCanceled = true;

          // tenants 컬렉션도 업데이트
          try {
            await db.collection('tenants').doc(subscriptionTenantId).update({
              subscriptionStatus: 'expired',
              subscriptionPlan: null,
              updatedAt: now,
            });
          } catch {
            // tenants 업데이트 실패해도 무시
          }
        }
      }

      // tenantId로 못 찾았으면 email로 시도
      if (!subscriptionCanceled && subscriptionEmail) {
        const subscriptionDoc = await db.collection('subscriptions').doc(subscriptionEmail).get();
        if (subscriptionDoc.exists) {
          await db.collection('subscriptions').doc(subscriptionEmail).update({
            status: 'expired',
            canceledAt: now,
            cancelReason: refundReason || '관리자 요청 환불',
            updatedAt: now,
            updatedBy: admin?.adminId || 'unknown',
          });
          subscriptionCanceled = true;
        }
      }
    }

    return NextResponse.json({
      success: true,
      refundedAmount: refundAmount,
      remainingAmount: remainingAmount - refundAmount,
      subscriptionCanceled,
    });
  } catch (error) {
    console.error('Refund error:', error);
    const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
    return NextResponse.json(
      { error: `환불 처리 중 오류가 발생했습니다: ${errorMessage}` },
      { status: 500 }
    );
  }
}
