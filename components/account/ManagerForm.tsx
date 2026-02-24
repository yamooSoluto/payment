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

interface ManagerData {
  managerId: string;
  loginId: string;
  name: string;
  phone?: string;
  active: boolean;
  tenants: ManagerTenantAccess[];
}

interface ManagerFormProps {
  manager: ManagerData | null;
  tenants: TenantInfo[];
  onSuccess: () => void;
  onClose: () => void;
}

const LEVEL_LABELS: Record<PermissionLevel, string> = {
  hidden: '숨김',
  read: '조회',
  write: '편집',
};

export default function ManagerForm({ manager, tenants, onSuccess, onClose }: ManagerFormProps) {
  const isEdit = !!manager;

  const [loginId, setLoginId] = useState(manager?.loginId ?? '');
  const [password, setPassword] = useState('');
  const [name, setName] = useState(manager?.name ?? '');
  const [phone, setPhone] = useState(manager?.phone ?? '');
  const [active, setActive] = useState(manager?.active ?? true);

  // 매장별 접근 여부 + 권한
  const [tenantAccess, setTenantAccess] = useState<Record<string, boolean>>(() => {
    if (!manager) return {};
    const map: Record<string, boolean> = {};
    manager.tenants.forEach(t => { map[t.tenantId] = true; });
    return map;
  });

  const [tenantPerms, setTenantPerms] = useState<Record<string, ManagerPermissions>>(() => {
    const map: Record<string, ManagerPermissions> = {};
    tenants.forEach(t => {
      const existing = manager?.tenants.find(mt => mt.tenantId === t.tenantId);
      map[t.tenantId] = existing ? { ...existing.permissions } : { ...DEFAULT_PERMISSIONS };
    });
    return map;
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 바깥 클릭/ESC로 닫기
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

    if (!loginId.trim()) { setError('아이디를 입력해주세요.'); return; }
    if (loginId.includes('@')) { setError('아이디에 @를 포함할 수 없습니다.'); return; }
    if (!isEdit && !password) { setError('비밀번호를 입력해주세요.'); return; }
    if (password && (password.length < 6 || !/[!@#$%^&*(),.?":{}|<>_\-+=[\]\\\/~`';]/.test(password))) {
      setError('비밀번호는 6자 이상, 특수기호를 포함해야 합니다.');
      return;
    }
    if (!name.trim()) { setError('이름을 입력해주세요.'); return; }

    const selectedTenants: ManagerTenantAccess[] = tenants
      .filter(t => tenantAccess[t.tenantId])
      .map(t => ({
        tenantId: t.tenantId,
        permissions: tenantPerms[t.tenantId] ?? { ...DEFAULT_PERMISSIONS },
      }));

    setLoading(true);
    try {
      let res: Response;

      if (isEdit) {
        const body: Record<string, unknown> = {
          name: name.trim(),
          phone: phone.trim() || undefined,
          active,
          tenants: selectedTenants,
        };
        if (password) body.password = password;

        res = await fetch(`/api/managers/${manager.managerId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      } else {
        res = await fetch('/api/managers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            loginId: loginId.trim(),
            password,
            name: name.trim(),
            phone: phone.trim() || undefined,
            tenants: selectedTenants,
          }),
        });
      }

      if (res.ok) {
        onSuccess();
      } else {
        const data = await res.json();
        setError(data.error || '저장에 실패했습니다.');
      }
    } catch {
      setError('저장에 실패했습니다.');
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
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">
            {isEdit ? '매니저 수정' : '매니저 추가'}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <Xmark className="w-5 h-5" />
          </button>
        </div>

        {/* 폼 */}
        <form id="manager-form" onSubmit={handleSubmit} className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          {error && (
            <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg">{error}</div>
          )}

          {/* 기본 정보 */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                아이디 <span className="text-red-400">*</span>
                <span className="ml-1 text-xs font-normal text-gray-400">@ 포함 불가</span>
              </label>
              <input
                type="text"
                value={loginId}
                onChange={e => setLoginId(e.target.value)}
                disabled={isEdit}
                placeholder="cafe_staff01"
                autoComplete="off"
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-yamoo-primary/30 focus:border-yamoo-primary disabled:bg-gray-50 disabled:text-gray-400"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                비밀번호
                {!isEdit && <span className="text-red-400"> *</span>}
                {isEdit && <span className="ml-1 text-xs font-normal text-gray-400">입력 시 변경</span>}
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder={isEdit ? '변경 시에만 입력' : '비밀번호'}
                autoComplete="new-password"
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-yamoo-primary/30 focus:border-yamoo-primary"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  이름 <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="홍길동"
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-yamoo-primary/30 focus:border-yamoo-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  연락처 <span className="text-xs font-normal text-gray-400">선택</span>
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="010-0000-0000"
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-yamoo-primary/30 focus:border-yamoo-primary"
                />
              </div>
            </div>

            {isEdit && (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  role="switch"
                  aria-checked={active}
                  onClick={() => setActive(v => !v)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    active ? 'bg-yamoo-primary' : 'bg-gray-200'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                      active ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
                <span className="text-sm text-gray-700">
                  {active ? '활성' : '비활성 (로그인 차단)'}
                </span>
              </div>
            )}
          </div>

          {/* 매장 접근 권한 */}
          {tenants.length > 0 && (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-3">매장 접근 권한</p>
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
                      {/* 매장 토글 */}
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

                      {/* 권한 설정 (체크된 경우만) */}
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

        {/* 푸터 */}
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
            {loading ? '저장 중...' : isEdit ? '수정' : '추가'}
          </button>
        </div>
      </div>
    </div>
  );
}
