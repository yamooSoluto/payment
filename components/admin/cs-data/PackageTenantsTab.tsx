'use client';

import { useState, useEffect } from 'react';
import { Plus, Xmark, Trash, RefreshDouble, Check, WarningCircle } from 'iconoir-react';

// ═══════════════════════════════════════════════════════════
// 타입
// ═══════════════════════════════════════════════════════════

export interface AppliedTenant {
  tenantId: string;
  brandName: string;
  appliedAt: string;
  faqCount: number;
}

export interface TenantOption {
  tenantId: string;
  brandName: string;
}

interface PackageTenantsTabProps {
  packageId: string;
  appliedTenants: AppliedTenant[];
  onChanged: () => void;
}

// ═══════════════════════════════════════════════════════════
// 매장 선택 모달
// ═══════════════════════════════════════════════════════════

function TenantSelectModal({
  allTenants,
  excludeIds,
  onApply,
  onClose,
}: {
  allTenants: TenantOption[];
  excludeIds: Set<string>;
  onApply: (ids: string[]) => Promise<void>;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);

  const available = allTenants.filter(
    t => !excludeIds.has(t.tenantId) && (!search || t.brandName.includes(search) || t.tenantId.includes(search))
  );

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-[440px] max-h-[70vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">매장 추가</h3>
          <p className="text-xs text-gray-400 mt-0.5">패키지 FAQ를 적용할 매장을 선택하세요</p>
        </div>

        <div className="px-5 py-3">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="매장명 검색..."
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 placeholder:text-gray-300"
            autoFocus
          />
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {available.length === 0 ? (
            <div className="text-center py-8 text-sm text-gray-400">
              {search ? '검색 결과가 없습니다' : '추가 가능한 매장이 없습니다'}
            </div>
          ) : (
            <div className="space-y-0.5">
              {available.map(t => {
                const isSel = selected.has(t.tenantId);
                return (
                  <button
                    key={t.tenantId}
                    onClick={() => setSelected(prev => {
                      const n = new Set(prev);
                      isSel ? n.delete(t.tenantId) : n.add(t.tenantId);
                      return n;
                    })}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                      isSel ? 'bg-blue-50' : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                      isSel ? 'bg-blue-500 border-blue-500' : 'border-gray-300'
                    }`}>
                      {isSel && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <span className="text-sm text-gray-800 font-medium">{t.brandName}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
          <span className="text-xs text-gray-400">{selected.size}개 선택</span>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100 rounded-lg transition-colors">
              취소
            </button>
            <button
              onClick={async () => { setApplying(true); await onApply([...selected]); }}
              disabled={selected.size === 0 || applying}
              className="px-4 py-1.5 text-xs font-medium text-white bg-gray-900 hover:bg-gray-800 disabled:bg-gray-300 rounded-lg transition-colors"
            >
              {applying ? '적용 중...' : '적용'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 삭제 확인 모달
// ═══════════════════════════════════════════════════════════

function RemoveConfirmModal({
  brandName,
  onConfirm,
  onClose,
}: {
  brandName: string;
  onConfirm: (mode: 'delete' | 'keep') => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60]" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-[380px]" onClick={e => e.stopPropagation()}>
        <div className="px-5 pt-5 pb-3 flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-red-50 flex items-center justify-center shrink-0 mt-0.5">
            <WarningCircle className="w-5 h-5 text-red-500" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">매장 제거</h3>
            <p className="text-xs text-gray-500 mt-1 leading-relaxed">
              <strong>{brandName}</strong> 매장을 이 패키지에서 제거합니다.
              해당 매장의 FAQ를 어떻게 처리할까요?
            </p>
          </div>
        </div>

        <div className="px-5 pb-4 space-y-2">
          <button
            onClick={() => onConfirm('delete')}
            className="w-full flex items-start gap-3 p-3 rounded-xl border border-gray-200 hover:border-red-300 hover:bg-red-50/50 transition-colors text-left"
          >
            <Trash className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
            <div>
              <span className="text-sm font-medium text-gray-800">FAQ 삭제</span>
              <p className="text-[11px] text-gray-400 mt-0.5">패키지에서 가져온 FAQ를 삭제합니다 (직접 수정한 항목은 유지)</p>
            </div>
          </button>
          <button
            onClick={() => onConfirm('keep')}
            className="w-full flex items-start gap-3 p-3 rounded-xl border border-gray-200 hover:border-blue-300 hover:bg-blue-50/50 transition-colors text-left"
          >
            <Check className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
            <div>
              <span className="text-sm font-medium text-gray-800">FAQ 유지</span>
              <p className="text-[11px] text-gray-400 mt-0.5">FAQ를 매장 소유로 전환하여 그대로 유지합니다</p>
            </div>
          </button>
        </div>

        <div className="px-5 py-3 border-t border-gray-100 flex justify-end">
          <button onClick={onClose} className="px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100 rounded-lg transition-colors">
            취소
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 매장 관리 모달 (PackageFaqTab에서 사용)
// ═══════════════════════════════════════════════════════════

export function TenantManageModal({
  packageName,
  appliedTenants,
  allTenants,
  packageUpdatedAt,
  onApply,
  onSync,
  onRemove,
  onClose,
}: {
  packageName: string;
  appliedTenants: AppliedTenant[];
  allTenants: TenantOption[];
  packageUpdatedAt?: string | null;
  onApply: (tenantIds: string[]) => Promise<void>;
  onSync: (tenantId?: string) => Promise<void>;
  onRemove: (tenantId: string, brandName: string, mode: 'delete' | 'keep') => Promise<void>;
  onClose: () => void;
}) {
  const [showSelect, setShowSelect] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [removing, setRemoving] = useState<{ tenantId: string; brandName: string } | null>(null);

  const appliedIds = new Set(appliedTenants.map(t => t.tenantId));

  const handleApply = async (tenantIds: string[]) => {
    setShowSelect(false);
    await onApply(tenantIds);
  };

  const handleSync = async (tenantId?: string) => {
    setSyncing(tenantId || 'all');
    try { await onSync(tenantId); } finally { setSyncing(null); }
  };

  const handleRemove = async (mode: 'delete' | 'keep') => {
    if (!removing) return;
    const { tenantId, brandName } = removing;
    setRemoving(null);
    await onRemove(tenantId, brandName, mode);
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  };

  if (showSelect) {
    return (
      <TenantSelectModal
        allTenants={allTenants}
        excludeIds={appliedIds}
        onApply={handleApply}
        onClose={() => setShowSelect(false)}
      />
    );
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
        <div className="bg-white rounded-2xl shadow-2xl w-[480px] max-h-[75vh] flex flex-col" onClick={e => e.stopPropagation()}>
          {/* 헤더 */}
          <div className="px-5 py-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">{packageName}</h3>
              <p className="text-xs text-gray-400 mt-0.5">
                {appliedTenants.length > 0 ? `${appliedTenants.length}개 매장 적용 중` : '적용된 매장 없음'}
              </p>
            </div>
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
              <Xmark className="w-4 h-4" />
            </button>
          </div>

          {/* 매장 목록 */}
          <div className="flex-1 overflow-y-auto px-5 pb-2">
            {appliedTenants.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-sm text-gray-400">아직 적용된 매장이 없습니다</p>
                <p className="text-xs text-gray-300 mt-1">매장을 추가하여 FAQ를 배포하세요</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {appliedTenants.map(t => {
                  const needsSync = packageUpdatedAt && t.appliedAt && new Date(packageUpdatedAt) > new Date(t.appliedAt);
                  return (
                    <div
                      key={t.tenantId}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-gray-50 hover:bg-gray-100/80 transition-colors group"
                    >
                      {/* 상태 점 */}
                      <div className={`w-2 h-2 rounded-full shrink-0 ${
                        needsSync ? 'bg-amber-400' : 'bg-emerald-400'
                      }`} title={needsSync ? '동기화 필요' : '최신 상태'} />

                      {/* 매장 정보 */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-800">{t.brandName}</span>
                          {needsSync && (
                            <span className="text-[10px] font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">동기화 필요</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[11px] text-gray-400">FAQ {t.faqCount}건</span>
                          <span className="text-[11px] text-gray-300">·</span>
                          <span className="text-[11px] text-gray-400">{formatDate(t.appliedAt)} 적용</span>
                        </div>
                      </div>

                      {/* 액션 */}
                      <div className={`flex items-center gap-1 transition-opacity ${
                        needsSync ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                      }`}>
                        <button
                          onClick={() => handleSync(t.tenantId)}
                          disabled={syncing !== null}
                          className={`px-2 py-1 text-[11px] rounded-md transition-colors font-medium ${
                            needsSync
                              ? 'text-amber-700 bg-amber-50 hover:bg-amber-100'
                              : 'text-blue-600 hover:bg-blue-50'
                          }`}
                        >
                          {syncing === t.tenantId ? '동기화 중...' : '동기화'}
                        </button>
                        <button
                          onClick={() => setRemoving({ tenantId: t.tenantId, brandName: t.brandName })}
                          className="p-1 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
                          title="매장 제거"
                        >
                          <Trash className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 하단 액션 */}
          <div className="px-5 py-3 border-t border-gray-100 flex items-center gap-2">
            {appliedTenants.length > 0 && (
              <button
                onClick={() => handleSync()}
                disabled={syncing !== null}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              >
                <RefreshDouble className={`w-3.5 h-3.5 ${syncing === 'all' ? 'animate-spin' : ''}`} />
                {syncing === 'all' ? '동기화 중...' : '전체 동기화'}
              </button>
            )}
            <button
              onClick={() => setShowSelect(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors ml-auto"
            >
              <Plus className="w-3.5 h-3.5" />
              매장 추가
            </button>
          </div>
        </div>
      </div>

      {/* 삭제 확인 모달 */}
      {removing && (
        <RemoveConfirmModal
          brandName={removing.brandName}
          onConfirm={handleRemove}
          onClose={() => setRemoving(null)}
        />
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════
// 메인 컴포넌트 (기존 [packageId] 페이지에서 사용)
// ═══════════════════════════════════════════════════════════

export default function PackageTenantsTab({ packageId, appliedTenants, onChanged }: PackageTenantsTabProps) {
  const [allTenants, setAllTenants] = useState<TenantOption[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [applying, setApplying] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/tenants?limit=200&status=active');
        if (res.ok) {
          const data = await res.json();
          setAllTenants(
            (data.tenants || []).map((t: any) => ({ tenantId: t.tenantId, brandName: t.brandName }))
          );
        }
      } catch (err) {
        console.error('[PackageTenantsTab] load tenants error:', err);
      }
    })();
  }, []);

  const appliedIds = new Set(appliedTenants.map(t => t.tenantId));

  const handleApply = async (tenantIds: string[]) => {
    setShowModal(false);
    setApplying(true);
    try {
      const res = await fetch(`/api/admin/cs-data/packages/${packageId}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantIds }),
      });
      if (!res.ok) throw new Error('Failed to apply');
      const data = await res.json();
      alert(`${data.applied}개 매장에 ${data.created}개 FAQ 적용 완료`);
      onChanged();
    } catch (err) {
      console.error('[PackageTenantsTab] apply error:', err);
      alert('적용에 실패했습니다.');
    } finally {
      setApplying(false);
    }
  };

  const handleSync = async (tenantId?: string) => {
    if (!confirm('패키지 변경사항을 적용된 매장에 동기화하시겠습니까?')) return;
    setSyncing(true);
    try {
      const body = tenantId ? { tenantIds: [tenantId] } : {};
      const res = await fetch(`/api/admin/cs-data/packages/${packageId}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Failed to sync');
      const data = await res.json();
      alert(`동기화 완료: ${data.synced}건 업데이트, ${data.created}건 생성, ${data.deleted}건 삭제, ${data.skipped}건 건너뜀(overridden)`);
      onChanged();
    } catch (err) {
      console.error('[PackageTenantsTab] sync error:', err);
      alert('동기화에 실패했습니다.');
    } finally {
      setSyncing(false);
    }
  };

  const handleRemove = async (tenantId: string) => {
    const tenant = appliedTenants.find(t => t.tenantId === tenantId);
    if (!tenant) return;
    if (!confirm(`"${tenant.brandName}" 매장을 패키지에서 제거하시겠습니까?`)) return;
    setRemoving(tenantId);
    try {
      const res = await fetch(`/api/admin/cs-data/packages/${packageId}/remove-tenant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId, mode: 'delete' }),
      });
      if (!res.ok) throw new Error('Failed to remove');
      onChanged();
    } catch (err) {
      console.error('[PackageTenantsTab] remove error:', err);
      alert('매장 제거에 실패했습니다.');
    } finally {
      setRemoving(null);
    }
  };

  const filteredTenants = allTenants.filter(t => !appliedIds.has(t.tenantId));

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-gray-900">적용 매장</h2>
        <div className="flex gap-2">
          {appliedTenants.length > 0 && (
            <button
              onClick={() => handleSync()}
              disabled={syncing}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
            >
              <RefreshDouble className="w-3.5 h-3.5" />
              {syncing ? '동기화 중...' : '전체 동기화'}
            </button>
          )}
          <button
            onClick={() => setShowModal(true)}
            disabled={applying}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            매장 추가
          </button>
        </div>
      </div>

      {appliedTenants.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">
          적용된 매장이 없습니다.
        </div>
      ) : (
        <div className="space-y-2">
          {appliedTenants.map(t => (
            <div key={t.tenantId} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors group">
              <div className="flex-1">
                <span className="text-sm font-medium text-gray-800">{t.brandName}</span>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-gray-400">FAQ {t.faqCount}건</span>
                  <span className="text-xs text-gray-300">·</span>
                  <span className="text-xs text-gray-400">{new Date(t.appliedAt).toLocaleDateString()}</span>
                </div>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => handleSync(t.tenantId)}
                  disabled={syncing}
                  className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded-md"
                >
                  동기화
                </button>
                <button
                  onClick={() => handleRemove(t.tenantId)}
                  disabled={removing === t.tenantId}
                  className="p-1 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-md"
                >
                  <Trash className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <TenantSelectModal
          allTenants={allTenants}
          excludeIds={appliedIds}
          onApply={handleApply}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}