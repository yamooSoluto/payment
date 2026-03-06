'use client';

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { NavArrowDown, NavArrowUp, Trash, Link as LinkIcon } from 'iconoir-react';
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
  createdByAdmin?: boolean;
  tenants: ManagerTenantAccess[];
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

  const handleFormSuccess = () => {
    setFormOpen(false);
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
                <li key={m.managerId} className="px-6 py-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 text-sm font-medium text-gray-600">
                        {m.name.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 truncate">
                          {m.name}
                          <span className="ml-2 text-sm font-normal text-gray-400">@{m.loginId}</span>
                        </p>
                        {!m.active && (
                          <p className="text-xs"><span className="px-1.5 py-0.5 bg-red-50 text-red-500 rounded text-xs">비활성</span></p>
                        )}
                      </div>
                    </div>
                  </div>
                  {m.tenants.length > 0 && (
                    <div className="mt-2 ml-11 space-y-1">
                      {m.tenants
                        .filter(t => tenants.some(mt => mt.tenantId === t.tenantId))
                        .map(t => {
                          const tenantInfo = tenants.find(mt => mt.tenantId === t.tenantId);
                          const isConfirming = removeConfirm?.managerId === m.managerId && removeConfirm?.tenantId === t.tenantId;
                          return (
                            <div key={t.tenantId} className="flex items-center justify-between text-xs">
                              <span className="text-gray-500">{tenantInfo?.brandName || t.tenantId}</span>
                              {!m.createdByAdmin && (
                                isConfirming ? (
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
                                    className="text-gray-400 hover:text-red-500 transition-colors"
                                    title="내보내기"
                                  >
                                    <Trash className="w-3.5 h-3.5" />
                                  </button>
                                )
                              )}
                            </div>
                          );
                        })}
                    </div>
                  )}
                </li>
              ))}
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