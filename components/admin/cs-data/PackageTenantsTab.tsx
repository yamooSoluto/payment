'use client';

import { useState, useEffect } from 'react';
import { Plus, Trash, RefreshDouble } from 'iconoir-react';

// ═══════════════════════════════════════════════════════════
// 타입
// ═══════════════════════════════════════════════════════════

interface AppliedTenant {
  tenantId: string;
  brandName: string;
  appliedAt: string;
  appliedBy: string;
  faqCount: number;
}

interface TenantOption {
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
  onApply: (tenantIds: string[]) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  const available = allTenants.filter(t =>
    !excludeIds.has(t.tenantId) &&
    (!search || t.brandName.toLowerCase().includes(search.toLowerCase()))
  );

  const toggleAll = () => {
    if (selected.size === available.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(available.map(t => t.tenantId)));
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-[400px] max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">매장 선택</h3>
          <p className="text-xs text-gray-400 mt-0.5">패키지를 적용할 매장을 선택하세요.</p>
        </div>

        <div className="px-5 py-3 border-b border-gray-100">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="매장 검색..."
            className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
            autoFocus
          />
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-2">
          {available.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">적용 가능한 매장이 없습니다.</p>
          ) : (
            <>
              <button
                onClick={toggleAll}
                className="w-full text-left px-2 py-2 text-xs text-blue-600 hover:bg-blue-50 rounded mb-1"
              >
                {selected.size === available.length ? '전체 해제' : `전체 선택 (${available.length})`}
              </button>
              {available.map(t => (
                <label
                  key={t.tenantId}
                  className="flex items-center gap-2 px-2 py-2 hover:bg-gray-50 rounded cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(t.tenantId)}
                    onChange={() => {
                      const next = new Set(selected);
                      if (next.has(t.tenantId)) next.delete(t.tenantId);
                      else next.add(t.tenantId);
                      setSelected(next);
                    }}
                    className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-400"
                  />
                  <span className="text-sm text-gray-700">{t.brandName}</span>
                </label>
              ))}
            </>
          )}
        </div>

        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
          <span className="text-xs text-gray-400">{selected.size}개 선택</span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700"
            >
              취소
            </button>
            <button
              onClick={() => onApply(Array.from(selected))}
              disabled={selected.size === 0}
              className="px-4 py-1.5 text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 rounded-lg disabled:bg-gray-300"
            >
              적용
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 메인 컴포넌트
// ═══════════════════════════════════════════════════════════

export default function PackageTenantsTab({ packageId, appliedTenants, onChanged }: PackageTenantsTabProps) {
  const [allTenants, setAllTenants] = useState<TenantOption[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [applying, setApplying] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  // 전체 매장 목록 로드
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

  // 매장 적용
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

  // 동기화
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

  // 매장 제거
  const handleRemove = async (tenantId: string, brandName: string) => {
    const choice = prompt(
      `"${brandName}" 매장을 패키지에서 제거합니다.\n\n` +
      `1: FAQ도 함께 삭제 (overridden 제외)\n` +
      `2: FAQ 유지 (source를 manual로 전환)\n\n` +
      `선택 (1 또는 2):`,
      '1'
    );

    if (!choice || !['1', '2'].includes(choice)) return;

    setRemoving(tenantId);
    try {
      const mode = choice === '1' ? 'delete' : 'keep';
      const res = await fetch(`/api/admin/cs-data/packages/${packageId}/remove-tenant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId, mode }),
      });
      if (!res.ok) throw new Error('Failed to remove');
      const data = await res.json();
      const msg = mode === 'delete'
        ? `${data.processed}개 FAQ 삭제${data.skippedOverridden > 0 ? ` (${data.skippedOverridden}건 overridden 유지)` : ''}`
        : `${data.processed}개 FAQ를 manual로 전환`;
      alert(msg);
      onChanged();
    } catch (err) {
      console.error('[PackageTenantsTab] remove error:', err);
      alert('매장 제거에 실패했습니다.');
    } finally {
      setRemoving(null);
    }
  };


  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  };

  return (
    <div>
      {/* 상단 액션 */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-gray-400">
          적용 매장 {appliedTenants.length}곳
        </span>
        <div className="flex items-center gap-2">
          {appliedTenants.length > 0 && (
            <button
              onClick={() => handleSync()}
              disabled={syncing}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors"
            >
              <RefreshDouble className="w-3.5 h-3.5" />
              {syncing ? '동기화 중...' : '전체 동기화'}
            </button>
          )}
          <button
            onClick={() => setShowModal(true)}
            disabled={applying}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            {applying ? '적용 중...' : '매장 추가'}
          </button>
        </div>
      </div>

      {/* 매장 목록 */}
      {appliedTenants.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm bg-white rounded-xl border border-gray-200">
          아직 적용된 매장이 없습니다.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs text-gray-400 font-medium">
                <th className="px-4 py-2.5">매장명</th>
                <th className="px-4 py-2.5 w-20">FAQ 수</th>
                <th className="px-4 py-2.5 w-28">적용일</th>
                <th className="px-4 py-2.5 w-28 text-right">작업</th>
              </tr>
            </thead>
            <tbody>
              {appliedTenants.map(t => (
                <tr key={t.tenantId} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="px-4 py-3">
                    <span className="text-sm text-gray-900 font-medium">{t.brandName}</span>
                    <span className="text-xs text-gray-400 ml-2">{t.tenantId}</span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{t.faqCount}개</td>
                  <td className="px-4 py-3 text-xs text-gray-400">{formatDate(t.appliedAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => handleSync(t.tenantId)}
                        disabled={syncing}
                        className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        title="이 매장만 동기화"
                      >
                        동기화
                      </button>
                      <button
                        onClick={() => handleRemove(t.tenantId, t.brandName)}
                        disabled={removing === t.tenantId}
                        className="p-1 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                        title="매장 제거"
                      >
                        <Trash className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 매장 선택 모달 */}
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