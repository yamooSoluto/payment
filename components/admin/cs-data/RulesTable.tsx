'use client';

import { useState, useRef, useEffect, useCallback, useMemo, Fragment } from 'react';
import { Trash, Plus, Xmark, Check, Copy, NavArrowDown, NavArrowUp, NavArrowRight, Filter as FilterIcon } from 'iconoir-react';

// ═══════════════════════════════════════════════════════════
// 타입
// ═══════════════════════════════════════════════════════════

export interface Rule {
  id: string;
  platform: string;
  store: string[];
  label: string;
  content: string;
  category: string;
  tags: string[];
  linkedFaqIds: string[];
  linkedPackageIds: string[];
  createdAt: string | null;
  updatedAt: string | null;
  createdBy: string;
}

export interface ScopeOptions {
  platforms: string[];
  stores: string[];
}

export interface RuleAddData {
  id: string;
  platform: string;
  store: string[];
  label: string;
  content: string;
  category?: string;
  tags?: string[];
}

export interface PackageInfo {
  id: string;
  name: string;
  description: string;
  faqCount: number;
}

type SortDir = 'asc' | 'desc';
type SortField = 'platform' | 'store' | 'label' | 'content' | 'category' | 'tags' | 'ref' | null;

interface RulesTableProps {
  rules: Rule[];
  scopeOptions: ScopeOptions;
  onCellEdit: (ruleId: string, field: string, value: any) => void;
  onDelete: (ruleId: string) => void;
  onAdd: (data: RuleAddData) => Promise<void>;
  dirtyIds: Set<string>;
  packagesMap: Map<string, PackageInfo>;
  tenantsMap: Map<string, string>;
  onRefClick: (type: 'package' | 'faq', id: string, tenantId?: string) => void;
  categoryOptions: string[];
  onAddCategory: (cat: string) => void;
}

const COL_SPAN = 8;
const generateId = () => `rule_${Date.now().toString(36)}`;

const FIELD_LABELS: Record<string, string> = {
  platform: '플랫폼', store: '매장', category: '분류', label: '라벨',
  content: '내용', tags: '태그', ref: '참조',
};

const GROUPABLE: SortField[] = ['platform', 'store', 'category', 'tags'];

// ═══════════════════════════════════════════════════════════
// 메인 테이블
// ═══════════════════════════════════════════════════════════

