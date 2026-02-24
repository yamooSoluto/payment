'use client';

import { useState, useEffect } from 'react';
import { PERMISSION_SECTIONS } from '@/lib/manager-permissions';
import type { PermissionLevel } from '@/lib/manager-permissions';

interface TenantManagerEntry {
  managerId: string;
  loginId: string;
  name: string;
  phone?: string;
  masterEmail: string;
  active: boolean;
  tenantAccess: {
    tenantId: string;
    permissions: Record<string, PermissionLevel>;
  };
  createdAt: string | null;
  updatedAt: string | null;
}

const LEVEL_BADGE: Record<PermissionLevel, { label: string; className: string }> = {
  hidden: { label: '숨김', className: 'bg-gray-100 text-gray-500' },
  read:   { label: '조회', className: 'bg-blue-100 text-blue-700' },
  write:  { label: '편집', className: 'bg-green-100 text-green-700' },
};

export default function ManagersTab({ tenantId }: { tenantId: string }) {
  const [managers, setManagers] = useState<TenantManagerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/admin/tenants/${tenantId}/managers`)
      .then(res => res.ok ? res.json() : [])
      .then(data => setManagers(data))
      .catch(() => setManagers([]))
      .finally(() => setLoading(false));
  }, [tenantId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <div className="animate-spin rounded-full h-6 w-6 border-2 border-blue-300 border-t-blue-600" />
      </div>
    );
  }

  if (managers.length === 0) {
    return (
      <div className="text-center py-10 text-gray-400 text-sm">
        이 매장에 배정된 매니저가 없습니다.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500 mb-4">
        총 {managers.length}명의 매니저가 이 매장에 접근 권한을 가지고 있습니다.
      </p>
      {managers.map(m => {
        const isOpen = expanded === m.managerId;
        return (
          <div key={m.managerId} className="border border-gray-100 rounded-xl overflow-hidden">
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
                  <p className="text-xs text-gray-400">{m.masterEmail}</p>
                </div>
              </div>
              <svg
                className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {isOpen && (
              <div className="px-4 pb-4 pt-1 border-t border-gray-50">
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 mb-3 text-xs text-gray-500">
                  {m.phone && <div><span className="font-medium">연락처:</span> {m.phone}</div>}
                  {m.createdAt && (
                    <div><span className="font-medium">생성:</span> {new Date(m.createdAt).toLocaleDateString('ko-KR')}</div>
                  )}
                </div>
                <p className="text-xs font-medium text-gray-600 mb-2">권한</p>
                <div className="space-y-1.5">
                  {PERMISSION_SECTIONS.map(section => {
                    const level: PermissionLevel = m.tenantAccess.permissions?.[section.key] ?? 'hidden';
                    const badge = LEVEL_BADGE[level];
                    return (
                      <div key={section.key} className="flex items-center justify-between text-xs">
                        <span className="text-gray-600">{section.label}</span>
                        <span className={`px-2 py-0.5 rounded-md font-medium ${badge.className}`}>
                          {badge.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
