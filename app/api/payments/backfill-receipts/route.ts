import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { getPayment } from '@/lib/toss';

// 기존 결제 내역에 영수증 URL 추가
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
    // receiptUrl이 없는 완료된 결제 내역 조회
    const paymentsSnapshot = await db
      .collection('payments')
      .where('status', '==', 'done')
      .get();

    interface UpdateResult {
      paymentId: string;
      status: 'updated' | 'skipped' | 'error';
      receiptUrl?: string;
      error?: string;
    }

    const results: UpdateResult[] = [];
    let updatedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const doc of paymentsSnapshot.docs) {
      const payment = doc.data();

      // 이미 receiptUrl이 있으면 스킵
      if (payment.receiptUrl) {
        results.push({
          paymentId: doc.id,
          status: 'skipped',
        });
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

        if (tossPayment.receipt?.url) {
          // receiptUrl 업데이트
          await db.collection('payments').doc(doc.id).update({
            receiptUrl: tossPayment.receipt.url,
          });

          results.push({
            paymentId: doc.id,
            status: 'updated',
            receiptUrl: tossPayment.receipt.url,
          });
          updatedCount++;
        } else {
          results.push({
            paymentId: doc.id,
            status: 'skipped',
            error: 'No receipt URL in Toss response',
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