export default function RulesTable({
  rules, scopeOptions, onCellEdit, onDelete, onAdd, dirtyIds,
  packagesMap, tenantsMap, onRefClick,
  categoryOptions, onAddCategory,
}: RulesTableProps) {
  const [editingCell, setEditingCell] = useState<{ id: string; field: string } | null>(null);

  // 정렬
  const [sortField, setSortField] = useState<SortField>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // 칼럼 필터
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [showFilters, setShowFilters] = useState(false);

  // 그룹
  const [groupByField, setGroupByField] = useState<SortField>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [showGroupMenu, setShowGroupMenu] = useState(false);
  const groupRef = useRef<HTMLDivElement>(null);

  // 새 행
  const [adding, setAdding] = useState(false);
  const [newPlatform, setNewPlatform] = useState('-');
  const [newStore, setNewStore] = useState<string[]>(['공통']);
  const [newLabel, setNewLabel] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [newTags, setNewTags] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = newLabel.trim() && newContent.trim();

  const resetNewRow = () => {
    setNewPlatform('-'); setNewStore(['공통']); setNewLabel(''); setNewContent('');
    setNewCategory(''); setNewTags([]);
  };

  const handleSubmitNew = useCallback(async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    try {
      await onAdd({
        id: generateId(), platform: newPlatform, store: newStore,
        label: newLabel.trim(), content: newContent.trim(),
        category: newCategory, tags: newTags,
      });
      resetNewRow();
      setAdding(false);
    } catch (err: any) {
      alert(err.message || '추가 실패');
    } finally {
      setSubmitting(false);
    }
  }, [canSubmit, submitting, newPlatform, newStore, newLabel, newContent, newCategory, newTags, onAdd]);

  const handleDuplicate = useCallback(async (rule: Rule) => {
    try {
      await onAdd({
        id: generateId(), platform: rule.platform, store: [...rule.store],
        label: `${rule.label} (복사)`, content: rule.content,
        category: rule.category, tags: [...rule.tags],
      });
    } catch (err: any) {
      alert(err.message || '복제 실패');
    }
  }, [onAdd]);

  const isEditing = (id: string, field: string) => editingCell?.id === id && editingCell?.field === field;
  const startEdit = (id: string, field: string) => setEditingCell({ id, field });
  const stopEdit = () => setEditingCell(null);

  // 셀 편집 클릭 아웃사이드
  useEffect(() => {
    if (!editingCell) return;
    const handler = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('[data-dropdown]')) return;
      stopEdit();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [editingCell]);

  // 그룹 메뉴 클릭 아웃사이드
  useEffect(() => {
    if (!showGroupMenu) return;
    const handler = (e: MouseEvent) => {
      if (groupRef.current && !groupRef.current.contains(e.target as Node)) {
        setShowGroupMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showGroupMenu]);

  // 정렬 토글
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      if (sortDir === 'asc') setSortDir('desc');
      else { setSortField(null); setSortDir('asc'); }
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  // 그룹 설정
  const handleGroupBy = (field: SortField) => {
    if (groupByField === field) {
      setGroupByField(null);
    } else {
      setGroupByField(field);
    }
    setCollapsedGroups(new Set());
    setShowGroupMenu(false);
  };

  const toggleGroupCollapse = (key: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // 정렬 + 필터 적용
  const processedRules = useMemo(() => {
    let result = [...rules];

    // 칼럼 필터
    Object.entries(columnFilters).forEach(([field, fv]) => {
      if (!fv.trim()) return;
      result = result.filter(r => {
        // 셀렉트 칼럼: 정확 매치
        if (field === 'platform') return r.platform === fv;
        if (field === 'store') return r.store.includes(fv);
        if (field === 'category') {
          if (fv === '__none__') return !r.category;
          return r.category === fv;
        }
        // 텍스트 칼럼: 부분 매치
        const q = fv.toLowerCase();
        if (field === 'label') return r.label.toLowerCase().includes(q);
        if (field === 'content') return r.content.toLowerCase().includes(q);
        if (field === 'tags') return r.tags.some(t => t.toLowerCase().includes(q));
        if (field === 'ref') {
          const cnt = r.linkedPackageIds.length + r.linkedFaqIds.length;
          return String(cnt).includes(q);
        }
        return true;
      });
    });

    // 정렬
    if (sortField) {
      result.sort((a, b) => {
        let av: any, bv: any;
        if (sortField === 'platform') { av = a.platform; bv = b.platform; }
        else if (sortField === 'store') { av = a.store.join(','); bv = b.store.join(','); }
        else if (sortField === 'label') { av = a.label; bv = b.label; }
        else if (sortField === 'content') { av = a.content; bv = b.content; }
        else if (sortField === 'category') { av = a.category; bv = b.category; }
        else if (sortField === 'tags') { av = a.tags.join(','); bv = b.tags.join(','); }
        else if (sortField === 'ref') {
          av = a.linkedPackageIds.length + a.linkedFaqIds.length;
          bv = b.linkedPackageIds.length + b.linkedFaqIds.length;
        }
        if (typeof av === 'number' && typeof bv === 'number') return sortDir === 'asc' ? av - bv : bv - av;
        const cmp = String(av || '').localeCompare(String(bv || ''));
        return sortDir === 'asc' ? cmp : -cmp;
      });
    }

    return result;
  }, [rules, sortField, sortDir, columnFilters]);

  // 그룹 데이터
  const groupedData = useMemo(() => {
    if (!groupByField) return null;

    const map = new Map<string, Rule[]>();
    const order: string[] = [];

    for (const rule of processedRules) {
      let key: string;
      switch (groupByField) {
        case 'platform': key = rule.platform || '-'; break;
        case 'store': key = rule.store.length > 0 ? rule.store.join(', ') : '공통'; break;
        case 'category': key = rule.category || '(미분류)'; break;
        case 'tags': key = rule.tags.length > 0 ? [...rule.tags].sort().join(', ') : '(태그 없음)'; break;
        default: key = '-';
      }

      if (!map.has(key)) { map.set(key, []); order.push(key); }
      map.get(key)!.push(rule);
    }

    return order.map(key => ({ key, rules: map.get(key)! }));
  }, [processedRules, groupByField]);

  const platformOptions = ['-', ...scopeOptions.platforms];

  // 셀 공통 클래스
  const th = 'h-9 px-3 text-left text-[11px] font-medium text-gray-400 tracking-wide';
  const td = 'h-11 px-3 border-b border-gray-100/80';
  const cellText = 'text-sm text-gray-700 truncate leading-tight';
  const muted = 'text-sm text-gray-300';

  const hasActiveFilters = Object.values(columnFilters).some(v => v.trim());

  const sortLabel: Record<string, string> = FIELD_LABELS;

  // ── 규정 행 렌더 ──
  const renderRuleRow = (rule: Rule) => {
    const isDirty = dirtyIds.has(rule.id);
    return (
      <tr key={rule.id} className={`group transition-colors ${isDirty ? 'bg-amber-50/40' : 'hover:bg-gray-50/50'}`}>
        {/* 플랫폼 */}
        <td className={td} data-dropdown>
          <div className="flex items-center h-full">
            {isEditing(rule.id, 'platform') ? (
              <PlatformSelect value={rule.platform} options={platformOptions}
                onChange={val => { onCellEdit(rule.id, 'platform', val); stopEdit(); }} onClose={stopEdit} />
            ) : (
              <div onClick={() => startEdit(rule.id, 'platform')}
                className={`${rule.platform === '-' ? muted : cellText} cursor-pointer w-full flex items-center gap-0.5`}>
                {rule.platform || '-'}
                <NavArrowDown className="w-2.5 h-2.5 text-gray-300 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            )}
          </div>
        </td>

        {/* 매장 */}
        <td className={td} data-dropdown>
          <div className="flex items-center h-full">
            {isEditing(rule.id, 'store') ? (
              <StoreMultiSelect value={rule.store} options={scopeOptions.stores}
                onChange={val => onCellEdit(rule.id, 'store', val)} onClose={stopEdit} />
            ) : (
              <div onClick={() => startEdit(rule.id, 'store')}
                className={`${rule.store.length === 1 && rule.store[0] === '공통' ? muted : cellText} cursor-pointer w-full`}>
                {rule.store.length > 0 ? (
                  <span>{rule.store[0]}{rule.store.length > 1 && <span className="text-gray-400 ml-0.5 text-xs">+{rule.store.length - 1}</span>}</span>
                ) : <span className={muted}>공통</span>}
              </div>
            )}
          </div>
        </td>

        {/* 분류 */}
        <td className={td} data-dropdown>
          <div className="flex items-center h-full">
            {isEditing(rule.id, 'category') ? (
              <CategorySelect
                value={rule.category}
                options={categoryOptions}
                onChange={val => { onCellEdit(rule.id, 'category', val); stopEdit(); }}
                onAddOption={opt => { onAddCategory(opt); onCellEdit(rule.id, 'category', opt); stopEdit(); }}
                onClose={stopEdit}
              />
            ) : (
              <div onClick={() => startEdit(rule.id, 'category')} className="cursor-pointer w-full">
                {rule.category ? (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-violet-50 text-violet-700 border border-violet-100">
                    {rule.category}
                  </span>
                ) : <span className={muted}>-</span>}
              </div>
            )}
          </div>
        </td>

        {/* 라벨 */}
        <td className={td}>
          <div className="flex items-center h-full">
            {isEditing(rule.id, 'label') ? (
              <input autoFocus value={rule.label}
                onChange={e => onCellEdit(rule.id, 'label', e.target.value)}
                onBlur={stopEdit}
                onKeyDown={e => { if (e.nativeEvent.isComposing) return; if (e.key === 'Enter') stopEdit(); }}
                className="w-full h-7 text-sm border border-blue-400 rounded px-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-100" />
            ) : (
              <div onClick={() => startEdit(rule.id, 'label')} className={`${cellText} cursor-text w-full`}>
                {rule.label || <span className={muted}>-</span>}
              </div>
            )}
          </div>
        </td>

        {/* 내용 */}
        <td className={`${td} relative`}>
          <div className="flex items-center h-full">
            {isEditing(rule.id, 'content') ? (
              <ContentEditor value={rule.content} onChange={val => onCellEdit(rule.id, 'content', val)} onClose={stopEdit} />
            ) : (
              <div onClick={() => startEdit(rule.id, 'content')} className={`${cellText} cursor-text w-full text-gray-500`}>
                {rule.content ? rule.content.split('\n')[0] : <span className={muted}>-</span>}
              </div>
            )}
          </div>
        </td>

        {/* 태그 */}
        <td className={`${td} relative`}>
          <div className="flex items-center h-full">
            {isEditing(rule.id, 'tags') ? (
              <TagEditor
                tags={rule.tags}
                onChange={val => onCellEdit(rule.id, 'tags', val)}
                onClose={stopEdit}
              />
            ) : (
              <div onClick={() => startEdit(rule.id, 'tags')} className="cursor-text w-full flex items-center gap-1 flex-wrap min-h-[28px]">
                {rule.tags.length > 0 ? rule.tags.map((t, i) => (
                  <span key={i} className="inline-flex items-center px-1.5 py-0 rounded text-[10px] font-medium bg-gray-100 text-gray-600">{t}</span>
                )) : <span className={muted}>-</span>}
              </div>
            )}
          </div>
        </td>

        {/* 참조 */}
        <td className={td}>
          <div className="flex items-center h-full">
            <ReferenceCell rule={rule} packagesMap={packagesMap} tenantsMap={tenantsMap} onRefClick={onRefClick} />
          </div>
        </td>

        {/* 작업 */}
        <td className={td}>
          <div className="flex items-center justify-end h-full gap-0 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={() => handleDuplicate(rule)} className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100" title="복제">
              <Copy className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => {
                if (confirm(`규정 "${rule.label}"을 삭제하시겠습니까?${rule.linkedFaqIds.length > 0 ? `\n${rule.linkedFaqIds.length}개 FAQ에서 참조 중입니다.` : ''}`)) onDelete(rule.id);
              }}
              className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50" title="삭제">
              <Trash className="w-3.5 h-3.5" />
            </button>
          </div>
        </td>
      </tr>
    );
  };

  // 필터 셀렉트 공통 스타일
  const filterSelectCls = 'w-full text-[11px] border border-gray-200 rounded px-1.5 py-1 bg-white/80 focus:outline-none focus:ring-1 focus:ring-blue-300 focus:border-blue-300 text-gray-600';

  return (
    <div className="">
      {/* ── 툴바 ── */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-100 bg-gray-50/30">
        {/* 그룹 */}
        <div ref={groupRef} className="relative">
          <button
            onClick={() => setShowGroupMenu(!showGroupMenu)}
            className={`flex items-center gap-1 px-2 py-1 text-[11px] rounded-md transition-colors ${
              groupByField
                ? 'bg-indigo-50 text-indigo-600 font-medium'
                : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
            }`}
          >
            그룹
            {groupByField && (
              <>
                <span className="text-[10px]">: {FIELD_LABELS[groupByField]}</span>
                <span
                  role="button"
                  onClick={(e) => { e.stopPropagation(); setGroupByField(null); setCollapsedGroups(new Set()); }}
                  className="ml-0.5 hover:text-red-500"
                >
                  <Xmark className="w-3 h-3" />
                </span>
              </>
            )}
          </button>
          {showGroupMenu && (
            <div className="absolute z-50 top-full left-0 mt-1 w-40 bg-white border border-gray-200 rounded-lg shadow-lg py-1">
              {GROUPABLE.map(f => (
                <button key={f} onClick={() => handleGroupBy(f)}
                  className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 transition-colors flex items-center justify-between ${
                    groupByField === f ? 'text-indigo-600 font-medium bg-indigo-50/40' : 'text-gray-600'
                  }`}>
                  <span>{FIELD_LABELS[f!]}</span>
                  {groupByField === f && <Check className="w-3.5 h-3.5" />}
                </button>
              ))}
              {groupByField && (
                <>
                  <div className="border-t border-gray-100 my-1" />
                  <button onClick={() => { setGroupByField(null); setCollapsedGroups(new Set()); setShowGroupMenu(false); }}
                    className="w-full text-left px-3 py-1.5 text-sm text-gray-400 hover:text-red-500 hover:bg-red-50/50 transition-colors">
                    그룹 해제
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* 필터 토글 */}
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-1 px-2 py-1 text-[11px] rounded-md transition-colors ${
            showFilters || hasActiveFilters
              ? 'bg-blue-50 text-blue-600 font-medium'
              : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
          }`}
        >
          <FilterIcon className="w-3 h-3" />
          필터
          {hasActiveFilters && (
            <span className="ml-0.5 w-4 h-4 flex items-center justify-center rounded-full bg-blue-100 text-blue-600 text-[9px] font-bold">
              {Object.values(columnFilters).filter(v => v.trim()).length}
            </span>
          )}
        </button>
        {hasActiveFilters && (
          <button onClick={() => setColumnFilters({})} className="text-[11px] text-gray-400 hover:text-red-500 transition-colors">
            초기화
          </button>
        )}

        {/* 정렬 표시 */}
        {sortField && (
          <div className="flex items-center gap-1 ml-2 text-[11px] text-gray-400">
            <span>정렬:</span>
            <span className="font-medium text-gray-600">{sortLabel[sortField]}</span>
            <span>{sortDir === 'asc' ? '↑' : '↓'}</span>
            <button onClick={() => { setSortField(null); setSortDir('asc'); }} className="ml-0.5 text-gray-400 hover:text-red-500">
              <Xmark className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* 그룹 전체 접기/펼치기 */}
        {groupByField && groupedData && groupedData.length > 1 && (
          <button
            onClick={() => {
              const allKeys = groupedData.map(g => g.key);
              const allCollapsed = allKeys.every(k => collapsedGroups.has(k));
              setCollapsedGroups(allCollapsed ? new Set() : new Set(allKeys));
            }}
            className="text-[11px] text-gray-400 hover:text-gray-600 ml-auto px-1.5 py-1 rounded hover:bg-gray-100 transition-colors"
          >
            {groupedData.every(g => collapsedGroups.has(g.key)) ? '모두 펼치기' : '모두 접기'}
          </button>
        )}
      </div>

      {/* ── 테이블 ── */}
      <table className="w-full border-collapse table-fixed">
        <thead>
          <tr className="border-b border-gray-200/60 bg-gray-50/40">
            <SortableHeader field="platform" active={sortField} dir={sortDir} onSort={handleSort} className={`${th} w-[7%]`}>플랫폼</SortableHeader>
            <SortableHeader field="store" active={sortField} dir={sortDir} onSort={handleSort} className={`${th} w-[7%]`}>매장</SortableHeader>
            <SortableHeader field="category" active={sortField} dir={sortDir} onSort={handleSort} className={`${th} w-[8%]`}>분류</SortableHeader>
            <SortableHeader field="label" active={sortField} dir={sortDir} onSort={handleSort} className={`${th} w-[12%]`}>라벨</SortableHeader>
            <SortableHeader field="content" active={sortField} dir={sortDir} onSort={handleSort} className={th}>내용</SortableHeader>
            <SortableHeader field="tags" active={sortField} dir={sortDir} onSort={handleSort} className={`${th} w-[9%]`}>태그</SortableHeader>
            <SortableHeader field="ref" active={sortField} dir={sortDir} onSort={handleSort} className={`${th} w-[9%]`}>참조</SortableHeader>
            <th className={`${th} w-[4%]`} />
          </tr>

          {/* 필터 행 */}
          {showFilters && (
            <tr className="border-b border-gray-200/40 bg-blue-50/20">
              {/* 플랫폼 — 셀렉트 */}
              <td className="px-2 py-1.5">
                <select
                  value={columnFilters.platform || ''}
                  onChange={e => setColumnFilters(prev => ({ ...prev, platform: e.target.value }))}
                  className={filterSelectCls}
                >
                  <option value="">전체</option>
                  {platformOptions.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </td>
              {/* 매장 — 셀렉트 */}
              <td className="px-2 py-1.5">
                <select
                  value={columnFilters.store || ''}
                  onChange={e => setColumnFilters(prev => ({ ...prev, store: e.target.value }))}
                  className={filterSelectCls}
                >
                  <option value="">전체</option>
                  <option value="공통">공통</option>
                  {scopeOptions.stores.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </td>
              {/* 분류 — 셀렉트 */}
              <td className="px-2 py-1.5">
                <select
                  value={columnFilters.category || ''}
                  onChange={e => setColumnFilters(prev => ({ ...prev, category: e.target.value }))}
                  className={filterSelectCls}
                >
                  <option value="">전체</option>
                  <option value="__none__">(미분류)</option>
                  {categoryOptions.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </td>
              {/* 라벨 — 텍스트 */}
              <td className="px-2 py-1.5">
                <FilterInput value={columnFilters.label || ''} onChange={v => setColumnFilters(prev => ({ ...prev, label: v }))} placeholder="라벨" />
              </td>
              {/* 내용 — 텍스트 */}
              <td className="px-2 py-1.5">
                <FilterInput value={columnFilters.content || ''} onChange={v => setColumnFilters(prev => ({ ...prev, content: v }))} placeholder="내용" />
              </td>
              {/* 태그 — 텍스트 */}
              <td className="px-2 py-1.5">
                <FilterInput value={columnFilters.tags || ''} onChange={v => setColumnFilters(prev => ({ ...prev, tags: v }))} placeholder="태그" />
              </td>
              {/* 참조 — 텍스트 */}
              <td className="px-2 py-1.5">
                <FilterInput value={columnFilters.ref || ''} onChange={v => setColumnFilters(prev => ({ ...prev, ref: v }))} placeholder="참조" />
              </td>
              <td />
            </tr>
          )}
        </thead>

        <tbody>
          {processedRules.length === 0 && !adding && (
            <tr>
              <td colSpan={COL_SPAN} className="text-center py-16 text-sm text-gray-400">
                {hasActiveFilters ? '필터 결과가 없습니다.' : '등록된 규정이 없습니다.'}
              </td>
            </tr>
          )}

          {processedRules.length > 0 && groupedData ? (
            // ── 그룹 렌더링 ──
            groupedData.map((group) => (
              <Fragment key={group.key}>
                <tr className="bg-gray-50/80 border-b border-gray-200/60">
                  <td colSpan={COL_SPAN} className="px-2 py-1.5">
                    <button onClick={() => toggleGroupCollapse(group.key)} className="flex items-center gap-1.5 w-full text-left">
                      {collapsedGroups.has(group.key)
                        ? <NavArrowRight className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        : <NavArrowDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />}
                      <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">{FIELD_LABELS[groupByField!]}</span>
                      <span className="text-[13px] font-semibold text-gray-700">{group.key}</span>
                      <span className="text-[11px] text-gray-400 font-normal">({group.rules.length})</span>
                    </button>
                  </td>
                </tr>
                {!collapsedGroups.has(group.key) && group.rules.map(rule => renderRuleRow(rule))}
              </Fragment>
            ))
          ) : (
            // ── 플랫 렌더링 ──
            processedRules.map(rule => renderRuleRow(rule))
          )}

          {/* 새 행 */}
          {adding ? (
            <tr className="bg-blue-50/30">
              <td className={td} data-dropdown>
                <div className="flex items-center h-full">
                  <PlatformSelect value={newPlatform} options={platformOptions} onChange={setNewPlatform} onClose={() => {}} inline />
                </div>
              </td>
              <td className={td} data-dropdown>
                <div className="flex items-center h-full">
                  <StoreMultiSelect value={newStore} options={scopeOptions.stores} onChange={setNewStore} onClose={() => {}} inline />
                </div>
              </td>
              <td className={td} data-dropdown>
                <div className="flex items-center h-full">
                  <CategorySelect value={newCategory} options={categoryOptions}
                    onChange={setNewCategory}
                    onAddOption={opt => { onAddCategory(opt); setNewCategory(opt); }}
                    onClose={() => {}} inline />
                </div>
              </td>
              <td className={td}>
                <div className="flex items-center h-full">
                  <input autoFocus value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="라벨"
                    onKeyDown={e => { if (e.nativeEvent.isComposing) return; if (e.key === 'Enter' && canSubmit) handleSubmitNew(); if (e.key === 'Escape') { setAdding(false); resetNewRow(); } }}
                    className="w-full h-7 text-sm border border-gray-300 rounded px-2 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400" />
                </div>
              </td>
              <td className={td}>
                <div className="flex items-center h-full">
                  <input value={newContent} onChange={e => setNewContent(e.target.value)} placeholder="규정 본문..."
                    onKeyDown={e => { if (e.nativeEvent.isComposing) return; if (e.key === 'Enter' && canSubmit) handleSubmitNew(); if (e.key === 'Escape') { setAdding(false); resetNewRow(); } }}
                    className="w-full h-7 text-sm border border-gray-300 rounded px-2 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400" />
                </div>
              </td>
              <td className={td}>
                <div className="flex items-center h-full gap-1 flex-wrap">
                  {newTags.map((t, i) => (
                    <span key={i} className="inline-flex items-center gap-0.5 px-1.5 py-0 rounded text-[10px] font-medium bg-gray-100 text-gray-600">
                      {t}
                      <button onClick={() => setNewTags(newTags.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-500">
                        <Xmark className="w-2.5 h-2.5" />
                      </button>
                    </span>
                  ))}
                  <input
                    placeholder={newTags.length === 0 ? "태그 입력 후 Enter" : ""}
                    onKeyDown={e => {
                      if (e.nativeEvent.isComposing) return;
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const v = e.currentTarget.value.trim();
                        if (v && !newTags.includes(v)) { setNewTags([...newTags, v]); e.currentTarget.value = ''; }
                      }
                      if (e.key === 'Escape') { setAdding(false); resetNewRow(); }
                    }}
                    className="flex-1 min-w-[60px] h-6 text-[11px] border-none outline-none bg-transparent placeholder:text-gray-300"
                  />
                </div>
              </td>
              <td colSpan={2} className={td}>
                <div className="flex items-center h-full gap-2">
                  <button onClick={handleSubmitNew} disabled={!canSubmit || submitting}
                    className="text-[11px] text-blue-600 hover:text-blue-800 font-medium disabled:text-gray-300">
                    {submitting ? '저장 중...' : 'Enter 저장'}
                  </button>
                  <button onClick={() => { setAdding(false); resetNewRow(); }}
                    className="text-[11px] text-gray-400 hover:text-gray-600">
                    Esc 취소
                  </button>
                </div>
              </td>
            </tr>
          ) : (
            <tr>
              <td colSpan={COL_SPAN}>
                <button onClick={() => setAdding(true)}
                  className="w-full h-9 text-sm text-gray-400 hover:text-gray-600 hover:bg-gray-50/80 transition-colors flex items-center justify-center gap-1">
                  <Plus className="w-3.5 h-3.5" /> 새 규정
                </button>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 정렬 가능 헤더
// ═══════════════════════════════════════════════════════════

function SortableHeader({ field, active, dir, onSort, className, children }: {
  field: SortField; active: SortField; dir: SortDir;
  onSort: (f: SortField) => void; className?: string; children: React.ReactNode;
}) {
  const isActive = active === field;
  return (
    <th className={`${className} cursor-pointer select-none hover:bg-gray-100/60 transition-colors group/th`} onClick={() => onSort(field)}>
      <div className="flex items-center gap-1">
        {children}
        <span className={`transition-opacity ${isActive ? 'opacity-100' : 'opacity-0 group-hover/th:opacity-40'}`}>
          {isActive && dir === 'desc' ? <NavArrowUp className="w-3 h-3" /> : <NavArrowDown className="w-3 h-3" />}
        </span>
      </div>
    </th>
  );
}

// ═══════════════════════════════════════════════════════════
// 필터 텍스트 인풋
// ═══════════════════════════════════════════════════════════

function FilterInput({ value, onChange, placeholder }: {
  value: string; onChange: (v: string) => void; placeholder: string;
}) {
  return (
    <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      className="w-full text-[11px] border border-gray-200 rounded px-2 py-1 bg-white/80 focus:outline-none focus:ring-1 focus:ring-blue-300 focus:border-blue-300 placeholder:text-gray-300" />
  );
}

// ═══════════════════════════════════════════════════════════
// 분류 셀렉트 — 에어테이블 스타일 (인라인 옵션 추가)
// ═══════════════════════════════════════════════════════════

function CategorySelect({ value, options, onChange, onAddOption, onClose, inline }: {
  value: string;
  options: string[];
  onChange: (val: string) => void;
  onAddOption: (opt: string) => void;
  onClose: () => void;
  inline?: boolean;
}) {
  const [open, setOpen] = useState(!inline);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  const filtered = options.filter(o => !search || o.toLowerCase().includes(search.toLowerCase()));
  const canAdd = search.trim() && !options.some(o => o.toLowerCase() === search.trim().toLowerCase());

  useEffect(() => {
    if (!open && !inline) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        if (inline) setOpen(false); else onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, inline, onClose]);

  const handleSelect = (val: string) => {
    onChange(val);
    setSearch('');
    if (inline) setOpen(false); else onClose();
  };

  const handleAdd = () => {
    if (!canAdd) return;
    const trimmed = search.trim();
    onAddOption(trimmed);
    setSearch('');
    if (inline) setOpen(false); else onClose();
  };

  const dropdown = (
    <div className="absolute z-50 top-full left-0 mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg max-h-[260px] overflow-hidden flex flex-col">
      <div className="p-2 border-b border-gray-100">
        <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
          onKeyDown={e => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === 'Enter' && canAdd) handleAdd();
          }}
          placeholder="검색 또는 추가..."
          className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400" />
      </div>
      <div className="overflow-y-auto flex-1 py-1">
        <button onClick={() => handleSelect('')}
          className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 transition-colors ${!value ? 'text-blue-600 font-medium' : 'text-gray-400'}`}>
          -
        </button>
        {filtered.map(opt => (
          <button key={opt} onClick={() => handleSelect(opt)}
            className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 transition-colors ${value === opt ? 'text-blue-600 font-medium bg-blue-50/40' : 'text-gray-600'}`}>
            <span className="inline-flex items-center px-1.5 py-0 rounded-full text-[11px] font-medium bg-violet-50 text-violet-700 border border-violet-100">
              {opt}
            </span>
          </button>
        ))}
        {canAdd && (
          <button onClick={handleAdd}
            className="w-full text-left px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 transition-colors flex items-center gap-1">
            <Plus className="w-3 h-3" />
            <span>&quot;{search.trim()}&quot; 추가</span>
          </button>
        )}
      </div>
    </div>
  );

  if (inline) {
    return (
      <div ref={ref} data-dropdown className="relative w-full">
        <button onClick={() => setOpen(!open)}
          className="w-full h-7 text-left text-sm border border-gray-300 rounded px-2 bg-white truncate flex items-center justify-between">
          <span className={value ? 'text-gray-600' : 'text-gray-400'}>{value || '분류'}</span>
          <NavArrowDown className="w-3 h-3 text-gray-400 shrink-0" />
        </button>
        {open && dropdown}
      </div>
    );
  }

  return (
    <div ref={ref} data-dropdown className="relative w-full">
      {dropdown}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 태그 에디터 — 인라인 태그 입력
// ═══════════════════════════════════════════════════════════

function TagEditor({ tags, onChange, onClose }: {
  tags: string[];
  onChange: (tags: string[]) => void;
  onClose: () => void;
}) {
  const [input, setInput] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const addTag = () => {
    const trimmed = input.trim();
    if (trimmed && !tags.includes(trimmed)) {
      onChange([...tags, trimmed]);
    }
    setInput('');
  };

  const removeTag = (idx: number) => {
    onChange(tags.filter((_, i) => i !== idx));
  };

  return (
    <div ref={ref} className="absolute left-0 top-0 z-40 w-[280px]">
      <div className="bg-white border border-blue-400 rounded shadow-lg px-2 py-1.5 flex items-center gap-1 flex-wrap min-h-[32px]">
        {tags.map((t, i) => (
          <span key={i} className="inline-flex items-center gap-0.5 px-1.5 py-0 rounded text-[10px] font-medium bg-gray-100 text-gray-600">
            {t}
            <button onClick={() => removeTag(i)} className="text-gray-400 hover:text-red-500">
              <Xmark className="w-2.5 h-2.5" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          autoFocus
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === 'Enter') { e.preventDefault(); addTag(); }
            if (e.key === 'Backspace' && !input && tags.length > 0) removeTag(tags.length - 1);
            if (e.key === 'Escape') onClose();
          }}
          placeholder={tags.length === 0 ? '태그 입력 후 Enter' : ''}
          className="flex-1 min-w-[60px] text-[11px] border-none outline-none bg-transparent"
        />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 내용 편집기
// ═══════════════════════════════════════════════════════════

function ContentEditor({ value, onChange, onClose }: {
  value: string; onChange: (val: string) => void; onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div ref={ref} className="absolute left-0 top-0 z-40 w-[480px]">
      <textarea autoFocus value={value} onChange={e => onChange(e.target.value)}
        rows={Math.min(Math.max(value.split('\n').length + 1, 3), 10)}
        className="w-full text-sm border border-blue-400 rounded px-3 py-2 bg-white shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-50 resize-both leading-relaxed" />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 플랫폼 셀렉트
// ═══════════════════════════════════════════════════════════

function PlatformSelect({ value, options, onChange, onClose, inline }: {
  value: string; options: string[]; onChange: (val: string) => void; onClose: () => void; inline?: boolean;
}) {
  const [open, setOpen] = useState(!inline);
  const dropdownEl = (onSelect: (v: string) => void) => (
    <div data-dropdown className="absolute z-50 top-full left-0 mt-1 w-36 bg-white border border-gray-200 rounded-lg shadow-lg max-h-[200px] overflow-y-auto py-1">
      {options.map(opt => (
        <button key={opt} onClick={() => onSelect(opt)}
          className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 transition-colors ${value === opt ? 'text-blue-600 font-medium' : 'text-gray-600'}`}>
          {opt}
        </button>
      ))}
    </div>
  );

  if (inline) {
    return (
      <div data-dropdown className="relative w-full">
        <button onClick={() => setOpen(!open)} className="w-full h-7 text-left text-sm border border-gray-300 rounded px-2 bg-white truncate flex items-center justify-between">
          <span className="text-gray-600">{value || '-'}</span>
          <NavArrowDown className="w-3 h-3 text-gray-400 shrink-0" />
        </button>
        {open && dropdownEl((opt) => { onChange(opt); setOpen(false); })}
      </div>
    );
  }
  return (
    <div data-dropdown className="relative w-full">
      {dropdownEl((opt) => { onChange(opt); onClose(); })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 매장 멀티셀렉트
// ═══════════════════════════════════════════════════════════

function StoreMultiSelect({ value, options, onChange, onClose, inline }: {
  value: string[]; options: string[]; onChange: (val: string[]) => void; onClose: () => void; inline?: boolean;
}) {
  const [open, setOpen] = useState(!inline);
  const [search, setSearch] = useState('');
  const selected = new Set(value);
  const isAllCommon = selected.has('공통');

  const toggle = (item: string) => {
    if (item === '공통') { onChange(selected.has(item) ? [] : ['공통']); }
    else {
      const next = new Set(selected);
      next.delete('공통');
      if (next.has(item)) next.delete(item); else next.add(item);
      onChange(Array.from(next));
    }
  };

  const filtered = options.filter(o => !search || o.includes(search));
  const dropdown = (
    <div data-dropdown className="absolute z-50 top-full left-0 mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg max-h-[260px] overflow-hidden flex flex-col">
      <div className="p-2 border-b border-gray-100">
        <input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="검색..."
          className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400" />
      </div>
      <div className="overflow-y-auto flex-1 p-1">
        <label className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 rounded cursor-pointer">
          <input type="checkbox" checked={selected.has('공통')} onChange={() => toggle('공통')} className="rounded border-gray-300 text-blue-600 focus:ring-blue-400 w-3.5 h-3.5" />
          <span className="text-xs font-medium text-gray-700">공통</span>
        </label>
        {filtered.map(item => (
          <label key={item} className={`flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 rounded cursor-pointer ${isAllCommon ? 'opacity-40' : ''}`}>
            <input type="checkbox" checked={selected.has(item)} onChange={() => toggle(item)} disabled={isAllCommon} className="rounded border-gray-300 text-blue-600 focus:ring-blue-400 w-3.5 h-3.5" />
            <span className="text-xs text-gray-700">{item}</span>
          </label>
        ))}
      </div>
      <div className="p-1.5 border-t border-gray-100 flex justify-end">
        <button onClick={() => { if (inline) setOpen(false); else onClose(); }}
          className="text-xs text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded hover:bg-blue-50">완료</button>
      </div>
    </div>
  );

  if (inline) {
    return (
      <div data-dropdown className="relative w-full">
        <button onClick={() => setOpen(!open)} className="w-full h-7 text-left text-sm border border-gray-300 rounded px-2 bg-white truncate text-gray-600">
          {value.length > 0 ? value.join(', ') : '공통'}
        </button>
        {open && dropdown}
      </div>
    );
  }
  return <div data-dropdown className="relative w-full">{dropdown}</div>;
}

// ═══════════════════════════════════════════════════════════
// 참조 셀
// ═══════════════════════════════════════════════════════════

function ReferenceCell({ rule, packagesMap, tenantsMap, onRefClick }: {
  rule: Rule; packagesMap: Map<string, PackageInfo>; tenantsMap: Map<string, string>;
  onRefClick: (type: 'package' | 'faq', id: string, tenantId?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const totalCount = rule.linkedPackageIds.length + rule.linkedFaqIds.length;

  const parsedFaqRefs = rule.linkedFaqIds.map(r => {
    const [tenantId, faqId] = r.split('/');
    return { tenantId, faqId, brandName: tenantsMap.get(tenantId) || tenantId };
  });

  const displayNames: { label: string; type: 'package' | 'faq'; id: string; tenantId?: string }[] = [];
  for (const pkgId of rule.linkedPackageIds) {
    const pkg = packagesMap.get(pkgId);
    displayNames.push({ label: pkg?.name || pkgId, type: 'package', id: pkgId });
  }
  for (const faq of parsedFaqRefs) {
    displayNames.push({ label: faq.brandName, type: 'faq', id: faq.faqId, tenantId: faq.tenantId });
  }

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (totalCount === 0) return <span className="text-sm text-gray-300">-</span>;

  const firstItem = displayNames[0];
  const remaining = displayNames.length - 1;

  return (
    <div ref={ref} className="relative w-full" data-dropdown>
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1.5 w-full min-w-0 cursor-pointer">
        <span onClick={(e) => { e.stopPropagation(); onRefClick(firstItem.type, firstItem.id, firstItem.tenantId); }}
          className="inline-flex items-center px-2 py-0.5 rounded bg-blue-50 text-[12px] text-blue-700 hover:bg-blue-100 transition-colors truncate max-w-[120px]"
          title={firstItem.label}>{firstItem.label}</span>
        {remaining > 0 && <span className="text-[11px] text-gray-400 shrink-0 hover:text-blue-500 transition-colors">+{remaining}</span>}
      </button>

      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-lg max-h-[320px] overflow-y-auto">
          {rule.linkedPackageIds.length > 0 && (
            <div>
              <div className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-100 bg-gray-50/60">패키지 ({rule.linkedPackageIds.length})</div>
              {rule.linkedPackageIds.map(pkgId => {
                const pkg = packagesMap.get(pkgId);
                return (
                  <button key={pkgId} onClick={() => { setOpen(false); onRefClick('package', pkgId); }}
                    className="w-full text-left px-3 py-2 hover:bg-blue-50/50 transition-colors border-b border-gray-50 last:border-0">
                    <div className="text-[13px] text-gray-700 truncate">{pkg?.name || pkgId}</div>
                    {pkg && <div className="text-[11px] text-gray-400 mt-0.5">FAQ {pkg.faqCount}개</div>}
                  </button>
                );
              })}
            </div>
          )}
          {parsedFaqRefs.length > 0 && (
            <div>
              <div className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-100 bg-gray-50/60">FAQ ({parsedFaqRefs.length})</div>
              {parsedFaqRefs.map(faq => (
                <button key={`${faq.tenantId}/${faq.faqId}`} onClick={() => { setOpen(false); onRefClick('faq', faq.faqId, faq.tenantId); }}
                  className="w-full text-left px-3 py-2 hover:bg-blue-50/50 transition-colors border-b border-gray-50 last:border-0">
                  <div className="text-[13px] text-gray-700 truncate">{faq.brandName}</div>
                  <div className="text-[11px] text-gray-400 mt-0.5 truncate">{faq.faqId}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}