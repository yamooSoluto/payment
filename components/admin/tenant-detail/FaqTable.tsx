'use client';

import { useState, useMemo, useEffect, Fragment } from 'react';
import { Search, Trash, Database, NavArrowDown, Check } from 'iconoir-react';
import { UndoableInput, UndoableTextarea } from '@/components/ui/UndoableInput';

// ═══════════════════════════════════════════════════════════
// 타입
// ═══════════════════════════════════════════════════════════

interface TenantFaq {
  id: string;
  templateId?: string;
  questions: string[];
  answer: string;
  answerRaw?: string;
  questionsRaw?: string[];
  guide?: string;
  keyData?: string;
  handlerType?: 'bot' | 'staff' | 'conditional';
  handler?: 'bot' | 'op' | 'manager';
  rule?: string;
  tags?: string[];
  topic?: string;
  intent?: string;
  action_product?: string | null;
  action?: string | null;
  isActive: boolean;
  vectorStatus?: 'pending' | 'synced' | 'error';
  vectorUuid?: string;
  source?: string;
  createdAt?: number | Date;
  updatedAt?: number | Date;
}

interface FaqTableProps {
  faqs: TenantFaq[];
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onCellEdit: (faqId: string, updates: Partial<TenantFaq>) => void;
  onDelete: (faqId: string) => void;
  dirtyIds: Set<string>;
}

// ═══════════════════════════════════════════════════════════
// 상수
// ═══════════════════════════════════════════════════════════

const TOPIC_OPTIONS = [
  '매장/운영', '시설/환경', '상품/서비스', '예약/주문', '결제/환불',
  '회원/혜택', '기술/접속', '제보/신고', '기타',
];
const TAG_OPTIONS = ['문의', '칭찬', '건의', '불만', '요청', '긴급', 'c2c'];
const ACTION_PRODUCTS = ['ticket', 'room', 'locker', 'seat', 'shop', 'reservation'];
const ACTION_TYPES = ['change', 'cancel', 'refund', 'extend', 'transfer', 'check', 'issue'];
const COL_SPAN = 10;

const TAG_COLORS: Record<string, string> = {
  '문의': 'bg-blue-100 text-blue-700',
  '칭찬': 'bg-emerald-100 text-emerald-700',
  '건의': 'bg-yellow-100 text-yellow-700',
  '불만': 'bg-red-100 text-red-700',
  '요청': 'bg-purple-100 text-purple-700',
  '긴급': 'bg-orange-100 text-orange-700',
  'c2c': 'bg-teal-100 text-teal-700',
};

// ═══════════════════════════════════════════════════════════
// 헬퍼
// ═══════════════════════════════════════════════════════════

function getSourceIcon(source?: string) {
  switch (source) {
    case 'template': return '📋';
    case 'library':  return '📚';
    default:         return '✏️';
  }
}

