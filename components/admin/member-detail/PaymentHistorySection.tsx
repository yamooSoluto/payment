'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { CreditCard, Calendar, Search, Xmark, Filter, Download, NavArrowLeft, NavArrowRight, MoreHoriz } from 'iconoir-react';
import * as XLSX from 'xlsx';
import Spinner from '@/components/admin/Spinner';
import { Payment, TenantInfo, Member, PAYMENT_CATEGORY_LABELS, PAYMENT_TYPE_LABELS, INITIATED_BY_LABELS, getPlanName, getThisMonthRange } from './types';
import PaymentDetailModal from './PaymentDetailModal';
import RefundModal from './RefundModal';

interface PaymentHistorySectionProps {
  memberId: string;
  member: Member | null;
  tenants: TenantInfo[];
}

const PAYMENTS_PER_PAGE = 10;

export default function PaymentHistorySection({ memberId, member, tenants }: PaymentHistorySectionProps) {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [filterType, setFilterType] = useState<'thisMonth' | 'custom'>('thisMonth');
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({ start: '', end: '' });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [tempDateRange, setTempDateRange] = useState<{ start: string; end: string }>({ start: '', end: '' });
  const [searchId, setSearchId] = useState('');
  const [showFilter, setShowFilter] = useState(false);
  const [typeFilter, setTypeFilter] = useState<'all' | 'charge' | 'refund'>('all');
  const [tenantFilter, setTenantFilter] = useState<string>('all');
  const [planFilter, setPlanFilter] = useState<string>('all');
  const [actionDropdown, setActionDropdown] = useState<string | null>(null);
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number } | null>(null);
  const [detailModal, setDetailModal] = useState<Payment | null>(null);
  const [refundModal, setRefundModal] = useState<{ payment: Payment; availableAmount: number } | null>(null);

  const filterRef = useRef<HTMLDivElement>(null);
  const actionRef = useRef<HTMLDivElement>(null);

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/members/${memberId}?include=payments`);
      if (response.ok) {
        const data = await response.json();
        setPayments(data.payments || []);
      }
    } catch (error) {
      console.error('Failed to fetch payments:', error);
    } finally {
      setLoading(false);
    }
  }, [memberId]);

  useEffect(() => { fetchPayments(); }, [fetchPayments]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) setShowFilter(false);
      if (actionRef.current && !actionRef.current.contains(event.target as Node)) { setActionDropdown(null); setDropdownPosition(null); }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredPayments = payments.filter((payment) => {
    if (searchId) {
      const s = searchId.toLowerCase();
      const idMatch = payment.id.toLowerCase().includes(s);
      const orderMatch = (payment.orderId as string)?.toLowerCase().includes(s);
      const tenantName = tenants.find(t => t.tenantId === payment.tenantId)?.brandName || '';
      const tenantMatch = tenantName.toLowerCase().includes(s);
      if (!idMatch && !orderMatch && !tenantMatch) return false;
    }
    if (typeFilter !== 'all') {
      const isRefund = payment.transactionType === 'refund' || (payment.amount ?? 0) < 0;
      if (typeFilter === 'charge' && isRefund) return false;
      if (typeFilter === 'refund' && !isRefund) return false;
    }
    if (tenantFilter !== 'all' && payment.tenantId !== tenantFilter) return false;
    if (planFilter !== 'all' && payment.plan !== planFilter) return false;
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

  const totalPages = Math.ceil(filteredPayments.length / PAYMENTS_PER_PAGE);
  const paginated = filteredPayments.slice((page - 1) * PAYMENTS_PER_PAGE, page * PAYMENTS_PER_PAGE);

  const handleExport = () => {
    if (filteredPayments.length === 0) { alert('내보낼 결제 내역이 없습니다.'); return; }
    const exportData = filteredPayments.map((payment) => {
      const isRefund = payment.transactionType === 'refund' || (payment.amount ?? 0) < 0;
      const tenant = tenants.find(t => t.tenantId === payment.tenantId);
      return {
        '유형': isRefund ? '환불' : '결제',
        'ID': payment.orderId || payment.id,
        '날짜': payment.paidAt ? new Date(payment.paidAt).toLocaleString('ko-KR') : payment.createdAt ? new Date(payment.createdAt).toLocaleString('ko-KR') : '-',
        '매장': tenant?.brandName || '-',
        '플랜': payment.plan || '-',
        '금액': payment.amount ?? 0,
        '분류': payment.category ? PAYMENT_CATEGORY_LABELS[payment.category] || payment.category : '-',
        '거래 유형': payment.type ? PAYMENT_TYPE_LABELS[payment.type] || payment.type : '-',
        '처리자': payment.initiatedBy ? INITIATED_BY_LABELS[payment.initiatedBy] || payment.initiatedBy : '-',
        '상태': payment.status || '-',
      };
    });
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '결제 내역');
    worksheet['!cols'] = [{ wch: 8 }, { wch: 30 }, { wch: 22 }, { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 10 }, { wch: 10 }];
    const today = new Date().toISOString().split('T')[0];
    XLSX.writeFile(workbook, `결제내역_${member?.name || member?.email || 'unknown'}_${today}.xlsx`);
  };

  const openRefundModal = (payment: Payment) => {
    const originalAmount = Math.abs(payment.amount || 0);
    const refundedPayments = payments.filter(p => p.originalPaymentId === payment.id && (p.transactionType === 'refund' || p.category === 'refund'));
    const totalRefunded = refundedPayments.reduce((sum, p) => sum + Math.abs(p.amount || 0), 0);
    setRefundModal({ payment, availableAmount: originalAmount - totalRefunded });
    setActionDropdown(null);
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
        <div className="flex items-center justify-center py-10"><Spinner /></div>
      </div>
    );
  }

  return (
    <>
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
        <div className="flex flex-col gap-3 mb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-blue-600" />
              <h2 className="text-lg font-semibold">결제 내역</h2>
              <span className="text-sm text-gray-400">({filteredPayments.length}건)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative hidden sm:block">
                <input type="text" value={searchId} onChange={(e) => { setSearchId(e.target.value); setPage(1); }} placeholder="ID 또는 매장명 검색..." className="w-48 pl-8 pr-8 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                {searchId && <button onClick={() => { setSearchId(''); setPage(1); }} className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 hover:bg-gray-100 rounded"><Xmark className="w-3 h-3 text-gray-400" /></button>}
              </div>
              <button onClick={() => { setFilterType('thisMonth'); setDateRange({ start: '', end: '' }); setPage(1); }} className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${filterType === 'thisMonth' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>이번달</button>
              <button onClick={() => {
                const today = new Date().toISOString().split('T')[0];
                const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                setTempDateRange(dateRange.start ? dateRange : { start: monthAgo, end: today });
                setShowDatePicker(true);
              }} className={`text-xs rounded-lg transition-colors flex items-center gap-1 ${filterType === 'custom' && dateRange.start ? 'px-3 py-1.5 bg-blue-600 text-white' : 'p-1.5 bg-gray-100 text-gray-600 hover:bg-gray-200'}`} title="기간 선택">
                <Calendar className="w-4 h-4" />
                {filterType === 'custom' && dateRange.start && <span>{dateRange.start} ~ {dateRange.end}</span>}
              </button>
              <div className="relative" ref={filterRef}>
                <button onClick={() => setShowFilter(!showFilter)} className={`p-1.5 rounded-lg transition-colors ${typeFilter !== 'all' || tenantFilter !== 'all' || planFilter !== 'all' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`} title="필터"><Filter className="w-4 h-4" /></button>
                {showFilter && (
                  <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-xl shadow-lg border border-gray-200 z-50 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-medium text-gray-900">필터</span>
                      {(typeFilter !== 'all' || tenantFilter !== 'all' || planFilter !== 'all') && (
                        <button onClick={() => { setTypeFilter('all'); setTenantFilter('all'); setPlanFilter('all'); setPage(1); }} className="text-xs text-blue-600 hover:text-blue-700">초기화</button>
                      )}
                    </div>
                    <div className="mb-3">
                      <label className="block text-xs text-gray-500 mb-1.5">유형</label>
                      <div className="flex gap-1.5">
                        {[{ value: 'all', label: '전체' }, { value: 'charge', label: '결제' }, { value: 'refund', label: '환불' }].map((option) => (
                          <button key={option.value} onClick={() => { setTypeFilter(option.value as 'all' | 'charge' | 'refund'); setPage(1); }} className={`flex-1 px-2 py-1.5 text-xs rounded-lg transition-colors ${typeFilter === option.value ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{option.label}</button>
                        ))}
                      </div>
                    </div>
                    <div className="mb-3">
                      <label className="block text-xs text-gray-500 mb-1.5">매장</label>
                      <select value={tenantFilter} onChange={(e) => { setTenantFilter(e.target.value); setPage(1); }} className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                        <option value="all">전체</option>
                        {tenants.map((t) => <option key={t.tenantId} value={t.tenantId}>{t.brandName}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1.5">플랜</label>
                      <select value={planFilter} onChange={(e) => { setPlanFilter(e.target.value); setPage(1); }} className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent">
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
              <button onClick={handleExport} className="p-1.5 rounded-lg transition-colors bg-gray-100 text-gray-600 hover:bg-gray-200" title="xlsx로 내보내기"><Download className="w-4 h-4" /></button>
            </div>
          </div>
          <div className="flex items-center justify-end sm:hidden">
            <div className="relative w-full">
              <input type="text" value={searchId} onChange={(e) => { setSearchId(e.target.value); setPage(1); }} placeholder="ID 또는 매장명 검색..." className="w-full pl-8 pr-8 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              {searchId && <button onClick={() => { setSearchId(''); setPage(1); }} className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 hover:bg-gray-100 rounded"><Xmark className="w-3 h-3 text-gray-400" /></button>}
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
                    <th className="text-center px-2 py-3 text-sm font-medium text-gray-500 w-28">매장</th>
                    <th className="text-center px-2 py-3 text-sm font-medium text-gray-500 w-20">플랜</th>
                    <th className="text-center px-2 py-3 text-sm font-medium text-gray-500 w-14">유형</th>
                    <th className="text-center px-2 py-3 text-sm font-medium text-gray-500 w-20">금액</th>
                    <th className="text-center px-2 py-3 text-sm font-medium text-gray-500 w-14">처리자</th>
                    <th className="w-12 px-1 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paginated.map((payment, index) => {
                    const isRefund = payment.transactionType === 'refund' || payment.category === 'refund' || payment.status === 'refunded';
                    const paymentDate = payment.paidAt || payment.createdAt;
                    let formattedDate = '-';
                    if (paymentDate) {
                      const d = new Date(paymentDate);
                      formattedDate = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
                    }
                    const displayAmount = payment.amount < 0 ? payment.amount.toLocaleString() : (isRefund ? `-${payment.amount.toLocaleString()}` : payment.amount?.toLocaleString());
                    return (
                      <tr key={payment.id} className="hover:bg-gray-50">
                        <td className="px-2 py-3 text-sm text-gray-400 text-center">{(page - 1) * PAYMENTS_PER_PAGE + index + 1}</td>
                        <td className="px-2 py-3 text-xs text-gray-600 font-mono text-center truncate max-w-32" title={payment.orderId || payment.id}>{payment.orderId || payment.id}</td>
                        <td className="px-2 py-3 text-sm text-gray-600 text-center whitespace-nowrap">{formattedDate}</td>
                        <td className="px-2 py-3 text-sm text-gray-600 text-center truncate max-w-28" title={tenants.find(t => t.tenantId === payment.tenantId)?.brandName || '-'}>{tenants.find(t => t.tenantId === payment.tenantId)?.brandName || '-'}</td>
                        <td className="px-2 py-3 text-sm text-gray-600 text-center">{getPlanName(payment.planId || payment.plan)}</td>
                        <td className="px-2 py-3 text-sm text-gray-600 text-center">{isRefund ? '환불' : '결제'}</td>
                        <td className={`px-2 py-3 text-sm font-medium text-center whitespace-nowrap ${isRefund ? 'text-red-500' : 'text-gray-900'}`}>{displayAmount}원</td>
                        <td className="px-2 py-3 text-sm text-gray-600 text-center">{payment.initiatedBy ? INITIATED_BY_LABELS[payment.initiatedBy] || payment.initiatedBy : '-'}</td>
                        <td className="px-1 py-3 text-center">
                          <div className="relative" ref={actionDropdown === payment.id ? actionRef : undefined}>
                            <button onClick={(e) => {
                              if (actionDropdown === payment.id) { setActionDropdown(null); setDropdownPosition(null); } else {
                                const rect = e.currentTarget.getBoundingClientRect();
                                setDropdownPosition({ top: rect.bottom + 4, left: rect.right - 80 });
                                setActionDropdown(payment.id);
                              }
                            }} className="w-7 h-7 flex items-center justify-center text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"><MoreHoriz className="w-4 h-4" /></button>
                            {actionDropdown === payment.id && dropdownPosition && (
                              <div className="fixed bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-[9999] min-w-[80px]" style={{ top: dropdownPosition.top, left: dropdownPosition.left }}>
                                <button onClick={() => { setDetailModal(payment); setActionDropdown(null); setDropdownPosition(null); }} className="w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50">상세</button>
                                {!isRefund && payment.status === 'done' && (
                                  <button onClick={() => openRefundModal(payment)} className="w-full px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50">환불</button>
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
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 mt-2">
                <p className="text-sm text-gray-500">{filteredPayments.length}건 중 {(page - 1) * PAYMENTS_PER_PAGE + 1}-{Math.min(page * PAYMENTS_PER_PAGE, filteredPayments.length)}건</p>
                <div className="flex items-center gap-2">
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"><NavArrowLeft className="w-5 h-5" /></button>
                  <span className="text-sm text-gray-600">{page} / {totalPages}</span>
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"><NavArrowRight className="w-5 h-5" /></button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Date Picker Modal */}
      {showDatePicker && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-sm w-full p-6 shadow-xl">
            <h3 className="text-lg font-semibold mb-4">기간 선택</h3>
            <div className="space-y-4">
              <div><label className="block text-sm text-gray-600 mb-1">시작일</label><input type="date" value={tempDateRange.start} onChange={(e) => setTempDateRange({ ...tempDateRange, start: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500" /></div>
              <div><label className="block text-sm text-gray-600 mb-1">종료일</label><input type="date" value={tempDateRange.end} onChange={(e) => setTempDateRange({ ...tempDateRange, end: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500" /></div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowDatePicker(false)} className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50">취소</button>
              <button onClick={() => { if (tempDateRange.start && tempDateRange.end) { setFilterType('custom'); setDateRange(tempDateRange); setPage(1); setShowDatePicker(false); } }} disabled={!tempDateRange.start || !tempDateRange.end} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">적용</button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {detailModal && <PaymentDetailModal payment={detailModal} tenants={tenants} payments={payments} memberEmail={member?.email || ''} onClose={() => setDetailModal(null)} />}

      {/* Refund Modal */}
      {refundModal && <RefundModal payment={refundModal.payment} availableAmount={refundModal.availableAmount} onClose={() => setRefundModal(null)} onSuccess={() => { fetchPayments(); setRefundModal(null); }} />}
    </>
  );
}
