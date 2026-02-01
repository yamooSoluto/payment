import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { getAdminFromRequest } from '@/lib/admin-auth';

// 해당 매장의 최근 결제 내역 조회 (환불 가능 여부 판단용)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
  }

  const admin = await getAdminFromRequest(request);
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { tenantId } = await params;

    // 최근 결제 내역 중 status=done인 것 조회
    const paymentsSnapshot = await db
      .collection('payments')
      .where('tenantId', '==', tenantId)
      .where('status', '==', 'done')
      .where('transactionType', '==', 'charge')
      .limit(10)
      .get();

    if (paymentsSnapshot.empty) {
      return NextResponse.json({ payment: null });
    }

    // 가장 최근 결제 찾기
    let latestDate = new Date(0);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let latestPayment: any = null;

    paymentsSnapshot.docs.forEach((doc) => {
      const payment = doc.data();
      const createdAt = payment.createdAt?.toDate?.() || new Date(payment.createdAt);
      if (createdAt > latestDate) {
        latestDate = createdAt;
        latestPayment = { id: doc.id, ...payment };
      }
    });

    if (!latestPayment) {
      return NextResponse.json({ payment: null });
    }

    return NextResponse.json({
      payment: {
        id: latestPayment.id,
        amount: latestPayment.amount,
        plan: latestPayment.plan,
        paymentKey: latestPayment.paymentKey || null,
        paidAt: latestPayment.paidAt?.toDate?.()?.toISOString() || latestPayment.paidAt || null,
        orderId: latestPayment.orderId,
      },
    });
  } catch (error) {
    console.error('Failed to fetch latest payment:', error);
    return NextResponse.json({ error: 'Failed to fetch payment info' }, { status: 500 });
  }
}
