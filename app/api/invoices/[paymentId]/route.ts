import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin, getAdminAuth } from '@/lib/firebase-admin';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { getPlanName } from '@/lib/toss';
import { verifyToken } from '@/lib/auth';

// 인증 함수: SSO 토큰 또는 Firebase Auth 토큰 검증
async function authenticateRequest(request: NextRequest): Promise<string | null> {
  const authHeader = request.headers.get('Authorization');

  if (!authHeader) {
    return null;
  }

  // Bearer 토큰인 경우 Firebase Auth로 처리
  if (authHeader.startsWith('Bearer ')) {
    const idToken = authHeader.substring(7);
    try {
      const auth = getAdminAuth();
      if (!auth) {
        console.error('Firebase Admin Auth not initialized');
        return null;
      }
      const decodedToken = await auth.verifyIdToken(idToken);
      return decodedToken.email || null;
    } catch (error) {
      console.error('Firebase Auth token verification failed:', error);
      return null;
    }
  }

  // 그 외는 SSO 토큰으로 처리
  const email = await verifyToken(authHeader);
  return email;
}

// jsPDF autotable 타입 확장
declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: {
      startY?: number;
      head?: string[][];
      body?: string[][];
      theme?: string;
      headStyles?: Record<string, unknown>;
      bodyStyles?: Record<string, unknown>;
      columnStyles?: Record<number, Record<string, unknown>>;
      margin?: { left?: number; right?: number };
    }) => jsPDF;
  }
}

function formatPrice(price: number): string {
  return price.toLocaleString('ko-KR');
}

