'use client';

import { useState, useEffect, Fragment } from 'react';
import { UserCrown, Plus, EditPencil, Trash, RefreshDouble, Xmark, Settings, Group } from 'iconoir-react';

interface Admin {
  id: string;
  username: string;
  name: string;
  role: string;
  createdAt: string;
  lastLoginAt: string | null;
}

// 권한 정의
const PERMISSION_GROUPS = {
  dashboard: { label: '대시보드', permissions: ['dashboard:read'] },
  members: { label: '회원 관리', permissions: ['members:read', 'members:write', 'members:delete'] },
  admins: { label: '운영진 관리', permissions: ['admins:read', 'admins:write', 'admins:delete'] },
  plans: { label: '상품 관리', permissions: ['plans:read', 'plans:write', 'plans:delete'] },
  orders: { label: '주문 내역', permissions: ['orders:read', 'orders:write', 'orders:export'] },
  subscriptions: { label: '구독 관리', permissions: ['subscriptions:read', 'subscriptions:write'] },
  stats: { label: '통계', permissions: ['stats:read'] },
  notifications: { label: '알림톡', permissions: ['notifications:read', 'notifications:write', 'notifications:send'] },
  settings: { label: '설정', permissions: ['settings:read', 'settings:write'] },
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
  'orders:read': '조회',
  'orders:write': '수정',
  'orders:export': '내보내기',
  'subscriptions:read': '조회',
  'subscriptions:write': '수정',
  'stats:read': '조회',
  'notifications:read': '조회',
  'notifications:write': '수정',
  'notifications:send': '발송',
  'settings:read': '조회',
  'settings:write': '수정',
};

type RoleType = 'super' | 'admin' | 'viewer';

interface RolePermissions {
  super: string[];
  admin: string[];
  viewer: string[];
}

export default function AdminsPage() {
  const [activeTab, setActiveTab] = useState<'list' | 'permissions'>('list');
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [loading, setLoading] = useState(true);
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
    if (!confirm(`정말 "${admin.name}" 운영진을 삭제하시겠습니까?`)) {
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
          <h1 className="text-2xl font-bold text-gray-900">운영진 관리</h1>
        </div>
        {activeTab === 'list' && (
          <button
            onClick={() => handleOpenModal()}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shrink-0"
          >
            <Plus className="w-4 h-4" />
            운영진 추가
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
          onClick={() => setActiveTab('list')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'list'
              ? 'text-blue-600 border-blue-600'
              : 'text-gray-500 border-transparent hover:text-gray-700'
          }`}
        >
          <Group className="w-4 h-4" />
          운영진 목록
        </button>
        <button
          onClick={() => setActiveTab('permissions')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'permissions'
              ? 'text-blue-600 border-blue-600'
              : 'text-gray-500 border-transparent hover:text-gray-700'
          }`}
        >
          <Settings className="w-4 h-4" />
          권한 관리
        </button>
      </div>

      {/* 운영진 목록 탭 */}
      {activeTab === 'list' && (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <RefreshDouble className="w-8 h-8 text-blue-600 animate-spin" />
          </div>
        ) : admins.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            등록된 운영진이 없습니다.
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
              <RefreshDouble className="w-8 h-8 text-blue-600 animate-spin" />
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

      {/* 모달 */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold">
                {editingAdmin ? '운영진 수정' : '운영진 추가'}
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
                    <option value="admin">관리자 (운영진 관리 제외)</option>
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
    </div>
  );
}
