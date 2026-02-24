'use client';

import { useState, useEffect } from 'react';
import { Xmark, User, ArrowUpRight } from 'iconoir-react';
import { useRouter } from 'next/navigation';
import { PERMISSION_SECTIONS } from '@/lib/manager-permissions';
import type { PermissionLevel } from '@/lib/manager-permissions';
import type { ManagerTenantAccess } from '@/lib/manager-auth';

interface ManagerRow {
  managerId: string;
  loginId: string;
  name: string;
  phone: string | null;
  masterEmail: string;
  active: boolean;
  tenants: ManagerTenantAccess[];
  tenantCount: number;
  createdAt: string | null;
  updatedAt: string | null;
}

const LEVEL_BADGE: Record<PermissionLevel, { label: string; className: string }> = {
  hidden: { label: '숨김', className: 'bg-gray-100 text-gray-500' },
  read:   { label: '조회', className: 'bg-blue-100 text-blue-700' },
  write:  { label: '편집', className: 'bg-green-100 text-green-700' },
};

export default function AdminManagerDetailModal({
  manager,
  onClose,
}: {
  manager: ManagerRow;
  onClose: () => void;
}) {
  const router = useRouter();
  const [brandNames, setBrandNames] = useState<Record<string, string>>({});

  // 매장명 조회
  useEffect(() => {
    if (manager.tenants.length === 0) return;

    const tenantIds = manager.tenants.map(t => t.tenantId);
    Promise.all(
      tenantIds.map(id =>
        fetch(`/api/admin/tenants/${id}`)
          .then(r => r.ok ? r.json() : null)
          .catch(() => null)
      )
    ).then(results => {
      const map: Record<string, string> = {};
      results.forEach((data, i) => {
        if (data?.tenant?.brandName) {
          map[tenantIds[i]] = data.tenant.brandName;
        }
      });
      setBrandNames(map);
    });
  }, [manager.tenants]);

  // ESC 닫기
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-base font-semibold text-gray-600">
              {manager.name.charAt(0)}
            </div>
            <div>
              <p className="font-semibold text-gray-900">
                {manager.name}
                <span className="ml-2 text-sm font-normal text-gray-400">@{manager.loginId}</span>
              </p>
              <p className="text-xs text-gray-400">{manager.masterEmail}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <Xmark className="w-5 h-5" />
          </button>
        </div>

        {/* 본문 */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          {/* 기본 정보 */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-gray-50 rounded-xl px-4 py-3">
              <p className="text-xs text-gray-400 mb-0.5">상태</p>
              <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${
                manager.active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
              }`}>
                {manager.active ? '활성' : '비활성'}
              </span>
            </div>
            <div className="bg-gray-50 rounded-xl px-4 py-3">
              <p className="text-xs text-gray-400 mb-0.5">연락처</p>
              <p className="font-medium text-gray-700">{manager.phone || '-'}</p>
            </div>
            <div className="bg-gray-50 rounded-xl px-4 py-3">
              <p className="text-xs text-gray-400 mb-0.5">생성일</p>
              <p className="font-medium text-gray-700">
                {manager.createdAt ? new Date(manager.createdAt).toLocaleDateString('ko-KR') : '-'}
              </p>
            </div>
            <div className="bg-gray-50 rounded-xl px-4 py-3">
              <p className="text-xs text-gray-400 mb-0.5">마지막 수정</p>
              <p className="font-medium text-gray-700">
                {manager.updatedAt ? new Date(manager.updatedAt).toLocaleDateString('ko-KR') : '-'}
              </p>
            </div>
          </div>

          {/* 매장별 권한 */}
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-3">
              매장 접근 권한
              <span className="ml-2 text-xs font-normal text-gray-400">{manager.tenantCount}개</span>
            </p>

            {manager.tenants.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">배정된 매장이 없습니다.</p>
            ) : (
              <div className="space-y-3">
                {manager.tenants.map(t => (
                  <div key={t.tenantId} className="border border-gray-100 rounded-xl overflow-hidden">
                    {/* 매장 헤더 */}
                    <div className="flex items-center justify-between px-4 py-3 bg-gray-50">
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {brandNames[t.tenantId] || t.tenantId}
                        </p>
                        {brandNames[t.tenantId] && (
                          <p className="text-xs text-gray-400">{t.tenantId}</p>
                        )}
                      </div>
                      <button
                        onClick={() => {
                          onClose();
                          router.push(`/admin/tenants/${t.tenantId}?tab=managers`);
                        }}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="매장 상세"
                      >
                        <ArrowUpRight className="w-4 h-4" />
                      </button>
                    </div>

                    {/* 권한 그리드 */}
                    <div className="px-4 py-3 grid grid-cols-2 gap-1.5">
                      {PERMISSION_SECTIONS.map(section => {
                        const level: PermissionLevel = t.permissions?.[section.key] ?? 'hidden';
                        const badge = LEVEL_BADGE[level];
                        return (
                          <div key={section.key} className="flex items-center justify-between text-xs px-2.5 py-1.5 bg-gray-50 rounded-lg">
                            <span className="text-gray-600">{section.label}</span>
                            <span className={`px-1.5 py-0.5 rounded-md font-medium ${badge.className}`}>
                              {badge.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 푸터 */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
          <button
            onClick={() => {
              onClose();
              router.push(`/admin/members/${encodeURIComponent(manager.masterEmail)}`);
            }}
            className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1.5"
          >
            <User className="w-4 h-4" />
            마스터 회원 상세
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
