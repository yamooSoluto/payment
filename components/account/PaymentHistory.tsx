'use client';

import { useState, useMemo } from 'react';
import { formatPrice, formatDate } from '@/lib/utils';
import { getPlanName } from '@/lib/toss';
import { NavArrowDown, NavArrowUp, Journal, CheckCircle, XmarkCircle, Page, Filter, Download } from 'iconoir-react';

interface Payment {
  id: string;
  orderId: string;
  amount: number;
  plan: string;
  status: 'done' | 'completed' | 'canceled' | 'failed' | 'refunded';
  type?: 'upgrade' | 'downgrade' | 'recurring' | 'refund' | 'subscription' | 'cancel_refund' | 'downgrade_refund' | 'plan_change' | 'plan_change_refund';
  newPlan?: string; // plan_change_refund에서 새 플랜 정보
  previousPlan?: string;
  refundReason?: string;
  cancelReason?: string;
  paidAt?: Date | string;
  createdAt: Date | string;
  cardCompany?: string;
  cardNumber?: string;
  receiptUrl?: string;
  // 환불 관련 필드
  originalPaymentId?: string;
  refundedAmount?: number;
  lastRefundAt?: Date | string;
  // 업그레이드 상세 정보
  creditAmount?: number; // 기존 플랜 미사용분 크레딧
  proratedNewAmount?: number; // 새 플랜 일할 금액
}

// 환불 정보가 병합된 결제 내역
interface MergedPayment extends Payment {
  refunds: {
    amount: number;
    date: Date | string;
    reason?: string;
  }[];
  totalRefundedAmount: number;
  hasRefund: boolean;
}

interface PaymentHistoryProps {
  payments: Payment[];
  tenantName?: string;
}

type FilterPeriod = 'all' | 'month' | '3months' | 'custom';
type FilterStatus = 'all' | 'done' | 'refunded' | 'canceled';

