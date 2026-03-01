'use client';

import { useState, useRef, useEffect, Fragment } from 'react';
import { Trash, NavArrowDown, Xmark } from 'iconoir-react';

// ═══════════════════════════════════════════════════════════
// 타입
// ═══════════════════════════════════════════════════════════

interface TenantFaq {
  id: string;
  templateId?: string;
  questions: string[];
  answer: string;
  guide?: string;
  keyData?: string;
  handlerType?: 'bot' | 'staff' | 'conditional';
  handler?: 'bot' | 'op' | 'manager';
  rule?: string;
  tags?: string[];
  topic?: string;
  tag_actions?: string[];
  action_product?: string | null;
  action?: string | null;
  isActive: boolean;
  vectorStatus?: 'pending' | 'synced' | 'error';
  vectorUuid?: string;
  source?: string;
  createdAt?: number | Date;
  updatedAt?: number | Date;
}

export interface CsFaq extends TenantFaq {
  tenantId: string;
  tenantName: string;
  branchNo?: string | null;
  // 그룹핑 정보 (page.tsx에서 설정)
  _groupTenantIds?: string[];
}

export interface TenantOption {
  tenantId: string;
  brandName: string;
  branchNo?: string | null;
}

interface CsFaqTableProps {
  faqs: CsFaq[];
  tenants: TenantOption[];
  onCellEdit: (faqId: string, tenantId: string, updates: Partial<TenantFaq>) => void;
  onDelete: (faqId: string, tenantId: string) => void;
  onTenantToggle: (faq: CsFaq, tenantId: string, action: 'add' | 'remove') => void;
  pendingTenantChanges: Map<string, { add: Set<string>; remove: Set<string> }>;
  dirtyIds: Set<string>;
  selectedIds: Set<string>;
  onSelectToggle: (faqId: string) => void;
  onSelectAll: (ids: string[]) => void;
  onDeselectAll: () => void;
}

// ═══════════════════════════════════════════════════════════
// 상수
// ═══════════════════════════════════════════════════════════

const TOPIC_OPTIONS = [
  '매장/운영', '공간/환경', '좌석/룸', '시설/비품', '상품/서비스',
  '정책/규정', '결제/환불', '문제/해결', '혜택/이벤트', '기타',
];

const TAG_OPTIONS = ['문의', '칭찬', '건의', '불만', '요청', '긴급'];

const ACTION_PRODUCTS = ['ticket', 'room', 'locker', 'seat', 'shop', 'reservation'];
const ACTION_TYPES = ['change', 'cancel', 'refund', 'extend', 'transfer', 'check', 'issue'];

const COL_SPAN = 12;

// ═══════════════════════════════════════════════════════════
// 헬퍼
// ═══════════════════════════════════════════════════════════

// FAQ 유니크 키 (tenantId + docId — 템플릿 FAQ는 여러 매장에서 같은 docId를 가짐)
export function faqKey(faq: { tenantId: string; id: string }) {
  return `${faq.tenantId}_${faq.id}`;
}

function getSourceIcon(source?: string) {
  switch (source) {
    case 'template': return '📋';
    case 'library':  return '📚';
    default:         return '✏️';
  }
}

function getHandlerBadge(faq: CsFaq) {
  if (faq.handlerType === 'staff' || faq.handlerType === 'conditional') {
    return { label: '담당자 전달', style: 'bg-purple-50 text-purple-600' };
  }
  return { label: 'AI 답변', style: 'bg-blue-50 text-blue-600' };
}

function getHandlerDisplay(faq: CsFaq) {
  if (!faq.handler || faq.handler === 'bot') return '—';
  if (faq.handler === 'op') return '운영';
  if (faq.handler === 'manager') return '현장';
  return faq.handler;
}