function getHandlerBadge(faq: TenantFaq) {
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

function isTransferMode(faq: TenantFaq) {
  return faq.handlerType === 'staff' || faq.handlerType === 'conditional';
}

// ═══════════════════════════════════════════════════════════
// 컴포넌트
// ═══════════════════════════════════════════════════════════

export default function FaqTable({ faqs, searchQuery, onSearchChange, onCellEdit, onDelete, dirtyIds }: FaqTableProps) {
  const [editingCell, setEditingCell] = useState<{ id: string; field: string } | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filteredFaqs = useMemo(() => {
    if (!searchQuery.trim()) return faqs;
    const q = searchQuery.toLowerCase();
    return faqs.filter(faq =>
      faq.questions.some(question => question.toLowerCase().includes(q)) ||
      faq.answer?.toLowerCase().includes(q) ||
      faq.topic?.toLowerCase().includes(q)
    );
  }, [faqs, searchQuery]);

  const isEditing = (id: string, field: string) =>
    editingCell?.id === id && editingCell?.field === field;

  const startEdit = (id: string, field: string) =>
    setEditingCell({ id, field });

  const stopEdit = () => setEditingCell(null);

  const toggleExpand = (id: string) =>
    setExpandedId(prev => prev === id ? null : id);

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

  // ── 빈 상태 ──
  if (faqs.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="text-center py-16">
          <Database className="w-12 h-12 mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500 mb-2">등록된 FAQ가 없습니다.</p>
          <p className="text-sm text-gray-400">
            &apos;질문 템플릿&apos; 탭에서 전체 동기화로 FAQ를 생성하세요.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      {/* 검색 바 */}
      <div className="px-4 py-3 border-b border-gray-100">
        <div className="relative max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="질문, 답변, 주제 검색..."
            className="w-full pl-9 pr-4 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-1 focus:ring-gray-400 focus:border-gray-400 outline-none placeholder:text-gray-400"
          />
        </div>
        {searchQuery && (
          <p className="text-xs text-gray-400 mt-1.5">
            {filteredFaqs.length}개 결과 / 전체 {faqs.length}개
          </p>
        )}
      </div>

      {/* 테이블 — 드롭다운 열릴 때 overflow 해제 */}
      <div className={editingCell ? '' : 'overflow-x-auto'}>
        <table className="w-full min-w-[960px]">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
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
            {filteredFaqs.map((faq) => {
              const isDirty = dirtyIds.has(faq.id);
              const badge = getHandlerBadge(faq);
              const status = getStatusDisplay(faq.vectorStatus);
              const isExpanded = expandedId === faq.id;
              const transfer = isTransferMode(faq);

              return (
                <Fragment key={faq.id}>
                  <tr className={`transition-colors ${isDirty ? 'border-l-2 border-l-blue-400 bg-blue-50/30' : 'hover:bg-gray-50/80'}`}>
                    {/* 소스 */}
                    <td className="px-3 py-2.5 text-center">
                      <span className="text-sm" title={faq.source || 'manual'}>
                        {getSourceIcon(faq.source)}
                      </span>
                    </td>

                    {/* 질문 — 클릭 시 확장 */}
                    <td className="px-3 py-2.5 max-w-[260px] cursor-pointer" onClick={() => toggleExpand(faq.id)}>
                      <div className="flex items-center gap-1.5">
                        <NavArrowDown className={`w-3.5 h-3.5 text-gray-400 shrink-0 transition-transform ${isExpanded ? '' : '-rotate-90'}`} />
                        <span className="text-sm text-gray-900 truncate">{faq.questions[0] || '(질문 없음)'}</span>
                        {faq.questions.length > 1 && (
                          <span className="shrink-0 inline-flex items-center justify-center min-w-[20px] h-5 px-1 text-[10px] font-medium bg-gray-200 text-gray-600 rounded-full">
                            +{faq.questions.length - 1}
                          </span>
                        )}
                      </div>
                      {isDirty && <span className="text-[10px] text-blue-500 ml-5">● 변경됨</span>}
                    </td>

                    {/* 답변 — 클릭 시 확장 */}
                    <td className="px-3 py-2.5 max-w-[200px] cursor-pointer" onClick={() => toggleExpand(faq.id)}>
                      <span className="text-sm text-gray-600 truncate block hover:bg-gray-100 rounded px-1 -mx-1 py-0.5">
                        {faq.answer || '—'}
                      </span>
                    </td>

                    {/* ── 처리 ── */}
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <div className="relative">
                        <span
                          onClick={() => startEdit(faq.id, 'handlerType')}
                          className={`inline-flex px-1.5 py-0.5 text-[11px] font-medium rounded cursor-pointer hover:ring-2 hover:ring-gray-200 transition-all ${badge.style}`}
                        >
                          {badge.label}
                        </span>
                        {isEditing(faq.id, 'handlerType') && (
                          <div data-dropdown className="absolute left-0 top-full z-50 mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[130px]">
                            <button
                              onClick={() => { onCellEdit(faq.id, { handlerType: 'bot', handler: undefined, rule: undefined }); stopEdit(); }}
                              className={`w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-gray-50 ${!transfer ? 'bg-blue-50/40' : ''}`}
                            >
                              <span className="px-2 py-0.5 text-[11px] font-medium rounded-full bg-blue-100 text-blue-700">AI 답변</span>
                              {!transfer && <Check className="w-3 h-3 text-blue-500 ml-auto" />}
                            </button>
                            <button
                              onClick={() => {
                                onCellEdit(faq.id, {
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
                            onClick={() => startEdit(faq.id, 'handler')}
                            className={`inline-flex px-1.5 py-0.5 text-[11px] font-medium rounded-full cursor-pointer hover:ring-2 hover:ring-gray-200 transition-all ${
                              faq.handler === 'manager' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                            }`}
                          >
                            {faq.handler === 'manager' ? '현장' : '운영'}
                          </span>
                          {isEditing(faq.id, 'handler') && (
                            <div data-dropdown className="absolute left-0 top-full z-50 mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[100px]">
                              {[
                                { value: 'op', label: '운영', color: 'bg-amber-100 text-amber-700' },
                                { value: 'manager', label: '현장', color: 'bg-green-100 text-green-700' },
                              ].map(opt => (
                                <button
                                  key={opt.value}
                                  onClick={() => { onCellEdit(faq.id, { handler: opt.value as 'op' | 'manager' }); stopEdit(); }}
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
                          onClick={() => startEdit(faq.id, 'topic')}
                          className={`cursor-pointer hover:ring-2 hover:ring-gray-200 rounded-full transition-all inline-flex ${
                            faq.topic
                              ? 'px-1.5 py-0.5 text-[11px] font-medium bg-gray-100 text-gray-700'
                              : 'px-1 py-0.5 text-sm text-gray-400'
                          }`}
                        >
                          {faq.topic || '—'}
                        </span>
                        {isEditing(faq.id, 'topic') && (
                          <div data-dropdown className="absolute left-0 top-full z-50 mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[120px] max-h-[260px] overflow-y-auto">
                            <button
                              onClick={() => { onCellEdit(faq.id, { topic: '' }); stopEdit(); }}
                              className="w-full text-left px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-50"
                            >
                              — 없음
                            </button>
                            {TOPIC_OPTIONS.map(t => (
                              <button
                                key={t}
                                onClick={() => { onCellEdit(faq.id, { topic: t }); stopEdit(); }}
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
                    <td className="px-3 py-2.5">
                      <div className="relative">
                        <span
                          onClick={() => startEdit(faq.id, 'tag')}
                          className="cursor-pointer hover:ring-2 hover:ring-gray-200 rounded transition-all inline-flex items-center gap-0.5 py-0.5"
                        >
                          {faq.tags && faq.tags.length > 0 ? (
                            <>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${TAG_COLORS[faq.tags[0]] || 'bg-gray-100 text-gray-600'}`}>
                                {faq.tags[0]}
                              </span>
                              {faq.tags.length > 1 && (
                                <span className="text-[10px] bg-gray-200 text-gray-600 rounded-full px-1">+{faq.tags.length - 1}</span>
                              )}
                            </>
                          ) : (
                            <span className="text-xs text-gray-400 px-1">—</span>
                          )}
                        </span>
                        {isEditing(faq.id, 'tag') && (
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
                                    onCellEdit(faq.id, { tags: newTags });
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
                          onClick={() => startEdit(faq.id, 'action')}
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
                        {isEditing(faq.id, 'action') && (
                          <div data-dropdown className="absolute left-0 top-full z-50 mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[160px] max-h-[320px] overflow-y-auto">
                            <div className="px-3 py-1 text-[10px] font-medium text-gray-400 uppercase tracking-wide">Product</div>
                            <button
                              onClick={() => onCellEdit(faq.id, { action_product: null })}
                              className={`w-full text-left px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-50 ${!faq.action_product ? 'bg-blue-50/40' : ''}`}
                            >
                              — 없음
                            </button>
                            {ACTION_PRODUCTS.map(p => (
                              <button
                                key={p}
                                onClick={() => onCellEdit(faq.id, { action_product: p })}
                                className={`w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-gray-50 ${faq.action_product === p ? 'bg-blue-50/40' : ''}`}
                              >
                                <span className="font-mono text-[11px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">{p}</span>
                                {faq.action_product === p && <Check className="w-3 h-3 text-blue-500 ml-auto" />}
                              </button>
                            ))}
                            <div className="border-t border-gray-100 my-1" />
                            <div className="px-3 py-1 text-[10px] font-medium text-gray-400 uppercase tracking-wide">Type</div>
                            <button
                              onClick={() => onCellEdit(faq.id, { action: null })}
                              className={`w-full text-left px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-50 ${!faq.action ? 'bg-blue-50/40' : ''}`}
                            >
                              — 없음
                            </button>
                            {ACTION_TYPES.map(a => (
                              <button
                                key={a}
                                onClick={() => onCellEdit(faq.id, { action: a })}
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
                        <span className={`text-[11px] font-medium ${status.color}`}>{status.text}</span>
                      </div>
                    </td>

                    {/* 삭제 */}
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <button onClick={() => onDelete(faq.id)} className="p-1 hover:bg-red-50 rounded transition-colors" title="삭제">
                        <Trash className="w-3.5 h-3.5 text-red-400" />
                      </button>
                    </td>
                  </tr>

                  {/* ── 확장 영역 ── */}
                  {isExpanded && (
                    <tr className={isDirty ? 'border-l-2 border-l-blue-400 bg-blue-50/20' : 'bg-gray-50/50'}>
                      <td colSpan={COL_SPAN} className="px-6 py-4">
                        <div className="space-y-4 max-w-2xl">

                          {/* ── 원본 (고객 등록 내용, 읽기전용) ── */}
                          {(faq.questionsRaw || faq.answerRaw) && (
                            <div className="bg-gray-50 border border-gray-100 rounded-lg px-3 py-2.5 space-y-2">
                              <label className="block text-[11px] font-medium text-gray-400 uppercase tracking-wide">원본</label>
                              {faq.questionsRaw && faq.questionsRaw.length > 0 && (
                                <div className="text-sm text-gray-500">
                                  <span className="text-gray-400 text-xs mr-1.5">Q</span>
                                  {faq.questionsRaw.join(' ; ')}
                                </div>
                              )}
                              {faq.answerRaw && (
                                <div className="text-sm text-gray-500 whitespace-pre-wrap">
                                  <span className="text-gray-400 text-xs mr-1.5">A</span>
                                  {faq.answerRaw}
                                </div>
                              )}
                            </div>
                          )}

                          {/* ── 질문 배열 ── */}
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-2">질문</label>
                            <div className="space-y-1.5">
                              {faq.questions.map((q, idx) => (
                                <div key={idx} className="flex gap-2">
                                  <UndoableInput
                                    type="text"
                                    value={q}
                                    onChange={(e) => {
                                      const newQ = [...faq.questions];
                                      newQ[idx] = e.target.value;
                                      onCellEdit(faq.id, { questions: newQ });
                                    }}
                                    placeholder="유사표현은 세미콜론(;)으로 구분"
                                    className="flex-1 px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-1 focus:ring-gray-400 focus:border-gray-400 outline-none"
                                  />
                                  <button
                                    onClick={() => {
                                      const newQ = faq.questions.filter((_, i) => i !== idx);
                                      onCellEdit(faq.id, { questions: newQ.length ? newQ : [''] });
                                    }}
                                    className="p-1 text-gray-400 hover:text-red-500 rounded transition-colors"
                                  >
                                    <Trash className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ))}
                              <button
                                onClick={() => onCellEdit(faq.id, { questions: [...faq.questions, ''] })}
                                className="w-full px-2.5 py-1.5 text-xs text-gray-500 border border-dashed border-gray-300 rounded-lg hover:bg-white hover:text-gray-700 transition-colors"
                              >
                                + 질문 추가
                              </button>
                            </div>
                          </div>

                          {/* ── 답변 ── */}
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1.5">답변</label>
                            <UndoableTextarea
                              value={faq.answer}
                              onChange={(e) => onCellEdit(faq.id, { answer: e.target.value })}
                              rows={4}
                              className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-1 focus:ring-gray-400 focus:border-gray-400 outline-none resize-none"
                            />
                          </div>

                          {/* ── 가이드 ── */}
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1.5">가이드</label>
                            <UndoableTextarea
                              value={faq.guide || ''}
                              onChange={(e) => onCellEdit(faq.id, { guide: e.target.value })}
                              rows={2}
                              placeholder="답변 참고사항..."
                              className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-1 focus:ring-gray-400 focus:border-gray-400 outline-none resize-none"
                            />
                          </div>

                          {/* ── 사전안내 (담당자 전달 모드) ── */}
                          {transfer && (
                            <div>
                              <label className="block text-xs font-medium text-gray-500 mb-1.5">
                                사전 안내 <span className="text-gray-400 font-normal">(입력 시 조건부 전달)</span>
                              </label>
                              <UndoableTextarea
                                value={faq.rule || ''}
                                onChange={(e) => {
                                  const rule = e.target.value;
                                  onCellEdit(faq.id, {
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

      {/* 검색 결과 없음 */}
      {searchQuery && filteredFaqs.length === 0 && (
        <div className="text-center py-10">
          <p className="text-sm text-gray-500">검색 결과가 없습니다.</p>
        </div>
      )}
    </div>
  );
}
