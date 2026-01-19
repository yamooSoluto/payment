'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { RefreshDouble, NavArrowLeft, NavArrowRight, Edit, Xmark, Check, Search, Filter, Download, Calendar, PageFlip, Spark } from 'iconoir-react';
import * as XLSX from 'xlsx';
import Spinner from '@/components/admin/Spinner';

type TabType = 'active' | 'history';

// 활성 구독 인터페이스
interface Subscription {
  id: string;
  tenantId: string;
  email: string;
  memberName: string;
  brandName: string;
  phone: string;
  plan: string;
  status: string;
  amount: number;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  nextBillingDate: string | null;
  createdAt: string | null;
  pricePolicy: string | null;
}

// 구독 내역 인터페이스
interface SubscriptionHistoryItem {
  recordId: string;
  tenantId: string;
  email: string;
  memberName: string;
  memberPhone: string;
  brandName: string;
  plan: string;
  status: string;
  amount: number;
  periodStart: string | null;
  periodEnd: string | null;
  billingDate: string | null;
  changeType: string;
  changedAt: string | null;
  changedBy: string;
  previousPlan: string | null;
  previousStatus: string | null;
  note: string | null;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function SubscriptionsPage() {
  const [activeTab, setActiveTab] = useState<TabType>('active');

  // === 활성 탭 상태 ===
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loadingActive, setLoadingActive] = useState(true);
  const [searchActive, setSearchActive] = useState('');
  const [planFilterActive, setPlanFilterActive] = useState<string[]>([]);
  const [statusFilterActive, setStatusFilterActive] = useState<string[]>([]);
  const [showActiveFilter, setShowActiveFilter] = useState(false);
  const [activeFilterPosition, setActiveFilterPosition] = useState<{ top: number; right: number } | null>(null);
  const activeFilterRef = useRef<HTMLDivElement>(null);
  const [paginationActive, setPaginationActive] = useState<Pagination>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });

  // === 전체(내역) 탭 상태 ===
  const [history, setHistory] = useState<SubscriptionHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [searchHistory, setSearchHistory] = useState('');
  const [planFilterHistory, setPlanFilterHistory] = useState<string[]>([]);
  const [statusFilterHistory, setStatusFilterHistory] = useState<string[]>([]);
  const [showHistoryFilter, setShowHistoryFilter] = useState(false);
  const [historyFilterPosition, setHistoryFilterPosition] = useState<{ top: number; right: number } | null>(null);
  const [historyFilterType, setHistoryFilterType] = useState<'all' | 'custom'>('all');
  const [historyDateRange, setHistoryDateRange] = useState<{ start: string; end: string }>({ start: '', end: '' });
  const [showHistoryDatePicker, setShowHistoryDatePicker] = useState(false);
  const [tempHistoryDateRange, setTempHistoryDateRange] = useState<{ start: string; end: string }>({ start: '', end: '' });
  const historyFilterRef = useRef<HTMLDivElement>(null);
  const [paginationHistory, setPaginationHistory] = useState<Pagination>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });

  // 편집 모달 상태
  const [editModal, setEditModal] = useState(false);
  const [editingSubscription, setEditingSubscription] = useState<Subscription | null>(null);
  const [editForm, setEditForm] = useState({
    brandName: '',
    plan: '',
    status: '',
    currentPeriodStart: '',
    currentPeriodEnd: '',
    nextBillingDate: '',
  });
  const [isSaving, setIsSaving] = useState(false);

  // === 활성 구독 데이터 fetch ===
  const fetchSubscriptions = useCallback(async () => {
    setLoadingActive(true);
    try {
      const params = new URLSearchParams({
        page: paginationActive.page.toString(),
        limit: paginationActive.limit.toString(),
        ...(searchActive && { search: searchActive }),
        ...(planFilterActive.length > 0 && { plan: planFilterActive.join(',') }),
        ...(statusFilterActive.length > 0 && { status: statusFilterActive.join(',') }),
      });

      const response = await fetch(`/api/admin/subscriptions/list?${params}`);
      if (response.ok) {
        const data = await response.json();
        setSubscriptions(data.subscriptions);
        setPaginationActive(data.pagination);
      }
    } catch (error) {
      console.error('Failed to fetch subscriptions:', error);
    } finally {
      setLoadingActive(false);
    }
  }, [paginationActive.page, paginationActive.limit, searchActive, planFilterActive, statusFilterActive]);

  // === 구독 내역 데이터 fetch ===
  const fetchHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const params = new URLSearchParams({
        page: paginationHistory.page.toString(),
        limit: paginationHistory.limit.toString(),
        ...(searchHistory && { search: searchHistory }),
        ...(planFilterHistory.length > 0 && { plan: planFilterHistory.join(',') }),
        ...(statusFilterHistory.length > 0 && { status: statusFilterHistory.join(',') }),
      });

      const response = await fetch(`/api/admin/subscriptions/history?${params}`);
      if (response.ok) {
        const data = await response.json();
        setHistory(data.history);
        setPaginationHistory(data.pagination);
      }
    } catch (error) {
      console.error('Failed to fetch subscription history:', error);
    } finally {
      setLoadingHistory(false);
    }
  }, [paginationHistory.page, paginationHistory.limit, searchHistory, planFilterHistory, statusFilterHistory]);

  // 탭 변경 시 데이터 fetch
  useEffect(() => {
    if (activeTab === 'active') {
      fetchSubscriptions();
    } else {
      fetchHistory();
    }
  }, [activeTab, fetchSubscriptions, fetchHistory]);

  // 활성 탭 필터 적용
  const handleFilterActive = () => {
    setPaginationActive(prev => ({ ...prev, page: 1 }));
    fetchSubscriptions();
  };

  // 히스토리 탭 필터 적용
  const handleFilterHistory = () => {
    setPaginationHistory(prev => ({ ...prev, page: 1 }));
    fetchHistory();
  };

  // 날짜 포맷
  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('ko-KR');
  };

  // 결제일 표시 (만료/해지 상태이거나 체험 중이면서 결제 예정이 없으면 - 표시)
  const formatBillingDate = (subscription: Subscription) => {
    const { status, nextBillingDate } = subscription;

    // 만료 또는 해지 상태면 결제일 없음
    if (status === 'expired' || status === 'canceled') {
      return '-';
    }

    // 체험 중이고 다음 결제일이 없으면 - 표시
    if ((status === 'trial' || status === 'trialing') && !nextBillingDate) {
      return '-';
    }

    return formatDate(nextBillingDate);
  };

  const formatDateForInput = (dateString: string | null) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toISOString().split('T')[0];
  };

  // 플랜명 변환
  const getPlanName = (plan: string) => {
    switch (plan) {
      case 'trial': return 'Trial';
      case 'basic': return 'Basic';
      case 'business': return 'Business';
      case 'enterprise': return 'Enterprise';
      default: return plan || '-';
    }
  };

  // 상태 뱃지
  const getStatusBadge = (status: string) => {
    const baseClass = "px-2 py-1 text-xs font-medium rounded-full";
    switch (status) {
      case 'active':
        return <span className={`${baseClass} bg-green-100 text-green-700`}>구독중</span>;
      case 'trial':
      case 'trialing':
        return <span className={`${baseClass} bg-blue-100 text-blue-700`}>체험</span>;
      case 'canceled':
        return <span className={`${baseClass} bg-red-100 text-red-700`}>해지</span>;
      case 'expired':
        return <span className={`${baseClass} bg-gray-100 text-gray-600`}>만료</span>;
      case 'completed':
        return <span className={`${baseClass} bg-gray-100 text-gray-500`}>완료</span>;
      case 'none':
        return <span className={`${baseClass} bg-yellow-100 text-yellow-700`}>미구독</span>;
      case 'deleted':
        return <span className={`${baseClass} bg-red-50 text-red-400`}>삭제</span>;
      default:
        return <span className={`${baseClass} bg-gray-100 text-gray-600`}>{status || '-'}</span>;
    }
  };

  // 변경 유형 라벨
  const getChangeTypeLabel = (changeType: string) => {
    const labels: Record<string, string> = {
      new: '신규',
      upgrade: '업그레이드',
      downgrade: '다운그레이드',
      renew: '갱신',
      cancel: '해지',
      expire: '만료',
      reactivate: '재활성화',
      admin_edit: '수정',
    };
    return labels[changeType] || changeType;
  };

  // 처리자 라벨
  const getChangedByLabel = (changedBy: string) => {
    const labels: Record<string, string> = {
      admin: '관리자',
      system: '시스템',
      user: '회원',
    };
    return labels[changedBy] || changedBy || '-';
  };

  // 편집 모달
  const openEditModal = (subscription: Subscription) => {
    setEditingSubscription(subscription);
    setEditForm({
      brandName: subscription.brandName || '',
      plan: subscription.plan || '',
      status: subscription.status || '',
      currentPeriodStart: formatDateForInput(subscription.currentPeriodStart),
      currentPeriodEnd: formatDateForInput(subscription.currentPeriodEnd),
      nextBillingDate: formatDateForInput(subscription.nextBillingDate),
    });
    setEditModal(true);
  };

  const handleSave = async () => {
    if (!editingSubscription) return;

    setIsSaving(true);
    try {
      const response = await fetch('/api/admin/subscriptions/list', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: editingSubscription.tenantId,
          brandName: editForm.brandName || null,
          plan: editForm.plan,
          status: editForm.status,
          currentPeriodStart: editForm.currentPeriodStart || null,
          currentPeriodEnd: editForm.currentPeriodEnd || null,
          nextBillingDate: editForm.nextBillingDate || null,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        alert('구독 정보가 수정되었습니다.');
        setEditModal(false);
        setEditingSubscription(null);
        fetchSubscriptions();
      } else {
        alert(data.error || '수정에 실패했습니다.');
      }
    } catch {
      alert('오류가 발생했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  // 히스토리 날짜 필터 모달
  const handleOpenHistoryDatePicker = () => {
    setTempHistoryDateRange(historyDateRange);
    setShowHistoryDatePicker(true);
  };

  const handleApplyHistoryDateRange = () => {
    setHistoryDateRange(tempHistoryDateRange);
    setHistoryFilterType('custom');
    setShowHistoryDatePicker(false);
    setPaginationHistory(prev => ({ ...prev, page: 1 }));
  };

  // 히스토리 xlsx 내보내기
  const handleExportHistory = () => {
    if (history.length === 0) {
      alert('내보낼 구독 내역이 없습니다.');
      return;
    }

    const exportData = history.map((record, index) => ({
      'No.': index + 1,
      '회원명': record.memberName || '-',
      '이메일': record.email || '-',
      '매장명': record.brandName || '-',
      '플랜': getPlanName(record.plan),
      '구분': getChangeTypeLabel(record.changeType),
      '시작일': formatDate(record.periodStart),
      '종료일': formatDate(record.periodEnd),
      '처리일': formatDate(record.changedAt),
      '상태': record.status === 'active' ? '구독중' : record.status === 'trialing' || record.status === 'trial' ? '체험' : record.status === 'completed' ? '완료' : record.status === 'canceled' ? '해지' : record.status === 'expired' ? '만료' : record.status || '-',
      '처리자': getChangedByLabel(record.changedBy),
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '구독 내역');

    const colWidths = [
      { wch: 5 },   // No.
      { wch: 12 },  // 회원명
      { wch: 25 },  // 이메일
      { wch: 15 },  // 매장명
      { wch: 10 },  // 플랜
      { wch: 12 },  // 구분
      { wch: 12 },  // 시작일
      { wch: 12 },  // 종료일
      { wch: 12 },  // 처리일
      { wch: 8 },   // 상태
      { wch: 8 },   // 처리자
    ];
    worksheet['!cols'] = colWidths;

    const today = new Date().toISOString().split('T')[0];
    const fileName = `구독내역_전체_${today}.xlsx`;

    XLSX.writeFile(workbook, fileName);
  };

  // 외부 클릭 감지 (필터 팝업 닫기)
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (activeFilterRef.current && !activeFilterRef.current.contains(event.target as Node)) {
        setShowActiveFilter(false);
        setActiveFilterPosition(null);
      }
      if (historyFilterRef.current && !historyFilterRef.current.contains(event.target as Node)) {
        setShowHistoryFilter(false);
        setHistoryFilterPosition(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="space-y-6 overflow-x-hidden">
      <div className="flex items-center justify-between flex-wrap gap-4 sticky left-0">
        <div className="flex items-center gap-3">
          <RefreshDouble className="w-8 h-8 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900">구독 내역</h1>
        </div>
      </div>

      {/* 탭 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 sticky left-0">
        <div className="flex border-b border-gray-100">
          <button
            onClick={() => setActiveTab('active')}
            className={`flex items-center gap-2 px-6 py-4 text-sm font-medium transition-colors ${
              activeTab === 'active'
                ? 'text-blue-600 border-b-2 border-blue-600 -mb-px'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Spark className="w-4 h-4" />
            활성
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-2 px-6 py-4 text-sm font-medium transition-colors ${
              activeTab === 'history'
                ? 'text-blue-600 border-b-2 border-blue-600 -mb-px'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <PageFlip className="w-4 h-4" />
            전체
          </button>
        </div>
      </div>

      {/* 활성 탭 컨텐츠 */}
      {activeTab === 'active' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <div className="flex flex-col gap-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-3">
                {/* 검색 및 필터 */}
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="relative">
                    <input
                      type="text"
                      value={searchActive}
                      onChange={(e) => setSearchActive(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleFilterActive()}
                      placeholder="회원명, 매장명, 이메일 검색..."
                      className="w-48 sm:w-64 pl-8 pr-8 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    {searchActive && (
                      <button
                        onClick={() => { setSearchActive(''); setPaginationActive(prev => ({ ...prev, page: 1 })); }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 hover:bg-gray-100 rounded"
                      >
                        <Xmark className="w-3 h-3 text-gray-400" />
                      </button>
                    )}
                  </div>
                  <div className="relative" ref={activeFilterRef}>
                    <button
                      onClick={(e) => {
                        if (showActiveFilter) {
                          setShowActiveFilter(false);
                          setActiveFilterPosition(null);
                        } else {
                          const rect = e.currentTarget.getBoundingClientRect();
                          setActiveFilterPosition({
                            top: rect.bottom + 8,
                            right: window.innerWidth - rect.right,
                          });
                          setShowActiveFilter(true);
                        }
                      }}
                      className={`p-1.5 rounded-lg transition-colors ${
                        (planFilterActive.length > 0 || statusFilterActive.length > 0)
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                      title="필터"
                    >
                      <Filter className="w-4 h-4" />
                    </button>
                    {showActiveFilter && activeFilterPosition && (
                      <div
                        className="fixed bg-white border border-gray-200 rounded-lg shadow-lg p-4 min-w-[240px]"
                        style={{ top: activeFilterPosition.top, right: activeFilterPosition.right, zIndex: 9999 }}
                      >
                        <div className="space-y-4">
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-2">플랜</label>
                            <div className="space-y-1.5">
                              {[
                                { value: 'none', label: '미지정' },
                                { value: 'trial', label: 'Trial' },
                                { value: 'basic', label: 'Basic' },
                                { value: 'business', label: 'Business' },
                              ].map(option => (
                                <label key={option.value} className="flex items-center gap-2 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={planFilterActive.includes(option.value)}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setPlanFilterActive(prev => [...prev, option.value]);
                                      } else {
                                        setPlanFilterActive(prev => prev.filter(v => v !== option.value));
                                      }
                                      setPaginationActive(prev => ({ ...prev, page: 1 }));
                                    }}
                                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                  />
                                  <span className="text-sm text-gray-700">{option.label}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-2">상태</label>
                            <div className="space-y-1.5">
                              {[
                                { value: 'none', label: '미구독' },
                                { value: 'trialing', label: '체험' },
                                { value: 'active', label: '구독중' },
                                { value: 'canceled', label: '해지' },
                                { value: 'expired', label: '만료' },
                                { value: 'deleted', label: '삭제' },
                              ].map(option => (
                                <label key={option.value} className="flex items-center gap-2 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={statusFilterActive.includes(option.value)}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setStatusFilterActive(prev => [...prev, option.value]);
                                      } else {
                                        setStatusFilterActive(prev => prev.filter(v => v !== option.value));
                                      }
                                      setPaginationActive(prev => ({ ...prev, page: 1 }));
                                    }}
                                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                  />
                                  <span className="text-sm text-gray-700">{option.label}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              setPlanFilterActive([]);
                              setStatusFilterActive([]);
                              setPaginationActive(prev => ({ ...prev, page: 1 }));
                            }}
                            className="w-full text-xs text-gray-500 hover:text-gray-700 py-1"
                          >
                            필터 초기화
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={handleFilterActive}
                    className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    검색
                  </button>
                </div>
              </div>
            </div>
          </div>
            {loadingActive ? (
              <div className="flex items-center justify-center py-20">
                <Spinner size="md" />
              </div>
            ) : subscriptions.length === 0 ? (
              <div className="text-center py-20 text-gray-500">
                구독 정보가 없습니다.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-max">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="text-center px-2 py-3 text-sm font-medium text-gray-500 w-10">No.</th>
                      <th className="text-center px-2 py-3 text-sm font-medium text-gray-500">회원</th>
                      <th className="text-center px-2 py-3 text-sm font-medium text-gray-500">이메일</th>
                      <th className="text-center px-2 py-3 text-sm font-medium text-gray-500">매장</th>
                      <th className="text-center px-2 py-3 text-sm font-medium text-gray-500">플랜</th>
                      <th className="text-center px-2 py-3 text-sm font-medium text-gray-500">상태</th>
                      <th className="text-center px-2 py-3 text-sm font-medium text-gray-500">시작일</th>
                      <th className="text-center px-2 py-3 text-sm font-medium text-gray-500">종료일</th>
                      <th className="text-center px-2 py-3 text-sm font-medium text-gray-500">결제일</th>
                      <th className="text-center px-2 py-3 text-sm font-medium text-gray-500">수정</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {subscriptions.map((subscription, index) => (
                      <tr key={subscription.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-2 py-3 text-sm text-gray-400 text-center">
                          {(paginationActive.page - 1) * paginationActive.limit + index + 1}
                        </td>
                        <td className="px-2 py-3 text-sm text-gray-600 text-center">
                          {subscription.memberName || '-'}
                        </td>
                        <td className="px-2 py-3 text-sm text-gray-600 text-center">
                          {subscription.email || '-'}
                        </td>
                        <td className="px-2 py-3 text-sm font-medium text-gray-900 text-center">
                          {subscription.brandName}
                        </td>
                        <td className="px-2 py-3 text-sm text-gray-600 text-center">
                          {getPlanName(subscription.plan)}
                        </td>
                        <td className="px-2 py-3 text-center">
                          {getStatusBadge(subscription.status)}
                        </td>
                        <td className="px-2 py-3 text-sm text-gray-600 text-center whitespace-nowrap">
                          {formatDate(subscription.currentPeriodStart)}
                        </td>
                        <td className="px-2 py-3 text-sm text-gray-600 text-center whitespace-nowrap">
                          {formatDate(subscription.currentPeriodEnd)}
                        </td>
                        <td className="px-2 py-3 text-sm text-gray-600 text-center whitespace-nowrap">
                          {formatBillingDate(subscription)}
                        </td>
                        <td className="px-2 py-3 text-center">
                          <button
                            onClick={() => openEditModal(subscription)}
                            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                            title="수정"
                          >
                            <Edit className="w-4 h-4 text-gray-600" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* 페이지네이션 */}
            {paginationActive.totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 sticky left-0">
                <p className="text-sm text-gray-500">
                  {paginationActive.total}개 중 {(paginationActive.page - 1) * paginationActive.limit + 1}-
                  {Math.min(paginationActive.page * paginationActive.limit, paginationActive.total)}개 표시
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPaginationActive(prev => ({ ...prev, page: prev.page - 1 }))}
                    disabled={paginationActive.page === 1}
                    className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <NavArrowLeft className="w-5 h-5" />
                  </button>
                  <span className="text-sm text-gray-600">
                    {paginationActive.page} / {paginationActive.totalPages}
                  </span>
                  <button
                    onClick={() => setPaginationActive(prev => ({ ...prev, page: prev.page + 1 }))}
                    disabled={paginationActive.page === paginationActive.totalPages}
                    className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <NavArrowRight className="w-5 h-5" />
                  </button>
                </div>
              </div>
            )}
        </div>
      )}

      {/* 전체(내역) 탭 컨텐츠 */}
      {activeTab === 'history' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <div className="flex flex-col gap-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-3">
                {/* 검색 및 필터 */}
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="relative">
                    <input
                      type="text"
                      value={searchHistory}
                      onChange={(e) => setSearchHistory(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleFilterHistory()}
                      placeholder="회원명, 매장명, 이메일 검색..."
                      className="w-48 sm:w-64 pl-8 pr-8 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    {searchHistory && (
                      <button
                        onClick={() => { setSearchHistory(''); setPaginationHistory(prev => ({ ...prev, page: 1 })); }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 hover:bg-gray-100 rounded"
                      >
                        <Xmark className="w-3 h-3 text-gray-400" />
                      </button>
                    )}
                  </div>
                  <button
                    onClick={() => { setHistoryFilterType('all'); setHistoryDateRange({ start: '', end: '' }); setPaginationHistory(prev => ({ ...prev, page: 1 })); }}
                    className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                      historyFilterType === 'all'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    전체
                  </button>
                  <button
                    onClick={handleOpenHistoryDatePicker}
                    className={`text-xs rounded-lg transition-colors flex items-center gap-1 ${
                      historyFilterType === 'custom' && historyDateRange.start
                        ? 'px-3 py-1.5 bg-blue-600 text-white'
                        : 'p-1.5 bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                    title="기간 선택"
                  >
                    <Calendar className="w-4 h-4" />
                    {historyFilterType === 'custom' && historyDateRange.start && (
                      <span>{historyDateRange.start} ~ {historyDateRange.end}</span>
                    )}
                  </button>
                  <div className="relative" ref={historyFilterRef}>
                    <button
                      onClick={(e) => {
                        if (showHistoryFilter) {
                          setShowHistoryFilter(false);
                          setHistoryFilterPosition(null);
                        } else {
                          const rect = e.currentTarget.getBoundingClientRect();
                          setHistoryFilterPosition({
                            top: rect.bottom + 8,
                            right: window.innerWidth - rect.right,
                          });
                          setShowHistoryFilter(true);
                        }
                      }}
                      className={`p-1.5 rounded-lg transition-colors ${
                        (planFilterHistory.length > 0 || statusFilterHistory.length > 0)
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                      title="필터"
                    >
                      <Filter className="w-4 h-4" />
                    </button>
                    {showHistoryFilter && historyFilterPosition && (
                      <div
                        className="fixed bg-white border border-gray-200 rounded-lg shadow-lg p-4 min-w-[240px]"
                        style={{ top: historyFilterPosition.top, right: historyFilterPosition.right, zIndex: 9999 }}
                      >
                        <div className="space-y-4">
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-2">플랜</label>
                            <div className="space-y-1.5">
                              {[
                                { value: 'trial', label: 'Trial' },
                                { value: 'basic', label: 'Basic' },
                                { value: 'business', label: 'Business' },
                                { value: 'enterprise', label: 'Enterprise' },
                              ].map(option => (
                                <label key={option.value} className="flex items-center gap-2 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={planFilterHistory.includes(option.value)}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setPlanFilterHistory(prev => [...prev, option.value]);
                                      } else {
                                        setPlanFilterHistory(prev => prev.filter(v => v !== option.value));
                                      }
                                      setPaginationHistory(prev => ({ ...prev, page: 1 }));
                                    }}
                                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                  />
                                  <span className="text-sm text-gray-700">{option.label}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-2">상태</label>
                            <div className="space-y-1.5">
                              {[
                                { value: 'trialing', label: '체험' },
                                { value: 'active', label: '구독중' },
                                { value: 'completed', label: '완료' },
                                { value: 'expired', label: '만료' },
                                { value: 'canceled', label: '해지' },
                              ].map(option => (
                                <label key={option.value} className="flex items-center gap-2 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={statusFilterHistory.includes(option.value)}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setStatusFilterHistory(prev => [...prev, option.value]);
                                      } else {
                                        setStatusFilterHistory(prev => prev.filter(v => v !== option.value));
                                      }
                                      setPaginationHistory(prev => ({ ...prev, page: 1 }));
                                    }}
                                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                  />
                                  <span className="text-sm text-gray-700">{option.label}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              setPlanFilterHistory([]);
                              setStatusFilterHistory([]);
                              setPaginationHistory(prev => ({ ...prev, page: 1 }));
                            }}
                            className="w-full text-xs text-gray-500 hover:text-gray-700 py-1"
                          >
                            필터 초기화
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={handleExportHistory}
                    className="p-1.5 rounded-lg transition-colors bg-gray-100 text-gray-600 hover:bg-gray-200"
                    title="xlsx로 내보내기"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleFilterHistory}
                    className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    검색
                  </button>
                </div>
              </div>
            </div>
          </div>

          {loadingHistory ? (
            <div className="flex items-center justify-center py-20">
              <Spinner size="md" />
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-20 text-gray-500">
              구독 내역이 없습니다.
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-max">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="text-center px-2 py-3 text-sm font-medium text-gray-500 w-10">No.</th>
                      <th className="text-center px-2 py-3 text-sm font-medium text-gray-500 w-20">회원</th>
                      <th className="text-center px-2 py-3 text-sm font-medium text-gray-500 w-40">이메일</th>
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
                    {history.map((record, index) => (
                      <tr key={record.recordId} className="hover:bg-gray-50">
                        <td className="px-2 py-3 text-sm text-gray-400 text-center">
                          {(paginationHistory.page - 1) * paginationHistory.limit + index + 1}
                        </td>
                        <td className="px-2 py-3 text-sm text-gray-600 text-center truncate max-w-20" title={record.memberName}>
                          {record.memberName || '-'}
                        </td>
                        <td className="px-2 py-3 text-sm text-gray-600 text-center truncate max-w-40" title={record.email}>
                          {record.email || '-'}
                        </td>
                        <td className="px-2 py-3 text-sm text-gray-600 text-center truncate max-w-28" title={record.brandName}>
                          {record.brandName || '-'}
                        </td>
                        <td className="px-2 py-3 text-sm text-gray-600 text-center">
                          {getPlanName(record.plan)}
                        </td>
                        <td className="px-2 py-3 text-sm text-gray-600 text-center">
                          {getChangeTypeLabel(record.changeType)}
                        </td>
                        <td className="px-2 py-3 text-sm text-gray-600 text-center whitespace-nowrap">
                          {formatDate(record.periodStart)}
                        </td>
                        <td className="px-2 py-3 text-sm text-gray-600 text-center whitespace-nowrap">
                          {formatDate(record.periodEnd)}
                        </td>
                        <td className="px-2 py-3 text-sm text-gray-600 text-center whitespace-nowrap">
                          {formatDate(record.changedAt)}
                        </td>
                        <td className="px-2 py-3 text-center">
                          {getStatusBadge(record.status)}
                        </td>
                        <td className="px-2 py-3 text-sm text-gray-600 text-center">
                          {getChangedByLabel(record.changedBy)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* 페이지네이션 */}
              {paginationHistory.totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                  <p className="text-sm text-gray-500">
                    {paginationHistory.total}건 중 {(paginationHistory.page - 1) * paginationHistory.limit + 1}-
                    {Math.min(paginationHistory.page * paginationHistory.limit, paginationHistory.total)}건
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPaginationHistory((p) => ({ ...p, page: Math.max(1, p.page - 1) }))}
                      disabled={paginationHistory.page === 1}
                      className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <NavArrowLeft className="w-5 h-5" />
                    </button>
                    <span className="text-sm text-gray-600">
                      {paginationHistory.page} / {paginationHistory.totalPages}
                    </span>
                    <button
                      onClick={() => setPaginationHistory((p) => ({ ...p, page: Math.min(p.totalPages, p.page + 1) }))}
                      disabled={paginationHistory.page === paginationHistory.totalPages}
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
      )}

      {/* 편집 모달 */}
      {editModal && editingSubscription && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setEditModal(false)}
          />
          <div className="relative bg-white rounded-xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto p-6">
            <button
              onClick={() => setEditModal(false)}
              className="sticky top-0 float-right p-2 hover:bg-gray-100 rounded-full z-10"
            >
              <Xmark className="w-5 h-5 text-gray-500" />
            </button>

            <h3 className="text-lg font-bold text-gray-900 mb-4">구독 정보 수정</h3>

            {/* 회원 정보 (읽기 전용) */}
            <div className="bg-gray-50 rounded-lg p-3 mb-4 text-sm space-y-1">
              <div>
                <span className="text-gray-500">이메일: </span>
                <span className="font-medium">{editingSubscription.email || '-'}</span>
              </div>
              <div>
                <span className="text-gray-500">이름: </span>
                <span className="font-medium">{editingSubscription.memberName || '-'}</span>
              </div>
              <div>
                <span className="text-gray-500">연락처: </span>
                <span className="font-medium">{editingSubscription.phone || '-'}</span>
              </div>
            </div>

            {/* 매장 정보 */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                매장명
              </label>
              <input
                type="text"
                value={editForm.brandName}
                onChange={(e) => setEditForm(prev => ({ ...prev, brandName: e.target.value }))}
                placeholder="매장명 입력"
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* 플랜 선택 */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                플랜
              </label>
              <select
                value={editForm.plan}
                onChange={(e) => setEditForm(prev => ({ ...prev, plan: e.target.value }))}
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">선택</option>
                <option value="trial">Trial</option>
                <option value="basic">Basic</option>
                <option value="business">Business</option>
              </select>
            </div>

            {/* 상태 선택 */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                상태
              </label>
              <select
                value={editForm.status}
                onChange={(e) => setEditForm(prev => ({ ...prev, status: e.target.value }))}
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">선택</option>
                <option value="none">미구독</option>
                <option value="trialing">체험</option>
                <option value="active">구독중</option>
                <option value="canceled">해지</option>
                <option value="expired">만료</option>
                <option value="deleted">삭제</option>
              </select>
            </div>

            {/* 시작일 */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                시작일
              </label>
              <input
                type="date"
                value={editForm.currentPeriodStart}
                onChange={(e) => setEditForm(prev => ({ ...prev, currentPeriodStart: e.target.value }))}
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* 종료일 */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                종료일
              </label>
              <input
                type="date"
                value={editForm.currentPeriodEnd}
                onChange={(e) => setEditForm(prev => ({ ...prev, currentPeriodEnd: e.target.value }))}
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* 다음 결제일 */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                다음 결제일
              </label>
              <input
                type="date"
                value={editForm.nextBillingDate}
                onChange={(e) => setEditForm(prev => ({ ...prev, nextBillingDate: e.target.value }))}
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* 버튼 */}
            <div className="flex gap-3">
              <button
                onClick={() => setEditModal(false)}
                className="flex-1 py-3 px-4 rounded-lg font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex-1 py-3 px-4 rounded-lg font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isSaving ? (
                  <>
                    <RefreshDouble className="w-4 h-4 animate-spin" />
                    저장 중...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    저장
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 구독 내역 기간 선택 모달 */}
      {showHistoryDatePicker && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-sm mx-4 shadow-xl">
            <h3 className="text-lg font-semibold mb-4">기간 선택</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">시작일</label>
                <input
                  type="date"
                  value={tempHistoryDateRange.start}
                  onChange={(e) => setTempHistoryDateRange(prev => ({ ...prev, start: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">종료일</label>
                <input
                  type="date"
                  value={tempHistoryDateRange.end}
                  onChange={(e) => setTempHistoryDateRange(prev => ({ ...prev, end: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setShowHistoryDatePicker(false)}
                  className="flex-1 py-2 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={handleApplyHistoryDateRange}
                  disabled={!tempHistoryDateRange.start || !tempHistoryDateRange.end}
                  className="flex-1 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  적용
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
