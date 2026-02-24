'use client';

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { NavArrowDown, NavArrowUp, Plus, EditPencil, Trash } from 'iconoir-react';
import ManagerForm from './ManagerForm';
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
  tenants: ManagerTenantAccess[];
  createdAt: string;
  updatedAt: string;
}

interface ManagerSectionProps {
  masterEmail: string;
  tenants: TenantInfo[];
}

export default function ManagerSection({ masterEmail, tenants }: ManagerSectionProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [managers, setManagers] = useState<ManagerData[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingManager, setEditingManager] = useState<ManagerData | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [error, setError] = useState('');

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

  const handleDelete = async (managerId: string) => {
    setDeleteLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/managers/${managerId}`, { method: 'DELETE' });
      if (res.ok) {
        setManagers(prev => prev.filter(m => m.managerId !== managerId));
        setDeleteConfirm(null);
      } else {
        const data = await res.json();
        setError(data.error || '삭제에 실패했습니다.');
      }
    } catch {
      setError('삭제에 실패했습니다.');
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleFormSuccess = () => {
    setFormOpen(false);
    setEditingManager(null);
    fetchManagers();
  };

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

          {/* 매니저 목록 */}
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
              {managers.map(m => (
                <li key={m.managerId} className="px-6 py-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 text-sm font-medium text-gray-600">
                      {m.name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 truncate">
                        {m.name}
                        <span className="ml-2 text-sm font-normal text-gray-400">@{m.loginId}</span>
                      </p>
                      <p className="text-xs text-gray-400">
                        {m.tenants.length}개 매장
                        {!m.active && (
                          <span className="ml-2 px-1.5 py-0.5 bg-red-50 text-red-500 rounded text-xs">비활성</span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => { setEditingManager(m); setFormOpen(true); }}
                      className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                      title="수정"
                    >
                      <EditPencil className="w-4 h-4" />
                    </button>
                    {deleteConfirm === m.managerId ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleDelete(m.managerId)}
                          disabled={deleteLoading}
                          className="px-2 py-1 text-xs bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50"
                        >
                          삭제
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(null)}
                          className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200"
                        >
                          취소
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirm(m.managerId)}
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        title="삭제"
                      >
                        <Trash className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {/* 매니저 추가 버튼 */}
          <div className="px-6 pb-5 pt-2">
            <button
              onClick={() => { setEditingManager(null); setFormOpen(true); }}
              className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-500 hover:border-yamoo-primary hover:text-yamoo-primary transition-colors"
            >
              <Plus className="w-4 h-4" />
              매니저 추가
            </button>
          </div>
        </div>
      )}

      {/* 폼 모달 - backdrop-blur stacking context 우회를 위해 portal 사용 */}
      {formOpen && typeof document !== 'undefined' && createPortal(
        <ManagerForm
          manager={editingManager}
          tenants={tenants}
          onSuccess={handleFormSuccess}
          onClose={() => { setFormOpen(false); setEditingManager(null); }}
        />,
        document.body
      )}
    </div>
  );
}