function getStatusDisplay(status?: string) {
  switch (status) {
    case 'synced': return { dot: 'bg-green-500', text: 'SYNCED', color: 'text-green-600' };
    case 'error':  return { dot: 'bg-red-500', text: 'ERROR', color: 'text-red-600' };
    default:       return { dot: 'bg-yellow-400', text: 'PENDING', color: 'text-yellow-600' };
  }
}

function getActionDisplay(faq: CsFaq): string | null {
  const parts = [faq.action_product, faq.action].filter(Boolean);
  return parts.length > 0 ? parts.join('_') : null;
}

function isTransferMode(faq: CsFaq) {
  return faq.handlerType === 'staff' || faq.handlerType === 'conditional';
}

function getTagDisplay(tags?: string[]): { text: string; extra: number } {
  if (!tags || tags.length === 0) return { text: '—', extra: 0 };
  return { text: tags[0], extra: tags.length - 1 };
}

// 매장별 배지 색상 (해시 기반)
const BADGE_COLORS = [
  'bg-blue-100 text-blue-700',
  'bg-green-100 text-green-700',
  'bg-purple-100 text-purple-700',
  'bg-orange-100 text-orange-700',
  'bg-pink-100 text-pink-700',
  'bg-teal-100 text-teal-700',
  'bg-indigo-100 text-indigo-700',
  'bg-yellow-100 text-yellow-700',
];

