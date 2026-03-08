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
  onBulkDelete?: (ruleIds: string[]) => Promise<void>;
  onAdd: (data: RuleAddData) => Promise<void>;
  dirtyIds: Set<string>;
  packagesMap: Map<string, PackageInfo>;
  tenantsMap: Map<string, string>;
  onRefClick: (type: 'package' | 'faq', id: string, tenantId?: string) => void;
  categoryOptions: string[];
  onAddCategory: (cat: string) => void;
  onUndo?: () => void;
  onRedo?: () => void;
}

const COL_SPAN = 8;
const generateId = () => `rule_${Date.now().toString(36)}`;

const FIELD_LABELS: Record<string, string> = {
  platform: '플랫폼', store: '매장', category: '분류', label: '라벨',
  content: '내용', tags: '태그', ref: '참조',
};

const GROUPABLE: SortField[] = ['platform', 'store', 'category', 'tags'];

// 네비게이션 가능한 필드 순서 (방향키/탭 이동용)
const NAV_FIELDS = ['platform', 'store', 'category', 'label', 'content', 'tags', 'ref'] as const;
// 편집 가능한 필드 (ref 제외)
const EDITABLE_FIELDS = new Set(['platform', 'store', 'category', 'label', 'content', 'tags']);

// 셀 값을 텍스트로 변환 (복사용)
function getCellText(rule: Rule, field: string): string {
  switch (field) {
    case 'platform': return rule.platform;
    case 'store': return rule.store.join(', ');
    case 'label': return rule.label;
    case 'content': return rule.content;
    case 'category': return rule.category || '';
    case 'tags': return rule.tags.join(', ');
    case 'ref': {
      const parts: string[] = [];
      if (rule.linkedPackageIds.length > 0) parts.push(`패키지 ${rule.linkedPackageIds.length}`);
      if (rule.linkedFaqIds.length > 0) parts.push(`FAQ ${rule.linkedFaqIds.length}`);
      return parts.join(', ') || '-';
    }
    default: return '';
  }
}

// ═══════════════════════════════════════════════════════════
// 메인 테이블
// ═══════════════════════════════════════════════════════════

