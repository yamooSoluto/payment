'use client';

import { useState, useRef, useEffect, Fragment } from 'react';
import { Trash, NavArrowDown, Xmark, Check } from 'iconoir-react';

// ═══════════════════════════════════════════════════════════
// 타입
// ═══════════════════════════════════════════════════════════

interface TenantFaq {
  id: string;
  templateId?: string;
  questions: string[];
  questionsRaw?: string[];
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
  startIndex?: number;
}

// ═══════════════════════════════════════════════════════════
// 상수
// ═══════════════════════════════════════════════════════════

const TOPIC_OPTIONS = [
  '매장/운영', '시설/환경', '상품/서비스', '예약/주문', '결제/환불',
  '회원/혜택', '기술/접속', '제보/신고', '기타',
];

const TAG_OPTIONS = ['문의', '칭찬', '건의', '불만', '요청', '긴급'];

const ACTION_PRODUCTS = ['ticket', 'room', 'locker', 'seat', 'shop', 'reservation'];
const ACTION_TYPES = ['change', 'cancel', 'refund', 'extend', 'transfer', 'check', 'issue'];

const TAG_COLORS: Record<string, string> = {
  '문의': 'bg-blue-100 text-blue-700',
  '칭찬': 'bg-emerald-100 text-emerald-700',
  '건의': 'bg-yellow-100 text-yellow-700',
  '불만': 'bg-red-100 text-red-700',
  '요청': 'bg-purple-100 text-purple-700',
  '긴급': 'bg-orange-100 text-orange-700',
};

const COL_SPAN = 13;

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

function getStatusDisplay(status?: string) {
  switch (status) {
    case 'synced': return { dot: 'bg-green-500', text: 'SYNCED', color: 'text-green-600' };
    case 'error':  return { dot: 'bg-red-500', text: 'ERROR', color: 'text-red-600' };
    default:       return { dot: 'bg-yellow-400', text: 'PENDING', color: 'text-yellow-600' };
  }
}

function isTransferMode(faq: CsFaq) {
  return faq.handlerType === 'staff' || faq.handlerType === 'conditional';
}

// questionsRaw가 있으면 원본 질문을 우선 사용 (Airtable 등 외부 소스에서 여러 질문이 들어온 경우)
function getDisplayQuestions(faq: CsFaq): string[] {
  if (Array.isArray(faq.questionsRaw) && faq.questionsRaw.length > 0) return faq.questionsRaw;
  if (Array.isArray(faq.questions) && faq.questions.length > 0) return faq.questions;
  return [''];
}

function normalizeTag(tag: string): string {
  // "문의: 정보 확인" → "문의" (콜론 이전 부분만)
  const base = tag.split(':')[0].trim();
  return base || tag;
}

