'use client';

import { Xmark } from 'iconoir-react';
import {
  Payment,
  PAYMENT_TYPE_LABELS,
  PAYMENT_CATEGORY_LABELS,
  TRANSACTION_TYPE_LABELS,
  INITIATED_BY_LABELS,
  getPlanName,
} from './types';

interface PaymentDetailModalProps {
  payment: Payment;
  onClose: () => void;
}

export default function PaymentDetailModal({ payment, onClose }: PaymentDetailModalProps) {
  const isRefund = payment.transactionType === 'refund' || (payment.amount ?? 0) < 0;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">결제 상세</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <Xmark className="w-5 h-5" />
          </button>
        </div>
        <div className="divide-y divide-gray-100">
          <div className="flex py-3">
            <span className="text-gray-500 w-24 shrink-0">일시</span>
            <span className="text-gray-900">
              {payment.paidAt
                ? new Date(payment.paidAt).toLocaleString('ko-KR')
                : payment.createdAt
                  ? new Date(payment.createdAt).toLocaleString('ko-KR')
                  : '-'}
            </span>
          </div>
          <div className="flex py-3">
            <span className="text-gray-500 w-24 shrink-0">주문 ID</span>
            <span className="text-gray-900 font-mono text-sm break-all">{payment.orderId || payment.id}</span>
          </div>
          <div className="flex py-3">
            <span className="text-gray-500 w-24 shrink-0">플랜</span>
            <span className="text-gray-900">{getPlanName(payment.plan)}</span>
          </div>
          <div className="flex py-3">
            <span className="text-gray-500 w-24 shrink-0">결제유형</span>
            <span className="text-gray-900">
              {payment.type ? PAYMENT_TYPE_LABELS[payment.type] || payment.type : '-'}
            </span>
          </div>
          <div className="flex py-3">
            <span className="text-gray-500 w-24 shrink-0">분류</span>
            <span className="text-gray-900">
              {payment.category ? PAYMENT_CATEGORY_LABELS[payment.category] || payment.category : '-'}
            </span>
          </div>
          <div className="flex py-3">
            <span className="text-gray-500 w-24 shrink-0">거래</span>
            <span className={`font-medium ${isRefund ? 'text-red-500' : 'text-gray-900'}`}>
              {payment.transactionType ? TRANSACTION_TYPE_LABELS[payment.transactionType] || payment.transactionType : (isRefund ? '환불' : '결제')}
            </span>
          </div>
          <div className="flex py-3">
            <span className="text-gray-500 w-24 shrink-0">금액</span>
            <span className={`font-medium ${(payment.amount ?? 0) < 0 ? 'text-red-500' : 'text-gray-900'}`}>
              {(payment.amount ?? 0) < 0 ? '-' : ''}{Math.abs(payment.amount ?? 0).toLocaleString()}원
            </span>
          </div>
          {(payment.refundedAmount ?? 0) > 0 && (
            <>
              <div className="flex py-3">
                <span className="text-gray-500 w-24 shrink-0">환불된 금액</span>
                <span className="text-orange-600 font-medium">-{payment.refundedAmount?.toLocaleString()}원</span>
              </div>
              <div className="flex py-3">
                <span className="text-gray-500 w-24 shrink-0">잔여 금액</span>
                <span className="text-blue-600 font-medium">{payment.remainingAmount?.toLocaleString()}원</span>
              </div>
            </>
          )}
          {(() => {
            const cardInfo = payment.cardInfo as { company?: string; number?: string } | undefined;
            const cardCompany = String(cardInfo?.company || (payment.cardCompany as string) || '');
            const cardNumber = String(cardInfo?.number || (payment.cardNumber as string) || '');
            if (!cardNumber) return null;
            return (
              <div className="flex py-3">
                <span className="text-gray-500 w-24 shrink-0">카드</span>
                <span className="text-gray-900">{cardCompany} {cardNumber}</span>
              </div>
            );
          })()}
          {payment.originalPaymentId && (
            <div className="flex py-3">
              <span className="text-gray-500 w-24 shrink-0">원 결제</span>
              <span className="text-gray-900 font-mono text-sm">
                {String(payment.originalPaymentId).split('_').slice(0, 2).join('_')}
              </span>
            </div>
          )}
          <div className="flex py-3">
            <span className="text-gray-500 w-24 shrink-0">처리자</span>
            <span className="text-gray-900">
              {payment.initiatedBy ? (
                <>
                  {INITIATED_BY_LABELS[payment.initiatedBy] || payment.initiatedBy}
                  {payment.initiatedBy === 'admin' && payment.adminName && (
                    <span className="text-gray-500 ml-1">({payment.adminName})</span>
                  )}
                </>
              ) : '-'}
            </span>
          </div>
          {(payment.refundReason || payment.cancelReason) && (
            <div className="flex py-3">
              <span className="text-gray-500 w-24 shrink-0">사유</span>
              <span className="text-gray-900">{String(payment.refundReason || payment.cancelReason)}</span>
            </div>
          )}
          {payment.receiptUrl && (
            <div className="pt-4">
              <a
                href={payment.receiptUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
              >
                영수증
              </a>
            </div>
          )}
        </div>
        <div className="mt-6">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