export default function PaymentHistory({ payments, tenantName }: PaymentHistoryProps) {
  const [showAll, setShowAll] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [periodFilter, setPeriodFilter] = useState<FilterPeriod>('all');
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  // 환불 레코드를 원결제에 병합
  const mergedPayments = useMemo(() => {
    // 환불 타입들 (cancel_refund, downgrade_refund, plan_change_refund, refund 등)
    const refundTypes = ['refund', 'cancel_refund', 'downgrade_refund', 'plan_change_refund'];

    // 환불 레코드 판별 함수: type이 환불 타입이거나, 금액이 음수인 경우 (즉시 해지 환불 포함)
    const isRefundRecord = (p: Payment) =>
      refundTypes.includes(p.type || '') ||
      (p.status === 'refunded' && p.amount < 0) ||
      (p.amount < 0 && p.originalPaymentId); // 음수 금액 + originalPaymentId가 있으면 환불

    // 환불 레코드와 원결제 분리
    const refundRecords = payments.filter(p => isRefundRecord(p));
    const originalPayments = payments.filter(p => !isRefundRecord(p));

    // 원결제에 환불 정보 병합
    const merged: MergedPayment[] = originalPayments.map(payment => {
      // 이 결제에 연관된 환불들 찾기
      const relatedRefunds = refundRecords.filter(r => r.originalPaymentId === payment.id);

      // 환불 정보 구성
      const refunds = relatedRefunds.map(r => ({
        amount: Math.abs(r.amount),
        date: r.paidAt || r.createdAt,
        reason: r.refundReason || r.cancelReason,
      }));

      // 결제 문서 자체에 refundedAmount가 있는 경우 (관리자 환불)
      if (payment.refundedAmount && payment.refundedAmount > 0 && refunds.length === 0) {
        refunds.push({
          amount: payment.refundedAmount,
          date: payment.lastRefundAt || payment.createdAt,
          reason: undefined,
        });
      }

      const totalRefundedAmount = refunds.reduce((sum, r) => sum + r.amount, 0);

      return {
        ...payment,
        refunds,
        totalRefundedAmount,
        hasRefund: totalRefundedAmount > 0,
      };
    });

    return merged;
  }, [payments]);

  // 필터링된 결제 내역
  const filteredPayments = useMemo(() => {
    let result = [...mergedPayments];

    // 기간 필터
    if (periodFilter !== 'all') {
      if (periodFilter === 'custom') {
        // 직접 입력
        if (customStartDate || customEndDate) {
          result = result.filter((p) => {
            const paymentDate = new Date(p.paidAt || p.createdAt);
            if (customStartDate && paymentDate < new Date(customStartDate)) return false;
            if (customEndDate) {
              const endDate = new Date(customEndDate);
              endDate.setHours(23, 59, 59, 999);
              if (paymentDate > endDate) return false;
            }
            return true;
          });
        }
      } else {
        const now = new Date();
        const filterDate = new Date();

        if (periodFilter === 'month') {
          filterDate.setMonth(now.getMonth() - 1);
        } else if (periodFilter === '3months') {
          filterDate.setMonth(now.getMonth() - 3);
        }

        result = result.filter((p) => {
          const paymentDate = new Date(p.paidAt || p.createdAt);
          return paymentDate >= filterDate;
        });
      }
    }

    // 상태 필터
    if (statusFilter !== 'all') {
      if (statusFilter === 'refunded') {
        result = result.filter((p) => p.hasRefund);
      } else {
        result = result.filter((p) => p.status === statusFilter && !p.hasRefund);
      }
    }

    return result;
  }, [mergedPayments, periodFilter, statusFilter, customStartDate, customEndDate]);

  const hasActiveFilters = periodFilter !== 'all' || statusFilter !== 'all' || customStartDate || customEndDate;

  const displayPayments = showAll ? filteredPayments : filteredPayments.slice(0, 5);

  // CSV 다운로드 함수
  const downloadCSV = () => {
    // CSV 헤더
    const headers = ['매장명', '결제일', '플랜', '결제금액', '환불금액', '실결제금액', '상태', '결제유형', '카드정보'];

    // CSV 데이터
    const rows = filteredPayments.map((p) => {
      const date = p.paidAt || p.createdAt;
      const formattedDate = new Date(date).toLocaleDateString('ko-KR');
      const planName = getPlanName(p.plan);
      const amount = String(p.amount);
      const refundAmount = p.totalRefundedAmount > 0 ? `-${p.totalRefundedAmount}` : '';
      const netAmount = String(p.amount - p.totalRefundedAmount);
      const status = p.hasRefund
        ? (p.totalRefundedAmount >= p.amount ? '전액환불' : '부분환불')
        : (p.status === 'done' || p.status === 'completed' ? '완료' : p.status === 'canceled' ? '취소' : '실패');
      const type = (p.type === 'upgrade' || p.type === 'plan_change') ? '플랜 변경' : p.type === 'downgrade' ? '다운그레이드' : '정기결제';
      const card = p.cardCompany ? `${p.cardCompany}카드 ${p.cardNumber || ''}` : '';

      return [tenantName || '', formattedDate, planName, amount, refundAmount, netAmount, status, type, card];
    });

    // CSV 문자열 생성
    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
    ].join('\n');

    // BOM 추가 (Excel에서 한글 인코딩 문제 해결)
    const bom = '\uFEFF';
    const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    // 다운로드 (파일명에 매장명 포함)
    const link = document.createElement('a');
    link.href = url;
    const fileNamePrefix = tenantName ? `${tenantName}_결제내역` : '결제내역';
    link.download = `${fileNamePrefix}_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const getStatusIcon = (payment: MergedPayment) => {
    if (payment.hasRefund) {
      if (payment.totalRefundedAmount >= payment.amount) {
        // 전액 환불
        return <XmarkCircle width={16} height={16} strokeWidth={1.5} className="text-red-500" />;
      } else {
        // 부분 환불
        return <CheckCircle width={16} height={16} strokeWidth={1.5} className="text-orange-500" />;
      }
    }
    switch (payment.status) {
      case 'done':
      case 'completed':
        return <CheckCircle width={16} height={16} strokeWidth={1.5} className="text-green-500" />;
      case 'canceled':
        return <XmarkCircle width={16} height={16} strokeWidth={1.5} className="text-gray-400" />;
      case 'failed':
        return <XmarkCircle width={16} height={16} strokeWidth={1.5} className="text-red-500" />;
      default:
        return null;
    }
  };

  const getStatusText = (payment: MergedPayment) => {
    if (payment.hasRefund) {
      if (payment.totalRefundedAmount >= payment.amount) {
        return '전액환불';
      } else {
        return '부분환불';
      }
    }
    switch (payment.status) {
      case 'done':
      case 'completed':
        return '완료';
      case 'canceled':
        return '취소됨';
      case 'failed':
        return '실패';
      default:
        return payment.status;
    }
  };

  const getStatusStyle = (payment: MergedPayment) => {
    if (payment.hasRefund) {
      if (payment.totalRefundedAmount >= payment.amount) {
        return 'text-red-600 bg-red-50';
      } else {
        return 'text-orange-600 bg-orange-50';
      }
    }
    switch (payment.status) {
      case 'done':
      case 'completed':
        return 'text-green-600 bg-green-50';
      case 'canceled':
        return 'text-gray-400 bg-gray-50';
      default:
        return 'text-red-600 bg-red-50';
    }
  };

  if (payments.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
        <h2 className="text-xl font-bold text-gray-900 mb-4">결제 내역</h2>
        <div className="text-center py-8 text-gray-500">
          <Journal width={48} height={48} strokeWidth={1.5} className="mx-auto mb-3 text-gray-300" />
          <p>결제 내역이 없습니다.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-900">결제 내역</h2>
        <div className="flex items-center gap-2">
          {filteredPayments.length > 0 && (
            <button
              onClick={downloadCSV}
              className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              title="CSV 다운로드"
            >
              <Download width={16} height={16} strokeWidth={1.5} />
              내보내기
            </button>
          )}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg transition-colors ${
              hasActiveFilters
                ? 'bg-yamoo-primary text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <Filter width={16} height={16} strokeWidth={1.5} />
            필터
            {hasActiveFilters && (
              <span className="ml-1 px-1.5 py-0.5 bg-white/20 rounded text-xs">
                {(periodFilter !== 'all' ? 1 : 0) + (statusFilter !== 'all' ? 1 : 0)}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* 필터 패널 */}
      {showFilters && (
        <div className="mb-4 p-4 bg-gray-50 rounded-lg space-y-3">
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1.5 block">기간</label>
            <div className="flex flex-wrap gap-2">
              {[
                { value: 'all' as const, label: '전체' },
                { value: 'month' as const, label: '최근 1개월' },
                { value: '3months' as const, label: '최근 3개월' },
                { value: 'custom' as const, label: '직접 입력' },
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={() => {
                    setPeriodFilter(option.value);
                    if (option.value !== 'custom') {
                      setCustomStartDate('');
                      setCustomEndDate('');
                    }
                  }}
                  className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                    periodFilter === option.value
                      ? 'bg-yamoo-primary text-white'
                      : 'bg-white text-gray-600 border border-gray-200 hover:border-yamoo-primary'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {periodFilter === 'custom' && (
              <div className="flex items-center gap-2 mt-2">
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-yamoo-primary"
                />
                <span className="text-gray-400">~</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-yamoo-primary"
                />
              </div>
            )}
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1.5 block">상태</label>
            <div className="flex gap-2">
              {[
                { value: 'all' as const, label: '전체' },
                { value: 'done' as const, label: '완료' },
                { value: 'refunded' as const, label: '환불' },
                { value: 'canceled' as const, label: '취소' },
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={() => setStatusFilter(option.value)}
                  className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                    statusFilter === option.value
                      ? 'bg-yamoo-primary text-white'
                      : 'bg-white text-gray-600 border border-gray-200 hover:border-yamoo-primary'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          {hasActiveFilters && (
            <button
              onClick={() => {
                setPeriodFilter('all');
                setStatusFilter('all');
                setCustomStartDate('');
                setCustomEndDate('');
              }}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              필터 초기화
            </button>
          )}
        </div>
      )}

      {/* 필터 결과 요약 */}
      {hasActiveFilters && (
        <div className="mb-3 text-sm text-gray-500">
          총 {filteredPayments.length}건의 결제 내역
        </div>
      )}

      <div className="divide-y">
        {displayPayments.map((payment) => (
          <div key={payment.id} className="py-4 first:pt-0 last:pb-0">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 shrink-0">
                {getStatusIcon(payment)}
              </div>
              <div className="min-w-0 flex-1">
                {/* 플랜명 + 상태뱃지 + 영수증 */}
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-gray-900 text-sm sm:text-base truncate">
                    {(payment.type === 'upgrade' || payment.type === 'plan_change') && payment.previousPlan
                      ? `${getPlanName(payment.previousPlan)} → ${getPlanName(payment.plan)} 플랜 변경`
                      : `${getPlanName(payment.plan)} 플랜`}
                  </p>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={`text-xs px-1.5 py-0.5 rounded ${getStatusStyle(payment)}`}>
                      {getStatusText(payment)}
                    </span>
                    {(payment.status === 'done' || payment.status === 'completed') && (
                      payment.receiptUrl ? (
                        <a
                          href={payment.receiptUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-gray-400 hover:text-yamoo-primary transition-colors"
                          title="영수증 보기"
                        >
                          <Page width={14} height={14} strokeWidth={1.5} />
                        </a>
                      ) : (
                        <a
                          href={`/api/invoices/${payment.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-gray-400 hover:text-yamoo-primary transition-colors"
                          title={payment.hasRefund ? '영수증 (환불 포함)' : '인보이스'}
                        >
                          <Page width={14} height={14} strokeWidth={1.5} />
                        </a>
                      )
                    )}
                  </div>
                </div>
                {/* 결제일 + 금액 (같은 줄) */}
                <div className="flex items-center justify-between mt-0.5">
                  <span className="text-xs sm:text-sm text-gray-500">
                    {payment.paidAt ? formatDate(payment.paidAt) : formatDate(payment.createdAt)}
                    {payment.cardCompany && ` · ${payment.cardCompany}카드`}
                  </span>
                  <span className={`font-semibold text-sm sm:text-base ${
                    payment.hasRefund && payment.totalRefundedAmount >= payment.amount
                      ? 'text-gray-400 line-through'
                      : payment.status === 'canceled'
                        ? 'text-gray-400 line-through'
                        : 'text-gray-900'
                  }`}>
                    {formatPrice(payment.amount)}원
                  </span>
                </div>
                {/* 환불 내역 */}
                {payment.hasRefund && payment.refunds.map((refund, index) => (
                  <div key={index} className="flex items-center justify-between mt-1 pl-3 border-l-2 border-red-200">
                    <span className="text-xs sm:text-sm text-gray-500">
                      {formatDate(refund.date)} 환불
                    </span>
                    <span className="text-sm font-medium text-red-600">
                      -{formatPrice(refund.amount)}원
                    </span>
                  </div>
                ))}
                {/* 실결제 금액 (부분 환불인 경우) */}
                {payment.hasRefund && payment.totalRefundedAmount < payment.amount && (
                  <div className="flex items-center justify-between mt-1 pl-3 border-l-2 border-gray-200">
                    <span className="text-xs sm:text-sm text-gray-500">실결제</span>
                    <span className="text-sm font-semibold text-gray-900">
                      {formatPrice(payment.amount - payment.totalRefundedAmount)}원
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredPayments.length > 5 && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="mt-4 w-full py-2 text-sm text-yamoo-primary font-medium hover:bg-gray-50 rounded-lg transition-colors flex items-center justify-center gap-1"
        >
          {showAll ? (
            <>
              접기 <NavArrowUp width={16} height={16} strokeWidth={1.5} />
            </>
          ) : (
            <>
              더 보기 ({filteredPayments.length - 5}건) <NavArrowDown width={16} height={16} strokeWidth={1.5} />
            </>
          )}
        </button>
      )}
    </div>
  );
}
