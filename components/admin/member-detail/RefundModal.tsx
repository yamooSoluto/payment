'use client';

import { useState } from 'react';
import { Xmark } from 'iconoir-react';
import { Payment } from './types';

interface RefundModalProps {
  payment: Payment;
  availableAmount: number;
  refundedAmount?: number;
  onClose: () => void;
  onSuccess: () => void;
}

const REFUND_REASONS = ['불만', '실수', '변심', '버그', '관리', '기타'] as const;
type RefundReason = '' | (typeof REFUND_REASONS)[number];

export default function RefundModal({ payment, availableAmount, refundedAmount, onClose, onSuccess }: RefundModalProps) {
  const [form, setForm] = useState({
    reason: '' as RefundReason,
    customReason: '',
    amount: availableAmount,
    cancelSubscription: false,
  });
  const [processing, setProcessing] = useState(false);

  const handleRefund = async () => {
    if (form.amount <= 0) { alert('환불 금액을 입력해주세요.'); return; }
    if (form.amount > availableAmount) { alert(`환불 가능 금액(${availableAmount.toLocaleString()}원)을 초과했습니다.`); return; }
    if (!form.reason) { alert('환불 사유를 선택해주세요.'); return; }
    if (!payment.paymentKey) { alert('결제 키가 없어 환불할 수 없습니다.'); return; }

    setProcessing(true);
    try {
      const reasonText = form.reason === '기타' && form.customReason
        ? `기타: ${form.customReason}`
        : form.reason;

      const response = await fetch('/api/admin/payments/refund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentId: payment.id,
          paymentKey: payment.paymentKey,
          refundAmount: form.amount,
          refundReason: reasonText,
          cancelSubscription: form.cancelSubscription,
          tenantId: payment.tenantId,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '환불 처리 중 오류가 발생했습니다.');
      alert('환불이 완료되었습니다.');
      onSuccess();
    } catch (error) {
      console.error('Refund error:', error);
      alert(error instanceof Error ? error.message : '환불 처리 중 오류가 발생했습니다.');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">환불 처리</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><Xmark className="w-5 h-5" /></button>
        </div>

        {/* 원본 결제 정보 */}
        <div className="bg-gray-50 rounded-lg p-4 mb-4">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-gray-500">원본 결제</span>
            <span className="font-medium font-mono text-xs">{payment.orderId}</span>
          </div>
          <div className="flex justify-between text-sm mb-2">
            <span className="text-gray-500">결제 금액</span>
            <span className="font-medium">{Math.abs(payment.amount || 0).toLocaleString()}원</span>
          </div>
          {(refundedAmount ?? 0) > 0 && (
            <div className="flex justify-between text-sm mb-2 text-orange-600">
              <span>이미 환불된 금액</span>
              <span className="font-medium">-{refundedAmount?.toLocaleString()}원</span>
            </div>
          )}
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">환불 가능 금액</span>
            <span className="font-medium text-blue-600">{availableAmount.toLocaleString()}원</span>
          </div>
        </div>

        {/* 환불 사유 */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            환불사유 <span className="text-red-500">*</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {REFUND_REASONS.map((reason) => (
              <button
                key={reason}
                type="button"
                onClick={() => setForm({ ...form, reason })}
                className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                  form.reason === reason
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 hover:border-gray-300 text-gray-600'
                }`}
              >
                {reason}
              </button>
            ))}
          </div>
          {form.reason === '기타' && (
            <input
              type="text"
              value={form.customReason}
              onChange={(e) => setForm({ ...form, customReason: e.target.value })}
              placeholder="기타 사유를 입력하세요"
              className="w-full mt-2 px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
            />
          )}
        </div>

        {/* 환불 금액 */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            금액 <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              type="number"
              value={form.amount || ''}
              onChange={(e) => {
                const value = parseInt(e.target.value) || 0;
                setForm({ ...form, amount: Math.min(value, availableAmount) });
              }}
              max={availableAmount}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 pr-10"
              placeholder="환불 금액 입력"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">원</span>
          </div>
          <p className="text-xs text-gray-500 mt-1">최대 환불 가능: {availableAmount.toLocaleString()}원</p>
        </div>

        {/* 구독 처리 옵션 */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">구독 처리</label>
          <div className="flex gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="subscriptionOption" checked={!form.cancelSubscription} onChange={() => setForm({ ...form, cancelSubscription: false })} className="text-blue-600 focus:ring-blue-500" />
              <span className="text-sm">구독 유지</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="subscriptionOption" checked={form.cancelSubscription} onChange={() => setForm({ ...form, cancelSubscription: true })} className="text-blue-600 focus:ring-blue-500" />
              <span className="text-sm text-red-600">구독 즉시 해지</span>
            </label>
          </div>
        </div>

        {/* 버튼 */}
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors" disabled={processing}>취소</button>
          <button
            onClick={handleRefund}
            disabled={processing || !form.reason || form.amount <= 0}
            className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {processing ? '처리 중...' : '환불 처리'}
          </button>
        </div>
      </div>
    </div>
  );
}