function formatDate(date: Date | string | undefined | null): string {
  if (!date) {
    return new Date().toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  }
  const d = new Date(date);
  if (isNaN(d.getTime())) {
    return new Date().toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  }
  return d.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface RefundRecord {
  id: string;
  amount: number;
  refundReason?: string;
  paidAt?: Date | string;
  createdAt?: Date | string;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ paymentId: string }> }
) {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
  }

  try {
    // 인증 검증
    const authenticatedEmail = await authenticateRequest(request);
    if (!authenticatedEmail) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { paymentId } = await params;

    if (!paymentId) {
      return NextResponse.json({ error: 'Payment ID is required' }, { status: 400 });
    }

    // 결제 정보 조회
    const paymentDoc = await db.collection('payments').doc(paymentId).get();

    if (!paymentDoc.exists) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
    }

    const payment = paymentDoc.data();
    if (!payment) {
      return NextResponse.json({ error: 'Payment data not found' }, { status: 404 });
    }

    // 본인 결제만 조회 가능
    if (payment.email !== authenticatedEmail) {
      return NextResponse.json({ error: 'Unauthorized - not your payment' }, { status: 403 });
    }

    // 환불 레코드인 경우 원결제 정보 조회
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let originalPayment: any = null;
    let refunds: RefundRecord[] = [];
    let isRefundRecord = payment.type === 'refund';

    if (isRefundRecord && payment.originalPaymentId) {
      // 환불 레코드: 원결제 정보 가져오기
      const originalDoc = await db.collection('payments').doc(payment.originalPaymentId).get();
      if (originalDoc.exists) {
        originalPayment = originalDoc.data();
      }
    } else if (!isRefundRecord) {
      // 원결제 레코드: 연관된 환불 내역 조회
      const refundsSnapshot = await db
        .collection('payments')
        .where('originalPaymentId', '==', paymentId)
        .where('type', '==', 'refund')
        .get();

      refunds = refundsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as RefundRecord[];

      // 또한 refundedAmount가 있는지 확인 (관리자 환불의 경우)
      if (payment.refundedAmount && payment.refundedAmount > 0) {
        // 별도의 환불 레코드가 없는 경우에만 추가
        if (refunds.length === 0) {
          refunds.push({
            id: 'internal',
            amount: -payment.refundedAmount,
            refundReason: payment.lastRefundReason || 'Refund',
            paidAt: payment.lastRefundAt,
          });
        }
      }
    }

    // PDF 생성
    const doc = new jsPDF();

    // 환불 레코드일 경우 원결제 기준으로 표시
    // 원결제를 찾지 못한 경우 환불 레코드 자체로 표시
    const hasOriginalPayment = isRefundRecord && originalPayment;
    const displayPayment = hasOriginalPayment ? originalPayment : payment;
    const displayPaymentId = isRefundRecord && payment.originalPaymentId
      ? payment.originalPaymentId
      : paymentId;

    // 환불 레코드인데 원결제를 찾지 못한 경우 - 환불 전용 영수증 생성
    const isRefundOnlyInvoice = isRefundRecord && !originalPayment;

    // 헤더 - 환불이 포함된 경우 다른 타이틀 사용
    doc.setFontSize(24);
    doc.setTextColor(0, 0, 0);
    const hasRefund = isRefundRecord || refunds.length > 0 || (payment.refundedAmount && payment.refundedAmount > 0);
    const headerText = isRefundOnlyInvoice ? 'REFUND RECEIPT' : (hasRefund ? 'INVOICE (Amended)' : 'INVOICE');
    doc.text(headerText, 105, 30, { align: 'center' });

    // 회사 정보
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text('YAMOO', 20, 50);
    doc.text('Invoice No: ' + (displayPaymentId || paymentId).substring(0, 20), 20, 56);
    doc.text('Date: ' + formatDate(displayPayment?.paidAt || displayPayment?.createdAt || payment.paidAt || payment.createdAt), 20, 62);

    // 고객 정보
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.text('Bill To:', 140, 50);
    doc.setTextColor(60, 60, 60);
    doc.text(displayPayment?.email || payment.email || 'N/A', 140, 56);
    doc.text('Tenant: ' + (displayPayment?.tenantId || payment.tenantId || 'N/A'), 140, 62);

    // 구분선
    doc.setDrawColor(200, 200, 200);
    doc.line(20, 75, 190, 75);

    // 결제 상세 테이블 구성
    // 환불 전용 영수증인 경우 previousPlan 또는 plan 사용
    const planName = getPlanName(displayPayment?.plan || payment.previousPlan || payment.plan || 'basic');
    // 환불 전용 영수증인 경우 환불 금액의 절대값 사용
    const originalAmount = isRefundOnlyInvoice
      ? Math.abs(payment.amount || 0)
      : Math.abs(displayPayment?.amount || 0);

    // 테이블 body 구성
    const tableBody: string[][] = [];

    // 환불 내역 추가
    let totalRefundAmount = 0;

    if (isRefundOnlyInvoice) {
      // 환불 전용 영수증: 환불 내역만 표시
      const refundAmount = Math.abs(payment.amount || 0);
      totalRefundAmount = refundAmount;
      const refundReason = payment.refundReason || (payment.previousPlan && payment.plan
        ? `${getPlanName(payment.previousPlan)} → ${getPlanName(payment.plan)}`
        : 'Refund');

      tableBody.push([
        `YAMOO ${planName} Plan - Refund`,
        'Refund',
        '-' + formatPrice(refundAmount) + ' KRW'
      ]);

      if (refundReason) {
        // 환불 사유를 별도 행으로 추가하지 않고 Description에 포함
      }
    } else {
      // 원결제 내역
      const paymentType = displayPayment?.type === 'upgrade'
        ? 'Upgrade'
        : displayPayment?.type === 'downgrade'
          ? 'Downgrade'
          : 'Subscription';

      tableBody.push([
        `YAMOO ${planName} Plan`,
        paymentType,
        formatPrice(originalAmount) + ' KRW'
      ]);

      if (isRefundRecord && hasOriginalPayment) {
        // 원결제를 찾은 환불 레코드인 경우
        const refundAmount = Math.abs(payment.amount || 0);
        totalRefundAmount = refundAmount;
        const refundDate = payment.paidAt || payment.createdAt;
        tableBody.push([
          `Refund (${formatDate(refundDate)})`,
          'Refund',
          '-' + formatPrice(refundAmount) + ' KRW'
        ]);
      } else {
        // 원결제에 연관된 환불들
        refunds.forEach((refund) => {
          const refundAmount = Math.abs(refund.amount || 0);
          totalRefundAmount += refundAmount;
          const refundDate = refund.paidAt || refund.createdAt || new Date();
          tableBody.push([
            `Refund (${formatDate(refundDate)})`,
            'Refund',
            '-' + formatPrice(refundAmount) + ' KRW'
          ]);
        });
      }
    }

    doc.autoTable({
      startY: 85,
      head: [['Description', 'Type', 'Amount']],
      body: tableBody,
      theme: 'striped',
      headStyles: {
        fillColor: [79, 70, 229],
        textColor: [255, 255, 255],
        fontSize: 10,
      },
      bodyStyles: {
        fontSize: 10,
      },
      columnStyles: {
        0: { cellWidth: 90 },
        1: { cellWidth: 40 },
        2: { cellWidth: 40, halign: 'right' },
      },
      margin: { left: 20, right: 20 },
    });

    // 합계 영역
    const baseY = 85 + (tableBody.length * 10) + 25;
    let currentY = baseY;

    if (isRefundOnlyInvoice) {
      // 환불 전용 영수증: 환불 금액만 표시
      doc.setFontSize(12);
      doc.setTextColor(220, 38, 38); // 빨간색
      doc.text('Refund Total:', 140, currentY);
      doc.setFontSize(14);
      doc.text('-' + formatPrice(totalRefundAmount) + ' KRW', 190, currentY, { align: 'right' });
      currentY += 20;
    } else {
      // 환불이 있는 경우 소계, 환불, 총액 표시
      if (totalRefundAmount > 0) {
        doc.setFontSize(10);
        doc.setTextColor(100, 100, 100);

        // 원결제 금액
        doc.text('Subtotal:', 140, currentY);
        doc.text(formatPrice(originalAmount) + ' KRW', 190, currentY, { align: 'right' });
        currentY += 8;

        // 환불 금액
        doc.setTextColor(220, 38, 38); // 빨간색
        doc.text('Refund:', 140, currentY);
        doc.text('-' + formatPrice(totalRefundAmount) + ' KRW', 190, currentY, { align: 'right' });
        currentY += 12;

        // 구분선
        doc.setDrawColor(200, 200, 200);
        doc.line(140, currentY - 4, 190, currentY - 4);
      }

      // 최종 합계
      const finalAmount = originalAmount - totalRefundAmount;
      doc.setFontSize(12);
      doc.setTextColor(0, 0, 0);
      doc.text('Total:', 140, currentY);
      doc.setFontSize(14);
      doc.text(formatPrice(finalAmount) + ' KRW', 190, currentY, { align: 'right' });
      currentY += 20;
    }

    // 결제 정보
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text('Payment Information', 20, currentY);
    currentY += 8;
    doc.setTextColor(60, 60, 60);

    const statusText = isRefundOnlyInvoice
      ? 'Refunded'
      : (totalRefundAmount > 0
        ? ((originalAmount - totalRefundAmount) === 0 ? 'Fully Refunded' : 'Partially Refunded')
        : (displayPayment?.status === 'done' || displayPayment?.status === 'completed' ? 'Completed' : (displayPayment?.status || payment.status)));
    doc.text('Status: ' + statusText, 20, currentY);
    currentY += 8;

    const cardCompany = displayPayment?.cardCompany || payment.cardCompany;
    const cardNumber = displayPayment?.cardNumber || payment.cardNumber;
    if (cardCompany) {
      doc.text(`Card: ${cardCompany} ${cardNumber || ''}`, 20, currentY);
      currentY += 8;
    }

    const orderId = displayPayment?.orderId || payment.orderId;
    if (orderId) {
      doc.text('Order ID: ' + orderId, 20, currentY);
    }

    // 푸터
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text('This is an automatically generated invoice.', 105, 270, { align: 'center' });
    doc.text('For inquiries, please contact support@yamoo.kr', 105, 276, { align: 'center' });

    // PDF 버퍼 생성
    const pdfBuffer = doc.output('arraybuffer');

    // 파일명 설정
    const fileName = hasRefund
      ? `invoice_amended_${displayPaymentId.substring(0, 15)}.pdf`
      : `invoice_${displayPaymentId.substring(0, 15)}.pdf`;

    // 응답 반환
    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });

  } catch (error) {
    console.error('Invoice generation failed:', error);
    console.error('Error details:', error instanceof Error ? error.message : error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack');
    return NextResponse.json(
      { error: 'Failed to generate invoice', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
