'use client';

import { useState, Fragment } from 'react';
import useSWR from 'swr';
import { useSearchParams, useRouter } from 'next/navigation';
import { UserCrown, Plus, EditPencil, Trash, RefreshDouble, Xmark, Settings, Group, Search, NavArrowLeft, NavArrowRight, InfoCircle, Clock, Journal } from 'iconoir-react';
import Spinner from '@/components/admin/Spinner';

interface PortalAccount {
  managerId: string;
  loginId: string;
  name: string;
  active: boolean;
  tenantCount: number;
}

interface Admin {
  id: string;
  username: string;
  name: string;
  role: string;
  createdAt: string;
  lastLoginAt: string | null;
  portalAccountId: string | null;
  portalAccount: PortalAccount | null;
}

interface LogData {
  id: string;
  action: string;
  actionLabel: string;
  adminId: string;
  adminLoginId: string;
  adminName: string;
  createdAt: string | null;
  email?: string;
  phone?: string;
  userId?: string;
  oldEmail?: string;
  newEmail?: string;
  tenantId?: string;
  brandName?: string;
  changes?: Record<string, { from: unknown; to: unknown }>;
  details?: Record<string, unknown>;
  deletedData?: Record<string, unknown>;
  restoredData?: Record<string, unknown>;
}

interface ActionType {
  value: string;
  label: string;
}

interface AccessLogData {
  id: string;
  adminId: string;
  adminLoginId: string;
  adminName: string;
  accessedAt: string | null;
  ip?: string;
  userAgent?: string;
}

// User-Agent 파싱하여 간결한 브라우저/디바이스 이름 추출
function parseBrowser(userAgent?: string): string {
  if (!userAgent) return '알 수 없음';

  // 모바일 앱
  if (userAgent.includes('Android')) {
    if (userAgent.includes('Mobile')) return 'Android 모바일';
    return 'Android';
  }
  if (userAgent.includes('iPhone') || userAgent.includes('iPad')) {
    if (userAgent.includes('iPad')) return 'iPad';
    return 'iPhone';
  }

  // 데스크톱 브라우저
  if (userAgent.includes('Edg/')) {
    const match = userAgent.match(/Edg\/(\d+)/);
    return match ? `Edge ${match[1]}` : 'Edge';
  }
  if (userAgent.includes('Chrome/') && !userAgent.includes('Chromium')) {
    const match = userAgent.match(/Chrome\/(\d+)/);
    return match ? `Chrome ${match[1]}` : 'Chrome';
  }
  if (userAgent.includes('Firefox/')) {
    const match = userAgent.match(/Firefox\/(\d+)/);
    return match ? `Firefox ${match[1]}` : 'Firefox';
  }
  if (userAgent.includes('Safari/') && !userAgent.includes('Chrome')) {
    const match = userAgent.match(/Version\/(\d+)/);
    return match ? `Safari ${match[1]}` : 'Safari';
  }
  if (userAgent.includes('OPR/')) {
    const match = userAgent.match(/OPR\/(\d+)/);
    return match ? `Opera ${match[1]}` : 'Opera';
  }

  // OS 정보라도 표시
  if (userAgent.includes('Windows')) return 'Windows';
  if (userAgent.includes('Mac OS')) return 'macOS';
  if (userAgent.includes('Linux')) return 'Linux';

  return '알 수 없는 클라이언트';
}

// 권한 정의
const PERMISSION_GROUPS = {
  dashboard: { label: '대시보드', permissions: ['dashboard:read'] },
  members: { label: '회원 관리', permissions: ['members:read', 'members:write', 'members:delete'] },
  admins: { label: '관리자 관리', permissions: ['admins:read', 'admins:write', 'admins:delete'] },
  plans: { label: '상품 관리', permissions: ['plans:read', 'plans:write', 'plans:delete'] },
  payments: { label: '결제 내역', permissions: ['payments:read', 'payments:write', 'payments:export'] },
  subscriptions: { label: '구독 관리', permissions: ['subscriptions:read', 'subscriptions:write'] },
  tenants: { label: '매장 관리', permissions: ['tenants:read', 'tenants:write', 'tenants:delete'] },
  stats: { label: '통계', permissions: ['stats:read'] },
  sms: { label: 'SMS', permissions: ['sms:read', 'sms:send'] },
  alimtalk: { label: '알림톡', permissions: ['alimtalk:read', 'alimtalk:write', 'alimtalk:delete'] },
  faq: { label: 'FAQ 관리', permissions: ['faq:read', 'faq:write', 'faq:delete'] },
  siteSettings: { label: '홈페이지 설정', permissions: ['siteSettings:read', 'siteSettings:write'] },
  terms: { label: '약관/개인정보처리방침', permissions: ['terms:read', 'terms:write'] },
};

const PERMISSION_LABELS: Record<string, string> = {
  'dashboard:read': '조회',
  'members:read': '조회',
  'members:write': '수정',
  'members:delete': '삭제',
  'admins:read': '조회',
  'admins:write': '수정',
  'admins:delete': '삭제',
  'plans:read': '조회',
  'plans:write': '수정',
  'plans:delete': '삭제',
  'payments:read': '조회',
  'payments:write': '수정',
  'payments:export': '내보내기',
  'subscriptions:read': '조회',
  'subscriptions:write': '수정',
  'tenants:read': '조회',
  'tenants:write': '수정',
  'tenants:delete': '삭제',
  'stats:read': '조회',
  'sms:read': '조회',
  'sms:send': '발송',
  'alimtalk:read': '조회',
  'alimtalk:write': '수정',
  'alimtalk:delete': '삭제',
  'faq:read': '조회',
  'faq:write': '수정',
  'faq:delete': '삭제',
  'siteSettings:read': '조회',
  'siteSettings:write': '수정',
  'terms:read': '조회',
  'terms:write': '수정',
};

