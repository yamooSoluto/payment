'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import useSWR from 'swr';
import { CreditCard, Search, Filter, Download, Calendar, Xmark, NavArrowLeft, NavArrowRight, MoreHoriz, RefreshDouble, CheckSquare, User } from 'iconoir-react';
import Spinner from '@/components/admin/Spinner';
import RefundModal from '@/components/admin/member-detail/RefundModal';


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
    phone?: string;
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
  const { data: swrData, isLoading: loading, isValidating: refreshing, mutate } = useSWR(
    '/api/admin/orders?limit=500'
  );
  const payments: Payment[] = swrData?.orders ?? [];

  // 페이지네이션 및 필터 상태
  const [page, setPage] = useState(1);
  const [filterType, setFilterType] = useState<'recent3Months' | 'custom'>('recent3Months');
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({ start: '', end: '' });
  const [showDatePickerModal, setShowDatePickerModal] = useState(false);
  const [tempDateRange, setTempDateRange] = useState<{ start: string; end: string }>({ start: '', end: '' });
  const [paymentDetailModal, setPaymentDetailModal] = useState<Payment | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilter, setShowFilter] = useState(false);
  const [filterPosition, setFilterPosition] = useState<{ top: number; right: number } | null>(null);

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

  // 새 환불처리 모달 상태
  const [showNewRefundModal, setShowNewRefundModal] = useState(false);
  const [newRefundMemberSearch, setNewRefundMemberSearch] = useState('');
  const [newRefundMemberResults, setNewRefundMemberResults] = useState<{
    id: string;
    email: string;
    name: string;
    phone: string;
  }[]>([]);
  const [newRefundMemberLoading, setNewRefundMemberLoading] = useState(false);
  const [newRefundSelectedMember, setNewRefundSelectedMember] = useState<{
    id: string;
    email: string;
    name: string;
    phone: string;
  } | null>(null);
  const [newRefundMemberPayments, setNewRefundMemberPayments] = useState<Payment[]>([]);
  const [newRefundPaymentsLoading, setNewRefundPaymentsLoading] = useState(false);
  const [newRefundSelectedPayment, setNewRefundSelectedPayment] = useState<Payment | null>(null);
  const [newRefundForm, setNewRefundForm] = useState({
    reason: '' as '' | '불만' | '실수' | '변심' | '버그' | '관리' | '기타',
    customReason: '',
    amount: 0,
    cancelSubscription: false,
  });
  const [processingNewRefund, setProcessingNewRefund] = useState(false);
  const [showPaymentDropdown, setShowPaymentDropdown] = useState(false);

  const filterRef = useRef<HTMLDivElement>(null);
  const PAYMENTS_PER_PAGE = 20;

  // 외부 클릭 감지
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
        setShowFilter(false);
        setFilterPosition(null);
      }
      if (actionRef.current && !actionRef.current.contains(event.target as Node)) {
        setActionDropdown(null);
        setDropdownPosition(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 최근 3개월 시작/끝 날짜 계산
  const getRecent3MonthsRange = () => {
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    return { start, end };
  };

  // 필터링된 결제 내역
  const filteredPayments = payments.filter((payment) => {
    // 검색어 필터 (ID, orderId, 매장명, 회원명, 이메일, 연락처)
    if (searchQuery) {
      const searchLower = searchQuery.toLowerCase();
      const paymentIdMatch = payment.id.toLowerCase().includes(searchLower);
      const orderIdMatch = (payment.orderId as string)?.toLowerCase().includes(searchLower);
      const tenantMatch = (payment.memberInfo?.businessName || '').toLowerCase().includes(searchLower);
      const memberMatch = (payment.memberInfo?.ownerName || '').toLowerCase().includes(searchLower);
      const emailMatch = (payment.memberInfo?.email || payment.email || '').toLowerCase().includes(searchLower);
      const phoneMatch = (payment.memberInfo?.phone || '').replace(/-/g, '').includes(searchQuery.replace(/-/g, ''));
      if (!paymentIdMatch && !orderIdMatch && !tenantMatch && !memberMatch && !emailMatch && !phoneMatch) {
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

    if (filterType === 'recent3Months') {
      const { start, end } = getRecent3MonthsRange();
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

  // 최근 3개월 필터 선택
  const handleRecent3MonthsFilter = () => {
    setFilterType('recent3Months');
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
  const handleExport = async () => {
    if (filteredPayments.length === 0) {
      alert('내보낼 결제 내역이 없습니다.');
      return;
    }

    const XLSX = await import('xlsx');

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
    setRefundModal({ isOpen: true, payment, availableAmount });
    setActionDropdown(null);
  };

  // 새로고침
  const handleRefresh = () => {
    mutate();
  };

  // 새 환불처리 모달 - 회원 검색 (디바운스 + race condition 방지)
  const memberSearchTimerRef = useRef<NodeJS.Timeout | null>(null);
  const memberSearchQueryRef = useRef('');

  const searchMembersForRefund = useCallback((query: string) => {
    memberSearchQueryRef.current = query;

    if (memberSearchTimerRef.current) {
      clearTimeout(memberSearchTimerRef.current);
    }

    if (!query.trim()) {
      setNewRefundMemberResults([]);
      setNewRefundMemberLoading(false);
      return;
    }

    setNewRefundMemberLoading(true);

    memberSearchTimerRef.current = setTimeout(async () => {
      try {
        const response = await fetch(`/api/admin/members?search=${encodeURIComponent(query)}&limit=10`);
        if (response.ok && memberSearchQueryRef.current === query) {
          const data = await response.json();
          setNewRefundMemberResults(data.members || []);
        }
      } catch (error) {
        console.error('Failed to search members:', error);
      } finally {
        if (memberSearchQueryRef.current === query) {
          setNewRefundMemberLoading(false);
        }
      }
    }, 300);
  }, []);

  // 새 환불처리 모달 - 회원 선택 시 결제 내역 조회
  const selectMemberForRefund = async (member: { id: string; email: string; name: string; phone: string }) => {
    setNewRefundSelectedMember(member);
    setNewRefundMemberSearch('');
    setNewRefundMemberResults([]);
    setNewRefundSelectedPayment(null);
    setNewRefundForm({ reason: '', customReason: '', amount: 0, cancelSubscription: false });
    setShowPaymentDropdown(false);

    setNewRefundPaymentsLoading(true);
    try {
      // 해당 회원의 결제 내역 필터링 (이미 로드된 payments에서)
      const memberPayments = payments.filter(p => {
        const email = p.memberInfo?.email || p.email || '';
        const isRefund = p.type === 'refund' || p.type === 'cancel_refund' || p.type === 'downgrade_refund' || (p.amount ?? 0) < 0;
        const remainingAmount = p.remainingAmount ?? p.amount ?? 0;
        const isRefundable = !isRefund && (p.status === 'completed' || p.status === 'done') && remainingAmount > 0;
        return email.toLowerCase() === member.email.toLowerCase() && isRefundable;
      });
      setNewRefundMemberPayments(memberPayments);
    } catch (error) {
      console.error('Failed to fetch member payments:', error);
    } finally {
      setNewRefundPaymentsLoading(false);
    }
  };

  // 새 환불처리 모달 - 결제 선택
  const selectPaymentForRefund = (payment: Payment) => {
    setNewRefundSelectedPayment(payment);
    const maxAmount = payment.remainingAmount ?? payment.amount ?? 0;
    setNewRefundForm({ ...newRefundForm, amount: maxAmount });
  };

  // 새 환불처리 모달 - 환불 처리
  const handleNewRefund = async () => {
    if (!newRefundSelectedPayment) return;

    const maxAmount = newRefundSelectedPayment.remainingAmount ?? newRefundSelectedPayment.amount ?? 0;

    if (newRefundForm.amount <= 0) {
      alert('환불 금액을 입력해주세요.');
      return;
    }

    if (newRefundForm.amount > maxAmount) {
      alert(`환불 가능 금액(${maxAmount.toLocaleString()}원)을 초과했습니다.`);
      return;
    }

    if (!newRefundForm.reason) {
      alert('환불 사유를 선택해주세요.');
      return;
    }

    if (!newRefundSelectedPayment.paymentKey) {
      alert('결제 키가 없어 환불할 수 없습니다.');
      return;
    }

    setProcessingNewRefund(true);

    try {
      const reasonText = newRefundForm.reason === '기타' && newRefundForm.customReason
        ? `기타: ${newRefundForm.customReason}`
        : newRefundForm.reason;

      const response = await fetch('/api/admin/payments/refund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentId: newRefundSelectedPayment.id,
          paymentKey: newRefundSelectedPayment.paymentKey,
          refundAmount: newRefundForm.amount,
          refundReason: reasonText,
          cancelSubscription: newRefundForm.cancelSubscription,
          tenantId: newRefundSelectedPayment.tenantId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '환불 처리 중 오류가 발생했습니다.');
      }

      alert('환불이 완료되었습니다.');
      mutate();
      closeNewRefundModal();
    } catch (error) {
      console.error('Refund error:', error);
      alert(error instanceof Error ? error.message : '환불 처리 중 오류가 발생했습니다.');
    } finally {
      setProcessingNewRefund(false);
    }
  };

  // 새 환불처리 모달 닫기
  const closeNewRefundModal = () => {
    if (memberSearchTimerRef.current) {
      clearTimeout(memberSearchTimerRef.current);
    }
    setShowNewRefundModal(false);
    setNewRefundMemberSearch('');
    setNewRefundMemberResults([]);
    setNewRefundSelectedMember(null);
    setNewRefundMemberPayments([]);
    setNewRefundSelectedPayment(null);
    setNewRefundForm({ reason: '', customReason: '', amount: 0, cancelSubscription: false });
    setShowPaymentDropdown(false);
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
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 overflow-visible">
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
                onClick={handleRecent3MonthsFilter}
                className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${filterType === 'recent3Months'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
              >
                최근 3개월
              </button>
              <button
                onClick={handleOpenDatePicker}
                className={`text-xs rounded-lg transition-colors flex items-center gap-1 ${filterType === 'custom' && dateRange.start
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
                  onClick={(e) => {
                    if (showFilter) {
                      setShowFilter(false);
                      setFilterPosition(null);
                    } else {
                      const rect = e.currentTarget.getBoundingClientRect();
                      // 모바일 화면에서 필터가 왼쪽 화면 밖으로 나가는 것을 방지
                      const dropdownWidth = 256; // w-64
                      const margin = 16;
                      const calculatedRight = window.innerWidth - rect.right;
                      // 왼쪽 여백(margin)을 확보하기 위한 right 값의 최댓값 계산
                      // Left = window.innerWidth - right - dropdownWidth >= margin
                      // right <= window.innerWidth - dropdownWidth - margin
                      const maxRight = window.innerWidth - dropdownWidth - margin;

                      setFilterPosition({
                        top: rect.bottom + 8,
                        right: Math.min(calculatedRight, maxRight),
                      });
                      setShowFilter(true);
                    }
                  }}
                  className={`p-1.5 rounded-lg transition-colors ${typeFilter !== 'all' || planFilter !== 'all'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  title="필터"
                >
                  <Filter className="w-4 h-4" />
                </button>
                {/* 필터 드롭다운 */}
                {showFilter && filterPosition && (
                  <div
                    className="fixed w-64 bg-white rounded-xl shadow-lg border border-gray-200 z-[9999] p-4"
                    style={{ top: filterPosition.top, right: filterPosition.right }}
                  >
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
                            className={`flex-1 px-2 py-1.5 text-xs rounded-lg transition-colors ${typeFilter === option.value
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
              {/* 환불처리 버튼 */}
              <button
                onClick={() => setShowNewRefundModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors bg-red-50 text-red-600 hover:bg-red-100 text-xs font-medium"
                title="환불처리"
              >
                <CheckSquare className="w-4 h-4" />
                환불처리
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
              <table className="w-full min-w-[900px]">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-center px-2 py-3 text-sm font-medium text-gray-500 whitespace-nowrap">No.</th>
                    <th className="text-center px-2 py-3 text-sm font-medium text-gray-500 whitespace-nowrap">날짜</th>
                    <th className="text-center px-2 py-3 text-sm font-medium text-gray-500 whitespace-nowrap">회원</th>
                    <th className="text-center px-2 py-3 text-sm font-medium text-gray-500 whitespace-nowrap">이메일</th>
                    <th className="text-center px-2 py-3 text-sm font-medium text-gray-500 whitespace-nowrap">매장</th>
                    <th className="text-center px-2 py-3 text-sm font-medium text-gray-500 whitespace-nowrap">플랜</th>
                    <th className="text-center px-2 py-3 text-sm font-medium text-gray-500 whitespace-nowrap">금액</th>
                    <th className="text-center px-2 py-3 text-sm font-medium text-gray-500 whitespace-nowrap">처리자</th>
                    <th className="text-center px-2 py-3 text-sm font-medium text-gray-500 whitespace-nowrap">orderId</th>
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
                        <td className="px-2 py-3 text-sm text-gray-400 text-center whitespace-nowrap">
                          {(page - 1) * PAYMENTS_PER_PAGE + index + 1}
                        </td>
                        <td className="px-2 py-3 text-sm text-gray-600 text-center whitespace-nowrap">
                          {formattedDate}
                        </td>
                        <td className="px-2 py-3 text-sm text-gray-600 text-center whitespace-nowrap">
                          {payment.memberInfo?.ownerName || '-'}
                        </td>
                        <td className="px-2 py-3 text-sm text-gray-600 text-center whitespace-nowrap">
                          {payment.memberInfo?.email || payment.email || '-'}
                        </td>
                        <td className="px-2 py-3 text-sm text-gray-600 text-center whitespace-nowrap">
                          {payment.memberInfo?.businessName || '-'}
                        </td>
                        <td className="px-2 py-3 text-sm text-gray-600 text-center whitespace-nowrap">
                          {getPlanName(payment.plan)}
                        </td>
                        <td className={`px-2 py-3 text-sm font-medium text-center whitespace-nowrap ${isRefund ? 'text-red-500' : 'text-gray-900'}`}>
                          {displayAmount}원
                        </td>
                        <td className="px-2 py-3 text-sm text-gray-600 text-center whitespace-nowrap">
                          {payment.initiatedBy ? INITIATED_BY_LABELS[payment.initiatedBy] || payment.initiatedBy : '-'}
                        </td>
                        <td className="px-2 py-3 text-xs text-gray-600 font-mono text-center whitespace-nowrap">
                          {payment.orderId || payment.id}
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
                <span className="text-gray-500 w-24 shrink-0">연락처</span>
                <span className="text-gray-900">{paymentDetailModal.memberInfo?.phone || '-'}</span>
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
              {/* 처리자 */}
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
              {/* 사유 */}
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
        <RefundModal
          payment={refundModal.payment as any}
          availableAmount={refundModal.availableAmount}
          refundedAmount={refundModal.payment.refundedAmount}
          onClose={() => setRefundModal({ isOpen: false, payment: null, availableAmount: 0 })}
          onSuccess={() => { mutate(); setRefundModal({ isOpen: false, payment: null, availableAmount: 0 }); }}
        />
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

      {/* 새 환불처리 모달 */}
      {showNewRefundModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl my-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">환불처리</h3>
              <button
                onClick={closeNewRefundModal}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <Xmark className="w-5 h-5" />
              </button>
            </div>

            {/* 1. 회원 검색 */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                회원 <span className="text-red-500">*</span>
              </label>
              {newRefundSelectedMember ? (
                <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <User className="w-5 h-5 text-blue-600" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{newRefundSelectedMember.name || '이름 없음'}</p>
                    <p className="text-sm text-gray-600 truncate">{newRefundSelectedMember.email}</p>
                    {newRefundSelectedMember.phone && (
                      <p className="text-xs text-gray-500">{newRefundSelectedMember.phone}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setNewRefundSelectedMember(null);
                      setNewRefundMemberPayments([]);
                      setNewRefundSelectedPayment(null);
                      setNewRefundForm({ reason: '', customReason: '', amount: 0, cancelSubscription: false });
                      setShowPaymentDropdown(false);
                    }}
                    className="p-1 hover:bg-blue-100 rounded"
                  >
                    <Xmark className="w-4 h-4 text-gray-500" />
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <div className="relative">
                    <input
                      type="text"
                      value={newRefundMemberSearch}
                      onChange={(e) => {
                        setNewRefundMemberSearch(e.target.value);
                        searchMembersForRefund(e.target.value);
                      }}
                      placeholder="이름, 이메일, 연락처로 검색..."
                      className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  </div>
                  {/* 회원 검색 결과 - 모달 바깥에 표시되도록 fixed로 변경 */}
                  {(newRefundMemberLoading || newRefundMemberResults.length > 0) && (
                    <div className="absolute z-[60] left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                      {newRefundMemberLoading ? (
                        <div className="p-4 text-center text-gray-500">
                          <Spinner size="sm" />
                        </div>
                      ) : (
                        newRefundMemberResults.map((member) => (
                          <button
                            key={member.id}
                            type="button"
                            onClick={() => selectMemberForRefund(member)}
                            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 text-left border-b border-gray-100 last:border-b-0"
                          >
                            <User className="w-5 h-5 text-gray-400 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-gray-900">{member.name || '이름 없음'}</p>
                              <p className="text-sm text-gray-500">{member.email}</p>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 2. 결제 내역 선택 */}
            <div className="mb-4">
              <label className={`block text-sm font-medium mb-1 ${!newRefundSelectedMember ? 'text-gray-400' : 'text-gray-700'}`}>
                결제내역 <span className="text-red-500">*</span>
              </label>
              {!newRefundSelectedMember ? (
                <div className="p-3 text-center text-gray-400 border border-gray-200 rounded-lg text-sm bg-gray-50">
                  회원을 먼저 선택해주세요
                </div>
              ) : newRefundPaymentsLoading ? (
                <div className="p-4 text-center text-gray-500 border border-gray-200 rounded-lg">
                  <Spinner size="sm" />
                </div>
              ) : newRefundMemberPayments.length === 0 ? (
                <div className="p-3 text-center text-gray-500 border border-gray-200 rounded-lg text-sm">
                  환불 가능한 결제 내역이 없습니다
                </div>
              ) : newRefundSelectedPayment ? (
                // 선택된 결제 표시
                <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <CreditCard className="w-5 h-5 text-blue-600 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900">
                      {newRefundSelectedPayment.memberInfo?.businessName || '매장명 없음'} · {getPlanName(newRefundSelectedPayment.plan)}
                    </p>
                    <p className="text-sm text-gray-600">
                      {newRefundSelectedPayment.paidAt || newRefundSelectedPayment.createdAt
                        ? new Date(newRefundSelectedPayment.paidAt || newRefundSelectedPayment.createdAt || '').toLocaleDateString('ko-KR')
                        : '-'} · {(newRefundSelectedPayment.amount ?? 0).toLocaleString()}원
                    </p>
                    <p className="text-xs text-blue-600">
                      환불가능: {(newRefundSelectedPayment.remainingAmount ?? newRefundSelectedPayment.amount ?? 0).toLocaleString()}원
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setNewRefundSelectedPayment(null);
                      setNewRefundForm({ reason: '', customReason: '', amount: 0, cancelSubscription: false });
                    }}
                    className="p-1 hover:bg-blue-100 rounded"
                  >
                    <Xmark className="w-4 h-4 text-gray-500" />
                  </button>
                </div>
              ) : (
                // 결제 선택 드롭다운
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowPaymentDropdown(!showPaymentDropdown)}
                    className="w-full flex items-center gap-2 px-4 py-2.5 border border-gray-200 rounded-lg hover:border-gray-300 text-left"
                  >
                    <CreditCard className="w-4 h-4 text-gray-400" />
                    <span className="text-gray-500">결제 내역 선택...</span>
                  </button>
                  {showPaymentDropdown && (
                    <div className="absolute z-[60] left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                      {newRefundMemberPayments.map((payment) => {
                        const paymentDate = payment.paidAt || payment.createdAt;
                        const formattedDate = paymentDate
                          ? new Date(paymentDate).toLocaleDateString('ko-KR')
                          : '-';
                        const remainingAmount = payment.remainingAmount ?? payment.amount ?? 0;

                        return (
                          <button
                            key={payment.id}
                            type="button"
                            onClick={() => {
                              selectPaymentForRefund(payment);
                              setShowPaymentDropdown(false);
                            }}
                            className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 text-left border-b border-gray-100 last:border-b-0"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900">
                                {payment.memberInfo?.businessName || '매장명 없음'}
                              </p>
                              <p className="text-xs text-gray-600">
                                {getPlanName(payment.plan)} · {formattedDate}
                              </p>
                              <p className="text-xs text-gray-400 font-mono truncate">
                                {payment.orderId || payment.id}
                              </p>
                            </div>
                            <div className="text-right ml-3">
                              <p className="text-sm font-medium text-gray-900">
                                {(payment.amount ?? 0).toLocaleString()}원
                              </p>
                              <p className="text-xs text-blue-600">
                                환불가능: {remainingAmount.toLocaleString()}원
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 3. 환불 사유 */}
            <div className="mb-4">
              <label className={`block text-sm font-medium mb-2 ${!newRefundSelectedPayment ? 'text-gray-400' : 'text-gray-700'}`}>
                환불사유 <span className="text-red-500">*</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {(['불만', '실수', '변심', '버그', '관리', '기타'] as const).map((reason) => (
                  <button
                    key={reason}
                    type="button"
                    onClick={() => newRefundSelectedPayment && setNewRefundForm({ ...newRefundForm, reason })}
                    disabled={!newRefundSelectedPayment}
                    className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${!newRefundSelectedPayment
                        ? 'border-gray-200 text-gray-400 bg-gray-50 cursor-not-allowed'
                        : newRefundForm.reason === reason
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-200 hover:border-gray-300 text-gray-600'
                      }`}
                  >
                    {reason}
                  </button>
                ))}
              </div>
              {/* 기타 사유 입력 */}
              {newRefundForm.reason === '기타' && (
                <input
                  type="text"
                  value={newRefundForm.customReason}
                  onChange={(e) => setNewRefundForm({ ...newRefundForm, customReason: e.target.value })}
                  placeholder="기타 사유를 입력하세요"
                  className="w-full mt-2 px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                />
              )}
            </div>

            {/* 4. 환불 금액 */}
            <div className="mb-4">
              <label className={`block text-sm font-medium mb-1 ${!newRefundSelectedPayment ? 'text-gray-400' : 'text-gray-700'}`}>
                금액 <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={newRefundForm.amount || ''}
                  onChange={(e) => {
                    if (!newRefundSelectedPayment) return;
                    const value = parseInt(e.target.value) || 0;
                    const max = newRefundSelectedPayment.remainingAmount ?? newRefundSelectedPayment.amount ?? 0;
                    setNewRefundForm({ ...newRefundForm, amount: Math.min(value, max) });
                  }}
                  max={newRefundSelectedPayment ? (newRefundSelectedPayment.remainingAmount ?? newRefundSelectedPayment.amount ?? 0) : 0}
                  disabled={!newRefundSelectedPayment}
                  className={`w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 pr-10 ${!newRefundSelectedPayment ? 'bg-gray-50 text-gray-400 cursor-not-allowed' : ''
                    }`}
                  placeholder={newRefundSelectedPayment ? '환불 금액 입력' : '결제내역을 먼저 선택해주세요'}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">원</span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {newRefundSelectedPayment
                  ? `최대 환불 가능: ${(newRefundSelectedPayment.remainingAmount ?? newRefundSelectedPayment.amount ?? 0).toLocaleString()}원`
                  : '결제내역 선택 시 환불 가능 금액이 표시됩니다'
                }
              </p>
            </div>

            {/* 5. 구독 처리 옵션 */}
            <div className="mb-6">
              <label className={`block text-sm font-medium mb-2 ${!newRefundSelectedPayment ? 'text-gray-400' : 'text-gray-700'}`}>
                구독 처리
              </label>
              <div className="flex gap-3">
                <label className={`flex items-center gap-2 ${!newRefundSelectedPayment ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                  <input
                    type="radio"
                    name="newRefundSubscriptionOption"
                    checked={!newRefundForm.cancelSubscription}
                    onChange={() => newRefundSelectedPayment && setNewRefundForm({ ...newRefundForm, cancelSubscription: false })}
                    disabled={!newRefundSelectedPayment}
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  <span className={`text-sm ${!newRefundSelectedPayment ? 'text-gray-400' : ''}`}>구독 유지</span>
                </label>
                <label className={`flex items-center gap-2 ${!newRefundSelectedPayment ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                  <input
                    type="radio"
                    name="newRefundSubscriptionOption"
                    checked={newRefundForm.cancelSubscription}
                    onChange={() => newRefundSelectedPayment && setNewRefundForm({ ...newRefundForm, cancelSubscription: true })}
                    disabled={!newRefundSelectedPayment}
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  <span className={`text-sm ${!newRefundSelectedPayment ? 'text-gray-400' : 'text-red-600'}`}>구독 즉시 해지</span>
                </label>
              </div>
            </div>

            {/* 버튼 */}
            <div className="flex gap-3">
              <button
                onClick={closeNewRefundModal}
                className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                disabled={processingNewRefund}
              >
                취소
              </button>
              <button
                onClick={handleNewRefund}
                disabled={processingNewRefund || !newRefundSelectedPayment || !newRefundForm.reason || newRefundForm.amount <= 0}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {processingNewRefund ? '처리 중...' : '환불 처리'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
