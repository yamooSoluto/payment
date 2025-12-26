import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { getPlanName } from '@/lib/toss';

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

function formatDate(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
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

    // PDF 생성
    const doc = new jsPDF();

    // 한글 폰트 설정을 위해 기본 설정 사용 (실제 한글 폰트는 별도 임베드 필요)
    // 임시로 영문과 숫자 위주로 표시

    // 헤더
    doc.setFontSize(24);
    doc.setTextColor(0, 0, 0);
    doc.text('INVOICE', 105, 30, { align: 'center' });

    // 회사 정보
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text('YAMOO', 20, 50);
    doc.text('Invoice No: ' + paymentId.substring(0, 20), 20, 56);
    doc.text('Date: ' + formatDate(payment.paidAt || payment.createdAt), 20, 62);

    // 고객 정보
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.text('Bill To:', 140, 50);
    doc.setTextColor(60, 60, 60);
    doc.text(payment.email || 'N/A', 140, 56);
    doc.text('Tenant: ' + (payment.tenantId || 'N/A'), 140, 62);

    // 구분선
    doc.setDrawColor(200, 200, 200);
    doc.line(20, 75, 190, 75);

    // 결제 상세 테이블
    const planName = getPlanName(payment.plan);
    const paymentType = payment.type === 'upgrade'
      ? 'Upgrade'
      : payment.type === 'downgrade'
        ? 'Downgrade'
        : payment.type === 'refund'
          ? 'Refund'
          : 'Subscription';

    doc.autoTable({
      startY: 85,
      head: [['Description', 'Type', 'Amount']],
      body: [
        [
          `YAMOO ${planName} Plan`,
          paymentType,
          (payment.type === 'refund' ? '-' : '') + formatPrice(Math.abs(payment.amount)) + ' KRW'
        ],
      ],
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

    // 합계
    const finalY = 120;
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text('Total:', 140, finalY);
    doc.setFontSize(14);
    doc.text(
      (payment.type === 'refund' ? '-' : '') + formatPrice(Math.abs(payment.amount)) + ' KRW',
      190,
      finalY,
      { align: 'right' }
    );

    // 결제 정보
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text('Payment Information', 20, finalY + 20);
    doc.setTextColor(60, 60, 60);
    doc.text('Status: ' + (payment.status === 'done' ? 'Completed' : payment.status), 20, finalY + 28);

    if (payment.cardCompany) {
      doc.text(`Card: ${payment.cardCompany} ${payment.cardNumber || ''}`, 20, finalY + 36);
    }

    if (payment.orderId) {
      doc.text('Order ID: ' + payment.orderId, 20, finalY + 44);
    }

    // 푸터
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text('This is an automatically generated invoice.', 105, 270, { align: 'center' });
    doc.text('For inquiries, please contact support@yamoo.kr', 105, 276, { align: 'center' });

    // PDF 버퍼 생성
    const pdfBuffer = doc.output('arraybuffer');

    // 응답 반환
    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="invoice_${paymentId.substring(0, 15)}.pdf"`,
      },
    });

  } catch (error) {
    console.error('Invoice generation failed:', error);
    return NextResponse.json(
      { error: 'Failed to generate invoice' },
      { status: 500 }
    );
  }
}
