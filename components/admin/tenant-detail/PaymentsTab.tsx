'use client';

import { useState, useEffect, useCallback } from 'react';
import { NavArrowDown, NavArrowUp } from 'iconoir-react';
import Spinner from '@/components/admin/Spinner';
import PaymentDetailModal from './PaymentDetailModal';
import {
  Payment,
  PAYMENT_TYPE_LABELS,
  TRANSACTION_TYPE_LABELS,
  INITIATED_BY_LABELS,
  getPlanName,
} from './types';

interface PaymentsTabProps {
  tenantId: string;
}

export default function PaymentsTab({ tenantId }: PaymentsTabProps) {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [detailModal, setDetailModal] = useState<Payment | null>(null);

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/tenants/${tenantId}?include=payments`);
      if (response.ok) {
        const data = await response.json();
        setPayments(data.payments || []);
      }
    } catch (error) {
      console.error('Failed to fetch payments:', error);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Spinner />
      </div>
    );
  }

  const totalCharge = payments
    .filter(p => p.transactionType !== 'refund' && (p.amount ?? 0) >= 0)
    .reduce((sum, p) => sum + (p.amount ?? 0), 0);
  const totalRefund = payments
    .filter(p => p.transactionType === 'refund' || (p.amount ?? 0) < 0)
    .reduce((sum, p) => sum + Math.abs(p.amount ?? 0), 0);
  const netTotal = totalCharge - totalRefund;

  const sortedPayments = [...payments].sort((a, b) => {
    const dateA = new Date(a.paidAt || a.createdAt).getTime();
    const dateB = new Date(b.paidAt || b.createdAt).getTime();
    return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
  });

  return (
    <div className="space-y-6">
      {/* 누적 금액 요약 */}
      {payments.length > 0 && (
        <div className="bg-gray-50 rounded-lg p-4">
          {/* Desktop: 3열 그리드 */}
          <div className="hidden sm:grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-xs text-gray-500 mb-1">총 결제</p>
              <p className="text-lg font-semibold text-gray-900">{totalCharge.toLocaleString()}원</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">총 환불</p>
              <p className="text-lg font-semibold text-red-600">-{totalRefund.toLocaleString()}원</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">순 결제</p>
              <p className={`text-lg font-semibold ${netTotal >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                {netTotal.toLocaleString()}원
              </p>
            </div>
          </div>
          {/* Mobile: 한 줄씩 왼쪽 정렬 */}
          <div className="flex flex-col gap-2 sm:hidden">
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500 w-14">총 결제</span>
              <span className="text-sm font-semibold text-gray-900">{totalCharge.toLocaleString()}원</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500 w-14">총 환불</span>
              <span className="text-sm font-semibold text-red-600">-{totalRefund.toLocaleString()}원</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500 w-14">순 결제</span>
              <span className={`text-sm font-semibold ${netTotal >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                {netTotal.toLocaleString()}원
              </span>
            </div>
          </div>
        </div>
      )}

      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-4">결제 내역 ({payments.length}건)</h3>
        {payments.length === 0 ? (
          <div className="text-center py-10 text-gray-500 bg-gray-50 rounded-lg">
            결제 내역이 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-max">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th
                    className="text-center px-3 py-3 text-sm font-medium text-gray-500 cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
                  >
                    <span className="inline-flex items-center gap-1">
                      결제일
                      {sortOrder === 'desc' ? (
                        <NavArrowDown className="w-3.5 h-3.5" />
                      ) : (
                        <NavArrowUp className="w-3.5 h-3.5" />
                      )}
                    </span>
                  </th>
                  <th className="text-center px-3 py-3 text-sm font-medium text-gray-500">플랜</th>
                  <th className="text-center px-3 py-3 text-sm font-medium text-gray-500">유형</th>
                  <th className="text-center px-3 py-3 text-sm font-medium text-gray-500">거래</th>
                  <th className="text-center px-3 py-3 text-sm font-medium text-gray-500">금액</th>
                  <th className="text-center px-3 py-3 text-sm font-medium text-gray-500">처리자</th>
                  <th className="text-center px-3 py-3 text-sm font-medium text-gray-500">주문ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sortedPayments.map((payment) => {
                  const isRefund = payment.transactionType === 'refund' || (payment.amount ?? 0) < 0;
                  const paymentDate = payment.paidAt || payment.createdAt;
                  return (
                    <tr
                      key={payment.id}
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => setDetailModal(payment)}
                    >
                      <td className="px-3 py-3 text-sm text-gray-600 text-center whitespace-nowrap">
                        {paymentDate
                          ? new Date(paymentDate).toLocaleString('ko-KR', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                          : '-'}
                      </td>
                      <td className="px-3 py-3 text-sm text-gray-600 text-center">
                        {getPlanName(payment.plan)}
                      </td>
                      <td className="px-3 py-3 text-sm text-gray-600 text-center whitespace-nowrap">
                        {payment.type ? PAYMENT_TYPE_LABELS[payment.type] || payment.type : '-'}
                      </td>
                      <td className="px-3 py-3 text-sm text-gray-600 text-center">
                        {payment.transactionType
                          ? TRANSACTION_TYPE_LABELS[payment.transactionType] || payment.transactionType
                          : (isRefund ? '환불' : '결제')}
                      </td>
                      <td className={`px-3 py-3 text-sm font-medium text-center ${isRefund ? 'text-red-600' : 'text-gray-900'}`}>
                        {isRefund ? '-' : ''}{Math.abs(payment.amount ?? 0).toLocaleString()}원
                      </td>
                      <td className="px-3 py-3 text-sm text-gray-600 text-center">
                        {payment.initiatedBy
                          ? INITIATED_BY_LABELS[payment.initiatedBy] || payment.initiatedBy
                          : '-'}
                      </td>
                      <td className="px-3 py-3 text-sm text-gray-500 text-center font-mono text-xs">
                        {payment.orderId || payment.id || '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 결제 상세 모달 */}
      {detailModal && (
        <PaymentDetailModal
          payment={detailModal}
          onClose={() => setDetailModal(null)}
        />
      )}
    </div>
  );
}
