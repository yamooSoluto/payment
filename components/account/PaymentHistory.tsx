'use client';

import { useState, useMemo } from 'react';
import { formatPrice, formatDate } from '@/lib/utils';
import { getPlanName } from '@/lib/toss';
import { NavArrowDown, NavArrowUp, Journal, CheckCircle, XmarkCircle, Page, MinusCircle, Filter, Download } from 'iconoir-react';

interface Payment {
  id: string;
  orderId: string;
  amount: number;
  plan: string;
  status: 'done' | 'canceled' | 'failed';
  type?: 'upgrade' | 'downgrade' | 'recurring' | 'refund';
  previousPlan?: string;
  refundReason?: string;
  paidAt?: Date | string;
  createdAt: Date | string;
  cardCompany?: string;
  cardNumber?: string;
  receiptUrl?: string;
}

interface PaymentHistoryProps {
  payments: Payment[];
}

type FilterPeriod = 'all' | 'month' | '3months' | 'custom';
type FilterStatus = 'all' | 'done' | 'refund' | 'canceled';

export default function PaymentHistory({ payments }: PaymentHistoryProps) {
  const [showAll, setShowAll] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [periodFilter, setPeriodFilter] = useState<FilterPeriod>('all');
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  // 필터링된 결제 내역
  const filteredPayments = useMemo(() => {
    let result = [...payments];

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
      if (statusFilter === 'refund') {
        result = result.filter((p) => p.type === 'refund');
      } else {
        result = result.filter((p) => p.status === statusFilter && p.type !== 'refund');
      }
    }

    return result;
  }, [payments, periodFilter, statusFilter, customStartDate, customEndDate]);

  const hasActiveFilters = periodFilter !== 'all' || statusFilter !== 'all' || customStartDate || customEndDate;

  const displayPayments = showAll ? filteredPayments : filteredPayments.slice(0, 5);

  // CSV 다운로드 함수
  const downloadCSV = () => {
    // CSV 헤더
    const headers = ['결제일', '플랜', '금액', '상태', '결제유형', '카드정보'];

    // CSV 데이터
    const rows = filteredPayments.map((p) => {
      const date = p.paidAt || p.createdAt;
      const formattedDate = new Date(date).toLocaleDateString('ko-KR');
      const planName = getPlanName(p.plan);
      const amount = p.type === 'refund' ? `-${Math.abs(p.amount)}` : String(p.amount);
      const status = p.type === 'refund' ? '환불' : p.status === 'done' ? '완료' : p.status === 'canceled' ? '취소' : '실패';
      const type = p.type === 'upgrade' ? '업그레이드' : p.type === 'downgrade' ? '다운그레이드' : p.type === 'refund' ? '환불' : '정기결제';
      const card = p.cardCompany ? `${p.cardCompany}카드 ${p.cardNumber || ''}` : '';

      return [formattedDate, planName, amount, status, type, card];
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

    // 다운로드
    const link = document.createElement('a');
    link.href = url;
    link.download = `결제내역_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const getStatusIcon = (status: string, type?: string) => {
    if (type === 'refund') {
      return <MinusCircle width={16} height={16} strokeWidth={1.5} className="text-red-500" />;
    }
    switch (status) {
      case 'done':
        return <CheckCircle width={16} height={16} strokeWidth={1.5} className="text-green-500" />;
      case 'canceled':
        return <XmarkCircle width={16} height={16} strokeWidth={1.5} className="text-gray-400" />;
      case 'failed':
        return <XmarkCircle width={16} height={16} strokeWidth={1.5} className="text-red-500" />;
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
                { value: 'refund' as const, label: '환불' },
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
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {getStatusIcon(payment.status, payment.type)}
                <div>
                  <p className="font-medium text-gray-900">
                    {payment.type === 'refund' && payment.previousPlan
                      ? `${getPlanName(payment.previousPlan)} → ${getPlanName(payment.plan)} 다운그레이드`
                      : payment.type === 'upgrade' && payment.previousPlan
                        ? `${getPlanName(payment.previousPlan)} → ${getPlanName(payment.plan)} 업그레이드`
                        : `${getPlanName(payment.plan)} 플랜`}
                  </p>
                  <p className="text-sm text-gray-500">
                    {payment.paidAt ? formatDate(payment.paidAt) : formatDate(payment.createdAt)}
                    {payment.cardCompany && ` · ${payment.cardCompany}카드`}
                  </p>
                  {payment.type === 'refund' && payment.refundReason && (
                    <p className="text-xs text-red-500 mt-1">
                      환불 사유: {payment.refundReason}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`font-semibold ${
                  payment.type === 'refund' ? 'text-red-600' :
                  payment.status === 'canceled' ? 'text-gray-400 line-through' :
                  'text-gray-900'
                }`}>
                  {payment.type === 'refund' ? `-${formatPrice(Math.abs(payment.amount))}원` : `${formatPrice(payment.amount)}원`}
                </span>
                <span className={`text-xs ${
                  payment.type === 'refund' ? 'text-red-600' :
                  payment.status === 'done' ? 'text-green-600' :
                  payment.status === 'canceled' ? 'text-gray-400' :
                  'text-red-600'
                }`}>
                  {payment.type === 'refund' ? '환불' : getStatusText(payment.status)}
                </span>
                {payment.status === 'done' && payment.receiptUrl && (
                  <a
                    href={payment.receiptUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-400 hover:text-yamoo-primary transition-colors"
                    title="영수증 보기"
                  >
                    <Page width={14} height={14} strokeWidth={1.5} />
                  </a>
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
