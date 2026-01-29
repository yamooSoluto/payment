'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { HomeSimpleDoor, NavArrowLeft, NavArrowRight, Search, Filter, Xmark, Settings, Plus, Trash, ViewColumns3, HistoricShield, Menu } from 'iconoir-react';
import Link from 'next/link';
import Spinner from '@/components/admin/Spinner';
import { INDUSTRIES, IndustryCode } from '@/lib/constants';
import useSWR from 'swr';


// 컬럼 정의 (고정 컬럼 제외)
interface ColumnDef {
  key: string;
  label: string;
  defaultVisible: boolean;
}

const AVAILABLE_COLUMNS: ColumnDef[] = [
  { key: 'branchNo', label: '지점번호', defaultVisible: true },
  { key: 'name', label: '회원', defaultVisible: true },
  { key: 'phone', label: '연락처', defaultVisible: true },
  { key: 'email', label: '이메일', defaultVisible: true },
  { key: 'industry', label: '업종', defaultVisible: true },
  { key: 'plan', label: '플랜', defaultVisible: true },
  { key: 'subscriptionStatus', label: '구독상태', defaultVisible: true },
  { key: 'csTone', label: 'AI톤', defaultVisible: true },
  { key: 'botName', label: '봇이름', defaultVisible: true },
  { key: 'createdAt', label: '생성일', defaultVisible: false },
  { key: 'brandCode', label: '매장코드', defaultVisible: false },
  { key: 'reviewCode', label: '리뷰코드', defaultVisible: false },
];

// csTone 필드 매핑 (asst_* ID → 친숙한 라벨)
const CS_TONE_OPTIONS: Record<string, string> = {
  'asst_7fV8slbPgcscXGoiyzLCrOqG': 'cute',
  'asst_1Dz4DylCNTNnaVQbrW3WlmCH': 'basic',
  'asst_hKaWohoAZehPvV50iRyPGuRo': 'GPT',
  'asst_5pHyGmGCRrRQDtQeWh2LYRGq': 'sweet',
  'asst_HJHT1weZPZO1UZAuDryCBjhA': 'ajae',
  'asst_o0yi4J6uAJG8G9ZQhDF34rQu': 'brother',
  'asst_dRBKDqplI86xxUyExv6HnY4V': 'duck',
};

const COLUMN_STORAGE_KEY = 'admin_tenants_visible_columns';

