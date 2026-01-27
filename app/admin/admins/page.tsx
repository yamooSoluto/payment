'use client';

import { useState, useEffect, Fragment } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { UserCrown, Plus, EditPencil, Trash, RefreshDouble, Xmark, Settings, Group, List, Search, NavArrowLeft, NavArrowRight } from 'iconoir-react';
import Spinner from '@/components/admin/Spinner';

interface Admin {
  id: string;
  username: string;
  name: string;
  role: string;
  createdAt: string;
  lastLoginAt: string | null;
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
  type TabType = 'list' | 'permissions' | 'task';
  const tabFromUrl = searchParams.get('tab') as TabType | null;
  const initialTab = tabFromUrl === 'permissions' ? 'permissions' : tabFromUrl === 'task' ? 'task' : 'list';

  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [loading, setLoading] = useState(true);

  // Task 탭 상태
  const [logs, setLogs] = useState<LogData[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsPagination, setLogsPagination] = useState({ page: 1, limit: 30, total: 0, totalPages: 0 });
  const [logsSearch, setLogsSearch] = useState('');
  const [logsActionFilter, setLogsActionFilter] = useState('');
  const [actionTypes, setActionTypes] = useState<ActionType[]>([]);
  const [selectedLog, setSelectedLog] = useState<LogData | null>(null);

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

  // 권한 관리 상태
  const [rolePermissions, setRolePermissions] = useState<RolePermissions>({
    super: [],
    admin: [],
    viewer: [],
  });
  const [permissionsLoading, setPermissionsLoading] = useState(false);
  const [permissionsSaving, setPermissionsSaving] = useState(false);

  useEffect(() => {
    fetchAdmins();
    fetchRolePermissions();
  }, []);

  // Task 탭이 활성화될 때 로그 조회
  useEffect(() => {
    if (activeTab === 'task') {
      fetchLogs();
    }
  }, [activeTab, logsPagination.page, logsActionFilter]);

  const fetchLogs = async () => {
    setLogsLoading(true);
    try {
      const params = new URLSearchParams({
        page: logsPagination.page.toString(),
        limit: logsPagination.limit.toString(),
      });
      if (logsSearch) params.set('search', logsSearch);
      if (logsActionFilter) params.set('action', logsActionFilter);

      const response = await fetch(`/api/admin/logs?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setLogs(data.logs);
        setLogsPagination(prev => ({ ...prev, total: data.pagination.total, totalPages: data.pagination.totalPages }));
        if (data.actionTypes) {
          setActionTypes(data.actionTypes);
        }
      }
    } catch (error) {
      console.error('Failed to fetch logs:', error);
    } finally {
      setLogsLoading(false);
    }
  };

  const handleLogsSearch = () => {
    setLogsPagination(prev => ({ ...prev, page: 1 }));
    fetchLogs();
  };

  // 테이블에 표시할 간단 요약 (API에서 이미 users/tenants 조회해서 매핑됨)
  const getLogSummary = (log: LogData): { brandName?: string; email?: string; phone?: string } => {
    return {
      brandName: log.brandName,
      email: log.action === 'email_change' ? log.newEmail : log.email,
      phone: log.phone,
    };
  };

  const fetchRolePermissions = async () => {
    setPermissionsLoading(true);
    try {
      const response = await fetch('/api/admin/permissions');
      if (response.ok) {
        const data = await response.json();
        setRolePermissions(data.permissions);
      }
    } catch (error) {
      console.error('Failed to fetch permissions:', error);
    } finally {
      setPermissionsLoading(false);
    }
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

  const fetchAdmins = async () => {
    try {
      const response = await fetch('/api/admin/admins');
      if (response.ok) {
        const data = await response.json();
        setAdmins(data.admins);
      }
    } catch (error) {
      console.error('Failed to fetch admins:', error);
    } finally {
      setLoading(false);
    }
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
        fetchAdmins();
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
        fetchAdmins();
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
        return <span className="px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-700 rounded-full">소유자</span>;
      case 'super':
        return <span className="px-2 py-1 text-xs font-medium bg-purple-100 text-purple-700 rounded-full">슈퍼관리자</span>;
      case 'admin':
        return <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded-full">관리자</span>;
      case 'viewer':
        return <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded-full">뷰어</span>;
      default:
        return <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-500 rounded-full">{role}</span>;
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
          onClick={() => handleTabChange('task')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'task'
              ? 'text-blue-600 border-blue-600'
              : 'text-gray-500 border-transparent hover:text-gray-700'
          }`}
        >
          <List className="w-4 h-4" />
          Task
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
                  <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">이름</th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">아이디</th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">권한</th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">마지막 로그인</th>
                  <th className="text-center px-6 py-4 text-sm font-medium text-gray-500">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {admins.map((admin) => (
                  <tr key={admin.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">
                      {admin.name || '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {admin.username || '-'}
                    </td>
                    <td className="px-6 py-4">
                      {getRoleBadge(admin.role)}
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
                                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
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
                                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
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

      {/* Task 탭 */}
      {activeTab === 'task' && (
        <div className="space-y-4">
          {/* 검색 및 필터 */}
          <div className="flex flex-wrap gap-3">
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
