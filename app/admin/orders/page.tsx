'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { CreditCard, Search, Filter, Download, Calendar, Xmark, NavArrowLeft, NavArrowRight, MoreHoriz, RefreshDouble } from 'iconoir-react';
import * as XLSX from 'xlsx';
import Spinner from '@/components/admin/Spinner';

interface Payment {
  id: string;
  amount: number;
  refundedAmount?: number;
  remainingAmount?: number;
  status: string;
  planId?: string;
  plan?: string;
  tenantId?: string;
  orderId?: string;
  category?: string;
  type?: string;
  transactionType?: 'charge' | 'refund';
  initiatedBy?: 'system' | 'admin' | 'user';
  adminId?: string;
  adminName?: string;
  receiptUrl?: string;
  createdAt: string;
  paidAt: string | null;
  cardInfo?: { company?: string; number?: string };
  cardCompany?: string;
  cardNumber?: string;
  originalPaymentId?: string;
  refundReason?: string;
  cancelReason?: string;
  paymentKey?: string;
  email?: string;
  memberInfo?: {
    businessName: string;
    ownerName: string;
    email: string;
  } | null;
}

const PAYMENT_CATEGORY_LABELS: Record<string, string> = {
  subscription: '신규 구독',
  recurring: '정기 결제',
  change: '플랜 변경',
  cancel: '구독 취소',
};

const PAYMENT_TYPE_LABELS: Record<string, string> = {
  first_payment: '첫 결제',
  trial_convert: 'Trial 전환',
  auto: '자동 결제',
  retry: '재결제',
  upgrade: '업그레이드',
  downgrade: '다운그레이드',
  downgrade_refund: '다운환불',
  cancel_refund: '해지환불',
  refund: '환불',
  subscription: '구독',
  renewal: '갱신',
  immediate: '즉시 취소',
  end_of_period: '기간 만료',
  admin_manual: '관리자 수동',
  admin_refund: '관리자 환불',
};

const TRANSACTION_TYPE_LABELS: Record<string, string> = {
  charge: '결제',
  refund: '환불',
};

const INITIATED_BY_LABELS: Record<string, string> = {
  system: '자동',
  admin: '관리자',
  user: '회원',
};

const getPlanName = (planId: string | undefined) => {
  switch (planId) {
    case 'trial': return 'Trial';
    case 'basic': return 'Basic';
    case 'business': return 'Business';
    case 'enterprise': return 'Enterprise';
    default: return planId || '-';
  }
};

