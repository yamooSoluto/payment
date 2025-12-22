'use client';

import { useState } from 'react';
import { formatPrice, formatDate } from '@/lib/utils';
import { getPlanName } from '@/lib/toss';
import { ChevronDown, ChevronUp, Receipt, CheckCircle, XCircle } from 'lucide-react';

interface Payment {
  id: string;
  orderId: string;
  amount: number;
  plan: string;
  status: 'done' | 'canceled' | 'failed';
  paidAt?: Date | string;
  createdAt: Date | string;
  cardCompany?: string;
  cardNumber?: string;
}

interface PaymentHistoryProps {
  payments: Payment[];
}

export default function PaymentHistory({ payments }: PaymentHistoryProps) {
  const [showAll, setShowAll] = useState(false);

  const displayPayments = showAll ? payments : payments.slice(0, 5);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'done':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'canceled':
        return <XCircle className="w-4 h-4 text-gray-400" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return null;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'done':
        return '완료';
      case 'canceled':
        return '취소됨';
      case 'failed':
        return '실패';
      default:
        return status;
    }
  };

  if (payments.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
        <h2 className="text-xl font-bold text-gray-900 mb-4">결제 내역</h2>
        <div className="text-center py-8 text-gray-500">
          <Receipt className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p>결제 내역이 없습니다.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
      <h2 className="text-xl font-bold text-gray-900 mb-4">결제 내역</h2>

      <div className="divide-y">
        {displayPayments.map((payment) => (
          <div key={payment.id} className="py-4 first:pt-0 last:pb-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {getStatusIcon(payment.status)}
                <div>
                  <p className="font-medium text-gray-900">
                    {getPlanName(payment.plan)} 플랜
                  </p>
                  <p className="text-sm text-gray-500">
                    {payment.paidAt ? formatDate(payment.paidAt) : formatDate(payment.createdAt)}
                    {payment.cardCompany && ` · ${payment.cardCompany}카드`}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className={`font-semibold ${payment.status === 'canceled' ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                  {formatPrice(payment.amount)}원
                </p>
                <p className={`text-xs ${
                  payment.status === 'done' ? 'text-green-600' :
                  payment.status === 'canceled' ? 'text-gray-400' :
                  'text-red-600'
                }`}>
                  {getStatusText(payment.status)}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {payments.length > 5 && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="mt-4 w-full py-2 text-sm text-yamoo-primary font-medium hover:bg-gray-50 rounded-lg transition-colors flex items-center justify-center gap-1"
        >
          {showAll ? (
            <>
              접기 <ChevronUp className="w-4 h-4" />
            </>
          ) : (
            <>
              더 보기 ({payments.length - 5}건) <ChevronDown className="w-4 h-4" />
            </>
          )}
        </button>
      )}
    </div>
  );
}