function getTenantColor(tenantId: string): string {
  let hash = 0;
  for (let i = 0; i < tenantId.length; i++) {
    hash = tenantId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return BADGE_COLORS[Math.abs(hash) % BADGE_COLORS.length];
}

// ═══════════════════════════════════════════════════════════
// 매장 멀티셀렉 팝오버 (로컬 pending → 배치 반영)
// ═══════════════════════════════════════════════════════════

function TenantMultiSelect({
  faq,
  tenants,
  activeTenantIds,
  pendingAdd,
  pendingRemove,
  onToggle,
  onClose,
}: {
  faq: CsFaq;
  tenants: TenantOption[];
  activeTenantIds: Set<string>;
  pendingAdd: Set<string>;
  pendingRemove: Set<string>;
  onToggle: (tenantId: string) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  const filtered = search
    ? tenants.filter(t =>
        t.brandName.toLowerCase().includes(search.toLowerCase()) ||
        (t.branchNo && t.branchNo.includes(search))
      )
    : tenants;

  return (
    <div
      ref={popoverRef}
      className="absolute top-full mt-1 left-0 w-64 bg-white border border-gray-200 rounded-lg shadow-xl z-30"
      onClick={(e) => e.stopPropagation()}
    >
      {/* 선택된 매장 칩 */}
      <div className="px-3 pt-3 pb-2 border-b border-gray-100">
        <p className="text-[10px] text-gray-400 mb-1.5">적용 매장</p>
        <div className="flex flex-wrap gap-1">
          {tenants
            .filter(t => activeTenantIds.has(t.tenantId))
            .map(t => {
              const isSelf = t.tenantId === faq.tenantId;
              const isPending = pendingAdd.has(t.tenantId);
              return (
                <span
                  key={t.tenantId}
                  className={`inline-flex items-center gap-0.5 px-2 py-0.5 text-[11px] font-medium rounded-full ${
                    isPending
                      ? 'border border-dashed border-amber-400 bg-amber-50 text-amber-700'
                      : getTenantColor(t.tenantId)
                  }`}
                >
                  {t.brandName}
                  {t.branchNo && <span className="text-[10px] opacity-70">#{t.branchNo}</span>}
                  {!isSelf && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onToggle(t.tenantId); }}
                      className="ml-0.5 hover:opacity-60"
                      title="제거"
                    >
                      <Xmark className="w-3 h-3" />
                    </button>
                  )}
                </span>
              );
            })}
        </div>
      </div>

      {/* 검색 */}
      <div className="px-3 py-2 border-b border-gray-100">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="매장명 또는 지점번호 검색..."
          className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded outline-none focus:ring-1 focus:ring-blue-300"
          autoFocus
        />
      </div>

      {/* 테넌트 목록 */}
      <div className="max-h-44 overflow-y-auto py-1">
        {filtered.map(t => {
          const isSelf = t.tenantId === faq.tenantId;
          const isActive = activeTenantIds.has(t.tenantId);
          const isPending = pendingAdd.has(t.tenantId) || pendingRemove.has(t.tenantId);
          return (
            <label
              key={t.tenantId}
              className={`flex items-center gap-2 px-3 py-1.5 text-xs transition-colors ${
                isSelf
                  ? 'bg-gray-50 text-gray-400 cursor-default'
                  : 'hover:bg-gray-50 text-gray-600 cursor-pointer'
              }`}
            >
              <input
                type="checkbox"
                checked={isActive}
                disabled={isSelf}
                onChange={() => onToggle(t.tenantId)}
                className="w-3 h-3 rounded border-gray-300"
              />
              <span>{t.brandName}</span>
              <span className="ml-auto flex items-center gap-1">
                {t.branchNo && (
                  <span className="text-[10px] text-gray-400">#{t.branchNo}</span>
                )}
                {isSelf && (
                  <span className="text-[10px] text-gray-300">현재</span>
                )}
                {isPending && !isSelf && (
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" title="변경 대기중" />
                )}
              </span>
            </label>
          );
        })}
        {filtered.length === 0 && (
          <p className="px-3 py-2 text-xs text-gray-400 text-center">검색 결과 없음</p>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 컴포넌트
// ═══════════════════════════════════════════════════════════

export default function CsFaqTable({
  faqs,
  tenants,
  onCellEdit,
  onDelete,
  onTenantToggle,
  pendingTenantChanges,
  dirtyIds,
  selectedIds,
  onSelectToggle,
  onSelectAll,
  onDeselectAll,
}: CsFaqTableProps) {
  const [editingCell, setEditingCell] = useState<{ id: string; field: string } | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [tenantPopoverId, setTenantPopoverId] = useState<string | null>(null);

  // 그룹핑된 FAQ에서 적용 매장 목록 가져오기 (pending 변경 반영)
  const getActiveTenantIds = (faq: CsFaq): Set<string> => {
    const baseIds = new Set(faq._groupTenantIds || [faq.tenantId]);
    const qKey = faq.questions[0]?.trim().toLowerCase() || '';
    const pending = pendingTenantChanges.get(qKey);
    if (pending) {
      for (const id of pending.add) baseIds.add(id);
      for (const id of pending.remove) baseIds.delete(id);
    }
    return baseIds;
  };

  const getPendingForFaq = (faq: CsFaq) => {
    const qKey = faq.questions[0]?.trim().toLowerCase() || '';
    return pendingTenantChanges.get(qKey) || { add: new Set<string>(), remove: new Set<string>() };
  };

  const isEditing = (id: string, field: string) =>
    editingCell?.id === id && editingCell?.field === field;

  const startEdit = (id: string, field: string) =>
    setEditingCell({ id, field });

  const stopEdit = () => setEditingCell(null);

  const toggleExpand = (id: string) =>
    setExpandedId(prev => prev === id ? null : id);

  const allSelected = faqs.length > 0 && faqs.every(f => selectedIds.has(faqKey(f)));

  if (faqs.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="text-center py-16">
          <p className="text-gray-500 mb-2">조건에 맞는 FAQ가 없습니다.</p>
          <p className="text-sm text-gray-400">필터를 변경하거나 FAQ를 추가해주세요.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1100px]">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              {/* 체크박스 */}
              <th className="px-3 py-2.5 w-8">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() => allSelected ? onDeselectAll() : onSelectAll(faqs.map(f => faqKey(f)))}
                  className="w-3.5 h-3.5 rounded border-gray-300"
                />
              </th>
              <th className="text-left px-3 py-2.5 text-xs font-medium text-gray-500 w-24">매장</th>
              <th className="text-left px-3 py-2.5 text-xs font-medium text-gray-500 w-10">소스</th>
              <th className="text-left px-3 py-2.5 text-xs font-medium text-gray-500 min-w-[180px]">질문</th>
              <th className="text-left px-3 py-2.5 text-xs font-medium text-gray-500 min-w-[140px]">답변</th>
              <th className="text-left px-3 py-2.5 text-xs font-medium text-gray-500 w-24">처리</th>
              <th className="text-left px-3 py-2.5 text-xs font-medium text-gray-500 w-16">handler</th>
              <th className="text-left px-3 py-2.5 text-xs font-medium text-gray-500 w-24">topic</th>
              <th className="text-left px-3 py-2.5 text-xs font-medium text-gray-500 w-20">tag</th>
              <th className="text-left px-3 py-2.5 text-xs font-medium text-gray-500 w-32">action</th>
              <th className="text-left px-3 py-2.5 text-xs font-medium text-gray-500 w-20">상태</th>
              <th className="text-left px-3 py-2.5 text-xs font-medium text-gray-500 w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {faqs.map((faq) => {
              const k = faqKey(faq);
              const isDirty = dirtyIds.has(k);
              const badge = getHandlerBadge(faq);
              const status = getStatusDisplay(faq.vectorStatus);
              const isExpanded = expandedId === k;
              const transfer = isTransferMode(faq);
              const tagInfo = getTagDisplay(faq.tags);
              const isSelected = selectedIds.has(k);
              const tenantColor = getTenantColor(faq.tenantId);
              const activeIds = getActiveTenantIds(faq);
              const extraCount = activeIds.size - 1;
              const pending = getPendingForFaq(faq);
              const hasPending = pending.add.size > 0 || pending.remove.size > 0;

              return (
                <Fragment key={k}>
                  <tr className={`transition-colors ${isDirty ? 'border-l-2 border-l-blue-400 bg-blue-50/30' : 'hover:bg-gray-50/80'}`}>
                    {/* 체크박스 */}
                    <td className="px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onSelectToggle(k)}
                        className="w-3.5 h-3.5 rounded border-gray-300"
                      />
                    </td>

                    {/* 매장 (인라인 멀티셀렉) */}
                    <td className="px-3 py-2.5 relative">
                      <button
                        onClick={() => setTenantPopoverId(tenantPopoverId === k ? null : k)}
                        className="inline-flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity"
                        title="클릭하여 적용 매장 편집"
                      >
                        <span className={`inline-block px-2 py-0.5 text-[11px] font-medium rounded-full truncate max-w-[80px] ${tenantColor}`}>
                          {faq.tenantName}
                        </span>
                        {faq.branchNo && (
                          <span className="text-[10px] text-gray-400">#{faq.branchNo}</span>
                        )}
                        {extraCount > 0 && (
                          <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-medium bg-gray-200 text-gray-600 rounded-full">
                            +{extraCount}
                          </span>
                        )}
                        {hasPending && (
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                        )}
                      </button>
                      {tenantPopoverId === k && (
                        <TenantMultiSelect
                          faq={faq}
                          tenants={tenants}
                          activeTenantIds={activeIds}
                          pendingAdd={pending.add}
                          pendingRemove={pending.remove}
                          onToggle={(tenantId) => {
                            onTenantToggle(faq, tenantId, activeIds.has(tenantId) ? 'remove' : 'add');
                          }}
                          onClose={() => setTenantPopoverId(null)}
                        />
                      )}
                    </td>

                    {/* 소스 아이콘 */}
                    <td className="px-3 py-2.5 text-center">
                      <span className="text-sm" title={faq.source || 'manual'}>
                        {getSourceIcon(faq.source)}
                      </span>
                    </td>

                    {/* 질문 */}
                    <td
                      className="px-3 py-2.5 max-w-[260px] cursor-pointer"
                      onClick={() => toggleExpand(k)}
                    >
                      <div className="flex items-center gap-1.5">
                        <NavArrowDown className={`w-3.5 h-3.5 text-gray-400 shrink-0 transition-transform ${isExpanded ? '' : '-rotate-90'}`} />
                        <span className="text-sm text-gray-900 truncate">
                          {faq.questions[0] || '(질문 없음)'}
                        </span>
                        {faq.questions.length > 1 && (
                          <span className="shrink-0 inline-flex items-center justify-center min-w-[20px] h-5 px-1 text-[10px] font-medium bg-gray-200 text-gray-600 rounded-full">
                            +{faq.questions.length - 1}
                          </span>
                        )}
                      </div>
                      {isDirty && (
                        <span className="text-[10px] text-blue-500 ml-5">● 변경됨</span>
                      )}
                    </td>

                    {/* 답변 */}
                    <td
                      className="px-3 py-2.5 max-w-[200px] cursor-pointer"
                      onClick={() => toggleExpand(k)}
                    >
                      <span className="text-sm text-gray-600 truncate block hover:bg-gray-100 rounded px-1 -mx-1 py-0.5">
                        {faq.answer || '—'}
                      </span>
                    </td>

                    {/* 처리 */}
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {isEditing(k, 'handlerType') ? (
                        <select
                          autoFocus
                          value={transfer ? 'transfer' : 'bot'}
                          onChange={(e) => {
                            if (e.target.value === 'bot') {
                              onCellEdit(faq.id, faq.tenantId, { handlerType: 'bot', handler: undefined, rule: undefined });
                            } else {
                              onCellEdit(faq.id, faq.tenantId, {
                                handlerType: faq.rule?.trim() ? 'conditional' : 'staff',
                                handler: (!faq.handler || faq.handler === 'bot') ? 'op' : faq.handler,
                              });
                            }
                            stopEdit();
                          }}
                          onBlur={stopEdit}
                          className="text-xs px-1.5 py-1 border border-blue-300 rounded outline-none bg-white"
                        >
                          <option value="bot">AI 답변</option>
                          <option value="transfer">담당자 전달</option>
                        </select>
                      ) : (
                        <span
                          onClick={() => startEdit(k, 'handlerType')}
                          className={`inline-flex px-1.5 py-0.5 text-[11px] font-medium rounded cursor-pointer hover:opacity-80 ${badge.style}`}
                        >
                          {badge.label}
                        </span>
                      )}
                    </td>

                    {/* handler */}
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {transfer ? (
                        isEditing(k, 'handler') ? (
                          <select
                            autoFocus
                            value={faq.handler === 'manager' ? 'manager' : 'op'}
                            onChange={(e) => {
                              onCellEdit(faq.id, faq.tenantId, { handler: e.target.value as 'op' | 'manager' });
                              stopEdit();
                            }}
                            onBlur={stopEdit}
                            className="text-xs px-1.5 py-1 border border-blue-300 rounded outline-none bg-white"
                          >
                            <option value="op">운영</option>
                            <option value="manager">현장</option>
                          </select>
                        ) : (
                          <span
                            onClick={() => startEdit(k, 'handler')}
                            className="text-sm text-gray-600 cursor-pointer hover:bg-gray-100 rounded px-1 -mx-1 py-0.5"
                          >
                            {getHandlerDisplay(faq)}
                          </span>
                        )
                      ) : (
                        <span className="text-sm text-gray-400">—</span>
                      )}
                    </td>

                    {/* topic */}
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {isEditing(k, 'topic') ? (
                        <select
                          autoFocus
                          value={faq.topic || ''}
                          onChange={(e) => {
                            onCellEdit(faq.id, faq.tenantId, { topic: e.target.value });
                            stopEdit();
                          }}
                          onBlur={stopEdit}
                          className="text-xs px-1.5 py-1 border border-blue-300 rounded outline-none bg-white max-w-[100px]"
                        >
                          <option value="">—</option>
                          {TOPIC_OPTIONS.map(t => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      ) : (
                        <span
                          onClick={() => startEdit(k, 'topic')}
                          className="text-sm text-gray-600 cursor-pointer hover:bg-gray-100 rounded px-1 -mx-1 py-0.5"
                        >
                          {faq.topic || '—'}
                        </span>
                      )}
                    </td>

                    {/* tag */}
                    <td className="px-3 py-2.5">
                      {isEditing(k, 'tag') ? (
                        <div
                          className="flex flex-wrap gap-1"
                          tabIndex={0}
                          onBlur={(e) => {
                            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                              stopEdit();
                            }
                          }}
                        >
                          {TAG_OPTIONS.map(tag => (
                            <button
                              key={tag}
                              onClick={() => {
                                const currentTags = faq.tags || [];
                                const newTags = currentTags.includes(tag)
                                  ? currentTags.filter(t => t !== tag)
                                  : [...currentTags, tag];
                                onCellEdit(faq.id, faq.tenantId, { tags: newTags });
                              }}
                              className={`px-2 py-0.5 rounded-full text-[11px] font-medium transition-all ${
                                (faq.tags || []).includes(tag)
                                  ? 'bg-gray-900 text-white'
                                  : 'text-gray-500 border border-gray-200 hover:border-gray-400'
                              }`}
                            >
                              {tag}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <span
                          onClick={() => startEdit(k, 'tag')}
                          className="cursor-pointer hover:bg-gray-100 rounded px-1 -mx-1 py-0.5 inline-flex items-center gap-1"
                        >
                          {tagInfo.extra > 0 ? (
                            <>
                              <span className="text-xs text-gray-600">{tagInfo.text}</span>
                              <span className="text-[10px] bg-gray-200 text-gray-600 rounded-full px-1.5">{`+${tagInfo.extra}`}</span>
                            </>
                          ) : (
                            <span className={`text-xs ${tagInfo.text === '—' ? 'text-gray-400' : 'text-gray-600'}`}>
                              {tagInfo.text}
                            </span>
                          )}
                        </span>
                      )}
                    </td>

                    {/* action */}
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {isEditing(k, 'action') ? (
                        <div
                          className="flex gap-1"
                          onBlur={(e) => {
                            const container = e.currentTarget;
                            requestAnimationFrame(() => {
                              if (!container.contains(document.activeElement)) {
                                stopEdit();
                              }
                            });
                          }}
                        >
                          <select
                            autoFocus
                            value={faq.action_product || ''}
                            onChange={(e) => onCellEdit(faq.id, faq.tenantId, { action_product: e.target.value || null })}
                            className="text-[11px] px-1 py-0.5 border border-blue-300 rounded outline-none bg-white w-[72px]"
                          >
                            <option value="">—</option>
                            {ACTION_PRODUCTS.map(p => (
                              <option key={p} value={p}>{p}</option>
                            ))}
                          </select>
                          <select
                            value={faq.action || ''}
                            onChange={(e) => onCellEdit(faq.id, faq.tenantId, { action: e.target.value || null })}
                            className="text-[11px] px-1 py-0.5 border border-blue-300 rounded outline-none bg-white w-[72px]"
                          >
                            <option value="">—</option>
                            {ACTION_TYPES.map(a => (
                              <option key={a} value={a}>{a}</option>
                            ))}
                          </select>
                        </div>
                      ) : (
                        <span
                          onClick={() => startEdit(k, 'action')}
                          className="cursor-pointer hover:bg-gray-100 rounded px-1 -mx-1 py-0.5 inline-block"
                        >
                          {getActionDisplay(faq) ? (
                            <span className="font-mono text-xs text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded">
                              {getActionDisplay(faq)}
                            </span>
                          ) : (
                            <span className="text-sm text-gray-400">—</span>
                          )}
                        </span>
                      )}
                    </td>

                    {/* 상태 */}
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <div className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                        <span className={`text-[11px] font-medium ${status.color}`}>
                          {status.text}
                        </span>
                      </div>
                    </td>

                    {/* 삭제 */}
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <button
                        onClick={() => onDelete(faq.id, faq.tenantId)}
                        className="p-1 hover:bg-red-50 rounded transition-colors"
                        title="삭제"
                      >
                        <Trash className="w-3.5 h-3.5 text-red-400" />
                      </button>
                    </td>
                  </tr>

                  {/* 확장 영역 */}
                  {isExpanded && (
                    <tr className={isDirty ? 'border-l-2 border-l-blue-400 bg-blue-50/20' : 'bg-gray-50/50'}>
                      <td colSpan={COL_SPAN} className="px-6 py-4">
                        <div className="space-y-4 max-w-2xl">
                          {/* 질문 배열 */}
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-2">질문</label>
                            <div className="space-y-1.5">
                              {faq.questions.map((q, idx) => (
                                <div key={idx} className="flex gap-2">
                                  <input
                                    type="text"
                                    value={q}
                                    onChange={(e) => {
                                      const newQ = [...faq.questions];
                                      newQ[idx] = e.target.value;
                                      onCellEdit(faq.id, faq.tenantId, { questions: newQ });
                                    }}
                                    placeholder="유사표현은 세미콜론(;)으로 구분"
                                    className="flex-1 px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-1 focus:ring-gray-400 focus:border-gray-400 outline-none"
                                  />
                                  <button
                                    onClick={() => {
                                      const newQ = faq.questions.filter((_, i) => i !== idx);
                                      onCellEdit(faq.id, faq.tenantId, { questions: newQ.length ? newQ : [''] });
                                    }}
                                    className="p-1 text-gray-400 hover:text-red-500 rounded transition-colors"
                                  >
                                    <Trash className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ))}
                              <button
                                onClick={() => onCellEdit(faq.id, faq.tenantId, { questions: [...faq.questions, ''] })}
                                className="w-full px-2.5 py-1.5 text-xs text-gray-500 border border-dashed border-gray-300 rounded-lg hover:bg-white hover:text-gray-700 transition-colors"
                              >
                                + 질문 추가
                              </button>
                            </div>
                          </div>

                          {/* 답변 */}
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1.5">답변</label>
                            <textarea
                              value={faq.answer}
                              onChange={(e) => onCellEdit(faq.id, faq.tenantId, { answer: e.target.value })}
                              rows={4}
                              className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-1 focus:ring-gray-400 focus:border-gray-400 outline-none resize-none"
                            />
                          </div>

                          {/* 가이드 */}
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1.5">가이드</label>
                            <textarea
                              value={faq.guide || ''}
                              onChange={(e) => onCellEdit(faq.id, faq.tenantId, { guide: e.target.value })}
                              rows={2}
                              placeholder="답변 참고사항..."
                              className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-1 focus:ring-gray-400 focus:border-gray-400 outline-none resize-none"
                            />
                          </div>

                          {/* 사전안내 (담당자 전달 모드) */}
                          {transfer && (
                            <div>
                              <label className="block text-xs font-medium text-gray-500 mb-1.5">
                                사전 안내 <span className="text-gray-400 font-normal">(입력 시 조건부 전달)</span>
                              </label>
                              <textarea
                                value={faq.rule || ''}
                                onChange={(e) => {
                                  const rule = e.target.value;
                                  onCellEdit(faq.id, faq.tenantId, {
                                    rule,
                                    handlerType: rule.trim() ? 'conditional' : 'staff',
                                  });
                                }}
                                rows={2}
                                placeholder="예: 환불/취소를 원하면 담당자에게 전달"
                                className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-1 focus:ring-gray-400 focus:border-gray-400 outline-none resize-none"
                              />
                              <p className="text-xs text-gray-400 mt-1">
                                {(faq.rule || '').trim()
                                  ? '조건 미충족 시 챗봇이 응답, 충족 시 담당자에게 전달됩니다'
                                  : '비워두면 바로 담당자에게 전달됩니다'}
                              </p>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}