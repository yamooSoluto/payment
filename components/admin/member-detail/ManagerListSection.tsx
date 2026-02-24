'use client';

import { useState, useEffect } from 'react';
import { Group } from 'iconoir-react';
import { PERMISSION_SECTIONS } from '@/lib/manager-permissions';
import type { PermissionLevel } from '@/lib/manager-permissions';
import type { ManagerTenantAccess } from '@/lib/manager-auth';

interface ManagerEntry {
  managerId: string;
  loginId: string;
  name: string;
  phone?: string;
  active: boolean;
  tenantCount: number;
  tenants: ManagerTenantAccess[];
  createdAt: string;
}

const LEVEL_BADGE: Record<PermissionLevel, { label: string; className: string }> = {
  hidden: { label: '숨김', className: 'bg-gray-100 text-gray-500' },
  read:   { label: '조회', className: 'bg-blue-100 text-blue-700' },
  write:  { label: '편집', className: 'bg-green-100 text-green-700' },
};

export default function ManagerListSection({ memberId }: { memberId: string }) {
  const [managers, setManagers] = useState<ManagerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/admin/members/${encodeURIComponent(memberId)}/managers`)
      .then(res => res.ok ? res.json() : [])
      .then(data => setManagers(data))
      .catch(() => setManagers([]))
      .finally(() => setLoading(false));
  }, [memberId]);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-50">
        <div className="flex items-center gap-2">
          <Group className="w-5 h-5 text-gray-400" />
          <h3 className="font-semibold text-gray-900">매니저 계정</h3>
          {!loading && (
            <span className="ml-1 px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-600 rounded-full">
              {managers.length}
            </span>
          )}
        </div>
      </div>

      <div className="p-4">
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <div className="animate-spin rounded-full h-5 w-5 border-2 border-gray-200 border-t-blue-500" />
          </div>
        ) : managers.length === 0 ? (
          <p className="text-center text-sm text-gray-400 py-6">등록된 매니저가 없습니다.</p>
        ) : (
          <div className="space-y-2">
            {managers.map(m => {
              const isOpen = expanded === m.managerId;
              return (
                <div key={m.managerId} className="border border-gray-100 rounded-lg overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : m.managerId)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-sm font-medium text-gray-600 flex-shrink-0">
                        {m.name.charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {m.name}
                          <span className="ml-2 text-xs font-normal text-gray-400">@{m.loginId}</span>
                          {!m.active && (
                            <span className="ml-2 px-1.5 py-0.5 bg-red-50 text-red-500 rounded text-xs">비활성</span>
                          )}
                        </p>
                        <p className="text-xs text-gray-400">
                          {m.tenantCount}개 매장 · {new Date(m.createdAt).toLocaleDateString('ko-KR')} 생성
                        </p>
                      </div>
                    </div>
                    <svg
                      className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {isOpen && m.tenants.length > 0 && (
                    <div className="border-t border-gray-50 px-4 py-3 space-y-3">
                      {m.tenants.map(t => (
                        <div key={t.tenantId}>
                          <p className="text-xs font-medium text-gray-500 mb-1.5">{t.tenantId}</p>
                          <div className="grid grid-cols-3 gap-1">
                            {PERMISSION_SECTIONS.map(section => {
                              const level: PermissionLevel = t.permissions?.[section.key] ?? 'hidden';
                              const badge = LEVEL_BADGE[level];
                              return (
                                <div key={section.key} className="flex items-center justify-between text-xs px-2 py-1 bg-gray-50 rounded">
                                  <span className="text-gray-500">{section.label}</span>
                                  <span className={`px-1.5 py-0.5 rounded font-medium ${badge.className}`}>{badge.label}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
