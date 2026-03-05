'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { RefreshDouble } from 'iconoir-react';
import Spinner from '@/components/admin/Spinner';
import RulesTable, { type Rule, type RuleAddData } from '@/components/admin/cs-data/RulesTable';

interface TenantOption {
  tenantId: string;
  brandName: string;
}

// ═══════════════════════════════════════════════════════════
// 메인 페이지
// ═══════════════════════════════════════════════════════════

export default function CsDataRulesPage() {
  // 데이터
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [tenants, setTenants] = useState<TenantOption[]>([]);

  // 필터
  const [platformFilter, setPlatformFilter] = useState('');
  const [storeFilter, setStoreFilter] = useState('');
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');

  // 편집
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set());
  const [syncingDirty, setSyncingDirty] = useState(false);

  // ── 플랫폼 + 테넌트 로드 (최초 1회) ──
  useEffect(() => {
    (async () => {
      try {
        const [settingsRes, tenantsRes] = await Promise.all([
          fetch('/api/admin/settings/cs-data'),
          fetch('/api/admin/tenants?limit=200&status=active'),
        ]);
        if (settingsRes.ok) {
          const s = await settingsRes.json();
          setPlatforms(s.platforms || []);
        }
        if (tenantsRes.ok) {
          const t = await tenantsRes.json();
          setTenants(
            (t.tenants || []).map((tn: any) => ({ tenantId: tn.tenantId, brandName: tn.brandName }))
          );
        }
      } catch (err) {
        console.error('[rules page] load platforms/tenants error:', err);
      }
    })();
  }, []);

  // ── 검색 디바운스 ──
  useEffect(() => {
    const timer = setTimeout(() => setSearchDebounced(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // ── 데이터 로드 ──
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (platformFilter) params.set('platform', platformFilter);
      if (storeFilter) params.set('store', storeFilter);
      if (searchDebounced) params.set('search', searchDebounced);

      const res = await fetch(`/api/admin/cs-data/rules?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setRules(data.rules || []);
    } catch (err) {
      console.error('[rules page] fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [platformFilter, storeFilter, searchDebounced]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── 스코프 옵션 (플랫폼 + 매장) ──
  const scopeOptions = useMemo(() => ({
    platforms,
    stores: tenants.map(t => t.brandName),
  }), [platforms, tenants]);

  // ── 셀 편집 ──
  const handleCellEdit = useCallback((ruleId: string, field: string, value: any) => {
    setRules(prev => prev.map(r =>
      r.id === ruleId ? { ...r, [field]: value } : r
    ));
    setDirtyIds(prev => new Set(prev).add(ruleId));
  }, []);

  // ── 변경사항 동기화 ──
  const handleSyncDirty = useCallback(async () => {
    if (dirtyIds.size === 0) return;
    setSyncingDirty(true);

    const dirtyRules = rules.filter(r => dirtyIds.has(r.id));
    const contentChanged = dirtyRules.length > 0;

    let syncLinkedFaqs = false;
    if (contentChanged) {
      syncLinkedFaqs = confirm('내용이 변경된 규정이 있습니다. 참조 중인 FAQ의 keyData도 함께 업데이트하시겠습니까?');
    }

    try {
      const results = await Promise.all(
        dirtyRules.map(async (rule) => {
          const res = await fetch(`/api/admin/cs-data/rules/${rule.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              label: rule.label,
              content: rule.content,
              platform: rule.platform,
              store: rule.store,
              syncLinkedFaqs,
            }),
          });
          return res.json();
        })
      );

      const syncedFaqs = results.reduce((sum, r) => sum + (r.syncedFaqs || 0), 0);
      if (syncedFaqs > 0) {
        alert(`${dirtyRules.length}건 저장 완료. ${syncedFaqs}개 FAQ keyData 업데이트됨.`);
      }

      setDirtyIds(new Set());
      fetchData();
    } catch (err) {
      console.error('[rules page] sync error:', err);
      alert('저장 중 오류가 발생했습니다.');
    } finally {
      setSyncingDirty(false);
    }
  }, [dirtyIds, rules, fetchData]);

  // ── 삭제 ──
  const handleDelete = useCallback(async (ruleId: string) => {
    try {
      const res = await fetch(`/api/admin/cs-data/rules/${ruleId}`, { method: 'DELETE' });
      const data = await res.json();

      if (res.status === 409 && data.linkedFaqCount) {
        const doForce = confirm(
          `이 규정을 ${data.linkedFaqCount}개 FAQ에서 참조 중입니다.\n강제 삭제하시겠습니까?`
        );
        if (!doForce) return;

        await fetch(`/api/admin/cs-data/rules/${ruleId}?force=true`, { method: 'DELETE' });
      }

      setRules(prev => prev.filter(r => r.id !== ruleId));
      setDirtyIds(prev => {
        const next = new Set(prev);
        next.delete(ruleId);
        return next;
      });
    } catch (err) {
      console.error('[rules page] delete error:', err);
      alert('삭제 중 오류가 발생했습니다.');
    }
  }, []);

  // ── 추가 ──
  const handleAdd = useCallback(async (data: RuleAddData) => {
    const res = await fetch('/api/admin/cs-data/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || '추가 실패');
    }
    fetchData();
  }, [fetchData]);

  return (
    <div className="max-w-7xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">규정 관리</h1>
          <p className="text-sm text-gray-500 mt-0.5">FAQ에서 참조하는 규정(KeyData) 원본을 관리합니다.</p>
        </div>
        {dirtyIds.size > 0 && (
          <button
            onClick={handleSyncDirty}
            disabled={syncingDirty}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-colors"
          >
            <RefreshDouble className="w-4 h-4" />
            {syncingDirty ? '저장 중...' : `${dirtyIds.size}건 변경됨 — 저장`}
          </button>
        )}
      </div>

      {/* 필터바 */}
      <div className="flex items-center gap-3 mb-4">
        <select
          value={platformFilter}
          onChange={e => setPlatformFilter(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
        >
          <option value="">전체 플랫폼</option>
          <option value="-">-</option>
          {platforms.map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>

        <select
          value={storeFilter}
          onChange={e => setStoreFilter(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
        >
          <option value="">전체 매장</option>
          <option value="공통">공통</option>
          {tenants.map(t => (
            <option key={t.tenantId} value={t.brandName}>{t.brandName}</option>
          ))}
        </select>

        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="검색..."
          className="flex-1 max-w-xs text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
      </div>

      {/* 카운트 */}
      <div className="text-xs text-gray-400 mb-2">
        전체 {rules.length}건
      </div>

      {/* 테이블 */}
      {loading ? (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-visible">
          <RulesTable
            rules={rules}
            scopeOptions={scopeOptions}
            onCellEdit={handleCellEdit}
            onDelete={handleDelete}
            onAdd={handleAdd}
            dirtyIds={dirtyIds}
          />
        </div>
      )}
    </div>
  );
}