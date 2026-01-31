'use client';

import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Timer, NavArrowLeft, NavArrowRight, Xmark, Search, Filter, Download, Calendar, PageFlip, Spark, SortUp, SortDown, MoreHoriz, FastRightCircle, WarningCircle, Plus } from 'iconoir-react';
import useSWR from 'swr';
import Spinner from '@/components/admin/Spinner';
import { SubscriptionActionModal, SubscriptionActionType, SubscriptionInfo, canStartSubscription } from '@/components/admin/subscription';


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
  hasBillingKey: boolean;
  pendingPlan: string | null;
  pendingAmount: number | null;
  cancelAt: string | null;
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
  const searchParams = useSearchParams();
  const router = useRouter();

  // URL에서 탭 상태 읽기
  const tabFromUrl = searchParams.get('tab') as TabType | null;
  const [activeTab, setActiveTab] = useState<TabType>(
    tabFromUrl === 'history' ? 'history' : 'active'
  );

  // 탭 변경 시 URL 업데이트
  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', tab);
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  // === 활성 탭 상태 ===
  const [searchActive, setSearchActive] = useState('');
  const [searchActiveQuery, setSearchActiveQuery] = useState('');
  const [planFilterActive, setPlanFilterActive] = useState<string[]>([]);
  const [statusFilterActive, setStatusFilterActive] = useState<string[]>([]);
  const [showActiveFilter, setShowActiveFilter] = useState(false);
  const [activeFilterPosition, setActiveFilterPosition] = useState<{ top: number; right: number } | null>(null);
  const activeFilterRef = useRef<HTMLDivElement>(null);
  const [activePageNum, setActivePageNum] = useState(1);
  const [paginationActive, setPaginationActive] = useState<Pagination>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });

  // 활성 탭 정렬 상태 (기본값: 시작일 오름차순)
  type SortField = 'currentPeriodStart' | 'currentPeriodEnd' | 'nextBillingDate';
  type SortOrder = 'asc' | 'desc';
  const [activeSortField, setActiveSortField] = useState<SortField>('currentPeriodStart');
  const [activeSortOrder, setActiveSortOrder] = useState<SortOrder>('asc');

  // === 전체(내역) 탭 상태 ===
  const [searchHistory, setSearchHistory] = useState('');
  const [searchHistoryQuery, setSearchHistoryQuery] = useState('');
  const [planFilterHistory, setPlanFilterHistory] = useState<string[]>([]);
  const [statusFilterHistory, setStatusFilterHistory] = useState<string[]>([]);
  const [showHistoryFilter, setShowHistoryFilter] = useState(false);
  const [historyFilterPosition, setHistoryFilterPosition] = useState<{ top: number; right: number } | null>(null);
  const [historyFilterType, setHistoryFilterType] = useState<'all' | 'custom'>('all');
  const [historyDateRange, setHistoryDateRange] = useState<{ start: string; end: string }>({ start: '', end: '' });
  const [showHistoryDatePicker, setShowHistoryDatePicker] = useState(false);
  const [tempHistoryDateRange, setTempHistoryDateRange] = useState<{ start: string; end: string }>({ start: '', end: '' });
  const historyFilterRef = useRef<HTMLDivElement>(null);
  const [historyPageNum, setHistoryPageNum] = useState(1);
  const [paginationHistory, setPaginationHistory] = useState<Pagination>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });

  // === 활성 구독 SWR ===
  const activeParams = new URLSearchParams({
    page: activePageNum.toString(),
    limit: '20',
    ...(searchActiveQuery && { search: searchActiveQuery }),
    ...(planFilterActive.length > 0 && { plan: planFilterActive.join(',') }),
    ...(statusFilterActive.length > 0 && { status: statusFilterActive.join(',') }),
  });
  const activeUrl = `/api/admin/subscriptions/list?${activeParams}`;
  const { data: activeData, isLoading: loadingActive, mutate: mutateActive } = useSWR(
    activeTab === 'active' ? activeUrl : null
  );
  const subscriptions: Subscription[] = activeData?.subscriptions ?? [];

  useEffect(() => {
    if (activeData?.pagination) {
      setPaginationActive(activeData.pagination);
    }
  }, [activeData]);

  // 정렬 토글 핸들러
  const handleActiveSort = (field: SortField) => {
    if (activeSortField === field) {
      // 같은 필드 클릭 시 정렬 순서 토글
      setActiveSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      // 다른 필드 클릭 시 해당 필드로 변경, 오름차순 시작
      setActiveSortField(field);
      setActiveSortOrder('asc');
    }
  };

  // 정렬된 구독 목록 (null 값은 맨 뒤로)
  const sortedSubscriptions = [...subscriptions].sort((a, b) => {
    const aValue = a[activeSortField];
    const bValue = b[activeSortField];

    // null/undefined 값은 항상 맨 뒤로
    if (!aValue && !bValue) return 0;
    if (!aValue) return 1;
    if (!bValue) return -1;

    // 날짜 비교
    const aDate = new Date(aValue).getTime();
    const bDate = new Date(bValue).getTime();

    if (activeSortOrder === 'asc') {
      return aDate - bDate;
    } else {
      return bDate - aDate;
    }
  });

  // 드롭다운 메뉴 상태
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [dropdownPosition, setDropdownPosition] = useState<{ top?: number; bottom?: number; left: number } | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 액션 모달 상태
  const [actionModal, setActionModal] = useState(false);
  const [selectedSubscription, setSelectedSubscription] = useState<Subscription | null>(null);
  const [initialAction, setInitialAction] = useState<SubscriptionActionType | undefined>(undefined);

  // === 구독 내역 SWR ===
  const historyParams = new URLSearchParams({
    page: historyPageNum.toString(),
    limit: '20',
    ...(searchHistoryQuery && { search: searchHistoryQuery }),
    ...(planFilterHistory.length > 0 && { plan: planFilterHistory.join(',') }),
    ...(statusFilterHistory.length > 0 && { status: statusFilterHistory.join(',') }),
  });
  const historyUrl = `/api/admin/subscriptions/history?${historyParams}`;
  const { data: historyData, isLoading: loadingHistory, mutate: mutateHistory } = useSWR(
    activeTab === 'history' ? historyUrl : null
  );
  const history: SubscriptionHistoryItem[] = historyData?.history ?? [];

  useEffect(() => {
    if (historyData?.pagination) {
      setPaginationHistory(historyData.pagination);
    }
  }, [historyData]);

  // 활성 탭 필터 적용
  const handleFilterActive = () => {
    setActivePageNum(1);
    setSearchActiveQuery(searchActive);
  };

  // 히스토리 탭 필터 적용
  const handleFilterHistory = () => {
    setHistoryPageNum(1);
    setSearchHistoryQuery(searchHistory);
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
      case 'pending_cancel':
        return <span className={`${baseClass} bg-orange-100 text-orange-700`}>해지예정</span>;
      case 'past_due':
        return <span className={`${baseClass} bg-red-100 text-red-700`}>결제실패</span>;
      case 'suspended':
        return <span className={`${baseClass} bg-yellow-100 text-yellow-700`}>일시정지</span>;
      case 'canceled':
        return <span className={`${baseClass} bg-red-100 text-red-700`}>해지</span>;
      case 'expired':
        return <span className={`${baseClass} bg-gray-100 text-gray-600`}>만료</span>;
      case 'completed':
        return <span className={`${baseClass} bg-gray-100 text-gray-500`}>완료</span>;
      case 'none':
        return <span className={`${baseClass} bg-gray-100 text-gray-500`}>미구독</span>;
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

  // 드롭다운 메뉴 열기
  const openDropdown = (subscription: Subscription, e: React.MouseEvent) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const windowHeight = window.innerHeight;
    const spaceBelow = windowHeight - rect.bottom;
    const MENU_HEIGHT = 160; // 예상 메뉴 높이

    if (spaceBelow < MENU_HEIGHT) {
      // 아래 공간이 부족하면 위로 띄움 (버튼 바로 위)
      setDropdownPosition({
        bottom: windowHeight - rect.top - 8,
        left: rect.right - 160,
      });
    } else {
      // 충분하면 아래로 띄움 (버튼 상단 기준 + 10px 지점)
      setDropdownPosition({
        top: rect.top + 10,
        left: rect.right - 160,
      });
    }
    setOpenDropdownId(subscription.id);
    setSelectedSubscription(subscription);
  };

  // 액션 모달 열기
  const openActionModal = (subscription: Subscription, action: SubscriptionActionType) => {
    setSelectedSubscription(subscription);
    setInitialAction(action);
    setActionModal(true);
    setOpenDropdownId(null);
    setDropdownPosition(null);
  };

  // 액션 성공 처리
  const handleActionSuccess = () => {
    mutateActive();
    setActionModal(false);
    setSelectedSubscription(null);
    setInitialAction(undefined);
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
    setHistoryPageNum(1);
  };

  // 히스토리 xlsx 내보내기
  const handleExportHistory = async () => {
    if (history.length === 0) {
      alert('내보낼 구독 내역이 없습니다.');
      return;
    }

    const XLSX = await import('xlsx');

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

  // 외부 클릭 감지 (필터 팝업, 드롭다운 닫기)
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
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpenDropdownId(null);
        setDropdownPosition(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="space-y-6 overflow-x-hidden">
      <div className="flex items-center justify-between flex-wrap gap-4 sticky left-0">
        <div className="flex items-center gap-3">
          <Timer className="w-8 h-8 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900">구독 내역</h1>
        </div>
      </div>

      {/* 탭 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 sticky left-0">
        <div className="flex border-b border-gray-100">
          <button
            onClick={() => handleTabChange('active')}
            className={`flex items-center gap-2 px-6 py-4 text-sm font-medium transition-colors ${activeTab === 'active'
              ? 'text-blue-600 border-b-2 border-blue-600 -mb-px'
              : 'text-gray-500 hover:text-gray-700'
              }`}
          >
            <Spark className="w-4 h-4" />
            활성
          </button>
          <button
            onClick={() => handleTabChange('history')}
            className={`flex items-center gap-2 px-6 py-4 text-sm font-medium transition-colors ${activeTab === 'history'
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
                      placeholder="회원명, 매장명, 이메일, 연락처 검색..."
                      className="w-48 sm:w-64 pl-8 pr-8 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    {searchActive && (
                      <button
                        onClick={() => { setSearchActive(''); setSearchActiveQuery(''); setActivePageNum(1); }}
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
                      className={`p-1.5 rounded-lg transition-colors ${(planFilterActive.length > 0 || statusFilterActive.length > 0)
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
                                      setActivePageNum(1);
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
                                { value: 'pending_cancel', label: '해지예정' },
                                { value: 'past_due', label: '결제실패' },
                                { value: 'suspended', label: '일시정지' },
                                { value: 'completed', label: '완료' },
                                { value: 'expired', label: '만료' },
                                { value: 'canceled', label: '해지' },
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
                                      setActivePageNum(1);
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
                              setActivePageNum(1);
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
                    <th
                      className="text-center px-2 py-3 text-sm font-medium text-gray-500 cursor-pointer hover:bg-gray-100 select-none"
                      onClick={() => handleActiveSort('currentPeriodStart')}
                    >
                      <span className="inline-flex items-center gap-1 justify-center">
                        시작일
                        {activeSortField === 'currentPeriodStart' && (
                          activeSortOrder === 'asc' ? <SortUp className="w-3 h-3" /> : <SortDown className="w-3 h-3" />
                        )}
                      </span>
                    </th>
                    <th
                      className="text-center px-2 py-3 text-sm font-medium text-gray-500 cursor-pointer hover:bg-gray-100 select-none"
                      onClick={() => handleActiveSort('currentPeriodEnd')}
                    >
                      <span className="inline-flex items-center gap-1 justify-center">
                        종료일
                        {activeSortField === 'currentPeriodEnd' && (
                          activeSortOrder === 'asc' ? <SortUp className="w-3 h-3" /> : <SortDown className="w-3 h-3" />
                        )}
                      </span>
                    </th>
                    <th
                      className="text-center px-2 py-3 text-sm font-medium text-gray-500 cursor-pointer hover:bg-gray-100 select-none"
                      onClick={() => handleActiveSort('nextBillingDate')}
                    >
                      <span className="inline-flex items-center gap-1 justify-center">
                        결제일
                        {activeSortField === 'nextBillingDate' && (
                          activeSortOrder === 'asc' ? <SortUp className="w-3 h-3" /> : <SortDown className="w-3 h-3" />
                        )}
                      </span>
                    </th>
                    <th className="text-center px-2 py-3 text-sm font-medium text-gray-500">관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sortedSubscriptions.map((subscription, index) => (
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
                        <div className="flex flex-col items-center gap-1">
                          {getStatusBadge(subscription.status)}
                          {subscription.pendingPlan && (
                            <span className="text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                              → {getPlanName(subscription.pendingPlan)}
                            </span>
                          )}
                        </div>
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
                      <td className="px-2 py-3 text-center relative">
                        <button
                          onClick={(e) => openDropdown(subscription, e)}
                          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                          title="관리"
                        >
                          <MoreHoriz className="w-4 h-4 text-gray-600" />
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
                  onClick={() => setActivePageNum(prev => prev - 1)}
                  disabled={paginationActive.page === 1}
                  className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <NavArrowLeft className="w-5 h-5" />
                </button>
                <span className="text-sm text-gray-600">
                  {paginationActive.page} / {paginationActive.totalPages}
                </span>
                <button
                  onClick={() => setActivePageNum(prev => prev + 1)}
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
                      placeholder="회원명, 매장명, 이메일, 연락처 검색..."
                      className="w-48 sm:w-64 pl-8 pr-8 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    {searchHistory && (
                      <button
                        onClick={() => { setSearchHistory(''); setSearchHistoryQuery(''); setHistoryPageNum(1); }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 hover:bg-gray-100 rounded"
                      >
                        <Xmark className="w-3 h-3 text-gray-400" />
                      </button>
                    )}
                  </div>
                  <button
                    onClick={() => { setHistoryFilterType('all'); setHistoryDateRange({ start: '', end: '' }); setHistoryPageNum(1); }}
                    className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${historyFilterType === 'all'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                  >
                    전체
                  </button>
                  <button
                    onClick={handleOpenHistoryDatePicker}
                    className={`text-xs rounded-lg transition-colors flex items-center gap-1 ${historyFilterType === 'custom' && historyDateRange.start
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
                      className={`p-1.5 rounded-lg transition-colors ${(planFilterHistory.length > 0 || statusFilterHistory.length > 0)
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
                                      setHistoryPageNum(1);
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
                                { value: 'pending_cancel', label: '해지예정' },
                                { value: 'past_due', label: '결제실패' },
                                { value: 'suspended', label: '일시정지' },
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
                                      setHistoryPageNum(1);
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
                              setHistoryPageNum(1);
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
                      onClick={() => setHistoryPageNum(prev => Math.max(1, prev - 1))}
                      disabled={paginationHistory.page === 1}
                      className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <NavArrowLeft className="w-5 h-5" />
                    </button>
                    <span className="text-sm text-gray-600">
                      {paginationHistory.page} / {paginationHistory.totalPages}
                    </span>
                    <button
                      onClick={() => setHistoryPageNum(prev => Math.min(paginationHistory.totalPages, prev + 1))}
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

      {/* 드롭다운 메뉴 */}
      {openDropdownId && dropdownPosition && selectedSubscription && (
        <div
          ref={dropdownRef}
          className="fixed bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[160px]"
          style={{
            top: dropdownPosition.top,
            bottom: dropdownPosition.bottom,
            left: dropdownPosition.left,
            zIndex: 9999
          }}
        >
          {canStartSubscription(selectedSubscription.status as SubscriptionInfo['status']) ? (
            <button
              onClick={() => openActionModal(selectedSubscription, 'start')}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 transition-colors"
            >
              <Plus className="w-4 h-4" />
              구독 시작
            </button>
          ) : (
            <>
              <button
                onClick={() => openActionModal(selectedSubscription, 'change_plan')}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <FastRightCircle className="w-4 h-4" />
                플랜 변경
              </button>
              <button
                onClick={() => openActionModal(selectedSubscription, 'adjust_period')}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <Calendar className="w-4 h-4" />
                기간 조정
              </button>
              <button
                onClick={() => openActionModal(selectedSubscription, 'cancel')}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
              >
                <WarningCircle className="w-4 h-4" />
                구독 해지
              </button>
            </>
          )}
        </div>
      )}

      {/* 구독 액션 모달 */}
      {actionModal && selectedSubscription && (
        <SubscriptionActionModal
          isOpen={actionModal}
          onClose={() => {
            setActionModal(false);
            setSelectedSubscription(null);
            setInitialAction(undefined);
          }}
          tenantId={selectedSubscription.tenantId}
          subscription={{
            tenantId: selectedSubscription.tenantId,
            plan: selectedSubscription.plan as SubscriptionInfo['plan'],
            status: selectedSubscription.status as SubscriptionInfo['status'],
            amount: selectedSubscription.amount,
            currentPeriodStart: selectedSubscription.currentPeriodStart,
            currentPeriodEnd: selectedSubscription.currentPeriodEnd,
            nextBillingDate: selectedSubscription.nextBillingDate,
          }}
          tenant={{
            tenantId: selectedSubscription.tenantId,
            brandName: selectedSubscription.brandName || '',
            email: selectedSubscription.email || '',
          }}
          initialAction={initialAction}
          onSuccess={handleActionSuccess}
        />
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
