'use client';

import { useState, useEffect } from 'react';
import { Xmark } from 'iconoir-react';
import { PERMISSION_SECTIONS, DEFAULT_PERMISSIONS } from '@/lib/manager-permissions';
import type { PermissionLevel, ManagerPermissions } from '@/lib/manager-permissions';
import type { ManagerTenantAccess } from '@/lib/manager-auth';

interface TenantInfo {
  tenantId: string;
  brandName: string;
}

interface ManagerFormProps {
  tenants: TenantInfo[];
  onSuccess: () => void;
  onClose: () => void;
}

const LEVEL_LABELS: Record<PermissionLevel, string> = {
  hidden: '숨김',
  read: '조회',
  write: '편집',
};

export default function ManagerForm({ tenants, onSuccess, onClose }: ManagerFormProps) {
  const [tenantAccess, setTenantAccess] = useState<Record<string, boolean>>({});
  const [tenantPerms, setTenantPerms] = useState<Record<string, ManagerPermissions>>(() => {
    const map: Record<string, ManagerPermissions> = {};
    tenants.forEach(t => {
      map[t.tenantId] = { ...DEFAULT_PERMISSIONS };
    });
    return map;
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const toggleTenant = (tenantId: string) => {
    setTenantAccess(prev => ({ ...prev, [tenantId]: !prev[tenantId] }));
  };

  const setPermission = (tenantId: string, sectionKey: string, level: PermissionLevel) => {
    setTenantPerms(prev => ({
      ...prev,
      [tenantId]: { ...prev[tenantId], [sectionKey]: level },
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const selectedTenants: ManagerTenantAccess[] = tenants
      .filter(t => tenantAccess[t.tenantId])
      .map(t => ({
        tenantId: t.tenantId,
        permissions: tenantPerms[t.tenantId] ?? { ...DEFAULT_PERMISSIONS },
      }));

    if (selectedTenants.length === 0) {
      setError('최소 1개 매장을 선택해주세요.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/managers/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenants: selectedTenants }),
      });

      if (res.ok) {
        const { inviteToken } = await res.json();
        const inviteUrl = 'https://app.yamoo.ai.kr/invite?token=' + inviteToken;
        try {
          await navigator.clipboard.writeText(inviteUrl);
          alert('초대 링크가 클립보드에 복사되었습니다. 매니저에게 전달해주세요.\n\n' + inviteUrl);
        } catch {
          prompt('아래 초대 링크를 매니저에게 전달해주세요:', inviteUrl);
        }
        onSuccess();
      } else {
        const data = await res.json();
        setError(data.error || '초대에 실패했습니다.');
      }
    } catch {
      setError('초대에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">매니저 초대</h2>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <Xmark className="w-5 h-5" />
          </button>
        </div>

        <form id="manager-form" onSubmit={handleSubmit} className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          {error && (
            <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg">{error}</div>
          )}

          <p className="text-sm text-gray-500">
            매장과 권한을 선택한 후 초대 링크를 생성하세요. 링크를 매니저에게 전달하면 매니저가 수락하여 매장에 연결됩니다.
          </p>

          {tenants.length > 0 && (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-3">초대할 매장 선택</p>
              <div className="space-y-3">
                {tenants.map(tenant => {
                  const enabled = !!tenantAccess[tenant.tenantId];
                  return (
                    <div
                      key={tenant.tenantId}
                      className={`border rounded-xl overflow-hidden transition-colors ${
                        enabled ? 'border-yamoo-primary/30' : 'border-gray-100'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => toggleTenant(tenant.tenantId)}
                        className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                          enabled ? 'bg-yellow-50/50' : 'bg-gray-50 hover:bg-gray-100'
                        }`}
                      >
                        <div
                          className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                            enabled ? 'bg-yamoo-primary border-yamoo-primary' : 'border-gray-300'
                          }`}
                        >
                          {enabled && (
                            <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 10 8">
                              <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </div>
                        <span className={`text-sm font-medium ${enabled ? 'text-gray-900' : 'text-gray-500'}`}>
                          {tenant.brandName}
                        </span>
                      </button>

                      {enabled && (
                        <div className="px-4 pb-3 pt-2 space-y-2.5">
                          {PERMISSION_SECTIONS.map(section => {
                            const current = tenantPerms[tenant.tenantId]?.[section.key] ?? 'hidden';
                            return (
                              <div key={section.key} className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <span className="text-xs font-medium text-gray-700">{section.label}</span>
                                </div>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  {(['hidden', 'read', 'write'] as PermissionLevel[]).map(level => (
                                    <button
                                      key={level}
                                      type="button"
                                      onClick={() => setPermission(tenant.tenantId, section.key, level)}
                                      className={`px-2.5 py-1 text-xs rounded-lg transition-colors ${
                                        current === level
                                          ? level === 'hidden'
                                            ? 'bg-gray-200 text-gray-700 font-medium'
                                            : level === 'read'
                                            ? 'bg-blue-100 text-blue-700 font-medium'
                                            : 'bg-yamoo-primary text-white font-medium'
                                          : 'text-gray-400 hover:bg-gray-100'
                                      }`}
                                    >
                                      {LEVEL_LABELS[level]}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </form>

        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
          >
            취소
          </button>
          <button
            type="submit"
            form="manager-form"
            disabled={loading}
            className="px-5 py-2.5 text-sm font-medium bg-yamoo-primary text-white rounded-xl hover:bg-yamoo-primary/90 disabled:opacity-50 transition-colors"
          >
            {loading ? '생성 중...' : '초대 링크 생성'}
          </button>
        </div>
      </div>
    </div>
  );
}