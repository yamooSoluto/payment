'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { RefreshDouble, Xmark, OpenNewWindow } from 'iconoir-react';
import Spinner from '@/components/admin/Spinner';
import RulesTable, { type Rule, type RuleAddData, type PackageInfo } from '@/components/admin/cs-data/RulesTable';

interface TenantOption {
  tenantId: string;
  brandName: string;
}

interface SidePanelItem {
  type: 'package' | 'faq';
  id: string;
  tenantId?: string;
}

interface PackageDetail {
  id: string;
  name: string;
  description: string;
  faqTemplates: { id: string; questions: string[]; answer: string; topic?: string }[];
  appliedTenants: { tenantId: string; brandName: string }[];
}

interface FaqDetail {
  id: string;
  tenantId: string;
  questions: string[];
  questionsRaw: string[];
  answer: string;
  answerRaw: string;
  guide: string;
  topic: string;
  source: string;
}

// ═══════════════════════════════════════════════════════════
// 메인 페이지
// ═══════════════════════════════════════════════════════════

export default function CsDataRulesPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [packages, setPackages] = useState<PackageInfo[]>([]);

  // 필터
  const [platformFilter, setPlatformFilter] = useState('');
  const [storeFilter, setStoreFilter] = useState('');
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');

  // 편집
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set());
  const [syncingDirty, setSyncingDirty] = useState(false);

  // 사이드패널
  const [sidePanelItem, setSidePanelItem] = useState<SidePanelItem | null>(null);
  const [panelData, setPanelData] = useState<PackageDetail | FaqDetail | null>(null);
  const [panelLoading, setPanelLoading] = useState(false);

  // 분류 옵션
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);

  // ── 초기 데이터 로드 ──
  useEffect(() => {
    (async () => {
      try {
        const [settingsRes, tenantsRes, packagesRes] = await Promise.all([
          fetch('/api/admin/settings/cs-data'),
          fetch('/api/admin/tenants?limit=200&status=active'),
          fetch('/api/admin/cs-data/packages'),
        ]);
        if (settingsRes.ok) {
          const s = await settingsRes.json();
          setPlatforms(s.platforms || []);
          setCategoryOptions(s.ruleCategories || []);
        }
        if (tenantsRes.ok) {
          const t = await tenantsRes.json();
          setTenants(
            (t.tenants || []).map((tn: any) => ({ tenantId: tn.tenantId, brandName: tn.brandName }))
          );
        }
        if (packagesRes.ok) {
          const p = await packagesRes.json();
          setPackages(
            (p.packages || []).map((pkg: any) => ({
              id: pkg.id,
              name: pkg.name || '',
              description: pkg.description || '',
              faqCount: pkg.faqCount || 0,
            }))
          );
        }
      } catch (err) {
        console.error('[rules page] load error:', err);
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

  const scopeOptions = useMemo(() => ({
    platforms,
    stores: tenants.map(t => t.brandName),
  }), [platforms, tenants]);

  const packagesMap = useMemo(() => {
    const map = new Map<string, PackageInfo>();
    packages.forEach(pkg => map.set(pkg.id, pkg));
    return map;
  }, [packages]);

  const tenantsMap = useMemo(() => {
    const map = new Map<string, string>();
    tenants.forEach(t => map.set(t.tenantId, t.brandName));
    return map;
  }, [tenants]);

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

    let syncLinkedFaqs = false;
    if (dirtyRules.length > 0) {
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
              category: rule.category,
              tags: rule.tags,
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

  // ── 추가 ─���
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

  // ── 분류 옵션 추가 (인라인에서 새 옵션 입력 시) ──
  const handleAddCategory = useCallback(async (cat: string) => {
    const newOptions = [...categoryOptions, cat];
    setCategoryOptions(newOptions);
    // 설정에 저장
    try {
      await fetch('/api/admin/settings/cs-data', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ruleCategories: newOptions }),
      });
    } catch (err) {
      console.error('[rules page] save category error:', err);
    }
  }, [categoryOptions]);

  // ── 사이드패널 ──
  const handleRefClick = useCallback((type: 'package' | 'faq', id: string, tenantId?: string) => {
    setSidePanelItem({ type, id, tenantId });
    setPanelData(null);
    setPanelLoading(true);

    const url = type === 'package'
      ? `/api/admin/cs-data/packages/${id}`
      : `/api/admin/cs-data/faqs/${id}?tenantId=${tenantId}`;

    fetch(url)
      .then(res => res.json())
      .then(data => {
        setPanelData(type === 'package' ? (data.package || null) : (data.faq || null));
      })
      .catch(err => console.error('[rules page] panel fetch error:', err))
      .finally(() => setPanelLoading(false));
  }, []);

  const closeSidePanel = useCallback(() => {
    setSidePanelItem(null);
    setPanelData(null);
  }, []);

  return (
    <div className="max-w-7xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">참조 데이터</h1>
          <p className="text-sm text-gray-500 mt-0.5">패키지/FAQ에서 참조하는 KeyData 원본을 관리합니다.</p>
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
          {platforms.map(p => <option key={p} value={p}>{p}</option>)}
        </select>

        <select
          value={storeFilter}
          onChange={e => setStoreFilter(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
        >
          <option value="">전체 매장</option>
          <option value="공통">공통</option>
          {tenants.map(t => <option key={t.tenantId} value={t.brandName}>{t.brandName}</option>)}
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
      <div className="text-xs text-gray-400 mb-2">전체 {rules.length}건</div>

      {/* 테이블 */}
      <div className="w-full">
        {loading ? (
          <div className="flex justify-center py-20"><Spinner /></div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-visible">
            <RulesTable
              rules={rules}
              scopeOptions={scopeOptions}
              onCellEdit={handleCellEdit}
              onDelete={handleDelete}
              onAdd={handleAdd}
              dirtyIds={dirtyIds}
              packagesMap={packagesMap}
              tenantsMap={tenantsMap}
              onRefClick={handleRefClick}
              categoryOptions={categoryOptions}
              onAddCategory={handleAddCategory}
            />
          </div>
        )}
      </div>

      {/* 사이드패널 오버레이 */}
      <div
        className={`fixed inset-0 bg-black/10 z-40 transition-opacity duration-200 ${sidePanelItem ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={closeSidePanel}
      />
      <div
        className={`fixed right-0 top-0 h-full w-[400px] bg-white border-l border-gray-200 shadow-2xl z-50 flex flex-col transition-transform duration-200 ease-out ${sidePanelItem ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {sidePanelItem && (
          <>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gray-50/40 shrink-0">
              <span className="text-sm font-semibold text-gray-900">
                {sidePanelItem.type === 'package' ? '패키지 상세' : 'FAQ 상세'}
              </span>
              <button onClick={closeSidePanel} className="p-1 hover:bg-gray-200/60 rounded-lg transition-colors">
                <Xmark className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {panelLoading ? (
                <div className="flex justify-center py-12"><Spinner /></div>
              ) : !panelData ? (
                <p className="text-sm text-gray-400 text-center py-12">데이터를 불러올 수 없습니다.</p>
              ) : sidePanelItem.type === 'package' ? (
                <PackagePanelContent data={panelData as PackageDetail} />
              ) : (
                <FaqPanelContent data={panelData as FaqDetail} tenantsMap={tenantsMap} />
              )}
            </div>

            {panelData && (
              <div className="px-5 py-3 border-t border-gray-100 shrink-0">
                <a
                  href={sidePanelItem.type === 'package' ? '/admin/cs-data/packages' : `/admin/cs-data/faqs?tenantId=${sidePanelItem.tenantId}`}
                  className="flex items-center justify-center gap-1.5 w-full py-2 text-xs font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
                >
                  <OpenNewWindow className="w-3.5 h-3.5" />
                  {sidePanelItem.type === 'package' ? '패키지 페이지로 이동' : 'FAQ 관리 페이지로 이동'}
                </a>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 사이드패널: 패키지 상세
// ═══════════════════════════════════════════════════════════

function PackagePanelContent({ data }: { data: PackageDetail }) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-[15px] font-semibold text-gray-900">{data.name}</h3>
        {data.description && <p className="text-[13px] text-gray-500 mt-1 leading-relaxed">{data.description}</p>}
      </div>

      <div>
        <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
          FAQ 템플릿 ({data.faqTemplates?.length || 0})
        </div>
        <div className="space-y-1.5">
          {(data.faqTemplates || []).map((ft, idx) => (
            <div key={ft.id || idx} className="px-3 py-2 bg-gray-50 rounded-lg">
              <p className="text-[13px] text-gray-700 leading-snug">{ft.questions?.[0] || '(질문 없음)'}</p>
              {ft.answer && <p className="text-[11px] text-gray-400 mt-1 line-clamp-2 leading-relaxed">{ft.answer}</p>}
            </div>
          ))}
          {(!data.faqTemplates || data.faqTemplates.length === 0) && (
            <p className="text-[12px] text-gray-400">등록된 템플릿이 없습니다.</p>
          )}
        </div>
      </div>

      {data.appliedTenants && data.appliedTenants.length > 0 && (
        <div>
          <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
            적용 매장 ({data.appliedTenants.length})
          </div>
          <div className="flex flex-wrap gap-1.5">
            {data.appliedTenants.map((t, idx) => (
              <span key={idx} className="inline-block px-2 py-0.5 text-[11px] font-medium text-gray-600 bg-gray-100 rounded-full">
                {t.brandName || t.tenantId}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 사이드패널: FAQ 상세
// ═══════════════════════════════════════════════════════════

function FaqPanelContent({ data, tenantsMap }: { data: FaqDetail; tenantsMap: Map<string, string> }) {
  const brandName = tenantsMap.get(data.tenantId) || data.tenantId;
  const displayQuestions = (data.questionsRaw?.length > 0 ? data.questionsRaw : data.questions) || [];

  return (
    <div className="space-y-4">
      <div>
        <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">매장</div>
        <p className="text-[13px] text-gray-900 font-medium">{brandName}</p>
      </div>

      <div>
        <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">질문 ({displayQuestions.length})</div>
        <div className="space-y-1.5">
          {displayQuestions.map((q: string, idx: number) => (
            <div key={idx} className="px-3 py-2 bg-gray-50 rounded-lg">
              <p className="text-[13px] text-gray-700 leading-snug">{q}</p>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">답변</div>
        <div className="px-3 py-2 bg-gray-50 rounded-lg">
          <p className="text-[13px] text-gray-600 leading-relaxed whitespace-pre-wrap">{data.answerRaw || data.answer || '(답변 없음)'}</p>
        </div>
      </div>

      {data.guide && (
        <div>
          <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">가이드</div>
          <p className="text-[13px] text-gray-500 leading-relaxed whitespace-pre-wrap">{data.guide}</p>
        </div>
      )}

      <div className="flex items-center gap-3 text-[11px] text-gray-400">
        {data.topic && <span>topic: {data.topic}</span>}
        {data.source && <span>source: {data.source}</span>}
      </div>
    </div>
  );
}