export default function OrdersPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // 페이지네이션 및 필터 상태
  const [page, setPage] = useState(1);
  const [filterType, setFilterType] = useState<'thisMonth' | 'custom'>('thisMonth');
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({ start: '', end: '' });
  const [showDatePickerModal, setShowDatePickerModal] = useState(false);
  const [tempDateRange, setTempDateRange] = useState<{ start: string; end: string }>({ start: '', end: '' });
  const [paymentDetailModal, setPaymentDetailModal] = useState<Payment | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilter, setShowFilter] = useState(false);

  // 필터 상태
  const [typeFilter, setTypeFilter] = useState<'all' | 'charge' | 'refund'>('all');
  const [planFilter, setPlanFilter] = useState<string>('all');

  // 액션 드롭다운 및 환불 모달
  const [actionDropdown, setActionDropdown] = useState<string | null>(null);
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number } | null>(null);
  const actionRef = useRef<HTMLDivElement>(null);
  const [refundModal, setRefundModal] = useState<{
    isOpen: boolean;
    payment: Payment | null;
    availableAmount: number;
  }>({ isOpen: false, payment: null, availableAmount: 0 });
  const [refundForm, setRefundForm] = useState({
    type: 'full' as 'full' | 'partial',
    amount: 0,
    reason: '',
    cancelSubscription: false,
  });
  const [processingRefund, setProcessingRefund] = useState(false);

  const filterRef = useRef<HTMLDivElement>(null);
  const PAYMENTS_PER_PAGE = 20;

  // 데이터 로드
  const fetchPayments = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/orders?limit=500');
      if (response.ok) {
        const data = await response.json();
        setPayments(data.orders);
      }
    } catch (error) {
      console.error('Failed to fetch payments:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  // 외부 클릭 감지
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
        setShowFilter(false);
      }
      if (actionRef.current && !actionRef.current.contains(event.target as Node)) {
        setActionDropdown(null);
        setDropdownPosition(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 이번달 시작/끝 날짜 계산
  const getThisMonthRange = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { start, end };
  };

  // 필터링된 결제 내역
  const filteredPayments = payments.filter((payment) => {
    // 검색어 필터 (ID, orderId, 매장명, 회원명, 이메일)
    if (searchQuery) {
      const searchLower = searchQuery.toLowerCase();
      const paymentIdMatch = payment.id.toLowerCase().includes(searchLower);
      const orderIdMatch = (payment.orderId as string)?.toLowerCase().includes(searchLower);
      const tenantMatch = (payment.memberInfo?.businessName || '').toLowerCase().includes(searchLower);
      const memberMatch = (payment.memberInfo?.ownerName || '').toLowerCase().includes(searchLower);
      const emailMatch = (payment.memberInfo?.email || payment.email || '').toLowerCase().includes(searchLower);
      if (!paymentIdMatch && !orderIdMatch && !tenantMatch && !memberMatch && !emailMatch) {
        return false;
      }
    }

    // 유형 필터 (결제/환불)
    if (typeFilter !== 'all') {
      const isRefund = payment.type === 'refund' || payment.type === 'cancel_refund' || payment.type === 'downgrade_refund' || (payment.amount ?? 0) < 0;
      if (typeFilter === 'charge' && isRefund) return false;
      if (typeFilter === 'refund' && !isRefund) return false;
    }

    // 플랜 필터
    if (planFilter !== 'all' && payment.plan !== planFilter) {
      return false;
    }

    // 날짜 필터
    const paymentDate = new Date(payment.paidAt || payment.createdAt);

    if (filterType === 'thisMonth') {
      const { start, end } = getThisMonthRange();
      return paymentDate >= start && paymentDate <= end;
    } else if (filterType === 'custom' && dateRange.start && dateRange.end) {
      const start = new Date(dateRange.start);
      const end = new Date(dateRange.end);
      end.setHours(23, 59, 59, 999);
      return paymentDate >= start && paymentDate <= end;
    }
    return true;
  });

  // 페이지네이션 계산
  const totalPages = Math.ceil(filteredPayments.length / PAYMENTS_PER_PAGE);
  const paginatedPayments = filteredPayments.slice(
    (page - 1) * PAYMENTS_PER_PAGE,
    page * PAYMENTS_PER_PAGE
  );

  // 이번달 필터 선택
  const handleThisMonthFilter = () => {
    setFilterType('thisMonth');
    setDateRange({ start: '', end: '' });
    setPage(1);
  };

  // 직접 입력 모달 열기
  const handleOpenDatePicker = () => {
    const today = new Date().toISOString().split('T')[0];
    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    setTempDateRange(dateRange.start ? dateRange : { start: monthAgo, end: today });
    setShowDatePickerModal(true);
  };

  // 날짜 범위 적용
  const handleApplyDateRange = () => {
    if (tempDateRange.start && tempDateRange.end) {
      setFilterType('custom');
      setDateRange(tempDateRange);
      setPage(1);
      setShowDatePickerModal(false);
    }
  };

  // 결제 내역 xlsx 내보내기
  const handleExport = () => {
    if (filteredPayments.length === 0) {
      alert('내보낼 결제 내역이 없습니다.');
      return;
    }

    const exportData = filteredPayments.map((payment) => {
      const isRefund = payment.type === 'refund' || payment.type === 'cancel_refund' || payment.type === 'downgrade_refund' || (payment.amount ?? 0) < 0;

      return {
        '유형': isRefund ? '환불' : '결제',
        'ID': payment.orderId || payment.id,
        '날짜': payment.paidAt
          ? new Date(payment.paidAt).toLocaleString('ko-KR')
          : payment.createdAt
          ? new Date(payment.createdAt).toLocaleString('ko-KR')
          : '-',
        '회원': payment.memberInfo?.ownerName || '-',
        '이메일': payment.memberInfo?.email || payment.email || '-',
        '매장': payment.memberInfo?.businessName || '-',
        '플랜': getPlanName(payment.plan),
        '금액': payment.amount ?? 0,
        '결제유형': payment.type ? PAYMENT_TYPE_LABELS[payment.type] || payment.type : '-',
        '처리자': payment.initiatedBy ? INITIATED_BY_LABELS[payment.initiatedBy] || payment.initiatedBy : '-',
        '상태': payment.status || '-',
        '사유': payment.cancelReason || payment.refundReason || '-',
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '결제 내역');

    // 열 너비 설정
    worksheet['!cols'] = [
      { wch: 8 },   // 유형
      { wch: 30 },  // ID
      { wch: 22 },  // 날짜
      { wch: 12 },  // 회원
      { wch: 25 },  // 이메일
      { wch: 15 },  // 매장
      { wch: 12 },  // 플랜
      { wch: 12 },  // 금액
      { wch: 15 },  // 결제유형
      { wch: 10 },  // 처리자
      { wch: 10 },  // 상태
      { wch: 20 },  // 사유
    ];

    const today = new Date().toISOString().split('T')[0];
    const fileName = `결제내역_${today}.xlsx`;

    XLSX.writeFile(workbook, fileName);
  };

  // 환불 모달 열기
  const openRefundModal = (payment: Payment) => {
    const availableAmount = payment.remainingAmount ?? payment.amount ?? 0;

    setRefundModal({
      isOpen: true,
      payment,
      availableAmount,
    });
    setRefundForm({
      type: 'full',
      amount: availableAmount,
      reason: '',
      cancelSubscription: false,
    });
    setActionDropdown(null);
  };

  // 환불 처리
  const handleRefund = async () => {
    if (!refundModal.payment) return;

    const refundAmount = refundForm.type === 'full' ? refundModal.availableAmount : refundForm.amount;

    if (refundAmount <= 0) {
      alert('환불 금액을 입력해주세요.');
      return;
    }

    if (refundAmount > refundModal.availableAmount) {
      alert(`환불 가능 금액(${refundModal.availableAmount.toLocaleString()}원)을 초과했습니다.`);
      return;
    }

    if (!refundModal.payment.paymentKey) {
      alert('결제 키가 없어 환불할 수 없습니다.');
      return;
    }

    setProcessingRefund(true);

    try {
      const response = await fetch('/api/admin/payments/refund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentId: refundModal.payment.id,
          paymentKey: refundModal.payment.paymentKey,
          refundAmount,
          refundReason: refundForm.reason.trim() || '관리자 환불 처리',
          cancelSubscription: refundForm.cancelSubscription,
          tenantId: refundModal.payment.tenantId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '환불 처리 중 오류가 발생했습니다.');
      }

      alert('환불이 완료되었습니다.');
      fetchPayments();
      setRefundModal({ isOpen: false, payment: null, availableAmount: 0 });
    } catch (error) {
      console.error('Refund error:', error);
      alert(error instanceof Error ? error.message : '환불 처리 중 오류가 발생했습니다.');
    } finally {
      setProcessingRefund(false);
    }
  };

  // 새로고침
  const handleRefresh = () => {
    setRefreshing(true);
    fetchPayments();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <CreditCard className="w-8 h-8 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900">결제 내역</h1>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
        >
          <RefreshDouble className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          새로고침
        </button>
      </div>

      {/* 결제 내역 */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
        <div className="flex flex-col gap-3 mb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-3">
            {/* 기간 필터 + 검색 (PC) */}
            <div className="flex items-center gap-2">
              {/* 검색 - PC에서만 이 위치에 표시 */}
              <div className="relative hidden sm:block">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setPage(1);
                  }}
                  placeholder="ID, 회원, 매장 검색..."
                  className="w-56 pl-8 pr-8 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                {searchQuery && (
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      setPage(1);
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 hover:bg-gray-100 rounded"
                  >
                    <Xmark className="w-3 h-3 text-gray-400" />
                  </button>
                )}
              </div>
              <button
                onClick={handleThisMonthFilter}
                className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                  filterType === 'thisMonth'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                이번달
              </button>
              <button
                onClick={handleOpenDatePicker}
                className={`text-xs rounded-lg transition-colors flex items-center gap-1 ${
                  filterType === 'custom' && dateRange.start
                    ? 'px-3 py-1.5 bg-blue-600 text-white'
                    : 'p-1.5 bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
                title="기간 선택"
              >
                <Calendar className="w-4 h-4" />
                {filterType === 'custom' && dateRange.start && (
                  <span>{dateRange.start} ~ {dateRange.end}</span>
                )}
              </button>
              {/* 상세 필터 버튼 */}
              <div className="relative" ref={filterRef}>
                <button
                  onClick={() => setShowFilter(!showFilter)}
                  className={`p-1.5 rounded-lg transition-colors ${
                    typeFilter !== 'all' || planFilter !== 'all'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                  title="필터"
                >
                  <Filter className="w-4 h-4" />
                </button>
                {/* 필터 드롭다운 */}
                {showFilter && (
                  <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-xl shadow-lg border border-gray-200 z-50 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-medium text-gray-900">필터</span>
                      {(typeFilter !== 'all' || planFilter !== 'all') && (
                        <button
                          onClick={() => {
                            setTypeFilter('all');
                            setPlanFilter('all');
                            setPage(1);
                          }}
                          className="text-xs text-blue-600 hover:text-blue-700"
                        >
                          초기화
                        </button>
                      )}
                    </div>
                    {/* 유형 필터 */}
                    <div className="mb-3">
                      <label className="block text-xs text-gray-500 mb-1.5">유형</label>
                      <div className="flex gap-1.5">
                        {[
                          { value: 'all', label: '전체' },
                          { value: 'charge', label: '결제' },
                          { value: 'refund', label: '환불' },
                        ].map((option) => (
                          <button
                            key={option.value}
                            onClick={() => {
                              setTypeFilter(option.value as 'all' | 'charge' | 'refund');
                              setPage(1);
                            }}
                            className={`flex-1 px-2 py-1.5 text-xs rounded-lg transition-colors ${
                              typeFilter === option.value
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    {/* 플랜 필터 */}
                    <div>
                      <label className="block text-xs text-gray-500 mb-1.5">플랜</label>
                      <select
                        value={planFilter}
                        onChange={(e) => {
                          setPlanFilter(e.target.value);
                          setPage(1);
                        }}
                        className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="all">전체</option>
                        <option value="trial">Trial</option>
                        <option value="basic">Basic</option>
                        <option value="business">Business</option>
                        <option value="enterprise">Enterprise</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>
              {/* 내보내기 버튼 */}
              <button
                onClick={handleExport}
                className="p-1.5 rounded-lg transition-colors bg-gray-100 text-gray-600 hover:bg-gray-200"
                title="xlsx로 내보내기"
              >
                <Download className="w-4 h-4" />
              </button>
            </div>
          </div>
          {/* 검색 필터 - 모바일에서만 표시 */}
          <div className="flex items-center justify-end sm:hidden">
            <div className="relative w-full">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="ID, 회원, 매장 검색..."
                className="w-full pl-8 pr-8 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              {searchQuery && (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setPage(1);
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 hover:bg-gray-100 rounded"
                >
                  <Xmark className="w-3 h-3 text-gray-400" />
                </button>
              )}
            </div>
          </div>
        </div>
        {filteredPayments.length === 0 ? (
          <p className="text-gray-500 text-center py-6 text-sm">결제 내역이 없습니다.</p>
        ) : (
          <>
            <div className="overflow-x-auto overflow-y-visible">
              <table className="w-full min-w-max">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-center px-2 py-3 text-sm font-medium text-gray-500 w-10">No.</th>
                    <th className="text-center px-2 py-3 text-sm font-medium text-gray-500 w-32">orderId</th>
                    <th className="text-center px-2 py-3 text-sm font-medium text-gray-500 w-24">날짜</th>
                    <th className="text-center px-2 py-3 text-sm font-medium text-gray-500 w-20">회원</th>
                    <th className="text-center px-2 py-3 text-sm font-medium text-gray-500 w-40">이메일</th>
                    <th className="text-center px-2 py-3 text-sm font-medium text-gray-500 w-28">매장</th>
                    <th className="text-center px-2 py-3 text-sm font-medium text-gray-500 w-20">플랜</th>
                    <th className="text-center px-2 py-3 text-sm font-medium text-gray-500 w-20">금액</th>
                    <th className="text-center px-2 py-3 text-sm font-medium text-gray-500 w-14">처리자</th>
                    <th className="w-12 px-1 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paginatedPayments.map((payment, index) => {
                    const isRefund = payment.type === 'refund' || payment.type === 'cancel_refund' || payment.type === 'downgrade_refund' || (payment.amount ?? 0) < 0;
                    const paymentDate = payment.paidAt || payment.createdAt;
                    let formattedDate = '-';
                    if (paymentDate) {
                      const d = new Date(paymentDate);
                      formattedDate = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
                    }
                    const displayAmount = payment.amount < 0
                      ? payment.amount.toLocaleString()
                      : (isRefund ? `-${Math.abs(payment.amount).toLocaleString()}` : payment.amount?.toLocaleString());

                    // 환불 가능 여부
                    const remainingAmount = payment.remainingAmount ?? payment.amount ?? 0;
                    const canRefund = !isRefund && (payment.status === 'completed' || payment.status === 'done') && remainingAmount > 0;

                    return (
                      <tr key={payment.id} className="hover:bg-gray-50">
                        <td className="px-2 py-3 text-sm text-gray-400 text-center">
                          {(page - 1) * PAYMENTS_PER_PAGE + index + 1}
                        </td>
                        <td className="px-2 py-3 text-xs text-gray-600 font-mono text-center truncate max-w-32" title={payment.orderId || payment.id}>
                          {payment.orderId || payment.id}
                        </td>
                        <td className="px-2 py-3 text-sm text-gray-600 text-center whitespace-nowrap">
                          {formattedDate}
                        </td>
                        <td className="px-2 py-3 text-sm text-gray-600 text-center truncate max-w-20" title={payment.memberInfo?.ownerName || '-'}>
                          {payment.memberInfo?.ownerName || '-'}
                        </td>
                        <td className="px-2 py-3 text-sm text-gray-600 text-center truncate max-w-40" title={payment.memberInfo?.email || payment.email || '-'}>
                          {payment.memberInfo?.email || payment.email || '-'}
                        </td>
                        <td className="px-2 py-3 text-sm text-gray-600 text-center truncate max-w-28" title={payment.memberInfo?.businessName || '-'}>
                          {payment.memberInfo?.businessName || '-'}
                        </td>
                        <td className="px-2 py-3 text-sm text-gray-600 text-center">
                          {getPlanName(payment.plan)}
                        </td>
                        <td className={`px-2 py-3 text-sm font-medium text-center whitespace-nowrap ${isRefund ? 'text-red-500' : 'text-gray-900'}`}>
                          {displayAmount}원
                        </td>
                        <td className="px-2 py-3 text-sm text-gray-600 text-center">
                          {payment.initiatedBy ? INITIATED_BY_LABELS[payment.initiatedBy] || payment.initiatedBy : '-'}
                        </td>
                        <td className="px-1 py-3 text-center">
                          <div className="relative" ref={actionDropdown === payment.id ? actionRef : undefined}>
                            <button
                              onClick={(e) => {
                                if (actionDropdown === payment.id) {
                                  setActionDropdown(null);
                                  setDropdownPosition(null);
                                } else {
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  setDropdownPosition({
                                    top: rect.bottom + 4,
                                    left: rect.right - 80,
                                  });
                                  setActionDropdown(payment.id);
                                }
                              }}
                              className="w-7 h-7 flex items-center justify-center text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
                            >
                              <MoreHoriz className="w-4 h-4" />
                            </button>
                            {actionDropdown === payment.id && dropdownPosition && (
                              <div
                                className="fixed bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-[9999] min-w-[80px]"
                                style={{ top: dropdownPosition.top, left: dropdownPosition.left }}
                              >
                                <button
                                  onClick={() => {
                                    setPaymentDetailModal(payment);
                                    setActionDropdown(null);
                                    setDropdownPosition(null);
                                  }}
                                  className="w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50"
                                >
                                  상세
                                </button>
                                {canRefund && (
                                  <button
                                    onClick={() => openRefundModal(payment)}
                                    className="w-full px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50"
                                  >
                                    환불
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {/* 페이지네이션 */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 mt-2">
                <p className="text-sm text-gray-500">
                  {filteredPayments.length}건 중 {(page - 1) * PAYMENTS_PER_PAGE + 1}-
                  {Math.min(page * PAYMENTS_PER_PAGE, filteredPayments.length)}건
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <NavArrowLeft className="w-5 h-5" />
                  </button>
                  <span className="text-sm text-gray-600">
                    {page} / {totalPages}
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <NavArrowRight className="w-5 h-5" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* 결제 상세 모달 */}
      {paymentDetailModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">결제 상세</h3>
              <button
                onClick={() => setPaymentDetailModal(null)}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <Xmark className="w-5 h-5" />
              </button>
            </div>
            <div className="divide-y divide-gray-100">
              <div className="flex py-3">
                <span className="text-gray-500 w-24 shrink-0">회원</span>
                <span className="text-gray-900">{paymentDetailModal.memberInfo?.ownerName || '-'}</span>
              </div>
              <div className="flex py-3">
                <span className="text-gray-500 w-24 shrink-0">이메일</span>
                <span className="text-gray-900">{paymentDetailModal.memberInfo?.email || paymentDetailModal.email || '-'}</span>
              </div>
              <div className="flex py-3">
                <span className="text-gray-500 w-24 shrink-0">매장</span>
                <span className="text-gray-900">{paymentDetailModal.memberInfo?.businessName || '-'}</span>
              </div>
              <div className="flex py-3">
                <span className="text-gray-500 w-24 shrink-0">일시</span>
                <span className="text-gray-900">
                  {paymentDetailModal.paidAt
                    ? new Date(paymentDetailModal.paidAt).toLocaleString('ko-KR')
                    : paymentDetailModal.createdAt
                    ? new Date(paymentDetailModal.createdAt).toLocaleString('ko-KR')
                    : '-'}
                </span>
              </div>
              <div className="flex py-3">
                <span className="text-gray-500 w-24 shrink-0">주문 ID</span>
                <span className="text-gray-900 font-mono text-sm break-all">{paymentDetailModal.orderId || paymentDetailModal.id}</span>
              </div>
              <div className="flex py-3">
                <span className="text-gray-500 w-24 shrink-0">플랜</span>
                <span className="text-gray-900">{getPlanName(paymentDetailModal.plan)}</span>
              </div>
              <div className="flex py-3">
                <span className="text-gray-500 w-24 shrink-0">결제유형</span>
                <span className="text-gray-900">
                  {paymentDetailModal.type ? PAYMENT_TYPE_LABELS[paymentDetailModal.type] || paymentDetailModal.type : '-'}
                </span>
              </div>
              <div className="flex py-3">
                <span className="text-gray-500 w-24 shrink-0">분류</span>
                <span className="text-gray-900">
                  {paymentDetailModal.category ? PAYMENT_CATEGORY_LABELS[paymentDetailModal.category] || paymentDetailModal.category : '-'}
                </span>
              </div>
              <div className="flex py-3">
                <span className="text-gray-500 w-24 shrink-0">거래</span>
                <span className={`font-medium ${paymentDetailModal.transactionType === 'refund' || (paymentDetailModal.amount ?? 0) < 0 ? 'text-red-500' : 'text-gray-900'}`}>
                  {paymentDetailModal.transactionType ? TRANSACTION_TYPE_LABELS[paymentDetailModal.transactionType] || paymentDetailModal.transactionType : ((paymentDetailModal.amount ?? 0) < 0 ? '환불' : '결제')}
                </span>
              </div>
              <div className="flex py-3">
                <span className="text-gray-500 w-24 shrink-0">처리자</span>
                <span className="text-gray-900">
                  {paymentDetailModal.initiatedBy ? (
                    <>
                      {INITIATED_BY_LABELS[paymentDetailModal.initiatedBy] || paymentDetailModal.initiatedBy}
                      {paymentDetailModal.initiatedBy === 'admin' && paymentDetailModal.adminName && (
                        <span className="text-gray-500 ml-1">({paymentDetailModal.adminName})</span>
                      )}
                    </>
                  ) : '-'}
                </span>
              </div>
              <div className="flex py-3">
                <span className="text-gray-500 w-24 shrink-0">금액</span>
                <span className={`font-medium ${(paymentDetailModal.amount ?? 0) < 0 ? 'text-red-500' : 'text-gray-900'}`}>
                  {(paymentDetailModal.amount ?? 0) < 0 ? '-' : ''}{Math.abs(paymentDetailModal.amount ?? 0).toLocaleString()}원
                </span>
              </div>
              {/* 환불 정보 */}
              {(paymentDetailModal.refundedAmount ?? 0) > 0 && (
                <>
                  <div className="flex py-3">
                    <span className="text-gray-500 w-24 shrink-0">환불된 금액</span>
                    <span className="text-orange-600 font-medium">-{paymentDetailModal.refundedAmount?.toLocaleString()}원</span>
                  </div>
                  <div className="flex py-3">
                    <span className="text-gray-500 w-24 shrink-0">잔여 금액</span>
                    <span className="text-blue-600 font-medium">{paymentDetailModal.remainingAmount?.toLocaleString()}원</span>
                  </div>
                </>
              )}
              {/* 카드 정보 */}
              {(() => {
                const cardInfo = paymentDetailModal.cardInfo as { company?: string; number?: string } | undefined;
                const cardCompany = String(cardInfo?.company || (paymentDetailModal.cardCompany as string) || '');
                const cardNumber = String(cardInfo?.number || (paymentDetailModal.cardNumber as string) || '');
                if (!cardNumber) return null;
                return (
                  <div className="flex py-3">
                    <span className="text-gray-500 w-24 shrink-0">카드</span>
                    <span className="text-gray-900">{cardCompany} {cardNumber}</span>
                  </div>
                );
              })()}
              {/* 원 결제 연결 (환불인 경우) */}
              {paymentDetailModal.originalPaymentId && (
                <div className="flex py-3">
                  <span className="text-gray-500 w-24 shrink-0">원 결제</span>
                  <span className="text-gray-900 font-mono text-sm">
                    {String(paymentDetailModal.originalPaymentId).split('_').slice(0, 2).join('_')}
                  </span>
                </div>
              )}
              {/* 환불 사유 */}
              {(paymentDetailModal.refundReason || paymentDetailModal.cancelReason) && (
                <div className="flex py-3">
                  <span className="text-gray-500 w-24 shrink-0">사유</span>
                  <span className="text-gray-900">{String(paymentDetailModal.refundReason || paymentDetailModal.cancelReason)}</span>
                </div>
              )}
              {/* 영수증 버튼 */}
              {paymentDetailModal.receiptUrl && (
                <div className="pt-4">
                  <a
                    href={paymentDetailModal.receiptUrl}
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
                onClick={() => setPaymentDetailModal(null)}
                className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 환불 모달 */}
      {refundModal.isOpen && refundModal.payment && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">환불 처리</h3>
              <button
                onClick={() => setRefundModal({ isOpen: false, payment: null, availableAmount: 0 })}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <Xmark className="w-5 h-5" />
              </button>
            </div>

            {/* 원본 결제 정보 */}
            <div className="bg-gray-50 rounded-lg p-4 mb-4">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-500">원본 결제</span>
                <span className="font-medium font-mono text-xs">{refundModal.payment.orderId}</span>
              </div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-500">결제 금액</span>
                <span className="font-medium">{Math.abs(refundModal.payment.amount || 0).toLocaleString()}원</span>
              </div>
              {(refundModal.payment.refundedAmount ?? 0) > 0 && (
                <div className="flex justify-between text-sm mb-2 text-orange-600">
                  <span>이미 환불된 금액</span>
                  <span className="font-medium">-{refundModal.payment.refundedAmount?.toLocaleString()}원</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">환불 가능 금액</span>
                <span className="font-medium text-blue-600">{refundModal.availableAmount.toLocaleString()}원</span>
              </div>
            </div>

            {/* 환불 유형 선택 */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">환불 유형</label>
              <div className="flex gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="refundType"
                    checked={refundForm.type === 'full'}
                    onChange={() => {
                      setRefundForm({ ...refundForm, type: 'full', amount: refundModal.availableAmount });
                    }}
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm">전액 환불</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="refundType"
                    checked={refundForm.type === 'partial'}
                    onChange={() => {
                      setRefundForm({ ...refundForm, type: 'partial', amount: 0 });
                    }}
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm">부분 환불</span>
                </label>
              </div>
            </div>

            {/* 부분 환불 금액 입력 */}
            {refundForm.type === 'partial' && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">환불 금액</label>
                <div className="relative">
                  <input
                    type="number"
                    value={refundForm.amount || ''}
                    onChange={(e) => setRefundForm({ ...refundForm, amount: parseInt(e.target.value) || 0 })}
                    max={refundModal.availableAmount}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 pr-10"
                    placeholder="환불 금액 입력"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">원</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">최대 {refundModal.availableAmount.toLocaleString()}원</p>
              </div>
            )}

            {/* 환불 사유 (선택) */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">환불 사유 <span className="text-gray-400 font-normal">(선택)</span></label>
              <textarea
                value={refundForm.reason}
                onChange={(e) => setRefundForm({ ...refundForm, reason: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 resize-none"
                rows={2}
                placeholder="환불 사유를 입력하세요 (미입력 시 '관리자 환불 처리'로 저장)"
              />
            </div>

            {/* 구독 처리 옵션 */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">구독 처리</label>
              <div className="flex gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="subscriptionOption"
                    checked={!refundForm.cancelSubscription}
                    onChange={() => setRefundForm({ ...refundForm, cancelSubscription: false })}
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm">구독 유지</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="subscriptionOption"
                    checked={refundForm.cancelSubscription}
                    onChange={() => setRefundForm({ ...refundForm, cancelSubscription: true })}
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-red-600">구독 즉시 해지</span>
                </label>
              </div>
            </div>

            {/* 버튼 */}
            <div className="flex gap-3">
              <button
                onClick={() => setRefundModal({ isOpen: false, payment: null, availableAmount: 0 })}
                className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                disabled={processingRefund}
              >
                취소
              </button>
              <button
                onClick={handleRefund}
                disabled={processingRefund || (refundForm.type === 'partial' && refundForm.amount <= 0)}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {processingRefund ? '처리 중...' : '환불 처리'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 기간 선택 모달 */}
      {showDatePickerModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-sm w-full p-6 shadow-xl">
            <h3 className="text-lg font-semibold mb-4">기간 선택</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">시작일</label>
                <input
                  type="date"
                  value={tempDateRange.start}
                  onChange={(e) => setTempDateRange({ ...tempDateRange, start: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">종료일</label>
                <input
                  type="date"
                  value={tempDateRange.end}
                  onChange={(e) => setTempDateRange({ ...tempDateRange, end: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowDatePickerModal(false)}
                className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleApplyDateRange}
                disabled={!tempDateRange.start || !tempDateRange.end}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                적용
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