interface Tenant {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  brandName: string;
  brandCode: string;
  branchNo: string | null;
  phone: string;
  industry: string;
  plan: string;
  subscriptionStatus: string;
  status: string;
  deleted: boolean;
  createdAt: string | null;
  csTone: string;
  botName: string;
  reviewCode: string;
  pendingPlan: string | null;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

type CustomFieldType = 'string' | 'number' | 'boolean' | 'map' | 'array' | 'timestamp' | 'select';
type CustomFieldTab = 'basic' | 'ai' | 'integrations' | 'subscription';

interface CustomFieldSchema {
  name: string;
  label: string;
  type: CustomFieldType;
  options?: string[];
  tab: CustomFieldTab;
  saveToFirestore: boolean;
  order: number;
}

export default function TenantsPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [industryFilter, setIndustryFilter] = useState<string[]>([]);
  const [planFilter, setPlanFilter] = useState<string[]>([]);
  const [subscriptionStatusFilter, setSubscriptionStatusFilter] = useState<string[]>([]);
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [moreMenuPosition, setMoreMenuPosition] = useState<{ top: number; right: number } | null>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const [filterPosition, setFilterPosition] = useState<{ top: number; right: number } | null>(null);
  const filterRef = useRef<HTMLDivElement>(null);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });

  // 관리자 메타 필드 스키마 상태
  const [showSchemaModal, setShowSchemaModal] = useState(false);
  const [customFieldSchema, setCustomFieldSchema] = useState<CustomFieldSchema[]>([]);
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [newFieldType, setNewFieldType] = useState<CustomFieldType>('string');
  const [newFieldTab, setNewFieldTab] = useState<CustomFieldTab>('basic');
  const [newFieldSaveToFirestore, setNewFieldSaveToFirestore] = useState(false);
  const [savingSchema, setSavingSchema] = useState(false);

  // 매장 추가 모달 상태
  const [showAddTenantModal, setShowAddTenantModal] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [memberSearchResults, setMemberSearchResults] = useState<{ email: string; name: string; phone: string }[]>([]);
  const [searchingMembers, setSearchingMembers] = useState(false);
  const [selectedMember, setSelectedMember] = useState<{ email: string; name: string; phone: string } | null>(null);
  const [addTenantForm, setAddTenantForm] = useState({ brandName: '', industry: '' });
  const [addingTenant, setAddingTenant] = useState(false);
  const [addTenantProgress, setAddTenantProgress] = useState(0);

  // 선택 삭제 상태
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedTenants, setSelectedTenants] = useState<string[]>([]);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  // 컬럼 선택 상태
  const [visibleColumns, setVisibleColumns] = useState<string[]>(() => {
    // 기본값 설정 (localStorage는 클라이언트에서만 접근)
    return AVAILABLE_COLUMNS.filter(c => c.defaultVisible).map(c => c.key);
  });
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const [columnSettingsPosition, setColumnSettingsPosition] = useState<{ top: number; right: number } | null>(null);
  const columnSettingsRef = useRef<HTMLDivElement>(null);

  // SWR로 매장 목록 조회
  const tenantsParams = new URLSearchParams({
    page: pagination.page.toString(),
    limit: pagination.limit.toString(),
    ...(search && { search }),
    ...(industryFilter.length > 0 && { industry: industryFilter.join(',') }),
    ...(planFilter.length > 0 && { plan: planFilter.join(',') }),
    ...(subscriptionStatusFilter.length > 0 && { subscriptionStatus: subscriptionStatusFilter.join(',') }),
    ...(includeDeleted && { includeDeleted: 'true' }),
  });
  const tenantsUrl = `/api/admin/tenants?${tenantsParams}`;
  const { data: tenantsData, isLoading: loading, mutate: mutateTenants } = useSWR(tenantsUrl);
  const tenants: Tenant[] = tenantsData?.tenants || [];

  useEffect(() => {
    if (tenantsData?.pagination) {
      setPagination(tenantsData.pagination);
    }
  }, [tenantsData]);

  const handleFilter = () => {
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  // 커스텀 필드 스키마 fetch
  const fetchCustomFieldSchema = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/tenant-meta-schema');
      if (response.ok) {
        const data = await response.json();
        setCustomFieldSchema(data.fields || []);
      }
    } catch (error) {
      console.error('Failed to fetch custom field schema:', error);
    }
  }, []);

  useEffect(() => {
    fetchCustomFieldSchema();
  }, [fetchCustomFieldSchema]);

  // localStorage에서 컬럼 설정 불러오기
  useEffect(() => {
    try {
      const saved = localStorage.getItem(COLUMN_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setVisibleColumns(parsed);
        }
      }
    } catch (e) {
      console.error('Failed to load column settings:', e);
    }
  }, []);

  // 컬럼 설정 변경 시 localStorage에 저장
  const handleColumnToggle = (columnKey: string) => {
    setVisibleColumns(prev => {
      const newColumns = prev.includes(columnKey)
        ? prev.filter(k => k !== columnKey)
        : [...prev, columnKey];
      try {
        localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(newColumns));
      } catch (e) {
        console.error('Failed to save column settings:', e);
      }
      return newColumns;
    });
  };

  // 컬럼 설정 전체 선택/해제
  const handleSelectAllColumns = (selectAll: boolean) => {
    const newColumns = selectAll ? AVAILABLE_COLUMNS.map(c => c.key) : [];
    setVisibleColumns(newColumns);
    try {
      localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(newColumns));
    } catch (e) {
      console.error('Failed to save column settings:', e);
    }
  };

  // 새 필드 추가
  const handleAddField = async () => {
    if (!newFieldName.trim() || !newFieldLabel.trim()) {
      alert('필드명과 라벨을 입력해주세요.');
      return;
    }

    setSavingSchema(true);
    try {
      const response = await fetch('/api/admin/tenant-meta-schema', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newFieldName.trim(),
          label: newFieldLabel.trim(),
          type: newFieldType,
          tab: newFieldTab,
          saveToFirestore: newFieldSaveToFirestore,
        }),
      });

      if (response.ok) {
        await fetchCustomFieldSchema();
        setNewFieldName('');
        setNewFieldLabel('');
        setNewFieldType('string');
        setNewFieldTab('basic');
        setNewFieldSaveToFirestore(false);
      } else {
        const data = await response.json();
        alert(data.error || '필드 추가에 실패했습니다.');
      }
    } catch (error) {
      console.error('Add field error:', error);
      alert(`오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
    } finally {
      setSavingSchema(false);
    }
  };

  // 필드 삭제
  const handleDeleteField = async (fieldName: string) => {
    if (!confirm(`"${fieldName}" 필드를 삭제하시겠습니까?\n모든 매장의 해당 필드 데이터는 유지되지만 더 이상 표시되지 않습니다.`)) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/tenant-meta-schema?name=${encodeURIComponent(fieldName)}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        await fetchCustomFieldSchema();
      } else {
        const data = await response.json();
        alert(data.error || '필드 삭제에 실패했습니다.');
      }
    } catch {
      alert('오류가 발생했습니다.');
    }
  };

  // 회원 검색
  const handleMemberSearch = async (searchValue: string) => {
    setMemberSearch(searchValue);
    if (!searchValue.trim()) {
      setMemberSearchResults([]);
      return;
    }

    setSearchingMembers(true);
    try {
      const response = await fetch(`/api/admin/members?search=${encodeURIComponent(searchValue)}&limit=10`);
      if (response.ok) {
        const data = await response.json();
        setMemberSearchResults(data.members.map((m: { email: string; name: string; phone: string }) => ({
          email: m.email,
          name: m.name,
          phone: m.phone,
        })));
      }
    } catch (error) {
      console.error('Failed to search members:', error);
    } finally {
      setSearchingMembers(false);
    }
  };

  // 매장 추가
  const handleAddTenant = async () => {
    if (!selectedMember) {
      alert('회원을 선택해주세요.');
      return;
    }
    if (!addTenantForm.brandName.trim() || !addTenantForm.industry) {
      alert('매장명과 업종을 입력해주세요.');
      return;
    }

    setAddingTenant(true);
    setAddTenantProgress(0);

    // 진행률 시뮬레이션
    const progressInterval = setInterval(() => {
      setAddTenantProgress(prev => {
        if (prev >= 90) return 90;
        const next = prev + 5 + Math.random() * 10;
        return Math.min(next, 90);
      });
    }, 400);

    try {
      const response = await fetch('/api/admin/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: selectedMember.email,
          brandName: addTenantForm.brandName.trim(),
          industry: addTenantForm.industry,
        }),
      });

      clearInterval(progressInterval);
      setAddTenantProgress(100);

      const data = await response.json();
      if (response.ok) {
        setTimeout(() => {
          alert('매장이 추가되었습니다.');
          setShowAddTenantModal(false);
          setSelectedMember(null);
          setMemberSearch('');
          setMemberSearchResults([]);
          setAddTenantForm({ brandName: '', industry: '' });
          setAddTenantProgress(0);
          mutateTenants();
        }, 300);
      } else {
        alert(data.error || '매장 추가에 실패했습니다.');
        setAddTenantProgress(0);
      }
    } catch (error) {
      clearInterval(progressInterval);
      console.error('Failed to add tenant:', error);
      alert('오류가 발생했습니다.');
      setAddTenantProgress(0);
    } finally {
      setAddingTenant(false);
    }
  };

  // 선택된 매장 삭제
  const handleDeleteSelected = async () => {
    if (deleteConfirmText !== '매장 삭제') return;

    setDeleting(true);
    try {
      const results = await Promise.all(
        selectedTenants.map(async (tenantId) => {
          const response = await fetch(`/api/admin/tenants/${tenantId}`, { method: 'DELETE' });
          if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            return { ok: false, tenantId, error: data.error || '삭제 실패' };
          }
          return { ok: true, tenantId };
        })
      );

      const successResults = results.filter(r => r.ok);
      const failResults = results.filter(r => !r.ok);

      if (failResults.length > 0) {
        const errorMessages = failResults.map(r => {
          const tenant = tenants.find(t => t.tenantId === r.tenantId);
          const brandName = tenant?.brandName || r.tenantId;
          return `• ${brandName}: ${r.error}`;
        }).join('\n');
        alert(`${successResults.length}개 삭제 성공, ${failResults.length}개 삭제 실패\n\n실패 사유:\n${errorMessages}`);
      } else {
        alert(`${successResults.length}개 매장이 삭제되었습니다.`);
      }

      setShowDeleteModal(false);
      setDeleteConfirmText('');
      setSelectedTenants([]);
      setIsSelectMode(false);
      mutateTenants();
    } catch (error) {
      console.error('Delete failed:', error);
      alert('삭제 중 오류가 발생했습니다.');
    } finally {
      setDeleting(false);
    }
  };

  // 전체 선택/해제
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      // 삭제되지 않은 매장만 선택
      const selectableIds = tenants.filter(t => !t.deleted).map(t => t.tenantId);
      setSelectedTenants(selectableIds);
    } else {
      setSelectedTenants([]);
    }
  };

  // 개별 선택/해제
  const handleSelectTenant = (tenantId: string, checked: boolean) => {
    if (checked) {
      setSelectedTenants(prev => [...prev, tenantId]);
    } else {
      setSelectedTenants(prev => prev.filter(id => id !== tenantId));
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('ko-KR');
  };

  const getIndustryLabel = (code: string) => {
    return INDUSTRIES[code as IndustryCode] || code || '-';
  };

  const getPlanName = (plan: string) => {
    switch (plan) {
      case 'trial': return 'Trial';
      case 'basic': return 'Basic';
      case 'business': return 'Business';
      case 'enterprise': return 'Enterprise';
      default: return plan || '-';
    }
  };

  const getStatusBadge = (status: string) => {
    const baseClass = "px-2 py-1 text-xs font-medium rounded-full";
    switch (status) {
      case 'active':
        return <span className={`${baseClass} bg-green-100 text-green-700`}>활성</span>;
      case 'deleted':
        return <span className={`${baseClass} bg-red-50 text-red-400`}>삭제</span>;
      default:
        return <span className={`${baseClass} bg-gray-100 text-gray-600`}>{status || '-'}</span>;
    }
  };

  const getSubscriptionStatusBadge = (status: string, deleted?: boolean, pendingPlan?: string | null) => {
    const baseClass = "px-2 py-1 text-xs font-medium rounded-full";
    // 삭제된 매장은 '삭제'로 표시
    if (deleted) {
      return <span className={`${baseClass} bg-red-50 text-red-400`}>삭제</span>;
    }

    // 플랜 변경 예약 인디케이터 (→B, →E 등)
    const pendingIndicator = pendingPlan ? (
      <span className="text-blue-500 ml-0.5">→{pendingPlan.charAt(0).toUpperCase()}</span>
    ) : null;

    switch (status) {
      case 'active':
        return <span className={`${baseClass} bg-green-100 text-green-700`}>구독중{pendingIndicator}</span>;
      case 'trial':
      case 'trialing':
        return <span className={`${baseClass} bg-blue-100 text-blue-700`}>체험{pendingIndicator}</span>;
      case 'pending_cancel':
        return <span className={`${baseClass} bg-orange-100 text-orange-700`}>해지예정</span>;
      case 'canceled':
        return <span className={`${baseClass} bg-red-100 text-red-700`}>해지</span>;
      case 'expired':
        return <span className={`${baseClass} bg-gray-100 text-gray-600`}>만료</span>;
      case 'none':
        return <span className={`${baseClass} bg-gray-100 text-gray-500`}>미구독</span>;
      default:
        return <span className={`${baseClass} bg-gray-100 text-gray-600`}>{status || '-'}</span>;
    }
  };

  const getCsToneLabel = (tone: string) => {
    return CS_TONE_OPTIONS[tone] || tone || '-';
  };

  // 외부 클릭 감지 (팝업 닫기)
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
        setShowFilter(false);
        setFilterPosition(null);
      }
      if (columnSettingsRef.current && !columnSettingsRef.current.contains(event.target as Node)) {
        setShowColumnSettings(false);
        setColumnSettingsPosition(null);
      }
      if (moreMenuRef.current && !moreMenuRef.current.contains(event.target as Node)) {
        setShowMoreMenu(false);
        setMoreMenuPosition(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const hasActiveFilters = industryFilter.length > 0 || planFilter.length > 0 || subscriptionStatusFilter.length > 0 || includeDeleted;

  return (
    <div className="space-y-6 overflow-x-hidden">
      <div className="flex items-center justify-between flex-wrap gap-4 sticky left-0">
        <div className="flex items-center gap-3">
          <HomeSimpleDoor className="w-8 h-8 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900">매장 관리</h1>
        </div>
        <div className="flex items-center gap-2">
          {isSelectMode ? (
            <>
              <button
                onClick={() => {
                  setIsSelectMode(false);
                  setSelectedTenants([]);
                }}
                className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 border border-gray-200 hover:border-gray-300 rounded-lg transition-colors"
              >
                취소
              </button>
              <button
                onClick={() => setShowDeleteModal(true)}
                disabled={selectedTenants.length === 0}
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Trash className="w-4 h-4" />
                <span>삭제 ({selectedTenants.length})</span>
              </button>
            </>
          ) : (
            <div className="relative" ref={moreMenuRef}>
              <button
                onClick={(e) => {
                  if (showMoreMenu) {
                    setShowMoreMenu(false);
                    setMoreMenuPosition(null);
                  } else {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setMoreMenuPosition({
                      top: rect.bottom + 12,
                      right: window.innerWidth - rect.right,
                    });
                    setShowMoreMenu(true);
                  }
                }}
                className={`w-11 h-11 flex items-center justify-center rounded-2xl transition-all duration-300 ${
                  showMoreMenu
                    ? 'bg-gray-900 text-white shadow-xl'
                    : 'bg-white/80 backdrop-blur-xl text-gray-700 shadow-lg border border-white/60 hover:bg-white hover:shadow-xl hover:scale-105'
                }`}
              >
                {showMoreMenu ? (
                  <Xmark className="w-5 h-5" />
                ) : (
                  <Menu className="w-5 h-5" />
                )}
              </button>
              {showMoreMenu && moreMenuPosition && (
                <div
                  className="fixed w-52 backdrop-blur-xl bg-white/90 rounded-2xl shadow-2xl border border-white/60 py-2 overflow-hidden"
                  style={{ top: moreMenuPosition.top, right: moreMenuPosition.right, zIndex: 9999 }}
                >
                  <button
                    onClick={() => {
                      setShowAddTenantModal(true);
                      setShowMoreMenu(false);
                      setMoreMenuPosition(null);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-blue-500/10 hover:text-blue-600 transition-all"
                  >
                    <div className="w-8 h-8 rounded-xl bg-blue-500/10 flex items-center justify-center">
                      <Plus className="w-4 h-4 text-blue-600" />
                    </div>
                    <span>매장 추가</span>
                  </button>
                  <button
                    onClick={() => {
                      setIsSelectMode(true);
                      setShowMoreMenu(false);
                      setMoreMenuPosition(null);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-red-500/10 hover:text-red-600 transition-all"
                  >
                    <div className="w-8 h-8 rounded-xl bg-red-500/10 flex items-center justify-center">
                      <Trash className="w-4 h-4 text-red-500" />
                    </div>
                    <span>선택 삭제</span>
                  </button>
                  <div className="border-t border-gray-200/50 my-2 mx-4" />
                  <Link
                    href="/admin/tenants/deleted-history"
                    onClick={() => {
                      setShowMoreMenu(false);
                      setMoreMenuPosition(null);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-500/10 transition-all"
                  >
                    <div className="w-8 h-8 rounded-xl bg-gray-500/10 flex items-center justify-center">
                      <HistoricShield className="w-4 h-4 text-gray-500" />
                    </div>
                    <span>삭제 내역</span>
                  </Link>
                  <button
                    onClick={() => {
                      setShowSchemaModal(true);
                      setShowMoreMenu(false);
                      setMoreMenuPosition(null);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-500/10 transition-all"
                  >
                    <div className="w-8 h-8 rounded-xl bg-gray-500/10 flex items-center justify-center">
                      <Settings className="w-4 h-4 text-gray-500" />
                    </div>
                    <span>필드 설정</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-100">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative">
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPagination(prev => ({ ...prev, page: 1 }));
                    }}
                    placeholder="검색"
                    className="w-48 sm:w-64 pl-8 pr-8 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  {search && (
                    <button
                      onClick={() => { setSearch(''); setPagination(prev => ({ ...prev, page: 1 })); }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 hover:bg-gray-100 rounded"
                    >
                      <Xmark className="w-3 h-3 text-gray-400" />
                    </button>
                  )}
                </div>
                <div className="relative" ref={filterRef}>
                  <button
                    onClick={(e) => {
                      if (showFilter) {
                        setShowFilter(false);
                        setFilterPosition(null);
                      } else {
                        const rect = e.currentTarget.getBoundingClientRect();
                        setFilterPosition({
                          top: rect.bottom + 8,
                          right: window.innerWidth - rect.right,
                        });
                        setShowFilter(true);
                      }
                    }}
                    className={`p-1.5 rounded-lg transition-colors ${hasActiveFilters
                      ? 'bg-gray-700 text-white'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700'
                      }`}
                    title="필터"
                  >
                    <Filter className="w-4 h-4" />
                  </button>
                  {showFilter && filterPosition && (
                    <div
                      className="fixed bg-white border border-gray-200 rounded-lg shadow-lg p-4 min-w-[280px] max-h-[70vh] overflow-y-auto"
                      style={{ top: filterPosition.top, right: filterPosition.right, zIndex: 9999 }}
                    >
                      <div className="space-y-4">
                        {/* 업종 필터 */}
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-2">업종</label>
                          <div className="space-y-1.5 max-h-32 overflow-y-auto">
                            {Object.entries(INDUSTRIES).map(([code, label]) => (
                              <label key={code} className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={industryFilter.includes(code)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setIndustryFilter(prev => [...prev, code]);
                                    } else {
                                      setIndustryFilter(prev => prev.filter(v => v !== code));
                                    }
                                    setPagination(prev => ({ ...prev, page: 1 }));
                                  }}
                                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                />
                                <span className="text-sm text-gray-700">{label}</span>
                              </label>
                            ))}
                          </div>
                        </div>

                        {/* 플랜 필터 */}
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
                                  checked={planFilter.includes(option.value)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setPlanFilter(prev => [...prev, option.value]);
                                    } else {
                                      setPlanFilter(prev => prev.filter(v => v !== option.value));
                                    }
                                    setPagination(prev => ({ ...prev, page: 1 }));
                                  }}
                                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                />
                                <span className="text-sm text-gray-700">{option.label}</span>
                              </label>
                            ))}
                          </div>
                        </div>

                        {/* 구독상태 필터 */}
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-2">구독상태</label>
                          <div className="space-y-1.5">
                            {[
                              { value: 'none', label: '미구독' },
                              { value: 'trialing', label: '체험' },
                              { value: 'active', label: '구독중' },
                              { value: 'canceled', label: '해지' },
                              { value: 'expired', label: '만료' },
                            ].map(option => (
                              <label key={option.value} className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={subscriptionStatusFilter.includes(option.value)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSubscriptionStatusFilter(prev => [...prev, option.value]);
                                    } else {
                                      setSubscriptionStatusFilter(prev => prev.filter(v => v !== option.value));
                                    }
                                    setPagination(prev => ({ ...prev, page: 1 }));
                                  }}
                                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                />
                                <span className="text-sm text-gray-700">{option.label}</span>
                              </label>
                            ))}
                          </div>
                        </div>

                        {/* 삭제된 매장 포함 */}
                        <div className="pt-2 border-t border-gray-100">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={includeDeleted}
                              onChange={(e) => {
                                setIncludeDeleted(e.target.checked);
                                setPagination(prev => ({ ...prev, page: 1 }));
                              }}
                              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-sm text-gray-700">삭제된 매장 포함</span>
                          </label>
                        </div>

                        <button
                          onClick={() => {
                            setIndustryFilter([]);
                            setPlanFilter([]);
                            setSubscriptionStatusFilter([]);
                            setIncludeDeleted(false);
                            setPagination(prev => ({ ...prev, page: 1 }));
                          }}
                          className="w-full text-xs text-gray-500 hover:text-gray-700 py-1"
                        >
                          필터 초기화
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                {/* 컬럼 설정 버튼 */}
                <div className="relative" ref={columnSettingsRef}>
                  <button
                    onClick={(e) => {
                      if (showColumnSettings) {
                        setShowColumnSettings(false);
                        setColumnSettingsPosition(null);
                      } else {
                        const rect = e.currentTarget.getBoundingClientRect();
                        setColumnSettingsPosition({
                          top: rect.bottom + 8,
                          right: window.innerWidth - rect.right,
                        });
                        setShowColumnSettings(true);
                      }
                    }}
                    className="p-1.5 rounded-lg transition-colors bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700"
                    title="컬럼 설정"
                  >
                    <ViewColumns3 className="w-4 h-4" />
                  </button>
                  {showColumnSettings && columnSettingsPosition && (
                    <div
                      className="fixed bg-white border border-gray-200 rounded-lg shadow-lg p-4 min-w-[200px] max-h-[50vh] overflow-y-auto"
                      style={{ top: columnSettingsPosition.top, right: columnSettingsPosition.right, zIndex: 9999 }}
                    >
                      <div className="space-y-3">
                        <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                          <span className="text-sm font-medium text-gray-700">표시 컬럼</span>
                          <div className="flex gap-1">
                            <button
                              onClick={() => handleSelectAllColumns(true)}
                              className="text-xs text-blue-600 hover:text-blue-700 px-1"
                            >
                              전체
                            </button>
                            <span className="text-gray-300">|</span>
                            <button
                              onClick={() => handleSelectAllColumns(false)}
                              className="text-xs text-gray-500 hover:text-gray-700 px-1"
                            >
                              해제
                            </button>
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          {AVAILABLE_COLUMNS.map((col) => (
                            <label key={col.key} className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={visibleColumns.includes(col.key)}
                                onChange={() => handleColumnToggle(col.key)}
                                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                              />
                              <span className="text-sm text-gray-700">{col.label}</span>
                            </label>
                          ))}
                        </div>
                        <p className="text-xs text-gray-400 pt-2 border-t border-gray-100">
                          No., 매장명, 상세는 항상 표시됩니다
                        </p>
                      </div>
                    </div>
                  )}
                </div>
                <button
                  onClick={handleFilter}
                  className="px-3 py-1.5 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800 transition-colors"
                >
                  조회
                </button>
              </div>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Spinner size="md" />
          </div>
        ) : tenants.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            매장이 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-max border-collapse">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {/* 체크박스 컬럼 (선택 모드일 때만) */}
                  {isSelectMode && (
                    <th className="text-center px-2 py-3 w-10 sticky left-0 bg-gray-50 z-10">
                      <input
                        type="checkbox"
                        checked={selectedTenants.length > 0 && selectedTenants.length === tenants.filter(t => !t.deleted).length}
                        onChange={(e) => handleSelectAll(e.target.checked)}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        onClick={(e) => e.stopPropagation()}
                      />
                    </th>
                  )}
                  {/* 고정 컬럼: No. */}
                  <th className={`text-center px-2 py-3 text-sm font-medium text-gray-500 w-12 sticky ${isSelectMode ? 'left-10' : 'left-0'} bg-gray-50 z-10`}>No.</th>
                  {/* 고정 컬럼: 매장명 */}
                  <th className={`text-center px-3 py-3 text-sm font-medium text-gray-500 min-w-[120px] sticky ${isSelectMode ? 'left-[5.5rem]' : 'left-12'} bg-gray-50 z-10 border-r border-gray-200`}>매장명</th>
                  {/* 동적 컬럼 */}
                  {visibleColumns.includes('branchNo') && (
                    <th className="text-center px-2 py-3 text-sm font-medium text-gray-500 whitespace-nowrap">지점번호</th>
                  )}
                  {visibleColumns.includes('name') && (
                    <th className="text-center px-2 py-3 text-sm font-medium text-gray-500 whitespace-nowrap">회원</th>
                  )}
                  {visibleColumns.includes('phone') && (
                    <th className="text-center px-2 py-3 text-sm font-medium text-gray-500 whitespace-nowrap">연락처</th>
                  )}
                  {visibleColumns.includes('email') && (
                    <th className="text-center px-2 py-3 text-sm font-medium text-gray-500 whitespace-nowrap">이메일</th>
                  )}
                  {visibleColumns.includes('industry') && (
                    <th className="text-center px-2 py-3 text-sm font-medium text-gray-500 whitespace-nowrap">업종</th>
                  )}
                  {visibleColumns.includes('plan') && (
                    <th className="text-center px-2 py-3 text-sm font-medium text-gray-500 whitespace-nowrap">플랜</th>
                  )}
                  {visibleColumns.includes('subscriptionStatus') && (
                    <th className="text-center px-2 py-3 text-sm font-medium text-gray-500 whitespace-nowrap">구독상태</th>
                  )}
                  {visibleColumns.includes('createdAt') && (
                    <th className="text-center px-2 py-3 text-sm font-medium text-gray-500 whitespace-nowrap">생성일</th>
                  )}
                  {visibleColumns.includes('brandCode') && (
                    <th className="text-center px-2 py-3 text-sm font-medium text-gray-500 whitespace-nowrap">매장코드</th>
                  )}
                  {visibleColumns.includes('csTone') && (
                    <th className="text-center px-2 py-3 text-sm font-medium text-gray-500 whitespace-nowrap">AI톤</th>
                  )}
                  {visibleColumns.includes('botName') && (
                    <th className="text-center px-2 py-3 text-sm font-medium text-gray-500 whitespace-nowrap">봇이름</th>
                  )}
                  {visibleColumns.includes('reviewCode') && (
                    <th className="text-center px-2 py-3 text-sm font-medium text-gray-500 whitespace-nowrap">리뷰코드</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {tenants.map((tenant, index) => (
                  <tr
                    key={tenant.id}
                    onClick={() => !isSelectMode && router.push(`/admin/tenants/${tenant.tenantId}`)}
                    className={`hover:bg-gray-50 transition-colors ${isSelectMode ? '' : 'cursor-pointer'} ${tenant.deleted ? 'bg-red-50/50' : ''}`}
                  >
                    {/* 체크박스 컬럼 (선택 모드일 때만) */}
                    {isSelectMode && (
                      <td
                        className={`px-2 py-3 text-center sticky left-0 z-10 ${tenant.deleted ? 'bg-red-50/50' : 'bg-white'}`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {!tenant.deleted && (
                          <input
                            type="checkbox"
                            checked={selectedTenants.includes(tenant.tenantId)}
                            onChange={(e) => handleSelectTenant(tenant.tenantId, e.target.checked)}
                            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                        )}
                      </td>
                    )}
                    {/* 고정 컬럼: No. */}
                    <td className={`px-2 py-3 text-sm text-gray-400 text-center sticky ${isSelectMode ? 'left-10' : 'left-0'} z-10 ${tenant.deleted ? 'bg-red-50/50' : 'bg-white'}`}>
                      {(pagination.page - 1) * pagination.limit + index + 1}
                    </td>
                    {/* 고정 컬럼: 매장명 */}
                    <td className={`px-3 py-3 text-sm font-medium text-gray-900 text-center sticky ${isSelectMode ? 'left-[5.5rem]' : 'left-12'} z-10 border-r border-gray-200 ${tenant.deleted ? 'bg-red-50/50' : 'bg-white'}`}>
                      <span className="whitespace-nowrap">{tenant.brandName}</span>
                      {tenant.deleted && (
                        <span className="ml-1 text-xs text-red-400">(삭제됨)</span>
                      )}
                    </td>
                    {/* 동적 컬럼 */}
                    {visibleColumns.includes('branchNo') && (
                      <td className="px-2 py-3 text-sm text-gray-600 text-center whitespace-nowrap">
                        {tenant.branchNo ?? '-'}
                      </td>
                    )}
                    {visibleColumns.includes('name') && (
                      <td className="px-2 py-3 text-sm text-gray-600 text-center whitespace-nowrap">
                        {tenant.name || '-'}
                      </td>
                    )}
                    {visibleColumns.includes('phone') && (
                      <td className="px-2 py-3 text-sm text-gray-600 text-center whitespace-nowrap">
                        {tenant.phone || '-'}
                      </td>
                    )}
                    {visibleColumns.includes('email') && (
                      <td className="px-2 py-3 text-sm text-gray-600 text-center whitespace-nowrap">
                        {tenant.email || '-'}
                      </td>
                    )}
                    {visibleColumns.includes('industry') && (
                      <td className="px-2 py-3 text-sm text-gray-600 text-center whitespace-nowrap">
                        {getIndustryLabel(tenant.industry)}
                      </td>
                    )}
                    {visibleColumns.includes('plan') && (
                      <td className="px-2 py-3 text-sm text-gray-600 text-center whitespace-nowrap">
                        {getPlanName(tenant.plan)}
                      </td>
                    )}
                    {visibleColumns.includes('subscriptionStatus') && (
                      <td className="px-2 py-3 text-center whitespace-nowrap">
                        {getSubscriptionStatusBadge(tenant.subscriptionStatus, tenant.deleted, tenant.pendingPlan)}
                      </td>
                    )}
                    {visibleColumns.includes('createdAt') && (
                      <td className="px-2 py-3 text-sm text-gray-600 text-center whitespace-nowrap">
                        {formatDate(tenant.createdAt)}
                      </td>
                    )}
                    {visibleColumns.includes('brandCode') && (
                      <td className="px-2 py-3 text-sm text-gray-600 text-center whitespace-nowrap font-mono text-xs">
                        {tenant.brandCode || '-'}
                      </td>
                    )}
                    {visibleColumns.includes('csTone') && (
                      <td className="px-2 py-3 text-sm text-gray-600 text-center whitespace-nowrap">
                        {getCsToneLabel(tenant.csTone)}
                      </td>
                    )}
                    {visibleColumns.includes('botName') && (
                      <td className="px-2 py-3 text-sm text-gray-600 text-center whitespace-nowrap">
                        {tenant.botName || '-'}
                      </td>
                    )}
                    {visibleColumns.includes('reviewCode') && (
                      <td className="px-2 py-3 text-sm text-gray-600 text-center whitespace-nowrap font-mono text-xs">
                        {tenant.reviewCode || '-'}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 페이지네이션 */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 sticky left-0">
            <p className="text-sm text-gray-500">
              {pagination.total}개 중 {(pagination.page - 1) * pagination.limit + 1}-
              {Math.min(pagination.page * pagination.limit, pagination.total)}개 표시
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                disabled={pagination.page === 1}
                className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <NavArrowLeft className="w-5 h-5" />
              </button>
              <span className="text-sm text-gray-600">
                {pagination.page} / {pagination.totalPages}
              </span>
              <button
                onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                disabled={pagination.page === pagination.totalPages}
                className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <NavArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 매장 추가 모달 */}
      {showAddTenantModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
            <div className="p-6 border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-900">새 매장 추가</h3>
              <p className="text-sm text-gray-500 mt-1">회원을 선택하고 매장 정보를 입력하세요</p>
            </div>
            {addingTenant ? (
              <div className="p-8">
                <div className="flex flex-col items-center gap-4">
                  <Spinner size="lg" />
                  <div className="w-full">
                    <div className="flex justify-between text-sm text-gray-600 mb-2">
                      <span>매장 생성 중...</span>
                      <span>{Math.round(addTenantProgress)}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${addTenantProgress}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-400 mt-3 text-center">
                      매장을 생성하고 있습니다
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="p-6 space-y-4">
                  {/* 회원 선택 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      회원 <span className="text-red-500">*</span>
                    </label>
                    {selectedMember ? (
                      <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <div>
                          <p className="font-medium text-gray-900">{selectedMember.name || '-'}</p>
                          <p className="text-sm text-gray-500">{selectedMember.phone || '-'} · {selectedMember.email}</p>
                        </div>
                        <button
                          onClick={() => {
                            setSelectedMember(null);
                            setMemberSearch('');
                            setMemberSearchResults([]);
                          }}
                          className="p-1 text-gray-400 hover:text-gray-600"
                        >
                          <Xmark className="w-5 h-5" />
                        </button>
                      </div>
                    ) : (
                      <div className="relative">
                        <input
                          type="text"
                          value={memberSearch}
                          onChange={(e) => handleMemberSearch(e.target.value)}
                          placeholder="이름, 연락처, 이메일로 검색..."
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                        {searchingMembers && (
                          <div className="absolute right-3 top-1/2 -translate-y-1/2">
                            <Spinner size="sm" />
                          </div>
                        )}
                        {memberSearchResults.length > 0 && (
                          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto z-10">
                            {memberSearchResults.map((member) => (
                              <button
                                key={member.email}
                                onClick={() => {
                                  setSelectedMember(member);
                                  setMemberSearch('');
                                  setMemberSearchResults([]);
                                }}
                                className="w-full px-3 py-2 text-left hover:bg-gray-50 border-b border-gray-100 last:border-0"
                              >
                                <p className="font-medium text-gray-900">{member.name || '-'}</p>
                                <p className="text-sm text-gray-500">{member.phone || '-'} · {member.email}</p>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* 매장명 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      매장명 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={addTenantForm.brandName}
                      onChange={(e) => setAddTenantForm({ ...addTenantForm, brandName: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="매장 이름을 입력하세요"
                      disabled={!selectedMember}
                    />
                  </div>

                  {/* 업종 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      업종 <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={addTenantForm.industry}
                      onChange={(e) => setAddTenantForm({ ...addTenantForm, industry: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                      disabled={!selectedMember}
                    >
                      <option value="">업종 선택</option>
                      {Object.entries(INDUSTRIES).map(([code, label]) => (
                        <option key={code} value={code}>{label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex gap-3 p-6 border-t border-gray-100">
                  <button
                    onClick={() => {
                      setShowAddTenantModal(false);
                      setSelectedMember(null);
                      setMemberSearch('');
                      setMemberSearchResults([]);
                      setAddTenantForm({ brandName: '', industry: '' });
                    }}
                    className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                  >
                    취소
                  </button>
                  <button
                    onClick={handleAddTenant}
                    disabled={!selectedMember || !addTenantForm.brandName.trim() || !addTenantForm.industry}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    매장 추가
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* 삭제 확인 모달 */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
            <div className="p-6 border-b border-gray-100">
              <h3 className="text-lg font-bold text-red-600 flex items-center gap-2">
                <Trash className="w-5 h-5" />
                매장 삭제
              </h3>
            </div>
            <div className="p-6 space-y-4">
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-800 font-medium mb-2">
                  {selectedTenants.length}개의 매장을 삭제하시겠습니까?
                </p>
                <p className="text-xs text-red-600">
                  • 삭제된 매장은 90일 후 영구 삭제됩니다.<br />
                  • 삭제된 매장의 구독은 즉시 만료 처리됩니다.<br />
                  • 이 작업은 취소할 수 없습니다.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  확인을 위해 <span className="font-bold text-red-600">&quot;매장 삭제&quot;</span>를 입력하세요
                </label>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="매장 삭제"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                />
              </div>
            </div>
            <div className="flex gap-3 p-6 border-t border-gray-100">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeleteConfirmText('');
                }}
                className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                취소
              </button>
              <button
                onClick={handleDeleteSelected}
                disabled={deleteConfirmText !== '매장 삭제' || deleting}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {deleting ? (
                  <>
                    <Spinner size="sm" />
                    삭제 중...
                  </>
                ) : (
                  <>
                    <Trash className="w-4 h-4" />
                    삭제
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 커스텀 필드 스키마 관리 모달 */}
      {showSchemaModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">커스텀 필드 설정</h2>
              <button
                onClick={() => setShowSchemaModal(false)}
                className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <Xmark className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1">
              <p className="text-sm text-gray-500 mb-4">
                여기서 정의한 필드는 모든 매장의 상세 페이지에서 지정된 탭에 표시됩니다.
              </p>

              {/* 기존 필드 목록 */}
              {customFieldSchema.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-medium text-gray-700 mb-2">등록된 필드 ({customFieldSchema.length}개)</h3>
                  <div className="space-y-2">
                    {customFieldSchema.map((field) => (
                      <div
                        key={field.name}
                        className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-gray-900">{field.label}</span>
                            <span className="text-xs text-gray-500">({field.name})</span>
                          </div>
                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            <span className="px-1.5 py-0.5 text-xs bg-blue-100 text-blue-700 rounded">
                              {field.tab === 'basic' ? '기본정보' : field.tab === 'ai' ? 'AI설정' : field.tab === 'integrations' ? '연동설정' : '구독'}
                            </span>
                            <span className="px-1.5 py-0.5 text-xs bg-gray-200 text-gray-600 rounded">
                              {field.type}
                            </span>
                            {!field.saveToFirestore && (
                              <span className="px-1.5 py-0.5 text-xs bg-purple-100 text-purple-600 rounded">
                                관리자용
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => handleDeleteField(field.name)}
                          className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
                          title="삭제"
                        >
                          <Trash className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 새 필드 추가 */}
              <div className="border-t border-gray-100 pt-4">
                <h3 className="text-sm font-medium text-gray-700 mb-3">새 필드 추가</h3>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">필드명 (영문)</label>
                      <input
                        type="text"
                        value={newFieldName}
                        onChange={(e) => setNewFieldName(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                        placeholder="예: manager_name"
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">표시 라벨</label>
                      <input
                        type="text"
                        value={newFieldLabel}
                        onChange={(e) => setNewFieldLabel(e.target.value)}
                        placeholder="예: 담당자명"
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">필드 타입</label>
                      <select
                        value={newFieldType}
                        onChange={(e) => setNewFieldType(e.target.value as CustomFieldType)}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="string">string</option>
                        <option value="number">number</option>
                        <option value="boolean">boolean</option>
                        <option value="timestamp">timestamp</option>
                        <option value="map">map</option>
                        <option value="array">array</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">표시 탭</label>
                      <select
                        value={newFieldTab}
                        onChange={(e) => setNewFieldTab(e.target.value as CustomFieldTab)}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="basic">기본 정보</option>
                        <option value="ai">AI 설정</option>
                        <option value="integrations">연동 설정</option>
                        <option value="subscription">구독</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newFieldSaveToFirestore}
                        onChange={(e) => setNewFieldSaveToFirestore(e.target.checked)}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">매장 데이터에 저장</span>
                      <span className="text-xs text-gray-400">(체크 해제 시 관리자 전용)</span>
                    </label>
                  </div>
                  <button
                    onClick={handleAddField}
                    disabled={savingSchema || !newFieldName.trim() || !newFieldLabel.trim()}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    {savingSchema ? '추가 중...' : '필드 추가'}
                  </button>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-gray-100">
              <button
                onClick={() => setShowSchemaModal(false)}
                className="w-full px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
