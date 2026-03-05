'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Trash, Plus, Xmark, Check, Copy, NavArrowDown } from 'iconoir-react';

// ═══════════════════════════════════════════════════════════
// 타입
// ═══════════════════════════════════════════════════════════

export interface Rule {
  id: string;
  platform: string;
  store: string[];
  label: string;
  content: string;
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
}

interface RulesTableProps {
  rules: Rule[];
  scopeOptions: ScopeOptions;
  onCellEdit: (ruleId: string, field: string, value: any) => void;
  onDelete: (ruleId: string) => void;
  onAdd: (data: RuleAddData) => Promise<void>;
  dirtyIds: Set<string>;
}

const COL_SPAN = 6;
const generateId = () => `rule_${Date.now().toString(36)}`;

// ═══════════════════════════════════════════════════════════
// 메인 테이블
// ═══════════════════════════════════════════════════════════

export default function RulesTable({
  rules, scopeOptions, onCellEdit, onDelete, onAdd, dirtyIds,
}: RulesTableProps) {
  const [editingCell, setEditingCell] = useState<{ id: string; field: string } | null>(null);

  // 새 행
  const [adding, setAdding] = useState(false);
  const [newPlatform, setNewPlatform] = useState('-');
  const [newStore, setNewStore] = useState<string[]>(['공통']);
  const [newLabel, setNewLabel] = useState('');
  const [newContent, setNewContent] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = newLabel.trim() && newContent.trim();

  const resetNewRow = () => { setNewPlatform('-'); setNewStore(['공통']); setNewLabel(''); setNewContent(''); };

  const handleSubmitNew = useCallback(async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    try {
      await onAdd({ id: generateId(), platform: newPlatform, store: newStore, label: newLabel.trim(), content: newContent.trim() });
      resetNewRow();
      setAdding(false);
    } catch (err: any) {
      alert(err.message || '추가 실패');
    } finally {
      setSubmitting(false);
    }
  }, [canSubmit, submitting, newPlatform, newStore, newLabel, newContent, onAdd]);

  const handleDuplicate = useCallback(async (rule: Rule) => {
    try {
      await onAdd({ id: generateId(), platform: rule.platform, store: [...rule.store], label: `${rule.label} (복사)`, content: rule.content });
    } catch (err: any) {
      alert(err.message || '복제 실패');
    }
  }, [onAdd]);

  const isEditing = (id: string, field: string) => editingCell?.id === id && editingCell?.field === field;
  const startEdit = (id: string, field: string) => setEditingCell({ id, field });
  const stopEdit = () => setEditingCell(null);

  useEffect(() => {
    if (!editingCell) return;
    const handler = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('[data-dropdown]')) return;
      stopEdit();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [editingCell]);

  const platformOptions = ['-', ...scopeOptions.platforms];

  // 셀 공통 클래스
  const th = 'h-9 px-3 text-left text-[11px] font-medium text-gray-400 tracking-wide';
  const td = 'h-11 px-3 border-b border-gray-100/80';
  const cellText = 'text-sm text-gray-700 truncate leading-tight';
  const muted = 'text-sm text-gray-300';

  return (
    <div className="overflow-visible">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-gray-200/60 bg-gray-50/40">
            <th className={`${th} w-[100px]`}>플랫폼</th>
            <th className={`${th} w-[110px]`}>매장</th>
            <th className={`${th} w-[180px]`}>라벨</th>
            <th className={th}>내용</th>
            <th className={`${th} w-[56px] text-center`}>참조</th>
            <th className={`${th} w-[64px]`} />
          </tr>
        </thead>

        <tbody>
          {rules.length === 0 && !adding && (
            <tr>
              <td colSpan={COL_SPAN} className="text-center py-16 text-sm text-gray-400">
                등록된 규정이 없습니다.
              </td>
            </tr>
          )}

          {rules.map((rule) => {
            const isDirty = dirtyIds.has(rule.id);

            return (
              <tr
                key={rule.id}
                className={`group transition-colors ${isDirty ? 'bg-amber-50/40' : 'hover:bg-gray-50/50'}`}
              >
                {/* 플랫폼 */}
                <td className={td} data-dropdown>
                  <div className="flex items-center h-full">
                    {isEditing(rule.id, 'platform') ? (
                      <PlatformSelect
                        value={rule.platform}
                        options={platformOptions}
                        onChange={val => { onCellEdit(rule.id, 'platform', val); stopEdit(); }}
                        onClose={stopEdit}
                      />
                    ) : (
                      <div
                        onClick={() => startEdit(rule.id, 'platform')}
                        className={`${rule.platform === '-' ? muted : cellText} cursor-pointer w-full flex items-center gap-0.5`}
                      >
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
                      <StoreMultiSelect
                        value={rule.store}
                        options={scopeOptions.stores}
                        onChange={val => onCellEdit(rule.id, 'store', val)}
                        onClose={stopEdit}
                      />
                    ) : (
                      <div
                        onClick={() => startEdit(rule.id, 'store')}
                        className={`${rule.store.length === 1 && rule.store[0] === '공통' ? muted : cellText} cursor-pointer w-full`}
                      >
                        {rule.store.length > 0 ? (
                          <span>
                            {rule.store[0]}
                            {rule.store.length > 1 && <span className="text-gray-400 ml-0.5 text-xs">+{rule.store.length - 1}</span>}
                          </span>
                        ) : (
                          <span className={muted}>공통</span>
                        )}
                      </div>
                    )}
                  </div>
                </td>

                {/* 라벨 */}
                <td className={td}>
                  <div className="flex items-center h-full">
                    {isEditing(rule.id, 'label') ? (
                      <input
                        autoFocus
                        value={rule.label}
                        onChange={e => onCellEdit(rule.id, 'label', e.target.value)}
                        onBlur={stopEdit}
                        onKeyDown={e => { if (e.nativeEvent.isComposing) return; if (e.key === 'Enter') stopEdit(); }}
                        className="w-full h-7 text-sm border border-blue-400 rounded px-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
                      />
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
                      <ContentEditor
                        value={rule.content}
                        onChange={val => onCellEdit(rule.id, 'content', val)}
                        onClose={stopEdit}
                      />
                    ) : (
                      <div onClick={() => startEdit(rule.id, 'content')} className={`${cellText} cursor-text w-full text-gray-500`}>
                        {rule.content ? rule.content.split('\n')[0] : <span className={muted}>-</span>}
                      </div>
                    )}
                  </div>
                </td>

                {/* 참조 */}
                <td className={`${td} text-center`}>
                  <div className="flex items-center justify-center h-full">
                    {rule.linkedPackageIds.length > 0 ? (
                      <span className="text-xs text-gray-500">{rule.linkedPackageIds.length}</span>
                    ) : (
                      <span className={muted}>-</span>
                    )}
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
                      className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50"
                      title="삭제"
                    >
                      <Trash className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}

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
              <td className={td}>
                <div className="flex items-center h-full">
                  <input autoFocus value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="라벨"
                    className="w-full h-7 text-sm border border-gray-300 rounded px-2 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400" />
                </div>
              </td>
              <td className={td}>
                <div className="flex items-center h-full">
                  <input value={newContent} onChange={e => setNewContent(e.target.value)} placeholder="규정 본문..."
                    className="w-full h-7 text-sm border border-gray-300 rounded px-2 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400" />
                </div>
              </td>
              <td className={td} />
              <td className={td}>
                <div className="flex items-center justify-end h-full gap-0">
                  <button onClick={handleSubmitNew} disabled={!canSubmit || submitting}
                    className="p-1 rounded text-blue-600 hover:bg-blue-50 disabled:text-gray-300" title="저장">
                    <Check className="w-4 h-4" />
                  </button>
                  <button onClick={() => { setAdding(false); resetNewRow(); }}
                    className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100" title="취소">
                    <Xmark className="w-4 h-4" />
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
// 내용 편집기 — 셀 위에 오버레이
// ═══════════════════════════════════════════════════════════

function ContentEditor({ value, onChange, onClose }: {
  value: string;
  onChange: (val: string) => void;
  onClose: () => void;
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
    <div ref={ref} className="absolute left-0 right-0 top-0 z-40">
      <textarea
        autoFocus
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={Math.min(Math.max(value.split('\n').length + 1, 3), 10)}
        className="w-full text-sm border border-blue-400 rounded px-3 py-2 bg-white shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-50 resize-y leading-relaxed"
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 플랫폼 셀렉트 (단일 선택)
// ═══════════════════════════════════════════════════════════

function PlatformSelect({ value, options, onChange, onClose, inline }: {
  value: string;
  options: string[];
  onChange: (val: string) => void;
  onClose: () => void;
  inline?: boolean;
}) {
  const [open, setOpen] = useState(!inline);

  const dropdownEl = (onSelect: (v: string) => void) => (
    <div data-dropdown className="absolute z-50 top-full left-0 mt-1 w-36 bg-white border border-gray-200 rounded-lg shadow-lg max-h-[200px] overflow-y-auto py-1">
      {options.map(opt => (
        <button
          key={opt}
          onClick={() => onSelect(opt)}
          className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 transition-colors ${value === opt ? 'text-blue-600 font-medium' : 'text-gray-600'}`}
        >
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
  value: string[];
  options: string[];
  onChange: (val: string[]) => void;
  onClose: () => void;
  inline?: boolean;
}) {
  const [open, setOpen] = useState(!inline);
  const [search, setSearch] = useState('');
  const selected = new Set(value);
  const isAllCommon = selected.has('공통');

  const toggle = (item: string) => {
    if (item === '공통') {
      onChange(selected.has(item) ? [] : ['공통']);
    } else {
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
          <input type="checkbox" checked={selected.has('공통')} onChange={() => toggle('공통')}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-400 w-3.5 h-3.5" />
          <span className="text-xs font-medium text-gray-700">공통</span>
        </label>
        {filtered.map(item => (
          <label key={item} className={`flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 rounded cursor-pointer ${isAllCommon ? 'opacity-40' : ''}`}>
            <input type="checkbox" checked={selected.has(item)} onChange={() => toggle(item)} disabled={isAllCommon}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-400 w-3.5 h-3.5" />
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

  return (
    <div data-dropdown className="relative w-full">
      {dropdown}
    </div>
  );
}