export default function RulesTable({
  rules, scopeOptions, onCellEdit, onDelete, onBulkDelete, onAdd, dirtyIds,
  packagesMap, tenantsMap, onRefClick,
  categoryOptions, onAddCategory,
  onUndo, onRedo,
}: RulesTableProps) {
  // 셀 선택 (클릭)
  const [selectedCell, setSelectedCell] = useState<{ id: string; field: string } | null>(null);
  // 셀 편집 (더블클릭 / Enter)
  const [editingCell, setEditingCell] = useState<{ id: string; field: string } | null>(null);
  // 복사 피드백
  const [copyFeedback, setCopyFeedback] = useState(false);
  // 행 체크 (일괄 작업)
  const [checkedRows, setCheckedRows] = useState<Set<string>>(new Set());

  const tableRef = useRef<HTMLDivElement>(null);

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

  // 칼럼 너비 리사이즈
  const MIN_CONTENT_WIDTH = 200;
  const DEFAULT_WIDTHS: Record<string, number> = {
    platform: 90, store: 90, category: 100, label: 150,
    tags: 120, ref: 120,
  };
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(DEFAULT_WIDTHS);
  // content 칼럼 별도 너비 (null = auto/나머지 공간)
  const [contentWidth, setContentWidth] = useState<number | null>(null);

  // 테이블 최소 너비: # + 고정 칼럼 합 + content + actions
  const NUM_WIDTH = 40;
  const fixedSum = Object.values(columnWidths).reduce((a, b) => a + b, 0);
  const effectiveContentW = contentWidth ?? MIN_CONTENT_WIDTH;
  const tableMinWidth = NUM_WIDTH + fixedSum + effectiveContentW;
  const resizing = useRef<{ field: string; startX: number; startW: number } | null>(null);

  const handleResizeStart = useCallback((field: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (field === 'content') {
      // content: 현재 실제 칼럼 너비에서 시작
      const th = (e.target as HTMLElement).closest('th');
      const startW = contentWidth ?? (th?.offsetWidth || MIN_CONTENT_WIDTH);
      resizing.current = { field: 'content', startX: e.clientX, startW };
    } else {
      const startW = columnWidths[field] || DEFAULT_WIDTHS[field];
      resizing.current = { field, startX: e.clientX, startW };
    }

    const onMove = (ev: MouseEvent) => {
      if (!resizing.current) return;
      const delta = ev.clientX - resizing.current.startX;
      const newW = Math.max(60, resizing.current.startW + delta);
      if (resizing.current.field === 'content') {
        setContentWidth(newW);
      } else {
        setColumnWidths(prev => ({ ...prev, [resizing.current!.field]: newW }));
      }
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      requestAnimationFrame(() => { resizing.current = null; });
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [columnWidths, contentWidth]);

  // 새 행 추가
  const handleAddBlankRow = useCallback(async () => {
    try {
      await onAdd({
        id: generateId(),
        platform: '-',
        store: ['공통'],
        label: '',
        content: '',
        category: '',
        tags: [],
      });
    } catch (err: any) {
      alert(err.message || '추가 실패');
    }
  }, [onAdd]);

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

  // ── 셀 선택/편집 헬퍼 ──
  const isSelected = (id: string, field: string) => selectedCell?.id === id && selectedCell?.field === field;
  const isEditing = (id: string, field: string) => editingCell?.id === id && editingCell?.field === field;

  const selectCell = useCallback((id: string, field: string) => {
    setSelectedCell({ id, field });
    setEditingCell(null);
  }, []);

  const startEdit = useCallback((id: string, field: string) => {
    if (!EDITABLE_FIELDS.has(field)) return; // ref 등 편집 불가
    setSelectedCell({ id, field });
    setEditingCell({ id, field });
  }, []);

  const stopEdit = useCallback(() => {
    // 편집 종료 → 선택 상태로 복귀, 테이블에 포커스 반환
    setEditingCell(null);
    requestAnimationFrame(() => tableRef.current?.focus());
  }, []);

  const deselectAll = useCallback(() => {
    setSelectedCell(null);
    setEditingCell(null);
  }, []);

  // ── 셀 편집 클릭 아웃사이드 ──
  useEffect(() => {
    if (!selectedCell && !editingCell) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // 드롭다운 내부 클릭은 무시
      if (target.closest('[data-dropdown]')) return;
      // 테이블 내부의 td 클릭은 무시 (selectCell에서 처리)
      if (target.closest('[data-cell]')) return;
      // 테이블 외부 클릭 → 전부 해제
      deselectAll();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [selectedCell, editingCell, deselectAll]);

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
    if (resizing.current) return; // 리사이즈 중 정렬 방지
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
        if (field === 'platform') return r.platform === fv;
        if (field === 'store') return r.store.includes(fv);
        if (field === 'category') {
          if (fv === '__none__') return !r.category;
          return r.category === fv;
        }
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

  // 원본 배열 인덱스 기반 넘버링 (정렬/필터 무관)
  const ruleIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    rules.forEach((r, i) => map.set(r.id, i + 1));
    return map;
  }, [rules]);

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

  // 보이는 행 목록 (그룹 접힘 고려)
  const visibleRules = useMemo(() => {
    if (!groupByField || !groupedData) return processedRules;
    const visible: Rule[] = [];
    for (const group of groupedData!) {
      if (!collapsedGroups.has(group.key)) {
        visible.push(...group.rules);
      }
    }
    return visible;
  }, [processedRules, groupByField, groupedData, collapsedGroups]);

  const platformOptions = ['-', ...scopeOptions.platforms];

  // ── 복사 ──
  const handleCopy = useCallback(() => {
    if (!selectedCell) return;
    const rule = rules.find(r => r.id === selectedCell.id);
    if (!rule) return;
    const text = getCellText(rule, selectedCell.field);
    navigator.clipboard.writeText(text).then(() => {
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 1200);
    });
  }, [selectedCell, rules]);

  // ── 붙여넣기 ──
  const handlePaste = useCallback(async () => {
    if (!selectedCell || editingCell) return;
    if (!EDITABLE_FIELDS.has(selectedCell.field)) return;
    try {
      const text = await navigator.clipboard.readText();
      if (!text) return;
      const { id, field } = selectedCell;
      switch (field) {
        case 'platform': {
          const trimmed = text.trim();
          if (platformOptions.includes(trimmed)) onCellEdit(id, 'platform', trimmed);
          break;
        }
        case 'store': {
          const arr = text.split(',').map(s => s.trim()).filter(Boolean);
          if (arr.length > 0) onCellEdit(id, 'store', arr);
          break;
        }
        case 'category': {
          const trimmed = text.trim();
          if (categoryOptions.includes(trimmed) || trimmed === '') onCellEdit(id, 'category', trimmed);
          break;
        }
        case 'label':
          onCellEdit(id, 'label', text.trim());
          break;
        case 'content':
          onCellEdit(id, 'content', text);
          break;
        case 'tags': {
          const arr = text.split(',').map(s => s.trim()).filter(Boolean);
          if (arr.length > 0) onCellEdit(id, 'tags', arr);
          break;
        }
      }
    } catch {
      // clipboard permission denied 등
    }
  }, [selectedCell, editingCell, platformOptions, categoryOptions, onCellEdit]);

  // ── Delete/Backspace 셀 초기화 ──
  const handleClearCell = useCallback(() => {
    if (!selectedCell || editingCell) return;
    if (!EDITABLE_FIELDS.has(selectedCell.field)) return;
    const { id, field } = selectedCell;
    switch (field) {
      case 'platform': onCellEdit(id, 'platform', '-'); break;
      case 'store': onCellEdit(id, 'store', ['공통']); break;
      case 'category': onCellEdit(id, 'category', ''); break;
      case 'label': onCellEdit(id, 'label', ''); break;
      case 'content': onCellEdit(id, 'content', ''); break;
      case 'tags': onCellEdit(id, 'tags', []); break;
    }
  }, [selectedCell, editingCell, onCellEdit]);

  // ── 키보드 네비게이션 ──
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Cmd/Ctrl+Z (undo/redo) — 편집 중이든 선택 중이든 항상 동작
    if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
      e.preventDefault();
      if (e.shiftKey) { onRedo?.(); } else { onUndo?.(); }
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'y') {
      e.preventDefault();
      onRedo?.();
      return;
    }

    // 편집 중이면 키보드 네비게이션 안 함 (각 편집 컴포넌트가 처리)
    if (editingCell) {
      if (e.key === 'Escape') {
        e.preventDefault();
        stopEdit();
      }
      return;
    }

    // 선택된 셀이 없으면 무시
    if (!selectedCell) return;

    const rowIds = visibleRules.map(r => r.id);
    const rowIdx = rowIds.indexOf(selectedCell.id);
    const colIdx = NAV_FIELDS.indexOf(selectedCell.field as typeof NAV_FIELDS[number]);
    if (rowIdx < 0 || colIdx < 0) return;

    switch (e.key) {
      case 'ArrowUp': {
        e.preventDefault();
        if (rowIdx > 0) setSelectedCell({ id: rowIds[rowIdx - 1], field: selectedCell.field });
        break;
      }
      case 'ArrowDown': {
        e.preventDefault();
        if (rowIdx < rowIds.length - 1) setSelectedCell({ id: rowIds[rowIdx + 1], field: selectedCell.field });
        break;
      }
      case 'ArrowLeft': {
        e.preventDefault();
        if (colIdx > 0) setSelectedCell({ id: selectedCell.id, field: NAV_FIELDS[colIdx - 1] });
        break;
      }
      case 'ArrowRight': {
        e.preventDefault();
        if (colIdx < NAV_FIELDS.length - 1) setSelectedCell({ id: selectedCell.id, field: NAV_FIELDS[colIdx + 1] });
        break;
      }
      case 'Tab': {
        e.preventDefault();
        if (e.shiftKey) {
          // 이전 셀
          if (colIdx > 0) {
            setSelectedCell({ id: selectedCell.id, field: NAV_FIELDS[colIdx - 1] });
          } else if (rowIdx > 0) {
            setSelectedCell({ id: rowIds[rowIdx - 1], field: NAV_FIELDS[NAV_FIELDS.length - 1] });
          }
        } else {
          // 다음 셀
          if (colIdx < NAV_FIELDS.length - 1) {
            setSelectedCell({ id: selectedCell.id, field: NAV_FIELDS[colIdx + 1] });
          } else if (rowIdx < rowIds.length - 1) {
            setSelectedCell({ id: rowIds[rowIdx + 1], field: NAV_FIELDS[0] });
          }
        }
        break;
      }
      case 'Enter': {
        e.preventDefault();
        if (e.shiftKey) {
          handleAddBlankRow();
        } else if (EDITABLE_FIELDS.has(selectedCell.field)) {
          startEdit(selectedCell.id, selectedCell.field);
        }
        break;
      }
      case 'Escape': {
        e.preventDefault();
        deselectAll();
        break;
      }
      case 'Delete':
      case 'Backspace': {
        e.preventDefault();
        handleClearCell();
        break;
      }
      default: {
        // Cmd/Ctrl+C
        if ((e.metaKey || e.ctrlKey) && e.key === 'c') {
          e.preventDefault();
          handleCopy();
        }
        // Cmd/Ctrl+V
        if ((e.metaKey || e.ctrlKey) && e.key === 'v') {
          e.preventDefault();
          handlePaste();
        }

        break;
      }
    }
  }, [editingCell, selectedCell, visibleRules, stopEdit, startEdit, deselectAll, handleCopy, handlePaste, handleClearCell, onUndo, onRedo]);

  // 셀 공통 클래스
  const th = 'h-9 px-3 text-left text-[11px] font-medium text-gray-400 tracking-wide';
  const td = 'h-11 px-3 border-b border-gray-100/80';
  const cellText = 'text-sm text-gray-700 truncate leading-tight';
  const muted = 'text-sm text-gray-300';

  const hasActiveFilters = Object.values(columnFilters).some(v => v.trim());

  const sortLabel: Record<string, string> = FIELD_LABELS;

  // 셀 선택/편집 스타일
  const cellCls = (id: string, field: string, extra?: string) => {
    const sel = isSelected(id, field) && !isEditing(id, field);
    return [
      td,
      extra || '',
      sel ? 'ring-2 ring-inset ring-blue-400 bg-blue-50/20' : '',
    ].filter(Boolean).join(' ');
  };

  // ── 규정 행 렌더 ──
  const renderRuleRow = (rule: Rule) => {
    const isDirty = dirtyIds.has(rule.id);
    return (
      <tr key={rule.id} className={`group transition-colors ${isDirty ? 'bg-amber-50/40' : 'hover:bg-gray-50/50'}`}>
        {/* # — 호버 시 체크박스, 기본은 넘버 */}
        <td className={`${td} text-center select-none group/numcell`}>
          {checkedRows.has(rule.id) ? (
            <input
              type="checkbox"
              checked
              onChange={e => { e.stopPropagation(); setCheckedRows(prev => { const n = new Set(prev); n.delete(rule.id); return n; }); }}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-400 w-3.5 h-3.5"
            />
          ) : (
            <>
              <span className="text-[11px] text-gray-300 group-hover/numcell:hidden">{ruleIndexMap.get(rule.id) ?? ''}</span>
              <input
                type="checkbox"
                checked={false}
                onChange={e => { e.stopPropagation(); setCheckedRows(prev => new Set(prev).add(rule.id)); }}
                className="hidden group-hover/numcell:inline-block rounded border-gray-300 text-blue-600 focus:ring-blue-400 w-3.5 h-3.5"
              />
            </>
          )}
        </td>
        {/* 플랫폼 */}
        <td
          className={cellCls(rule.id, 'platform')}
          data-cell data-dropdown
          onClick={() => { if (isEditing(rule.id, 'platform')) return; isSelected(rule.id, 'platform') ? startEdit(rule.id, 'platform') : selectCell(rule.id, 'platform'); }}
        >
          <div className="flex items-center h-full">
            {isEditing(rule.id, 'platform') ? (
              <PlatformSelect value={rule.platform} options={platformOptions}
                onChange={val => { onCellEdit(rule.id, 'platform', val); stopEdit(); }} onClose={stopEdit} />
            ) : (
              <div className="w-full flex items-center gap-0.5">
                {rule.platform && rule.platform !== '-' ? (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-100 truncate max-w-full">{rule.platform}</span>
                ) : <span className={muted}>-</span>}
                <NavArrowDown className="w-2.5 h-2.5 text-gray-300 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            )}
          </div>
        </td>

        {/* 매장 */}
        <td
          className={cellCls(rule.id, 'store')}
          data-cell data-dropdown
          onClick={() => { if (isEditing(rule.id, 'store')) return; isSelected(rule.id, 'store') ? startEdit(rule.id, 'store') : selectCell(rule.id, 'store'); }}
        >
          <div className="flex items-center h-full">
            {isEditing(rule.id, 'store') ? (
              <StoreMultiSelect value={rule.store} options={scopeOptions.stores}
                onChange={val => onCellEdit(rule.id, 'store', val)} onClose={stopEdit} />
            ) : (
              <div className="w-full flex items-center gap-1 overflow-hidden">
                {rule.store.length === 0 || (rule.store.length === 1 && rule.store[0] === '공통') ? (
                  <span className={muted}>공통</span>
                ) : (
                  <>
                    {rule.store.filter(s => s !== '공통').map((s, i) => (
                      <span key={i} className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-100 shrink-0 truncate max-w-[80px]">{s}</span>
                    ))}
                    {rule.store.filter(s => s !== '공통').length > 1 ? null : null}
                  </>
                )}
              </div>
            )}
          </div>
        </td>

        {/* 분류 */}
        <td
          className={cellCls(rule.id, 'category')}
          data-cell data-dropdown
          onClick={() => { if (isEditing(rule.id, 'category')) return; isSelected(rule.id, 'category') ? startEdit(rule.id, 'category') : selectCell(rule.id, 'category'); }}
        >
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
              <div className="w-full">
                {rule.category ? (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-violet-50 text-violet-700 border border-violet-100 truncate max-w-full">
                    {rule.category}
                  </span>
                ) : <span className={muted}>-</span>}
              </div>
            )}
          </div>
        </td>

        {/* 라벨 */}
        <td
          className={cellCls(rule.id, 'label')}
          data-cell
          onClick={() => { if (isEditing(rule.id, 'label')) return; isSelected(rule.id, 'label') ? startEdit(rule.id, 'label') : selectCell(rule.id, 'label'); }}
        >
          <div className="flex items-center h-full">
            {isEditing(rule.id, 'label') ? (
              <input autoFocus value={rule.label}
                onChange={e => onCellEdit(rule.id, 'label', e.target.value)}
                onBlur={stopEdit}
                onKeyDown={e => { if (e.nativeEvent.isComposing) return; if (e.key === 'Enter') stopEdit(); if (e.key === 'Escape') stopEdit(); }}
                className="w-full text-sm text-gray-700 bg-transparent focus:outline-none" />
            ) : (
              <div className={`${cellText} w-full`}>
                {rule.label || <span className={muted}>-</span>}
              </div>
            )}
          </div>
        </td>

        {/* 내용 */}
        <td
          className={cellCls(rule.id, 'content', 'relative')}
          data-cell
          onClick={() => { if (isEditing(rule.id, 'content')) return; isSelected(rule.id, 'content') ? startEdit(rule.id, 'content') : selectCell(rule.id, 'content'); }}
        >
          <div className="flex items-center h-full">
            {isEditing(rule.id, 'content') ? (
              <ContentEditor value={rule.content} onChange={val => onCellEdit(rule.id, 'content', val)} onClose={stopEdit} />
            ) : (
              <div className={`${cellText} w-full text-gray-500`}>
                {rule.content ? rule.content.split('\n')[0] : <span className={muted}>-</span>}
              </div>
            )}
          </div>
        </td>

        {/* 태그 */}
        <td
          className={cellCls(rule.id, 'tags')}
          data-cell
          onClick={() => { if (isEditing(rule.id, 'tags')) return; isSelected(rule.id, 'tags') ? startEdit(rule.id, 'tags') : selectCell(rule.id, 'tags'); }}
        >
          <div className="flex items-center h-full">
            {isEditing(rule.id, 'tags') ? (
              <TagEditor
                tags={rule.tags}
                onChange={val => onCellEdit(rule.id, 'tags', val)}
                onClose={stopEdit}
              />
            ) : (
              <div className="w-full flex items-center gap-1 overflow-hidden">
                {rule.tags.length > 0 ? rule.tags.map((t, i) => (
                  <span key={i} className="inline-flex items-center px-1.5 py-0 rounded text-[10px] font-medium bg-gray-100 text-gray-600 shrink-0">{t}</span>
                )) : <span className={muted}>-</span>}
              </div>
            )}
          </div>
        </td>

        {/* 참조 (선택 가능, 편집 불가) + 작업 오버레이 */}
        <td
          className={cellCls(rule.id, 'ref', 'relative overflow-visible')}
          data-cell
          onClick={() => { if (!isEditing(rule.id, 'ref')) selectCell(rule.id, 'ref'); }}
        >
          <div className="flex items-center h-full">
            <ReferenceCell rule={rule} packagesMap={packagesMap} tenantsMap={tenantsMap} onRefClick={onRefClick} />
          </div>
          <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0 opacity-0 group-hover:opacity-100 transition-opacity bg-white rounded-md shadow-sm border border-gray-200 px-0.5 z-20">
            <button onClick={e => { e.stopPropagation(); handleDuplicate(rule); }} className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100" title="복제">
              <Copy className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={e => {
                e.stopPropagation();
                const hasContent = rule.label || rule.content;
                const hasRef = rule.linkedFaqIds.length > 0 || rule.linkedPackageIds.length > 0;
                if (hasContent || hasRef) {
                  const refMsg = hasRef ? `\n참조: 패키지 ${rule.linkedPackageIds.length}, FAQ ${rule.linkedFaqIds.length}` : '';
                  const name = rule.label || "(제목 없음)";
                  if (!confirm(name + " 삭제하시겠습니까?" + refMsg)) return;
                }
                onDelete(rule.id);
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
    <div
      ref={tableRef}
      className="outline-none"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {/* ── 툴바 ── */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-100 bg-gray-50/30">
        {/* 그룹 */}
        <div ref={groupRef} className="relative">
          <button
            onClick={() => setShowGroupMenu(!showGroupMenu)}
            className={`flex items-center gap-1 px-2 py-1 text-[11px] rounded-md transition-colors ${groupByField
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
                  className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 transition-colors flex items-center justify-between ${groupByField === f ? 'text-indigo-600 font-medium bg-indigo-50/40' : 'text-gray-600'
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
          className={`flex items-center gap-1 px-2 py-1 text-[11px] rounded-md transition-colors ${showFilters || hasActiveFilters
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

        {/* 복사 피드백 */}
        {copyFeedback && (
          <span className="text-[11px] text-green-600 font-medium ml-2 animate-pulse">복사됨</span>
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

        {/* 일괄 액션 */}
        {checkedRows.size > 0 && (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-[11px] font-medium text-blue-600">{checkedRows.size}개 선택</span>
            <button
              onClick={async () => {
                const ids = Array.from(checkedRows);
                if (!confirm(ids.length + '개 규정을 삭제하시겠습니까?')) return;
                if (onBulkDelete) await onBulkDelete(ids); else for (const id of ids) onDelete(id);
                setCheckedRows(new Set());
              }}
              className="text-[11px] text-red-600 hover:text-red-800 font-medium px-1.5 py-0.5 rounded hover:bg-red-50 transition-colors"
            >
              삭제
            </button>
            <button
              onClick={() => setCheckedRows(new Set())}
              className="text-[11px] text-gray-400 hover:text-gray-600 px-1 py-0.5 rounded hover:bg-gray-100 transition-colors"
            >
              해제
            </button>
          </div>
        )}
      </div>

      {/* ── 테이블 ── */}
      <table className="border-collapse table-fixed" style={{ minWidth: tableMinWidth, width: '100%' }}>
        <colgroup>
          <col style={{ width: NUM_WIDTH }} />
          <col style={{ width: columnWidths.platform }} />
          <col style={{ width: columnWidths.store }} />
          <col style={{ width: columnWidths.category }} />
          <col style={{ width: columnWidths.label }} />
          <col style={contentWidth ? { width: contentWidth } : undefined} />
          <col style={{ width: columnWidths.tags }} />
          <col style={{ width: columnWidths.ref }} />
        </colgroup>
        <thead>
          <tr className="border-b border-gray-200/60 bg-gray-50/40">
            <th className={`${th} text-center group/num`}>
              {checkedRows.size > 0 ? (
                <input
                  type="checkbox"
                  checked={processedRules.length > 0 && processedRules.every(r => checkedRows.has(r.id))}
                  onChange={e => {
                    if (e.target.checked) setCheckedRows(new Set(processedRules.map(r => r.id)));
                    else setCheckedRows(new Set());
                  }}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-400 w-3.5 h-3.5"
                />
              ) : (
                <>
                  <span className="group-hover/num:hidden">#</span>
                  <input
                    type="checkbox"
                    checked={false}
                    onChange={() => setCheckedRows(new Set(processedRules.map(r => r.id)))}
                    className="hidden group-hover/num:inline-block rounded border-gray-300 text-blue-600 focus:ring-blue-400 w-3.5 h-3.5"
                  />
                </>
              )}
            </th>
            <ResizableHeader field="platform" active={sortField} dir={sortDir} onSort={handleSort} onResizeStart={handleResizeStart} className={th}>플랫폼</ResizableHeader>
            <ResizableHeader field="store" active={sortField} dir={sortDir} onSort={handleSort} onResizeStart={handleResizeStart} className={th}>매장</ResizableHeader>
            <ResizableHeader field="category" active={sortField} dir={sortDir} onSort={handleSort} onResizeStart={handleResizeStart} className={th}>분류</ResizableHeader>
            <ResizableHeader field="label" active={sortField} dir={sortDir} onSort={handleSort} onResizeStart={handleResizeStart} className={th}>라벨</ResizableHeader>
            <ResizableHeader field="content" active={sortField} dir={sortDir} onSort={handleSort} onResizeStart={handleResizeStart} className={th}>내용</ResizableHeader>
            <ResizableHeader field="tags" active={sortField} dir={sortDir} onSort={handleSort} onResizeStart={handleResizeStart} className={th}>태그</ResizableHeader>
            <ResizableHeader field="ref" active={sortField} dir={sortDir} onSort={handleSort} onResizeStart={handleResizeStart} className={th} isLast>참조</ResizableHeader>
          </tr>

          {/* 필터 행 */}
          {showFilters && (
            <tr className="border-b border-gray-200/40 bg-blue-50/20">
              <td />
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
            </tr>
          )}
        </thead>

        <tbody>
          {processedRules.length === 0 && (
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

          {/* 행 추가 */}
          <tr>
            <td colSpan={COL_SPAN}>
              <button onClick={handleAddBlankRow}
                className="w-full h-9 text-sm text-gray-400 hover:text-gray-600 hover:bg-gray-50/80 transition-colors flex items-center justify-center gap-1">
                <Plus className="w-3.5 h-3.5" /> 행 추가
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 정렬 가능 헤더
// ═══════════════════════════════════════════════════════════

function ResizableHeader({ field, active, dir, onSort, onResizeStart, className, children, isLast }: {
  field: string; active: SortField; dir: SortDir;
  onSort: (f: SortField) => void;
  onResizeStart: (field: string, e: React.MouseEvent) => void;
  className?: string; children: React.ReactNode;
  isLast?: boolean;
}) {
  const isActive = active === field;
  return (
    <th className={`${className} relative cursor-pointer select-none hover:bg-gray-100/60 transition-colors group/th`} onClick={() => onSort(field as SortField)}>
      <div className="flex items-center gap-1">
        {children}
        <span className={`transition-opacity ${isActive ? 'opacity-100' : 'opacity-0 group-hover/th:opacity-40'}`}>
          {isActive && dir === 'desc' ? <NavArrowUp className="w-3 h-3" /> : <NavArrowDown className="w-3 h-3" />}
        </span>
      </div>
      {!isLast && (
        <div
          onMouseDown={(e) => onResizeStart(field, e)}
          className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-blue-400/50 active:bg-blue-500/60 z-10"
        />
      )}
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
  // 포커스 인덱스: 0 = "-"(없음), 1~ = filtered options, 마지막 = canAdd
  const [fi, setFi] = useState(0);

  const filtered = options.filter(o => !search || o.toLowerCase().includes(search.toLowerCase()));
  const canAdd = search.trim() && !options.some(o => o.toLowerCase() === search.trim().toLowerCase());
  const totalItems = 1 + filtered.length + (canAdd ? 1 : 0); // "-" + filtered + add

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
        <input autoFocus value={search} onChange={e => { setSearch(e.target.value); setFi(0); }}
          onKeyDown={e => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); setFi(i => Math.min(i + 1, totalItems - 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); setFi(i => Math.max(i - 1, 0)); }
            else if (e.key === 'Enter') {
              e.preventDefault(); e.stopPropagation();
              if (fi === 0) handleSelect('');
              else if (fi <= filtered.length) handleSelect(filtered[fi - 1]);
              else if (canAdd) handleAdd();
            } else if (e.key === 'Escape') {
              e.preventDefault(); if (inline) setOpen(false); else onClose();
            }
          }}
          placeholder="검색 또는 추가..."
          className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400" />
      </div>
      <div className="overflow-y-auto flex-1 py-1">
        <button onClick={() => handleSelect('')}
          onMouseEnter={() => setFi(0)}
          className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${fi === 0 ? 'bg-blue-50' : 'hover:bg-gray-50'} ${!value ? 'text-blue-600 font-medium' : 'text-gray-400'}`}>
          -
        </button>
        {filtered.map((opt, idx) => (
          <button key={opt} onClick={() => handleSelect(opt)}
            onMouseEnter={() => setFi(idx + 1)}
            className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${fi === idx + 1 ? 'bg-blue-50' : 'hover:bg-gray-50'} ${value === opt ? 'text-blue-600 font-medium' : 'text-gray-600'}`}>
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
    <div className="w-full flex items-center gap-1 overflow-x-auto">
      {tags.map((t, i) => (
        <span key={i} className="inline-flex items-center gap-0.5 px-1.5 py-0 rounded text-[10px] font-medium bg-gray-100 text-gray-600 shrink-0">
          {t}
          <button onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); removeTag(i); }} className="text-gray-400 hover:text-red-500">
            <Xmark className="w-2.5 h-2.5" />
          </button>
        </span>
      ))}
      <input
        autoFocus
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === 'Enter') { e.preventDefault(); addTag(); }
          if (e.key === 'Backspace' && !input && tags.length > 0) removeTag(tags.length - 1);
          if (e.key === 'Escape') onClose();
        }}
        placeholder={tags.length === 0 ? '태그 입력' : ''}
        className="flex-1 min-w-[60px] text-[11px] border-none outline-none bg-transparent"
      />
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// 내용 편집기
// ═══════════════════════════════════════════════════════════

function ContentEditor({ value, onChange, onClose }: {
  value: string; onChange: (val: string) => void; onClose: () => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const lastValueRef = useRef(value);
  const isComposing = useRef(false);
  const initialized = useRef(false);
  const [showVarMenu, setShowVarMenu] = useState(false);
  const [varFocused, setVarFocused] = useState(0);

  const RULE_VARS = [
    { key: 'brandName', label: '매장명', desc: '적용 매장의 브랜드명' },
  ];
  const VAR_LABELS: Record<string, string> = { brandName: '매장명' };

  // chip HTML 생성
  const chipHtml = (key: string, label: string) =>
    `<span contenteditable="false" data-var="${key}" style="display:inline-flex;align-items:center;padding:1px 8px;margin:0 2px;font-size:12px;font-weight:500;background:#ede9fe;color:#7c3aed;border:1px solid #c4b5fd;border-radius:6px;cursor:default;user-select:all;vertical-align:baseline;line-height:1.6">${label}</span>`;

  const textToHtml = (text: string) => {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\{\{(\w[\w.]*)\}\}/g, (_, key) => chipHtml(key, VAR_LABELS[key] || key))
      .replace(/\n/g, '<br>');
  };

  const extractText = (el: HTMLElement): string => {
    let result = '';
    for (const node of Array.from(el.childNodes)) {
      if (node.nodeType === Node.TEXT_NODE) {
        result += node.textContent || '';
      } else if (node instanceof HTMLElement) {
        if (node.dataset.var) result += `{{${node.dataset.var}}}`;
        else if (node.tagName === 'BR') result += '\n';
        else if (node.tagName === 'DIV' || node.tagName === 'P') {
          if (result.length > 0 && !result.endsWith('\n')) result += '\n';
          result += extractText(node);
        } else result += extractText(node);
      }
    }
    return result;
  };

  // 외부 클릭으로 닫기
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  // 초기 HTML 설정
  useEffect(() => {
    if (!editorRef.current || initialized.current) return;
    editorRef.current.innerHTML = textToHtml(value) || '';
    initialized.current = true;
    lastValueRef.current = value;
    // 포커스 + 커서 끝으로
    editorRef.current.focus();
    const sel = window.getSelection();
    if (sel) {
      const range = document.createRange();
      range.selectNodeContents(editorRef.current);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }, []);

  // 외부 value 변경 동기화
  useEffect(() => {
    if (!editorRef.current || !initialized.current) return;
    if (extractText(editorRef.current) !== value) {
      editorRef.current.innerHTML = textToHtml(value) || '';
    }
    lastValueRef.current = value;
  }, [value]);

  const emitChange = useCallback(() => {
    if (isComposing.current || !editorRef.current) return;
    const newText = extractText(editorRef.current);
    if (newText !== lastValueRef.current) {
      lastValueRef.current = newText;
      onChange(newText);
    }
  }, [onChange]);

  const insertVar = useCallback((key: string) => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    // # 문자가 커서 앞에 있으면 제거
    const range = sel.getRangeAt(0);
    const startContainer = range.startContainer;
    if (startContainer.nodeType === Node.TEXT_NODE) {
      const text = startContainer.textContent || '';
      const offset = range.startOffset;
      if (offset > 0 && text[offset - 1] === '#') {
        startContainer.textContent = text.slice(0, offset - 1) + text.slice(offset);
        range.setStart(startContainer, offset - 1);
        range.collapse(true);
      }
    }

    const label = VAR_LABELS[key] || key;
    const chip = document.createElement('span');
    chip.contentEditable = 'false';
    chip.dataset.var = key;
    chip.style.cssText = 'display:inline-flex;align-items:center;padding:1px 8px;margin:0 2px;font-size:12px;font-weight:500;background:#ede9fe;color:#7c3aed;border:1px solid #c4b5fd;border-radius:6px;cursor:default;user-select:all;vertical-align:baseline;line-height:1.6';
    chip.textContent = label;

    const insertRange = sel.getRangeAt(0);
    insertRange.deleteContents();
    insertRange.insertNode(chip);
    const after = document.createTextNode('\u200B');
    chip.after(after);
    insertRange.setStartAfter(after);
    insertRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(insertRange);

    setShowVarMenu(false);
    emitChange();
  }, [emitChange]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showVarMenu) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setVarFocused(i => Math.min(i + 1, RULE_VARS.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setVarFocused(i => Math.max(i - 1, 0)); return; }
      if (e.key === 'Enter') { e.preventDefault(); insertVar(RULE_VARS[varFocused].key); return; }
      if (e.key === 'Escape') { e.preventDefault(); setShowVarMenu(false); return; }
    }
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };

  const handleInput = () => {
    if (isComposing.current) return;
    // # 감지
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      const node = range.startContainer;
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent || '';
        const offset = range.startOffset;
        if (offset > 0 && text[offset - 1] === '#') {
          setShowVarMenu(true);
          setVarFocused(0);
        } else {
          setShowVarMenu(false);
        }
      }
    }
    emitChange();
  };

  return (
    <div ref={wrapRef} className="absolute z-40 left-0 top-0 w-full min-w-[320px] bg-white border border-gray-200 rounded-lg shadow-lg p-2">
      <div className="relative">
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          onCompositionStart={() => { isComposing.current = true; }}
          onCompositionEnd={() => { isComposing.current = false; handleInput(); }}
          onPaste={e => {
            e.preventDefault();
            const text = e.clipboardData.getData('text/plain');
            document.execCommand('insertText', false, text);
          }}
          className="w-full text-sm text-gray-700 border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 overflow-y-auto whitespace-pre-wrap break-words leading-relaxed resize-y"
          style={{ minHeight: 120 }}
        />
        {!value && (
          <div className="absolute top-1.5 left-2 text-sm text-gray-400 pointer-events-none">내용을 입력하세요</div>
        )}
      </div>
      {/* # 변수 드롭다운 */}
      {showVarMenu && (
        <div className="absolute z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-1 mt-0.5 w-52">
          <div className="px-2.5 py-1 text-[10px] text-gray-400 font-semibold uppercase tracking-wider">변수 삽입</div>
          {RULE_VARS.map((v, i) => (
            <button key={v.key}
              onMouseDown={e => { e.preventDefault(); insertVar(v.key); }}
              onMouseEnter={() => setVarFocused(i)}
              className={`w-full text-left px-2.5 py-1.5 transition-colors flex items-center gap-2 ${i === varFocused ? 'bg-violet-50' : 'hover:bg-gray-50'}`}>
              <span className="text-[11px] font-medium text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded border border-violet-200">{v.label}</span>
              <span className="text-[10px] text-gray-400">{v.desc}</span>
            </button>
          ))}
        </div>
      )}
      {/* 하단 힌트 */}
      <div className="flex items-center gap-1.5 mt-1 px-0.5">
        <span className="text-[10px] text-gray-300"># 입력으로 변수 삽입</span>
        {value.includes('{{') && (
          <span className="text-[10px] text-violet-400">변수 포함됨</span>
        )}
      </div>
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
  const [focused, setFocused] = useState(() => {
    const idx = options.indexOf(value);
    return idx >= 0 ? idx : 0;
  });
  const listRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); setFocused(i => Math.min(i + 1, options.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); setFocused(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') {
      e.preventDefault(); e.stopPropagation();
      if (options[focused]) {
        if (inline) { onChange(options[focused]); setOpen(false); }
        else { onChange(options[focused]); onClose(); }
      }
    } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (inline) setOpen(false); else onClose(); }
  }, [focused, options, onChange, onClose, inline]);

  // 마운트 시 리스트에 포커스 → 키보드 동작
  useEffect(() => {
    listRef.current?.focus();
  }, []);

  useEffect(() => {
    const el = listRef.current?.children[focused] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [focused]);

  const dropdownEl = (onSelect: (v: string) => void) => (
    <div ref={listRef} data-dropdown className="absolute z-50 top-full left-0 mt-1 w-36 bg-white border border-gray-200 rounded-lg shadow-lg max-h-[200px] overflow-y-auto py-1 outline-none"
      tabIndex={-1} onKeyDown={handleKeyDown}>
      {options.map((opt, i) => (
        <button key={opt} onClick={() => onSelect(opt)}
          onMouseEnter={() => setFocused(i)}
          className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${i === focused ? 'bg-blue-50' : 'hover:bg-gray-50'} ${value === opt ? 'text-blue-600 font-medium' : 'text-gray-600'}`}>
          {opt}
        </button>
      ))}
    </div>
  );

  if (inline) {
    return (
      <div data-dropdown className="relative w-full" onKeyDown={handleKeyDown}>
        <button onClick={() => setOpen(!open)} className="w-full h-7 text-left text-sm border border-gray-300 rounded px-2 bg-white truncate flex items-center justify-between">
          <span className="text-gray-600">{value || '-'}</span>
          <NavArrowDown className="w-3 h-3 text-gray-400 shrink-0" />
        </button>
        {open && dropdownEl((opt) => { onChange(opt); setOpen(false); })}
      </div>
    );
  }
  return (
    <div data-dropdown className="relative w-full" onKeyDown={handleKeyDown}>
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
  const [fi, setFi] = useState(0); // focused index: 0=공통, 1+=filtered stores
  const actualStores = value.filter(s => s !== '공통');
  const isCommon = actualStores.length === 0;

  const toggle = (item: string) => {
    if (item === '공통') {
      onChange(['공통']);
    } else {
      const next = new Set(actualStores);
      if (next.has(item)) next.delete(item); else next.add(item);
      onChange(next.size === 0 ? ['공통'] : Array.from(next));
    }
  };

  const filtered = options.filter(o => !search || o.includes(search));
  // 전체 항목: [공통, ...filtered]
  const allItems = ['공통', ...filtered];

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); setFi(i => Math.min(i + 1, allItems.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); setFi(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' || e.key === ' ') {
      if (e.key === ' ' && search) return; // 검색 중 스페이스는 입력용
      e.preventDefault(); e.stopPropagation();
      if (allItems[fi]) toggle(allItems[fi]);
    } else if (e.key === 'Escape') {
      e.preventDefault(); e.stopPropagation();
      if (inline) setOpen(false); else onClose();
    }
  };

  const dropdown = (
    <div data-dropdown className="absolute z-50 top-full left-0 mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg max-h-[260px] overflow-hidden flex flex-col">
      <div className="p-2 border-b border-gray-100">
        <input autoFocus value={search} onChange={e => { setSearch(e.target.value); setFi(0); }} placeholder="검색..."
          onKeyDown={handleKey}
          className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400" />
      </div>
      <div className="overflow-y-auto flex-1 p-1">
        <label className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer ${fi === 0 ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
          onMouseEnter={() => setFi(0)}>
          <input type="checkbox" checked={isCommon} onChange={() => toggle('공통')} className="rounded border-gray-300 text-blue-600 focus:ring-blue-400 w-3.5 h-3.5" />
          <span className={`text-xs font-medium ${isCommon ? 'text-blue-600' : 'text-gray-700'}`}>공통 (전체)</span>
        </label>
        <div className="border-t border-gray-100 my-0.5" />
        {filtered.map((item, idx) => (
          <label key={item} className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer ${fi === idx + 1 ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
            onMouseEnter={() => setFi(idx + 1)}>
            <input type="checkbox" checked={actualStores.includes(item)} onChange={() => toggle(item)} className="rounded border-gray-300 text-blue-600 focus:ring-blue-400 w-3.5 h-3.5" />
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