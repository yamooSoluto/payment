'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { PageFlip, Calendar, Search, Xmark, Filter, Download, NavArrowLeft, NavArrowRight } from 'iconoir-react';
import * as XLSX from 'xlsx';
import Spinner from '@/components/admin/Spinner';
import { SubscriptionHistoryItem, TenantInfo, Member, CHANGE_TYPE_LABELS, CHANGED_BY_LABELS, getPlanName, getSubStatusLabel, getThisMonthRange } from './types';

interface SubscriptionHistorySectionProps {
  memberId: string;
  member: Member | null;
  tenants: TenantInfo[];
}

const SUBS_PER_PAGE = 10;

export default function SubscriptionHistorySection({ memberId, member, tenants }: SubscriptionHistorySectionProps) {
  const [history, setHistory] = useState<SubscriptionHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [filterType, setFilterType] = useState<'all' | 'thisMonth' | 'custom'>('all');
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({ start: '', end: '' });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [tempDateRange, setTempDateRange] = useState<{ start: string; end: string }>({ start: '', end: '' });
  const [search, setSearch] = useState('');
  const [showFilter, setShowFilter] = useState(false);
  const [tenantFilter, setTenantFilter] = useState<string>('all');
  const [planFilter, setPlanFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filterRef = useRef<HTMLDivElement>(null);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/members/${memberId}?include=history`);
      if (response.ok) {
        const data = await response.json();
        setHistory(data.subscriptionHistory || []);
      }
    } catch (error) {
      console.error('Failed to fetch subscription history:', error);
    } finally {
      setLoading(false);
    }
  }, [memberId]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) setShowFilter(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filtered = history.filter((record) => {
    if (search && !record.brandName.toLowerCase().includes(search.toLowerCase())) return false;
    if (tenantFilter !== 'all' && record.tenantId !== tenantFilter) return false;
    if (planFilter !== 'all' && record.plan !== planFilter) return false;
    if (statusFilter !== 'all' && record.status !== statusFilter) return false;
    if (filterType !== 'all' && record.changedAt) {
      const changedDate = new Date(record.changedAt);
      if (filterType === 'thisMonth') {
        const { start, end } = getThisMonthRange();
        if (changedDate < start || changedDate > end) return false;
      } else if (filterType === 'custom' && dateRange.start && dateRange.end) {
        const filterStart = new Date(dateRange.start);
        const filterEnd = new Date(dateRange.end);
        filterEnd.setHours(23, 59, 59, 999);
        if (changedDate < filterStart || changedDate > filterEnd) return false;
      }
    }
    return true;
  });

  const totalPages = Math.ceil(filtered.length / SUBS_PER_PAGE);
  const paginated = filtered.slice((page - 1) * SUBS_PER_PAGE, page * SUBS_PER_PAGE);

  const handleExport = () => {
    if (filtered.length === 0) { alert('내보낼 구독 내역이 없습니다.'); return; }
    const exportData = filtered.map((record) => ({
      '매장': record.brandName,
      '플랜': getPlanName(record.plan),
      '구분': CHANGE_TYPE_LABELS[record.changeType] || record.changeType,
      '시작일': record.periodStart ? new Date(record.periodStart).toLocaleDateString('ko-KR') : '-',
      '종료일': record.periodEnd ? new Date(record.periodEnd).toLocaleDateString('ko-KR') : '-',
      '처리일': record.changedAt ? new Date(record.changedAt).toLocaleDateString('ko-KR') : '-',
      '상태': getSubStatusLabel(record.status),
      '처리자': CHANGED_BY_LABELS[record.changedBy] || record.changedBy || '-',
      '금액': record.amount ?? 0,
      '이전 플랜': record.previousPlan ? getPlanName(record.previousPlan) : '-',
    }));
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '구독 내역');
    worksheet['!cols'] = [{ wch: 20 }, { wch: 12 }, { wch: 14 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 12 }];
    const today = new Date().toISOString().split('T')[0];
    XLSX.writeFile(workbook, `구독내역_${member?.name || member?.email || 'unknown'}_${today}.xlsx`);
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
              <PageFlip className="w-5 h-5 text-blue-600" />
              <h2 className="text-lg font-semibold">구독 내역</h2>
              <span className="text-sm text-gray-400">({filtered.length}건)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative hidden sm:block">
                <input type="text" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="매장명 검색..." className="w-48 pl-8 pr-8 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                {search && <button onClick={() => { setSearch(''); setPage(1); }} className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 hover:bg-gray-100 rounded"><Xmark className="w-3 h-3 text-gray-400" /></button>}
              </div>
              <button onClick={() => { setFilterType('all'); setDateRange({ start: '', end: '' }); setPage(1); }} className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${filterType === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>전체</button>
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
                <button onClick={() => setShowFilter(!showFilter)} className={`p-1.5 rounded-lg transition-colors ${(tenantFilter !== 'all' || planFilter !== 'all' || statusFilter !== 'all') ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`} title="필터"><Filter className="w-4 h-4" /></button>
                {showFilter && (
                  <div className="absolute right-0 top-full mt-2 bg-white border border-gray-200 rounded-lg shadow-lg p-4 z-10 min-w-[200px]">
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">매장</label>
                        <select value={tenantFilter} onChange={(e) => { setTenantFilter(e.target.value); setPage(1); }} className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5">
                          <option value="all">전체</option>
                          {tenants.map((t) => <option key={t.tenantId} value={t.tenantId}>{t.brandName}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">플랜</label>
                        <select value={planFilter} onChange={(e) => { setPlanFilter(e.target.value); setPage(1); }} className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5">
                          <option value="all">전체</option>
                          <option value="trial">Trial</option>
                          <option value="basic">Basic</option>
                          <option value="business">Business</option>
                          <option value="enterprise">Enterprise</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">상태</label>
                        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5">
                          <option value="all">전체</option>
                          <option value="trialing">체험</option>
                          <option value="active">구독중</option>
                          <option value="pending_cancel">해지예정</option>
                          <option value="past_due">결제실패</option>
                          <option value="suspended">일시정지</option>
                          <option value="completed">완료</option>
                          <option value="expired">만료</option>
                          <option value="canceled">해지</option>
                        </select>
                      </div>
                      <button onClick={() => { setTenantFilter('all'); setPlanFilter('all'); setStatusFilter('all'); setPage(1); }} className="w-full text-xs text-gray-500 hover:text-gray-700 py-1">필터 초기화</button>
                    </div>
                  </div>
                )}
              </div>
              <button onClick={handleExport} className="p-1.5 rounded-lg transition-colors bg-gray-100 text-gray-600 hover:bg-gray-200" title="xlsx로 내보내기"><Download className="w-4 h-4" /></button>
            </div>
          </div>
          <div className="flex items-center justify-end sm:hidden">
            <div className="relative w-full">
              <input type="text" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="매장명 검색..." className="w-full pl-8 pr-8 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              {search && <button onClick={() => { setSearch(''); setPage(1); }} className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 hover:bg-gray-100 rounded"><Xmark className="w-3 h-3 text-gray-400" /></button>}
            </div>
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className="text-gray-500 text-center py-6 text-sm">구독 내역이 없습니다.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-max">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-center px-2 py-3 text-sm font-medium text-gray-500 w-10">No.</th>
                    <th className="text-center px-2 py-3 text-sm font-medium text-gray-500 w-28">매장</th>
                    <th className="text-center px-2 py-3 text-sm font-medium text-gray-500 w-20">플랜</th>
                    <th className="text-center px-2 py-3 text-sm font-medium text-gray-500 w-20">구분</th>
                    <th className="text-center px-2 py-3 text-sm font-medium text-gray-500 w-24">시작일</th>
                    <th className="text-center px-2 py-3 text-sm font-medium text-gray-500 w-24">종료일</th>
                    <th className="text-center px-2 py-3 text-sm font-medium text-gray-500 w-24">처리일</th>
                    <th className="text-center px-2 py-3 text-sm font-medium text-gray-500 w-16">상태</th>
                    <th className="text-center px-2 py-3 text-sm font-medium text-gray-500 w-16">처리자</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paginated.map((record, index) => {
                    const statusLabel = getSubStatusLabel(record.status);
                    const statusColor = record.status === 'active' ? 'text-green-600' :
                      record.status === 'trialing' || record.status === 'trial' ? 'text-blue-600' :
                      record.status === 'canceled' || record.status === 'expired' ? 'text-red-500' :
                      'text-gray-500';
                    return (
                      <tr key={record.recordId} className="hover:bg-gray-50">
                        <td className="px-2 py-3 text-sm text-gray-400 text-center">{(page - 1) * SUBS_PER_PAGE + index + 1}</td>
                        <td className="px-2 py-3 text-sm text-gray-600 text-center truncate max-w-28" title={record.brandName}>{record.brandName}</td>
                        <td className="px-2 py-3 text-sm text-gray-600 text-center">{getPlanName(record.plan)}</td>
                        <td className="px-2 py-3 text-sm text-gray-600 text-center">{CHANGE_TYPE_LABELS[record.changeType] || record.changeType}</td>
                        <td className="px-2 py-3 text-sm text-gray-600 text-center whitespace-nowrap">{record.periodStart ? new Date(record.periodStart).toLocaleDateString('ko-KR') : '-'}</td>
                        <td className="px-2 py-3 text-sm text-gray-600 text-center whitespace-nowrap">{record.periodEnd ? new Date(record.periodEnd).toLocaleDateString('ko-KR') : '-'}</td>
                        <td className="px-2 py-3 text-sm text-gray-600 text-center whitespace-nowrap">{record.changedAt ? new Date(record.changedAt).toLocaleDateString('ko-KR') : '-'}</td>
                        <td className={`px-2 py-3 text-sm font-medium text-center ${statusColor}`}>{statusLabel}</td>
                        <td className="px-2 py-3 text-sm text-gray-600 text-center">{record.changedBy === 'admin' ? '관리자' : record.changedBy === 'system' ? '시스템' : record.changedBy === 'user' ? '회원' : record.changedBy || '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 mt-2">
                <p className="text-sm text-gray-500">{filtered.length}건 중 {(page - 1) * SUBS_PER_PAGE + 1}-{Math.min(page * SUBS_PER_PAGE, filtered.length)}건</p>
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
    </>
  );
}
