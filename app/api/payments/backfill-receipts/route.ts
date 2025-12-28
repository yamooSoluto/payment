import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { getPayment } from '@/lib/toss';

// 기존 결제 내역에 영수증 URL 및 환불 금액 동기화
// 관리자만 호출 가능
export async function POST(request: NextRequest) {
  // 간단한 인증 (CRON_SECRET 재활용)
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = adminDb || initializeFirebaseAdmin();
  if (!db) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
  }

  try {
    // 완료된 결제 내역 조회 (환불 레코드 제외)
    const paymentsSnapshot = await db
      .collection('payments')
      .where('status', '==', 'done')
      .get();

    interface UpdateResult {
      paymentId: string;
      status: 'updated' | 'skipped' | 'error';
      receiptUrl?: string;
      refundedAmount?: number;
      error?: string;
    }

    const results: UpdateResult[] = [];
    let updatedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const doc of paymentsSnapshot.docs) {
      const payment = doc.data();

      // 환불 레코드는 스킵
      if (payment.type === 'refund') {
        skippedCount++;
        continue;
      }

      // paymentKey가 없으면 스킵
      if (!payment.paymentKey) {
        results.push({
          paymentId: doc.id,
          status: 'error',
          error: 'No paymentKey',
        });
        errorCount++;
        continue;
      }

      try {
        // Toss API로 결제 정보 조회
        const tossPayment = await getPayment(payment.paymentKey);

        // 업데이트할 필드
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const updateFields: Record<string, any> = {};
        let needsUpdate = false;

        // 영수증 URL 업데이트
        if (!payment.receiptUrl && tossPayment.receipt?.url) {
          updateFields.receiptUrl = tossPayment.receipt.url;
          needsUpdate = true;
        }

        // 취소 금액 계산 (cancels 배열에서)
        if (tossPayment.cancels && Array.isArray(tossPayment.cancels) && tossPayment.cancels.length > 0) {
          const totalCancelAmount = tossPayment.cancels.reduce(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (sum: number, cancel: any) => sum + (cancel.cancelAmount || 0),
            0
          );

          // 기존 refundedAmount와 다르면 업데이트
          if (payment.refundedAmount !== totalCancelAmount && totalCancelAmount > 0) {
            updateFields.refundedAmount = totalCancelAmount;
            // 가장 최근 취소 정보
            const lastCancel = tossPayment.cancels[tossPayment.cancels.length - 1];
            if (lastCancel.canceledAt) {
              updateFields.lastRefundAt = new Date(lastCancel.canceledAt);
            }
            if (lastCancel.cancelReason) {
              updateFields.lastRefundReason = lastCancel.cancelReason;
            }
            needsUpdate = true;
          }
        }

        if (needsUpdate) {
          updateFields.updatedAt = new Date();
          await db.collection('payments').doc(doc.id).update(updateFields);

          results.push({
            paymentId: doc.id,
            status: 'updated',
            receiptUrl: updateFields.receiptUrl,
            refundedAmount: updateFields.refundedAmount,
          });
          updatedCount++;
        } else {
          results.push({
            paymentId: doc.id,
            status: 'skipped',
          });
          skippedCount++;
        }
      } catch (error) {
        console.error(`Failed to get payment info for ${doc.id}:`, error);
        results.push({
          paymentId: doc.id,
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        errorCount++;
      }

      // Rate limiting - Toss API 호출 간격
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    return NextResponse.json({
      success: true,
      total: paymentsSnapshot.docs.length,
      updated: updatedCount,
      skipped: skippedCount,
      errors: errorCount,
      results,
    });
  } catch (error) {
    console.error('Backfill receipts failed:', error);
    return NextResponse.json(
      { error: 'Backfill failed' },
      { status: 500 }
    );
  }
}
