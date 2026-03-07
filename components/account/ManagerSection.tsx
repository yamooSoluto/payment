'use client';

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { NavArrowDown, NavArrowUp, Trash, Link as LinkIcon, EditPencil } from 'iconoir-react';
import ManagerForm from './ManagerForm';
import { PERMISSION_SECTIONS, MANAGER_ADMIN_PERMISSION, DEFAULT_PERMISSIONS } from '@/lib/manager-permissions';
import type { PermissionLevel, ManagerPermissions } from '@/lib/manager-permissions';
import type { ManagerTenantAccess } from '@/lib/manager-auth';

interface TenantInfo {
  tenantId: string;
  brandName: string;
}

interface ManagerData {
  managerId: string;
  loginId: string;
  name: string;
  phone?: string;
  active: boolean;
  createdByAdmin?: boolean;
  tenants: (ManagerTenantAccess & { canDelete?: boolean })[];
  createdAt: string;
  updatedAt: string;
}

interface ManagerSectionProps {
  tenants: TenantInfo[];
}

export default function ManagerSection({ tenants }: ManagerSectionProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [managers, setManagers] = useState<ManagerData[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [removeConfirm, setRemoveConfirm] = useState<{ managerId: string; tenantId: string } | null>(null);
  const [removeLoading, setRemoveLoading] = useState(false);
  const [error, setError] = useState('');
  // 권한 수정 상태
  const [editingPerms, setEditingPerms] = useState<{ managerId: string; tenantId: string } | null>(null);
  const [permValues, setPermValues] = useState<Record<string, PermissionLevel>>({});
  const [editCanDelete, setEditCanDelete] = useState(false);
  const [permSaving, setPermSaving] = useState(false);
  const [expandedManager, setExpandedManager] = useState<string | null>(null);

  const fetchManagers = useCallback(async () => {
    try {
      const res = await fetch('/api/managers');
      if (res.ok) {
        const data = await res.json();
        setManagers(data);
      }
    } catch (e) {
      console.error('Failed to fetch managers', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchManagers();
  }, [fetchManagers]);

  const handleRemoveFromTenant = async (managerId: string, tenantId: string) => {
    setRemoveLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/managers/${managerId}/tenants/${tenantId}`, { method: 'DELETE' });
      if (res.ok) {
        fetchManagers();
        setRemoveConfirm(null);
      } else {
        const data = await res.json();
        setError(data.error || '초대 해제에 실패했습니다.');
      }
    } catch {
      setError('초대 해제에 실패했습니다.');
    } finally {
      setRemoveLoading(false);
    }
  };

  const startEditPerms = (managerId: string, tenant: ManagerTenantAccess & { canDelete?: boolean }) => {
    setEditingPerms({ managerId, tenantId: tenant.tenantId });
    setPermValues({ ...DEFAULT_PERMISSIONS, ...tenant.permissions });
    setEditCanDelete(tenant.canDelete ?? false);
  };

  const handlePermSave = async () => {
    if (!editingPerms) return;
    setPermSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/managers/${editingPerms.managerId}/tenants/${editingPerms.tenantId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissions: permValues, canDelete: editCanDelete }),
      });
      if (res.ok) {
        setManagers(prev => prev.map(m => {
          if (m.managerId !== editingPerms.managerId) return m;
          return {
            ...m,
            tenants: m.tenants.map(t =>
              t.tenantId === editingPerms.tenantId
                ? { ...t, permissions: permValues as ManagerPermissions, canDelete: editCanDelete }
                : t
            ),
          };
        }));
        setEditingPerms(null);
      } else {
        const data = await res.json();
        setError(data.error || '권한 수정에 실패했습니다.');
      }
    } catch {
      setError('권한 수정에 실패했습니다.');
    } finally {
      setPermSaving(false);
    }
  };

  const handleFormSuccess = () => {
    setFormOpen(false);
    fetchManagers();
  };

  const LEVEL_LABELS: Record<string, string> = { hidden: '숨김', read: '조회', write: '편집' };

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-white/60 shadow-lg overflow-hidden">
      {/* 헤더 */}
      <button
        className="w-full flex items-center justify-between px-6 py-5 hover:bg-white/40 transition-colors"
        onClick={() => setIsExpanded(v => !v)}
      >
        <div className="text-left">
          <p className="text-lg font-semibold text-gray-900">매니저 관리</p>
          <p className="text-sm text-gray-500">{managers.length}명의 매니저</p>
        </div>
        {isExpanded ? (
          <NavArrowUp className="w-5 h-5 text-gray-400" />
        ) : (
          <NavArrowDown className="w-5 h-5 text-gray-400" />
        )}
      </button>

      {isExpanded && (
        <div className="border-t border-gray-100/70">
          {error && (
            <div className="mx-6 mt-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg">{error}</div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-2 border-yamoo-accent border-t-yamoo-primary" />
            </div>
          ) : managers.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-400">
              등록된 매니저가 없습니다.
            </div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {managers.map(m => {
                const isManagerExpanded = expandedManager === m.managerId;
                return (
                <li key={m.managerId} className="px-6 py-4">
                  <button
                    className="w-full flex items-center justify-between gap-4"
                    onClick={() => setExpandedManager(isManagerExpanded ? null : m.managerId)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 text-sm font-medium text-gray-600">
                        {m.name.charAt(0)}
                      </div>
                      <div className="min-w-0 text-left">
                        <p className="font-medium text-gray-900 truncate">
                          {m.name}
                          {m.createdByAdmin && (
                            <span className="ml-1.5 px-1.5 py-0.5 bg-pink-50 text-pink-600 rounded text-[10px] font-medium">관리자</span>
                          )}
                          <span className="ml-2 text-sm font-normal text-gray-400">@{m.loginId}</span>
                        </p>
                        {!m.active && (
                          <p className="text-xs"><span className="px-1.5 py-0.5 bg-red-50 text-red-500 rounded text-xs">비활성</span></p>
                        )}
                      </div>
                    </div>
                    <div className="flex-shrink-0">
                      {isManagerExpanded ? (
                        <NavArrowUp className="w-4 h-4 text-gray-400" />
                      ) : (
                        <NavArrowDown className="w-4 h-4 text-gray-400" />
                      )}
                    </div>
                  </button>
                  {isManagerExpanded && m.tenants.length > 0 && (
                    <div className="mt-2 ml-11 space-y-2">
                      {m.tenants
                        .filter(t => tenants.some(mt => mt.tenantId === t.tenantId))
                        .map(t => {
                          const tenantInfo = tenants.find(mt => mt.tenantId === t.tenantId);
                          const isConfirming = removeConfirm?.managerId === m.managerId && removeConfirm?.tenantId === t.tenantId;
                          const isEditing = editingPerms?.managerId === m.managerId && editingPerms?.tenantId === t.tenantId;

                          return (
                            <div key={t.tenantId} className="bg-gray-50/70 rounded-lg p-3">
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-gray-700 font-medium">{tenantInfo?.brandName || t.tenantId}</span>
                                {!m.createdByAdmin && !isEditing && (
                                  <div className="flex items-center gap-1">
                                    <button
                                      onClick={() => startEditPerms(m.managerId, t)}
                                      className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded transition-colors"
                                      title="권한 수정"
                                    >
                                      <EditPencil className="w-3.5 h-3.5" />
                                    </button>
                                    {isConfirming ? (
                                      <div className="flex items-center gap-1">
                                        <button
                                          onClick={() => handleRemoveFromTenant(m.managerId, t.tenantId)}
                                          disabled={removeLoading}
                                          className="px-2 py-0.5 bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50"
                                        >
                                          해제
                                        </button>
                                        <button
                                          onClick={() => setRemoveConfirm(null)}
                                          className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded hover:bg-gray-200"
                                        >
                                          취소
                                        </button>
                                      </div>
                                    ) : (
                                      <button
                                        onClick={() => setRemoveConfirm({ managerId: m.managerId, tenantId: t.tenantId })}
                                        className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                                        title="내보내기"
                                      >
                                        <Trash className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>

                              {/* 인라인 권한 수정 */}
                              {isEditing && (
                                <div className="mt-3 space-y-2">
                                  {/* 전체 토글 */}
                                  <div className="flex items-center justify-between pb-2 mb-1 border-b border-gray-200">
                                    <span className="text-xs font-medium text-gray-700">전체 페이지 접근</span>
                                    {(() => {
                                      const allVisible = PERMISSION_SECTIONS.every(s => permValues[s.key] !== 'hidden');
                                      return (
                                        <button
                                          type="button"
                                          role="switch"
                                          aria-checked={allVisible}
                                          onClick={() => {
                                            const level: PermissionLevel = allVisible ? 'hidden' : 'read';
                                            setPermValues(prev => {
                                              const updated = { ...prev };
                                              PERMISSION_SECTIONS.forEach(s => { updated[s.key] = level; });
                                              return updated;
                                            });
                                          }}
                                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                                            allVisible ? 'bg-blue-500' : 'bg-gray-300'
                                          }`}
                                        >
                                          <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${
                                            allVisible ? 'translate-x-[18px]' : 'translate-x-[3px]'
                                          }`} />
                                        </button>
                                      );
                                    })()}
                                  </div>
                                  {PERMISSION_SECTIONS.map(sec => {
                                    const isVisible = permValues[sec.key] !== 'hidden';
                                    return (
                                      <div key={sec.key} className="flex items-center justify-between">
                                        <span className="text-xs text-gray-600">{sec.label}</span>
                                        <div className="flex items-center gap-2">
                                          <span className={`text-[11px] ${isVisible ? 'text-blue-500' : 'text-gray-400'}`}>{isVisible ? '허용' : '숨김'}</span>
                                        <button
                                          type="button"
                                          role="switch"
                                          aria-checked={isVisible}
                                          onClick={() => setPermValues(prev => ({ ...prev, [sec.key]: isVisible ? 'hidden' : 'read' }))}
                                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                                            isVisible ? 'bg-blue-500' : 'bg-gray-300'
                                          }`}
                                        >
                                          <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${
                                            isVisible ? 'translate-x-[18px]' : 'translate-x-[3px]'
                                          }`} />
                                        </button>
                                        </div>
                                      </div>
                                    );
                                  })}
                                  {/* 삭제 권한 + 매니저 관리 */}
                                  <div className="pt-2 mt-1 border-t border-gray-200 space-y-2">
                                    {/* 삭제 권한 */}
                                    <div className="flex items-center justify-between">
                                      <div>
                                        <span className="text-xs text-gray-600">삭제 권한</span>
                                        <p className="text-[11px] text-gray-400">대화, FAQ, 업무, 라이브러리 삭제</p>
                                      </div>
                                      <div className="flex items-center gap-2 flex-shrink-0">
                                        <span className={`text-[11px] ${editCanDelete ? 'text-red-500' : 'text-gray-400'}`}>{editCanDelete ? '허용' : '차단'}</span>
                                        <button
                                          type="button"
                                          role="switch"
                                          aria-checked={editCanDelete}
                                          title={editCanDelete ? '대화, FAQ, 업무, 라이브러리를 삭제할 수 있습니다' : '삭제 기능이 비활성화됩니다'}
                                          onClick={() => setEditCanDelete(prev => !prev)}
                                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 ${
                                            editCanDelete ? 'bg-red-500' : 'bg-gray-300'
                                          }`}
                                        >
                                          <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${
                                            editCanDelete ? 'translate-x-[18px]' : 'translate-x-[3px]'
                                          }`} />
                                        </button>
                                      </div>
                                    </div>
                                    {/* 매니저 관리 권한 */}
                                    <div className="flex items-center justify-between">
                                      <span className="text-xs text-gray-600">{MANAGER_ADMIN_PERMISSION.label}</span>
                                      <div className="flex items-center gap-0.5 bg-gray-100/80 rounded-lg p-0.5 flex-shrink-0">
                                        {(['hidden', 'read', 'write'] as PermissionLevel[]).map(level => {
                                          const curMgr = permValues[MANAGER_ADMIN_PERMISSION.key] ?? 'hidden';
                                          return (
                                            <button
                                              key={level}
                                              type="button"
                                              title={level === 'hidden' ? '매니저 관리 메뉴가 표시되지 않습니다' : level === 'read' ? '매니저 목록 조회만 가능합니다' : '매니저 초대, 권한 수정, 내보내기가 가능합니다'}
                                              onClick={() => setPermValues(prev => ({ ...prev, [MANAGER_ADMIN_PERMISSION.key]: level }))}
                                              className={`px-2.5 py-1 text-xs rounded-md transition-all ${
                                                curMgr === level
                                                  ? level === 'hidden' ? 'bg-white text-gray-700 font-medium shadow-sm'
                                                    : level === 'read' ? 'bg-white text-blue-600 font-medium shadow-sm'
                                                    : 'bg-amber-400 text-white font-medium shadow-sm'
                                                  : 'text-gray-400 hover:text-gray-600'
                                              }`}
                                            >
                                              {LEVEL_LABELS[level]}
                                            </button>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  </div>
                                  {/* 저장/취소 */}
                                  <div className="flex justify-end gap-2 pt-2">
                                    <button
                                      onClick={() => setEditingPerms(null)}
                                      className="px-3 py-1.5 text-xs bg-gray-200 text-gray-600 rounded-lg hover:bg-gray-300"
                                    >
                                      취소
                                    </button>
                                    <button
                                      onClick={handlePermSave}
                                      disabled={permSaving}
                                      className="px-3 py-1.5 text-xs bg-yamoo-primary text-white rounded-lg hover:bg-yamoo-primary/90 disabled:opacity-50"
                                    >
                                      {permSaving ? '저장 중...' : '저장'}
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  )}
                </li>
                );
              })}
            </ul>
          )}

          <div className="px-6 pb-5 pt-2">
            <button
              onClick={() => setFormOpen(true)}
              className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-500 hover:border-yamoo-primary hover:text-yamoo-primary transition-colors"
            >
              <LinkIcon className="w-4 h-4" />
              매니저 초대
            </button>
          </div>
        </div>
      )}

      {formOpen && typeof document !== 'undefined' && createPortal(
        <ManagerForm
          tenants={tenants}
          onSuccess={handleFormSuccess}
          onClose={() => setFormOpen(false)}
        />,
        document.body
      )}
    </div>
  );
}