type RoleType = 'super' | 'admin' | 'viewer';

interface RolePermissions {
  super: string[];
  admin: string[];
  viewer: string[];
}


export default function AdminsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // URL에서 탭 상태 읽기
  type TabType = 'list' | 'permissions' | 'access' | 'task';
  const tabFromUrl = searchParams.get('tab') as TabType | null;
  const initialTab = tabFromUrl === 'permissions' ? 'permissions' : tabFromUrl === 'access' ? 'access' : tabFromUrl === 'task' ? 'task' : 'list';

  const [activeTab, setActiveTab] = useState<TabType>(initialTab);

  // 작업 로그 탭 상태
  const [logsPagination, setLogsPagination] = useState({ page: 1, limit: 30, total: 0, totalPages: 0 });
  const [logsSearch, setLogsSearch] = useState('');
  const [logsSearchSubmitted, setLogsSearchSubmitted] = useState('');
  const [logsActionFilter, setLogsActionFilter] = useState('');
  const [logsDateFrom, setLogsDateFrom] = useState('');
  const [logsDateTo, setLogsDateTo] = useState('');
  const [actionTypes, setActionTypes] = useState<ActionType[]>([]);
  const [selectedLog, setSelectedLog] = useState<LogData | null>(null);

  // 접속 로그 탭 상태
  const [accessLogsPagination, setAccessLogsPagination] = useState({ page: 1, limit: 30, total: 0, totalPages: 0 });
  const [accessLogsSearch, setAccessLogsSearch] = useState('');
  const [accessLogsSearchSubmitted, setAccessLogsSearchSubmitted] = useState('');
  const [accessLogsDateFrom, setAccessLogsDateFrom] = useState('');
  const [accessLogsDateTo, setAccessLogsDateTo] = useState('');

  // SWR: Admins
  const { data: adminsData, isLoading: loading, mutate: mutateAdmins } = useSWR(
    '/api/admin/admins',
    { fallbackData: { admins: [] } }
  );
  const admins: Admin[] = adminsData?.admins || [];

  // SWR: Logs
  const logsParamsStr = (() => {
    const params = new URLSearchParams({ page: logsPagination.page.toString(), limit: logsPagination.limit.toString() });
    if (logsSearchSubmitted) params.set('search', logsSearchSubmitted);
    if (logsActionFilter) params.set('action', logsActionFilter);
    if (logsDateFrom) params.set('dateFrom', logsDateFrom);
    if (logsDateTo) params.set('dateTo', logsDateTo);
    return params.toString();
  })();
  const { data: logsData, isLoading: logsLoading, mutate: mutateLogs } = useSWR(
    activeTab === 'task' ? `/api/admin/logs?${logsParamsStr}` : null,
    { onSuccess: (data: { pagination?: { total: number; totalPages: number }; actionTypes?: ActionType[] }) => {
      setLogsPagination(prev => ({ ...prev, total: data.pagination?.total ?? 0, totalPages: data.pagination?.totalPages ?? 0 }));
      if (data.actionTypes) setActionTypes(data.actionTypes);
    }}
  );
  const logs: LogData[] = logsData?.logs || [];

  // SWR: Access Logs
  const accessLogsParamsStr = (() => {
    const params = new URLSearchParams({ page: accessLogsPagination.page.toString(), limit: accessLogsPagination.limit.toString() });
    if (accessLogsSearchSubmitted) params.set('search', accessLogsSearchSubmitted);
    if (accessLogsDateFrom) params.set('dateFrom', accessLogsDateFrom);
    if (accessLogsDateTo) params.set('dateTo', accessLogsDateTo);
    return params.toString();
  })();
  const { data: accessLogsData, isLoading: accessLogsLoading, mutate: mutateAccessLogs } = useSWR(
    activeTab === 'access' ? `/api/admin/access-log?${accessLogsParamsStr}` : null,
    { onSuccess: (data: { pagination?: { total: number; totalPages: number } }) => {
      setAccessLogsPagination(prev => ({ ...prev, total: data.pagination?.total ?? 0, totalPages: data.pagination?.totalPages ?? 0 }));
    }}
  );
  const accessLogs: AccessLogData[] = accessLogsData?.logs || [];

  // 탭 변경 시 URL 업데이트
  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    const newParams = new URLSearchParams(searchParams.toString());
    newParams.set('tab', tab);
    router.replace(`?${newParams.toString()}`, { scroll: false });
  };
  const [showModal, setShowModal] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState<Admin | null>(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    name: '',
    role: 'admin',
  });

  // SWR: Permissions
  const { data: permissionsData, isLoading: permissionsLoading, mutate: mutatePermissions } = useSWR(
    '/api/admin/permissions',
    { onSuccess: (data: { permissions?: RolePermissions }) => {
      if (data.permissions) setRolePermissions(data.permissions);
    }}
  );

  // 권한 관리 상태
  const [rolePermissions, setRolePermissions] = useState<RolePermissions>({
    super: [],
    admin: [],
    viewer: [],
  });
  const [permissionsSaving, setPermissionsSaving] = useState(false);

  const handleLogsSearch = () => {
    setLogsPagination(prev => ({ ...prev, page: 1 }));
    setLogsSearchSubmitted(logsSearch);
  };

  const handleAccessLogsSearch = () => {
    setAccessLogsPagination(prev => ({ ...prev, page: 1 }));
    setAccessLogsSearchSubmitted(accessLogsSearch);
  };

  // 테이블에 표시할 간단 요약 (API에서 이미 users/tenants 조회해서 매핑됨)
  const getLogSummary = (log: LogData): { brandName?: string; email?: string; phone?: string } => {
    return {
      brandName: log.brandName,
      email: log.action === 'email_change' ? log.newEmail : log.email,
      phone: log.phone,
    };
  };

  const handleSavePermissions = async () => {
    setPermissionsSaving(true);
    try {
      const response = await fetch('/api/admin/permissions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissions: rolePermissions }),
      });

      if (response.ok) {
        alert('권한 설정이 저장되었습니다.');
      } else {
        alert('저장에 실패했습니다.');
      }
    } catch (error) {
      console.error('Failed to save permissions:', error);
      alert('저장에 실패했습니다.');
    } finally {
      setPermissionsSaving(false);
    }
  };

  const togglePermission = (role: RoleType, permission: string) => {
    setRolePermissions((prev) => {
      const current = prev[role];
      const updated = current.includes(permission)
        ? current.filter((p) => p !== permission)
        : [...current, permission];
      return { ...prev, [role]: updated };
    });
  };

  const toggleAllPermissionsInGroup = (role: RoleType, groupKey: string) => {
    const group = PERMISSION_GROUPS[groupKey as keyof typeof PERMISSION_GROUPS];
    if (!group) return;

    const allChecked = group.permissions.every((p) => rolePermissions[role].includes(p));

    setRolePermissions((prev) => {
      let updated = [...prev[role]];
      if (allChecked) {
        updated = updated.filter((p) => !group.permissions.includes(p));
      } else {
        group.permissions.forEach((p) => {
          if (!updated.includes(p)) {
            updated.push(p);
          }
        });
      }
      return { ...prev, [role]: updated };
    });
  };

  const handleOpenModal = (admin?: Admin) => {
    if (admin) {
      setEditingAdmin(admin);
      setFormData({
        username: admin.username,
        password: '',
        name: admin.name,
        role: admin.role,
      });
    } else {
      setEditingAdmin(null);
      setFormData({
        username: '',
        password: '',
        name: '',
        role: 'admin',
      });
    }
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingAdmin(null);
  };

  // 포탈 계정 모달 상태
  const [showPortalModal, setShowPortalModal] = useState(false);
  const [portalTargetAdmin, setPortalTargetAdmin] = useState<Admin | null>(null);
  const [portalName, setPortalName] = useState('');
  const [portalActive, setPortalActive] = useState(true);
  const [portalTenants, setPortalTenants] = useState<Array<{ tenantId: string; brandName: string; permissions: Record<string, string> }>>([]);
  const [portalSaving, setPortalSaving] = useState(false);

  // 매장 선택 모달 상태
  const [showTenantSelectModal, setShowTenantSelectModal] = useState(false);
  const [allTenants, setAllTenants] = useState<Array<{ tenantId: string; brandName: string }>>([]);
  const [tenantSelectLoading, setTenantSelectLoading] = useState(false);
  const [tenantSelectSearch, setTenantSelectSearch] = useState('');
  const [checkedTenantIds, setCheckedTenantIds] = useState<Set<string>>(new Set());

  const defaultPermissions = { conversations: 'write', data: 'write', statistics: 'write', tasks: 'write', mypage: 'hidden', accounts: 'write' };

  const handleOpenPortalModal = (admin: Admin) => {
    setPortalTargetAdmin(admin);
    setPortalName(admin.portalAccount ? admin.portalAccount.name : admin.name);
    setPortalActive(admin.portalAccount ? admin.portalAccount.active : true);
    setPortalTenants([]);
    if (admin.portalAccount && admin.portalAccountId) {
      fetch(`/api/admin/portal-accounts?managerId=${admin.portalAccountId}`)
        .then(r => r.json())
        .then(data => {
          if (data.portalAccount?.tenants) {
            setPortalTenants(data.portalAccount.tenants.map((t: { tenantId: string; brandName?: string; permissions: Record<string, string> }) => ({
              tenantId: t.tenantId, brandName: t.brandName || t.tenantId, permissions: t.permissions || defaultPermissions,
            })));
          }
        });
    }
    setShowPortalModal(true);
  };

  const handleClosePortalModal = () => {
    setShowPortalModal(false);
    setPortalTargetAdmin(null);
  };

  const handleRemovePortalTenant = (tenantId: string) => {
    setPortalTenants(prev => prev.filter(t => t.tenantId !== tenantId));
  };

  // 매장 선택 모달 열기
  const handleOpenTenantSelect = async () => {
    setTenantSelectSearch('');
    setCheckedTenantIds(new Set(portalTenants.map(t => t.tenantId)));
    setShowTenantSelectModal(true);
    setTenantSelectLoading(true);
    try {
      const res = await fetch('/api/admin/tenants?limit=200');
      const data = await res.json();
      setAllTenants((data.tenants || []).map((t: { tenantId: string; brandName: string }) => ({ tenantId: t.tenantId, brandName: t.brandName })));
    } catch { /* ignore */ }
    finally { setTenantSelectLoading(false); }
  };

  const handleTenantSelectConfirm = () => {
    const selectedList = allTenants.filter(t => checkedTenantIds.has(t.tenantId));
    setPortalTenants(selectedList.map(t => {
      const existing = portalTenants.find(p => p.tenantId === t.tenantId);
      return existing || { tenantId: t.tenantId, brandName: t.brandName, permissions: defaultPermissions };
    }));
    setShowTenantSelectModal(false);
  };

  const filteredTenants = allTenants.filter(t =>
    t.brandName.toLowerCase().includes(tenantSelectSearch.toLowerCase()) ||
    t.tenantId.toLowerCase().includes(tenantSelectSearch.toLowerCase())
  );

  const allFilteredChecked = filteredTenants.length > 0 && filteredTenants.every(t => checkedTenantIds.has(t.tenantId));

  const handleToggleAllFiltered = () => {
    setCheckedTenantIds(prev => {
      const next = new Set(prev);
      if (allFilteredChecked) {
        filteredTenants.forEach(t => next.delete(t.tenantId));
      } else {
        filteredTenants.forEach(t => next.add(t.tenantId));
      }
      return next;
    });
  };

  const handleSavePortalAccount = async () => {
    if (!portalTargetAdmin) return;
    if (!portalName.trim()) { alert('이름을 입력해주세요.'); return; }
    setPortalSaving(true);
    try {
      if (portalTargetAdmin.portalAccount) {
        // 수정
        const res = await fetch(`/api/admin/portal-accounts/${portalTargetAdmin.portalAccountId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: portalName, active: portalActive, tenants: portalTenants }),
        });
        if (!res.ok) { const d = await res.json(); alert(d.error || '저장 실패'); return; }
      } else {
        // 생성
        const res = await fetch('/api/admin/portal-accounts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetAdminId: portalTargetAdmin.id, name: portalName, tenants: portalTenants }),
        });
        if (!res.ok) { const d = await res.json(); alert(d.error || '생성 실패'); return; }
      }
      handleClosePortalModal();
      mutateAdmins();
    } catch {
      alert('오류가 발생했습니다.');
    } finally {
      setPortalSaving(false);
    }
  };

  const handleDeletePortalAccount = async (admin: Admin) => {
    if (!admin.portalAccountId) return;
    if (!confirm(`"${admin.portalAccount?.loginId}" 포탈 계정을 삭제하시겠습니까?`)) return;
    try {
      const res = await fetch(`/api/admin/portal-accounts/${admin.portalAccountId}`, { method: 'DELETE' });
      if (res.ok) { mutateAdmins(); }
      else { const d = await res.json(); alert(d.error || '삭제 실패'); }
    } catch { alert('오류가 발생했습니다.'); }
  };

  const handleSave = async () => {
    if (!formData.username || !formData.name || !formData.role) {
      alert('필수 항목을 모두 입력해주세요.');
      return;
    }

    if (!editingAdmin && !formData.password) {
      alert('비밀번호를 입력해주세요.');
      return;
    }

    setSaving(true);
    try {
      const url = editingAdmin
        ? `/api/admin/admins/${editingAdmin.id}`
        : '/api/admin/admins';

      const response = await fetch(url, {
        method: editingAdmin ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        handleCloseModal();
        mutateAdmins();
      } else {
        const data = await response.json();
        alert(data.error || '저장에 실패했습니다.');
      }
    } catch (error) {
      console.error('Failed to save admin:', error);
      alert('저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (admin: Admin) => {
    if (!confirm(`정말 "${admin.name}" 관리자를 삭제하시겠습니까?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/admins/${admin.id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        mutateAdmins();
      } else {
        const data = await response.json();
        alert(data.error || '삭제에 실패했습니다.');
      }
    } catch (error) {
      console.error('Failed to delete admin:', error);
      alert('삭제에 실패했습니다.');
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'owner':
        return <span className="text-xs font-semibold text-amber-600">소유자</span>;
      case 'super':
        return <span className="text-xs font-medium text-gray-700">슈퍼관리자</span>;
      case 'admin':
        return <span className="text-xs font-medium text-gray-600">관리자</span>;
      case 'viewer':
        return <span className="text-xs text-gray-400">뷰어</span>;
      default:
        return <span className="text-xs text-gray-400">{role}</span>;
    }
  };

  return (
    <div className="space-y-6 overflow-x-hidden">
      <div className="flex items-center justify-between flex-wrap gap-4 sticky left-0">
        <div className="flex items-center gap-3">
          <UserCrown className="w-8 h-8 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900">관리자</h1>
        </div>
        {activeTab === 'list' && (
          <button
            onClick={() => handleOpenModal()}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shrink-0"
          >
            <Plus className="w-4 h-4" />
            관리자 추가
          </button>
        )}
        {activeTab === 'permissions' && (
          <button
            onClick={handleSavePermissions}
            disabled={permissionsSaving}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shrink-0 disabled:opacity-50"
          >
            {permissionsSaving ? (
              <RefreshDouble className="w-4 h-4 animate-spin" />
            ) : (
              <Settings className="w-4 h-4" />
            )}
            권한 저장
          </button>
        )}
      </div>

      {/* 탭 */}
      <div className="flex gap-2 border-b border-gray-200">
        <button
          onClick={() => handleTabChange('list')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'list'
              ? 'text-blue-600 border-blue-600'
              : 'text-gray-500 border-transparent hover:text-gray-700'
          }`}
        >
          <Group className="w-4 h-4" />
          관리자 목록
        </button>
        <button
          onClick={() => handleTabChange('permissions')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'permissions'
              ? 'text-blue-600 border-blue-600'
              : 'text-gray-500 border-transparent hover:text-gray-700'
          }`}
        >
          <Settings className="w-4 h-4" />
          권한 관리
        </button>
        <button
          onClick={() => handleTabChange('access')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'access'
              ? 'text-blue-600 border-blue-600'
              : 'text-gray-500 border-transparent hover:text-gray-700'
          }`}
        >
          <Clock className="w-4 h-4" />
          접속 로그
        </button>
        <button
          onClick={() => handleTabChange('task')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'task'
              ? 'text-blue-600 border-blue-600'
              : 'text-gray-500 border-transparent hover:text-gray-700'
          }`}
        >
          <Journal className="w-4 h-4" />
          작업 로그
        </button>
      </div>

      {/* 관리자 목록 탭 */}
      {activeTab === 'list' && (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Spinner size="md" />
          </div>
        ) : admins.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            등록된 관리자가 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-max">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-center px-4 py-4 text-sm font-medium text-gray-500 w-12">No.</th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">이름</th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">아이디</th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">권한</th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">포탈 계정</th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">마지막 로그인</th>
                  <th className="text-center px-6 py-4 text-sm font-medium text-gray-500">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {admins.map((admin, index) => (
                  <tr key={admin.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-4 text-sm text-center text-gray-400 font-mono">
                      {index + 1}
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">
                      {admin.name || '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {admin.username || '-'}
                    </td>
                    <td className="px-6 py-4">
                      {getRoleBadge(admin.role)}
                    </td>
                    <td className="px-6 py-4">
                      {admin.portalAccount ? (
                        <div className="flex items-center gap-2 group">
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${admin.portalAccount.active ? 'bg-green-400' : 'bg-gray-300'}`} />
                          <span className="text-sm text-gray-700">{admin.portalAccount.loginId}</span>
                          {admin.portalAccount.tenantCount > 0 && (
                            <span className="text-xs text-gray-400">{admin.portalAccount.tenantCount}개</span>
                          )}
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => handleOpenPortalModal(admin)}
                              className="p-1 hover:bg-gray-100 rounded transition-colors"
                              title="포탈 계정 수정"
                            >
                              <EditPencil className="w-3.5 h-3.5 text-gray-400" />
                            </button>
                            <button
                              onClick={() => handleDeletePortalAccount(admin)}
                              className="p-1 hover:bg-red-50 rounded transition-colors"
                              title="포탈 계정 삭제"
                            >
                              <Trash className="w-3.5 h-3.5 text-red-400" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleOpenPortalModal(admin)}
                          className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          계정 생성
                        </button>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {admin.lastLoginAt
                        ? new Date(admin.lastLoginAt).toLocaleString('ko-KR')
                        : '-'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleOpenModal(admin)}
                          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                          title="수정"
                        >
                          <EditPencil className="w-4 h-4 text-gray-500" />
                        </button>
                        <button
                          onClick={() => handleDelete(admin)}
                          disabled={admin.role === 'owner'}
                          className="p-2 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                          title={admin.role === 'owner' ? '소유자는 삭제할 수 없습니다' : '삭제'}
                        >
                          <Trash className="w-4 h-4 text-red-500" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}

      {/* 권한 관리 탭 */}
      {activeTab === 'permissions' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {permissionsLoading ? (
            <div className="flex items-center justify-center py-20">
              <Spinner size="md" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-max">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-6 py-4 text-sm font-medium text-gray-500 min-w-[180px]">기능</th>
                    <th className="text-center px-6 py-4 text-sm font-medium text-gray-500">
                      <div className="flex flex-col items-center gap-1">
                        <span className="px-2 py-1 text-xs font-medium bg-purple-100 text-purple-700 rounded-full">슈퍼관리자</span>
                      </div>
                    </th>
                    <th className="text-center px-6 py-4 text-sm font-medium text-gray-500">
                      <div className="flex flex-col items-center gap-1">
                        <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded-full">관리자</span>
                      </div>
                    </th>
                    <th className="text-center px-6 py-4 text-sm font-medium text-gray-500">
                      <div className="flex flex-col items-center gap-1">
                        <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded-full">뷰어</span>
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {Object.entries(PERMISSION_GROUPS).map(([groupKey, group]) => (
                    <Fragment key={groupKey}>
                      {/* 그룹 헤더 */}
                      <tr className="bg-gray-50/50">
                        <td className="px-6 py-3 text-sm font-semibold text-gray-900">
                          {group.label}
                        </td>
                        {(['super', 'admin', 'viewer'] as RoleType[]).map((role) => {
                          const allChecked = group.permissions.every((p) => rolePermissions[role].includes(p));
                          const someChecked = group.permissions.some((p) => rolePermissions[role].includes(p));
                          return (
                            <td key={role} className="px-6 py-3 text-center">
                              <input
                                type="checkbox"
                                checked={allChecked}
                                ref={(el) => {
                                  if (el) el.indeterminate = someChecked && !allChecked;
                                }}
                                onChange={() => toggleAllPermissionsInGroup(role, groupKey)}
                                className="w-4 h-4 accent-gray-700 border-gray-300 rounded"
                              />
                            </td>
                          );
                        })}
                      </tr>
                      {/* 개별 권한 */}
                      {group.permissions.map((permission) => (
                        <tr key={permission} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-3 text-sm text-gray-600 pl-10">
                            {PERMISSION_LABELS[permission] || permission}
                          </td>
                          {(['super', 'admin', 'viewer'] as RoleType[]).map((role) => (
                            <td key={role} className="px-6 py-3 text-center">
                              <input
                                type="checkbox"
                                checked={rolePermissions[role].includes(permission)}
                                onChange={() => togglePermission(role, permission)}
                                className="w-4 h-4 accent-gray-700 border-gray-300 rounded"
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-100">
            <p className="text-sm text-gray-500">
              <strong>소유자(Owner)</strong>는 모든 권한을 가지며, 권한 설정이 적용되지 않습니다.
            </p>
          </div>
        </div>
      )}

      {/* 접속 로그 탭 */}
      {activeTab === 'access' && (
        <div className="space-y-4">
          {/* 검색 및 필터 */}
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <input
                  type="text"
                  value={accessLogsSearch}
                  onChange={(e) => setAccessLogsSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAccessLogsSearch()}
                  placeholder="관리자명, 아이디, IP 검색..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={accessLogsDateFrom}
                onChange={(e) => {
                  setAccessLogsDateFrom(e.target.value);
                  setAccessLogsPagination(prev => ({ ...prev, page: 1 }));
                }}
                className="px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
              />
              <span className="text-gray-400">~</span>
              <input
                type="date"
                value={accessLogsDateTo}
                onChange={(e) => {
                  setAccessLogsDateTo(e.target.value);
                  setAccessLogsPagination(prev => ({ ...prev, page: 1 }));
                }}
                className="px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>
            <button
              onClick={handleAccessLogsSearch}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              검색
            </button>
          </div>

          {/* 접속 로그 테이블 */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            {accessLogsLoading ? (
              <div className="flex items-center justify-center py-20">
                <Spinner size="md" />
              </div>
            ) : accessLogs.length === 0 ? (
              <div className="text-center py-20 text-gray-500">
                접속 기록이 없습니다.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-max">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="text-left px-4 py-3 text-sm font-medium text-gray-500 whitespace-nowrap">접속 일시</th>
                      <th className="text-left px-4 py-3 text-sm font-medium text-gray-500 whitespace-nowrap">관리자</th>
                      <th className="text-left px-4 py-3 text-sm font-medium text-gray-500 whitespace-nowrap">아이디</th>
                      <th className="text-left px-4 py-3 text-sm font-medium text-gray-500 whitespace-nowrap">IP</th>
                      <th className="text-left px-4 py-3 text-sm font-medium text-gray-500 whitespace-nowrap">브라우저</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {accessLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                          {log.accessedAt ? new Date(log.accessedAt).toLocaleString('ko-KR') : '-'}
                        </td>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">
                          {log.adminName || '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                          {log.adminLoginId || '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 font-mono whitespace-nowrap">
                          {log.ip || '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1" title={log.userAgent}>
                            {parseBrowser(log.userAgent)}
                            <InfoCircle className="w-3.5 h-3.5 text-gray-400 cursor-help" />
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* 페이지네이션 */}
            {accessLogsPagination.totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
                <p className="text-sm text-gray-500">
                  총 {accessLogsPagination.total}건 중 {(accessLogsPagination.page - 1) * accessLogsPagination.limit + 1}-{Math.min(accessLogsPagination.page * accessLogsPagination.limit, accessLogsPagination.total)}건
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setAccessLogsPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                    disabled={accessLogsPagination.page === 1}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <NavArrowLeft className="w-4 h-4" />
                  </button>
                  <span className="text-sm text-gray-600">
                    {accessLogsPagination.page} / {accessLogsPagination.totalPages}
                  </span>
                  <button
                    onClick={() => setAccessLogsPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                    disabled={accessLogsPagination.page === accessLogsPagination.totalPages}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <NavArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 작업 로그 탭 */}
      {activeTab === 'task' && (
        <div className="space-y-4">
          {/* 검색 및 필터 */}
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <input
                  type="text"
                  value={logsSearch}
                  onChange={(e) => setLogsSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleLogsSearch()}
                  placeholder="관리자명, 매장명, 이메일, 연락처 검색..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              </div>
            </div>
            <select
              value={logsActionFilter}
              onChange={(e) => {
                setLogsActionFilter(e.target.value);
                setLogsPagination(prev => ({ ...prev, page: 1 }));
              }}
              className="px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">전체 액션</option>
              {actionTypes.map((type) => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={logsDateFrom}
                onChange={(e) => {
                  setLogsDateFrom(e.target.value);
                  setLogsPagination(prev => ({ ...prev, page: 1 }));
                }}
                className="px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
              />
              <span className="text-gray-400">~</span>
              <input
                type="date"
                value={logsDateTo}
                onChange={(e) => {
                  setLogsDateTo(e.target.value);
                  setLogsPagination(prev => ({ ...prev, page: 1 }));
                }}
                className="px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>
            <button
              onClick={handleLogsSearch}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              검색
            </button>
          </div>

          {/* 로그 테이블 */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            {logsLoading ? (
              <div className="flex items-center justify-center py-20">
                <Spinner size="md" />
              </div>
            ) : logs.length === 0 ? (
              <div className="text-center py-20 text-gray-500">
                처리 내역이 없습니다.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-max">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">일시</th>
                      <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">관리자</th>
                      <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">아이디</th>
                      <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">유형</th>
                      <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">매장명</th>
                      <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">이메일</th>
                      <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">연락처</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {logs.map((log) => {
                      const summary = getLogSummary(log);
                      return (
                        <tr
                          key={log.id}
                          onClick={() => setSelectedLog(log)}
                          className="hover:bg-gray-50 transition-colors cursor-pointer"
                        >
                          <td className="px-6 py-4 text-sm text-gray-600 whitespace-nowrap">
                            {log.createdAt ? new Date(log.createdAt).toLocaleString('ko-KR') : '-'}
                          </td>
                          <td className="px-6 py-4 text-sm font-medium text-gray-900">
                            {log.adminName || '-'}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600">
                            {log.adminLoginId || '-'}
                          </td>
                          <td className="px-6 py-4">
                            <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded-full">
                              {log.actionLabel}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600">
                            {summary.brandName || '-'}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600">
                            {summary.email || '-'}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600">
                            {summary.phone || '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* 페이지네이션 */}
            {logsPagination.totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
                <p className="text-sm text-gray-500">
                  총 {logsPagination.total}건 중 {(logsPagination.page - 1) * logsPagination.limit + 1}-{Math.min(logsPagination.page * logsPagination.limit, logsPagination.total)}건
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setLogsPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                    disabled={logsPagination.page === 1}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <NavArrowLeft className="w-4 h-4" />
                  </button>
                  <span className="text-sm text-gray-600">
                    {logsPagination.page} / {logsPagination.totalPages}
                  </span>
                  <button
                    onClick={() => setLogsPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                    disabled={logsPagination.page === logsPagination.totalPages}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <NavArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 모달 */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold">
                {editingAdmin ? '관리자 수정' : '관리자 추가'}
              </h2>
              <button
                onClick={handleCloseModal}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <Xmark className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  아이디 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="아이디 입력"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  비밀번호 {!editingAdmin && <span className="text-red-500">*</span>}
                </label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder={editingAdmin ? '변경 시에만 입력' : '비밀번호 입력'}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  이름 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="이름 입력"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  권한 <span className="text-red-500">*</span>
                </label>
                {editingAdmin?.role === 'owner' ? (
                  <div className="w-full px-4 py-2 border border-gray-200 rounded-lg bg-gray-100 text-gray-600">
                    소유자 (변경 불가)
                  </div>
                ) : (
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="super">슈퍼관리자 (모든 권한)</option>
                    <option value="admin">관리자 (관리자 관리 제외)</option>
                    <option value="viewer">뷰어 (읽기 전용)</option>
                  </select>
                )}
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleCloseModal}
                className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {saving ? <RefreshDouble className="w-5 h-5 animate-spin mx-auto" /> : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 포탈 계정 모달 */}
      {showPortalModal && portalTargetAdmin && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-bold">
                  {portalTargetAdmin.portalAccount ? '포탈 계정 수정' : '포탈 계정 생성'}
                </h2>
                <p className="text-sm text-gray-500 mt-0.5">{portalTargetAdmin.name}</p>
              </div>
              <button onClick={handleClosePortalModal} className="p-2 hover:bg-gray-100 rounded-lg">
                <Xmark className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-5">
              {/* 아이디/비밀번호 안내 */}
              <div className="bg-gray-50 rounded-lg px-4 py-3 text-xs text-gray-500 space-y-1">
                <p><span className="text-gray-400">아이디</span> <span className="font-mono text-gray-700 ml-2">{portalTargetAdmin.portalAccount ? portalTargetAdmin.portalAccount.loginId : portalTargetAdmin.username}</span></p>
                <p><span className="text-gray-400">비밀번호</span> <span className="ml-2 text-gray-500">관리자 계정과 동일 · 자동 동기화</span></p>
              </div>

              {/* 이름 */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">이름</label>
                <input
                  type="text"
                  value={portalName}
                  onChange={e => setPortalName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
                  placeholder="이름 입력"
                />
              </div>

              {/* 활성 상태 (수정 시에만) */}
              {portalTargetAdmin.portalAccount && (
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-gray-500">활성 상태</label>
                  <button
                    type="button"
                    onClick={() => setPortalActive(v => !v)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${portalActive ? 'bg-gray-700' : 'bg-gray-200'}`}
                  >
                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${portalActive ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
                  </button>
                </div>
              )}

              {/* 매장 배정 */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-gray-500">매장 배정</label>
                  <button
                    type="button"
                    onClick={handleOpenTenantSelect}
                    className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                    매장 선택
                  </button>
                </div>
                {portalTenants.length === 0 ? (
                  <p className="text-xs text-gray-400 py-3 text-center">배정된 매장이 없습니다.</p>
                ) : (
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {portalTenants.map(t => (
                      <div key={t.tenantId} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 group">
                        <span className="text-sm text-gray-700">{t.brandName}</span>
                        <button onClick={() => handleRemovePortalTenant(t.tenantId)} className="p-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Xmark className="w-3.5 h-3.5 text-gray-400 hover:text-red-400" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={handleClosePortalModal}
                className="flex-1 px-4 py-2 border border-gray-200 text-sm text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleSavePortalAccount}
                disabled={portalSaving}
                className="flex-1 px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-40"
              >
                {portalSaving ? <RefreshDouble className="w-4 h-4 animate-spin mx-auto" /> : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 매장 선택 모달 */}
      {showTenantSelectModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-gray-900">매장 선택</h3>
              <button onClick={() => setShowTenantSelectModal(false)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <Xmark className="w-4 h-4" />
              </button>
            </div>

            {/* 검색 */}
            <div className="relative mb-3">
              <input
                type="text"
                value={tenantSelectSearch}
                onChange={e => setTenantSelectSearch(e.target.value)}
                placeholder="매장명 검색..."
                className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            </div>

            {/* 전체선택 */}
            {!tenantSelectLoading && filteredTenants.length > 0 && (
              <div className="flex items-center gap-2 px-2 pb-2 border-b border-gray-100 mb-2">
                <input
                  type="checkbox"
                  id="tenant-select-all"
                  checked={allFilteredChecked}
                  onChange={handleToggleAllFiltered}
                  className="w-4 h-4 accent-gray-700 border-gray-300 rounded"
                />
                <label htmlFor="tenant-select-all" className="text-sm text-gray-600 cursor-pointer select-none">
                  전체 선택 ({filteredTenants.length}개)
                </label>
              </div>
            )}

            {/* 목록 */}
            <div className="flex-1 overflow-y-auto min-h-0">
              {tenantSelectLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Spinner size="sm" />
                </div>
              ) : filteredTenants.length === 0 ? (
                <p className="text-center text-sm text-gray-400 py-8">
                  {tenantSelectSearch ? '검색 결과가 없습니다.' : '매장이 없습니다.'}
                </p>
              ) : (
                <div className="space-y-1">
                  {filteredTenants.map(t => (
                    <label
                      key={t.tenantId}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={checkedTenantIds.has(t.tenantId)}
                        onChange={() => {
                          setCheckedTenantIds(prev => {
                            const next = new Set(prev);
                            if (next.has(t.tenantId)) next.delete(t.tenantId);
                            else next.add(t.tenantId);
                            return next;
                          });
                        }}
                        className="w-4 h-4 accent-gray-700 border-gray-300 rounded shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="text-sm text-gray-800 truncate">{t.brandName}</p>
                        <p className="text-xs text-gray-400 font-mono truncate">{t.tenantId}</p>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* 선택 카운트 + 버튼 */}
            <div className="flex items-center justify-between gap-3 mt-4 pt-4 border-t border-gray-100">
              <span className="text-sm text-gray-500">{checkedTenantIds.size}개 선택됨</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowTenantSelectModal(false)}
                  className="px-4 py-2 border border-gray-200 text-sm text-gray-600 rounded-lg hover:bg-gray-50"
                >
                  취소
                </button>
                <button
                  onClick={handleTenantSelectConfirm}
                  className="px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800"
                >
                  확인
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 로그 상세 모달 */}
      {selectedLog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold">처리 내역 상세</h2>
              <button
                onClick={() => setSelectedLog(null)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <Xmark className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* 기본 정보 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">일시</label>
                  <p className="text-sm text-gray-900">
                    {selectedLog.createdAt ? new Date(selectedLog.createdAt).toLocaleString('ko-KR') : '-'}
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">유형</label>
                  <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded-full">
                    {selectedLog.actionLabel}
                  </span>
                </div>
              </div>

              <div className="border-t border-gray-100 pt-4">
                <label className="block text-xs font-medium text-gray-500 mb-2">처리 관리자</label>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-sm text-gray-900 font-medium">{selectedLog.adminName || '-'}</p>
                  <p className="text-xs text-gray-500">{selectedLog.adminLoginId || '-'}</p>
                </div>
              </div>

              {/* 대상 정보 */}
              {(selectedLog.email || selectedLog.userId || selectedLog.tenantId) && (
                <div className="border-t border-gray-100 pt-4">
                  <label className="block text-xs font-medium text-gray-500 mb-2">대상 정보</label>
                  <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                    {selectedLog.tenantId && (
                      <div className="flex justify-between">
                        <span className="text-xs text-gray-500">매장 ID</span>
                        <span className="text-sm text-gray-900 font-mono">{selectedLog.tenantId}</span>
                      </div>
                    )}
                    {selectedLog.userId && (
                      <div className="flex justify-between">
                        <span className="text-xs text-gray-500">회원 ID</span>
                        <span className="text-sm text-gray-900 font-mono">{selectedLog.userId}</span>
                      </div>
                    )}
                    {selectedLog.email && (
                      <div className="flex justify-between">
                        <span className="text-xs text-gray-500">이메일</span>
                        <span className="text-sm text-gray-900">{selectedLog.email}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 이메일 변경 */}
              {selectedLog.action === 'email_change' && selectedLog.oldEmail && selectedLog.newEmail && (
                <div className="border-t border-gray-100 pt-4">
                  <label className="block text-xs font-medium text-gray-500 mb-2">이메일 변경</label>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-600">{selectedLog.oldEmail}</span>
                      <span className="text-gray-400">→</span>
                      <span className="text-sm text-gray-900 font-medium">{selectedLog.newEmail}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* 변경 내역 */}
              {selectedLog.changes && Object.keys(selectedLog.changes).length > 0 && (
                <div className="border-t border-gray-100 pt-4">
                  <label className="block text-xs font-medium text-gray-500 mb-2">변경 내역</label>
                  <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                    {Object.entries(selectedLog.changes).map(([key, val]) => (
                      <div key={key} className="flex flex-col">
                        <span className="text-xs text-gray-500">{key}</span>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-sm text-gray-600">{String(val.from ?? '(없음)')}</span>
                          <span className="text-gray-400">→</span>
                          <span className="text-sm text-gray-900 font-medium">{String(val.to ?? '(없음)')}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 상세 정보 */}
              {selectedLog.details && Object.keys(selectedLog.details).length > 0 && (
                <div className="border-t border-gray-100 pt-4">
                  <label className="block text-xs font-medium text-gray-500 mb-2">상세 정보</label>
                  <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                    {Object.entries(selectedLog.details).map(([key, val]) => (
                      <div key={key} className="flex justify-between">
                        <span className="text-xs text-gray-500">{key}</span>
                        <span className="text-sm text-gray-900">{String(val)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 삭제된 데이터 */}
              {selectedLog.deletedData && Object.keys(selectedLog.deletedData).length > 0 && (
                <div className="border-t border-gray-100 pt-4">
                  <label className="block text-xs font-medium text-gray-500 mb-2">삭제된 데이터</label>
                  <div className="bg-red-50 rounded-lg p-3 space-y-2">
                    {Object.entries(selectedLog.deletedData)
                      .filter(([, val]) => val)
                      .map(([key, val]) => (
                        <div key={key} className="flex justify-between">
                          <span className="text-xs text-red-600">{key}</span>
                          <span className="text-sm text-red-900">{String(val)}</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* 복구된 데이터 */}
              {selectedLog.restoredData && Object.keys(selectedLog.restoredData).length > 0 && (
                <div className="border-t border-gray-100 pt-4">
                  <label className="block text-xs font-medium text-gray-500 mb-2">복구된 데이터</label>
                  <div className="bg-green-50 rounded-lg p-3 space-y-2">
                    {Object.entries(selectedLog.restoredData)
                      .filter(([key, val]) => val && !key.includes('deleted'))
                      .map(([key, val]) => (
                        <div key={key} className="flex justify-between">
                          <span className="text-xs text-green-600">{key}</span>
                          <span className="text-sm text-green-900">{String(val)}</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6">
              <button
                onClick={() => setSelectedLog(null)}
                className="w-full px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
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