function getTagDisplay(tags?: string[]): { labels: string[]; } {
  if (!tags || tags.length === 0) return { labels: [] };
  // 중복 제거 + 정규화
  const unique = [...new Set(tags.map(normalizeTag))];
  return { labels: unique };
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
  startIndex = 0,
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

  // 드롭다운 외부 클릭 감지
  useEffect(() => {
    if (!editingCell) return;
    const handler = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('[data-dropdown]')) return;
      stopEdit();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [editingCell]);

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
      {/* 드롭다운 열릴 때 overflow 해제 */}
      <div className={editingCell ? '' : 'overflow-x-auto'}>
        <table className="w-full min-w-[1300px]">
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
              <th className="text-center px-2 py-2.5 text-xs font-medium text-gray-500 w-10">No.</th>
              <th className="text-left px-3 py-2.5 text-xs font-medium text-gray-500 min-w-[140px]">매장</th>
              <th className="text-left px-3 py-2.5 text-xs font-medium text-gray-500 w-12">소스</th>
              <th className="text-left px-3 py-2.5 text-xs font-medium text-gray-500 min-w-[200px]">질문</th>
              <th className="text-left px-3 py-2.5 text-xs font-medium text-gray-500 min-w-[160px]">답변</th>
              <th className="text-left px-3 py-2.5 text-xs font-medium text-gray-500 w-24">처리</th>
              <th className="text-left px-3 py-2.5 text-xs font-medium text-gray-500 w-20">handler</th>
              <th className="text-left px-3 py-2.5 text-xs font-medium text-gray-500 min-w-[80px]">topic</th>
              <th className="text-left px-3 py-2.5 text-xs font-medium text-gray-500 min-w-[80px]">tag</th>
              <th className="text-left px-3 py-2.5 text-xs font-medium text-gray-500 min-w-[120px]">action</th>
              <th className="text-left px-3 py-2.5 text-xs font-medium text-gray-500 w-24">상태</th>
              <th className="text-left px-3 py-2.5 text-xs font-medium text-gray-500 w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {faqs.map((faq, _idx) => {
              const k = faqKey(faq);
              const isDirty = dirtyIds.has(k);
              const badge = getHandlerBadge(faq);
              const status = getStatusDisplay(faq.vectorStatus);
              const isExpanded = expandedId === k;
              const transfer = isTransferMode(faq);
              const tagLabels = getTagDisplay(faq.tags).labels;
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


                    {/* No. */}
                    <td className="text-center px-2 py-2.5">
                      <span className="text-xs text-gray-400">{startIndex + _idx + 1}</span>
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
                      {(() => {
                        const displayQuestions = getDisplayQuestions(faq);
                        return (
                          <div className="flex items-center gap-1.5">
                            <NavArrowDown className={`w-3.5 h-3.5 text-gray-400 shrink-0 transition-transform ${isExpanded ? '' : '-rotate-90'}`} />
                            <span className="text-sm text-gray-900 truncate">
                              {displayQuestions[0] || '(질문 없음)'}
                            </span>
                            {displayQuestions.length > 1 && (
                              <span className="shrink-0 inline-flex items-center justify-center min-w-[20px] h-5 px-1 text-[10px] font-medium bg-gray-200 text-gray-600 rounded-full">
                                +{displayQuestions.length - 1}
                              </span>
                            )}
                          </div>
                        );
                      })()}
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

                    {/* ── 처리 ── */}
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <div className="relative">
                        <span
                          onClick={() => startEdit(k, 'handlerType')}
                          className={`inline-flex px-1.5 py-0.5 text-[11px] font-medium rounded cursor-pointer hover:ring-2 hover:ring-gray-200 transition-all ${badge.style}`}
                        >
                          {badge.label}
                        </span>
                        {isEditing(k, 'handlerType') && (
                          <div data-dropdown className="absolute left-0 top-full z-50 mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[130px]">
                            <button
                              onClick={() => { onCellEdit(faq.id, faq.tenantId, { handlerType: 'bot', handler: undefined, rule: undefined }); stopEdit(); }}
                              className={`w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-gray-50 ${!transfer ? 'bg-blue-50/40' : ''}`}
                            >
                              <span className="px-2 py-0.5 text-[11px] font-medium rounded-full bg-blue-100 text-blue-700">AI 답변</span>
                              {!transfer && <Check className="w-3 h-3 text-blue-500 ml-auto" />}
                            </button>
                            <button
                              onClick={() => {
                                onCellEdit(faq.id, faq.tenantId, {
                                  handlerType: faq.rule?.trim() ? 'conditional' : 'staff',
                                  handler: (!faq.handler || faq.handler === 'bot') ? 'op' : faq.handler,
                                });
                                stopEdit();
                              }}
                              className={`w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-gray-50 ${transfer ? 'bg-blue-50/40' : ''}`}
                            >
                              <span className="px-2 py-0.5 text-[11px] font-medium rounded-full bg-purple-100 text-purple-700">담당자 전달</span>
                              {transfer && <Check className="w-3 h-3 text-blue-500 ml-auto" />}
                            </button>
                          </div>
                        )}
                      </div>
                    </td>

                    {/* ── handler ── */}
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {transfer ? (
                        <div className="relative">
                          <span
                            onClick={() => startEdit(k, 'handler')}
                            className={`inline-flex px-1.5 py-0.5 text-[11px] font-medium rounded-full cursor-pointer hover:ring-2 hover:ring-gray-200 transition-all ${
                              faq.handler === 'manager' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                            }`}
                          >
                            {faq.handler === 'manager' ? '현장' : '운영'}
                          </span>
                          {isEditing(k, 'handler') && (
                            <div data-dropdown className="absolute left-0 top-full z-50 mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[100px]">
                              {[
                                { value: 'op', label: '운영', color: 'bg-amber-100 text-amber-700' },
                                { value: 'manager', label: '현장', color: 'bg-green-100 text-green-700' },
                              ].map(opt => (
                                <button
                                  key={opt.value}
                                  onClick={() => { onCellEdit(faq.id, faq.tenantId, { handler: opt.value as 'op' | 'manager' }); stopEdit(); }}
                                  className={`w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-gray-50 ${faq.handler === opt.value ? 'bg-blue-50/40' : ''}`}
                                >
                                  <span className={`px-2 py-0.5 text-[11px] font-medium rounded-full ${opt.color}`}>{opt.label}</span>
                                  {faq.handler === opt.value && <Check className="w-3 h-3 text-blue-500 ml-auto" />}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400">—</span>
                      )}
                    </td>

                    {/* ── topic ── */}
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <div className="relative">
                        <span
                          onClick={() => startEdit(k, 'topic')}
                          className={`cursor-pointer hover:ring-2 hover:ring-gray-200 rounded-full transition-all inline-flex ${
                            faq.topic
                              ? 'px-1.5 py-0.5 text-[11px] font-medium bg-gray-100 text-gray-700'
                              : 'px-1 py-0.5 text-sm text-gray-400'
                          }`}
                        >
                          {faq.topic || '—'}
                        </span>
                        {isEditing(k, 'topic') && (
                          <div data-dropdown className="absolute left-0 top-full z-50 mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[120px] max-h-[260px] overflow-y-auto">
                            <button
                              onClick={() => { onCellEdit(faq.id, faq.tenantId, { topic: '' }); stopEdit(); }}
                              className="w-full text-left px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-50"
                            >
                              — 없음
                            </button>
                            {TOPIC_OPTIONS.map(t => (
                              <button
                                key={t}
                                onClick={() => { onCellEdit(faq.id, faq.tenantId, { topic: t }); stopEdit(); }}
                                className={`w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-gray-50 ${faq.topic === t ? 'bg-blue-50/40' : ''}`}
                              >
                                <span className="px-2 py-0.5 text-[11px] font-medium rounded-full bg-gray-100 text-gray-700">{t}</span>
                                {faq.topic === t && <Check className="w-3 h-3 text-blue-500 ml-auto" />}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>

                    {/* ── tag (멀티셀렉트) ── */}
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <div className="relative">
                        <span
                          onClick={() => startEdit(k, 'tag')}
                          className="cursor-pointer hover:ring-2 hover:ring-gray-200 rounded transition-all inline-flex items-center gap-0.5 py-0.5"
                        >
                          {tagLabels.length === 0 ? (
                            <span className="text-xs text-gray-400 px-1">—</span>
                          ) : (
                            <>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${TAG_COLORS[tagLabels[0]] || 'bg-gray-100 text-gray-600'}`}>
                                {tagLabels[0]}
                              </span>
                              {tagLabels.length > 1 && (
                                <span className="text-[10px] bg-gray-200 text-gray-600 rounded-full px-1">+{tagLabels.length - 1}</span>
                              )}
                            </>
                          )}
                        </span>
                        {isEditing(k, 'tag') && (
                          <div data-dropdown className="absolute left-0 top-full z-50 mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[130px]">
                            {TAG_OPTIONS.map(tag => {
                              const isActive = (faq.tags || []).includes(tag);
                              return (
                                <button
                                  key={tag}
                                  onClick={() => {
                                    const currentTags = faq.tags || [];
                                    const newTags = isActive
                                      ? currentTags.filter(t => t !== tag)
                                      : [...currentTags, tag];
                                    onCellEdit(faq.id, faq.tenantId, { tags: newTags });
                                  }}
                                  className={`w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-gray-50 ${isActive ? 'bg-blue-50/40' : ''}`}
                                >
                                  <span className={`px-2 py-0.5 text-[11px] font-medium rounded-full ${
                                    isActive ? (TAG_COLORS[tag] || 'bg-gray-900 text-white') : 'bg-gray-100 text-gray-500'
                                  }`}>
                                    {tag}
                                  </span>
                                  {isActive && <Check className="w-3 h-3 text-blue-500 ml-auto" />}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </td>

                    {/* ── action (product + type 2단 드롭다운) ── */}
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <div className="relative">
                        <span
                          onClick={() => startEdit(k, 'action')}
                          className="cursor-pointer hover:ring-2 hover:ring-gray-200 rounded transition-all inline-flex items-center gap-0.5 py-0.5"
                        >
                          {faq.action_product || faq.action ? (
                            <>
                              {faq.action_product && (
                                <span className="font-mono text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">{faq.action_product}</span>
                              )}
                              {faq.action && (
                                <span className="font-mono text-[10px] bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded">{faq.action}</span>
                              )}
                            </>
                          ) : (
                            <span className="text-sm text-gray-400 px-1">—</span>
                          )}
                        </span>
                        {isEditing(k, 'action') && (
                          <div data-dropdown className="absolute left-0 top-full z-50 mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[160px] max-h-[320px] overflow-y-auto">
                            <div className="px-3 py-1 text-[10px] font-medium text-gray-400 uppercase tracking-wide">Product</div>
                            <button
                              onClick={() => onCellEdit(faq.id, faq.tenantId, { action_product: null })}
                              className={`w-full text-left px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-50 ${!faq.action_product ? 'bg-blue-50/40' : ''}`}
                            >
                              — 없음
                            </button>
                            {ACTION_PRODUCTS.map(p => (
                              <button
                                key={p}
                                onClick={() => onCellEdit(faq.id, faq.tenantId, { action_product: p })}
                                className={`w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-gray-50 ${faq.action_product === p ? 'bg-blue-50/40' : ''}`}
                              >
                                <span className="font-mono text-[11px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">{p}</span>
                                {faq.action_product === p && <Check className="w-3 h-3 text-blue-500 ml-auto" />}
                              </button>
                            ))}
                            <div className="border-t border-gray-100 my-1" />
                            <div className="px-3 py-1 text-[10px] font-medium text-gray-400 uppercase tracking-wide">Type</div>
                            <button
                              onClick={() => onCellEdit(faq.id, faq.tenantId, { action: null })}
                              className={`w-full text-left px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-50 ${!faq.action ? 'bg-blue-50/40' : ''}`}
                            >
                              — 없음
                            </button>
                            {ACTION_TYPES.map(a => (
                              <button
                                key={a}
                                onClick={() => onCellEdit(faq.id, faq.tenantId, { action: a })}
                                className={`w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-gray-50 ${faq.action === a ? 'bg-blue-50/40' : ''}`}
                              >
                                <span className="font-mono text-[11px] bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded">{a}</span>
                                {faq.action === a && <Check className="w-3 h-3 text-blue-500 ml-auto" />}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
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
                          {/* 질문 배열 (questionsRaw 우선, 없으면 questions) */}
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-2">질문</label>
                            <div className="space-y-1.5">
                              {(() => {
                                const editQuestions = getDisplayQuestions(faq);
                                return (
                                  <>
                                    {editQuestions.map((q, idx) => (
                                      <div key={idx} className="flex gap-2">
                                        <input
                                          type="text"
                                          value={q}
                                          onChange={(e) => {
                                            const newQ = [...editQuestions];
                                            newQ[idx] = e.target.value;
                                            // questionsRaw와 questions 모두 업데이트
                                            onCellEdit(faq.id, faq.tenantId, {
                                              questions: newQ,
                                              questionsRaw: newQ,
                                            });
                                          }}
                                          placeholder="유사표현은 세미콜론(;)으로 구분"
                                          className="flex-1 px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-1 focus:ring-gray-400 focus:border-gray-400 outline-none"
                                        />
                                        <button
                                          onClick={() => {
                                            const newQ = editQuestions.filter((_, i) => i !== idx);
                                            const updated = newQ.length ? newQ : [''];
                                            onCellEdit(faq.id, faq.tenantId, {
                                              questions: updated,
                                              questionsRaw: updated,
                                            });
                                          }}
                                          className="p-1 text-gray-400 hover:text-red-500 rounded transition-colors"
                                        >
                                          <Trash className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    ))}
                                    <button
                                      onClick={() => {
                                        const newQ = [...editQuestions, ''];
                                        onCellEdit(faq.id, faq.tenantId, {
                                          questions: newQ,
                                          questionsRaw: newQ,
                                        });
                                      }}
                                      className="w-full px-2.5 py-1.5 text-xs text-gray-500 border border-dashed border-gray-300 rounded-lg hover:bg-white hover:text-gray-700 transition-colors"
                                    >
                                      + 질문 추가
                                    </button>
                                  </>
                                );
                              })()}
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