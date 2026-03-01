'use client';

import { useState } from 'react';
import { Xmark, Trash, Plus } from 'iconoir-react';

// ═══════════════════════════════════════════════════════════
// 타입
// ═══════════════════════════════════════════════════════════

interface TenantOption {
  tenantId: string;
  brandName: string;
  branchNo?: string | null;
}

interface CsFaqAddModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: FaqAddData) => Promise<void>;
  tenants: TenantOption[];
}

export interface FaqAddData {
  tenantIds: string[];
  questions: string[];
  answer: string;
  guide: string;
  topic: string;
  tags: string[];
  action_product: string | null;
  action: string | null;
  handlerType: 'bot' | 'staff';
  skipExpander: boolean;
  handler?: 'bot' | 'op' | 'manager';
  rule?: string;
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

// ═══════════════════════════════════════════════════════════
// 컴포넌트
// ═══════════════════════════════════════════════════════════

export default function CsFaqAddModal({ isOpen, onClose, onSubmit, tenants }: CsFaqAddModalProps) {
  const [selectedTenants, setSelectedTenants] = useState<Set<string>>(new Set());
  const [questions, setQuestions] = useState<string[]>(['']);
  const [answer, setAnswer] = useState('');
  const [guide, setGuide] = useState('');
  const [topic, setTopic] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [actionProduct, setActionProduct] = useState('');
  const [actionType, setActionType] = useState('');
  const [handlerType, setHandlerType] = useState<'bot' | 'staff'>('bot');
  const [skipExpander, setSkipExpander] = useState(false);
  const [handler, setHandler] = useState<'op' | 'manager'>('op');
  const [rule, setRule] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const allSelected = tenants.length > 0 && tenants.every(t => selectedTenants.has(t.tenantId));

  const toggleTenant = (id: string) => {
    setSelectedTenants(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllTenants = () => {
    if (allSelected) {
      setSelectedTenants(new Set());
    } else {
      setSelectedTenants(new Set(tenants.map(t => t.tenantId)));
    }
  };

  const toggleTag = (tag: string) => {
    setTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  };

  const handleSubmit = async () => {
    if (selectedTenants.size === 0) { alert('매장을 선택해주세요.'); return; }
    if (!questions.some(q => q.trim())) { alert('질문을 입력해주세요.'); return; }
    if (!answer.trim()) { alert('답변을 입력해주세요.'); return; }

    setSubmitting(true);
    try {
      await onSubmit({
        tenantIds: Array.from(selectedTenants),
        questions: questions.filter(q => q.trim()),
        answer,
        guide,
        topic,
        tags,
        action_product: actionProduct || null,
        action: actionType || null,
        handlerType,
        skipExpander,
        ...(skipExpander ? { handler: handlerType === 'staff' ? handler : 'bot', rule } : {}),
      });
      // 성공 후 초기화
      setSelectedTenants(new Set());
      setQuestions(['']);
      setAnswer('');
      setGuide('');
      setTopic('');
      setTags([]);
      setActionProduct('');
      setActionType('');
      setHandlerType('bot');
      setSkipExpander(false);
      setHandler('op');
      setRule('');
      onClose();
    } catch {
      alert('FAQ 등록 중 오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">FAQ 추가</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
            <Xmark className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-5">
          {/* 적용 매장 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">적용 매장</label>
            <div className="border border-gray-200 rounded-lg max-h-36 overflow-y-auto">
              <label className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 bg-gray-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAllTenants}
                  className="w-3.5 h-3.5 rounded border-gray-300"
                />
                <span className="text-sm font-medium text-gray-700">전체 매장 ({tenants.length})</span>
              </label>
              {tenants.map(t => (
                <label key={t.tenantId} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedTenants.has(t.tenantId)}
                    onChange={() => toggleTenant(t.tenantId)}
                    className="w-3.5 h-3.5 rounded border-gray-300"
                  />
                  <span className="text-sm text-gray-600">{t.brandName}</span>
                </label>
              ))}
            </div>
          </div>

          {/* 질문 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">질문</label>
            <div className="space-y-1.5">
              {questions.map((q, idx) => (
                <div key={idx} className="flex gap-2">
                  <input
                    type="text"
                    value={q}
                    onChange={(e) => {
                      const newQ = [...questions];
                      newQ[idx] = e.target.value;
                      setQuestions(newQ);
                    }}
                    placeholder="고객이 물어볼 질문"
                    className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-1 focus:ring-gray-400 outline-none"
                  />
                  {questions.length > 1 && (
                    <button
                      onClick={() => setQuestions(questions.filter((_, i) => i !== idx))}
                      className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                    >
                      <Trash className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
              <button
                onClick={() => setQuestions([...questions, ''])}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> 유사 질문 추가
              </button>
            </div>
          </div>

          {/* 처리 방식 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">처리</label>
            <div className="flex gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="handlerType"
                  checked={handlerType === 'bot'}
                  onChange={() => setHandlerType('bot')}
                  className="w-3.5 h-3.5"
                />
                <span className="text-sm text-gray-600">AI 답변</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="handlerType"
                  checked={handlerType === 'staff'}
                  onChange={() => setHandlerType('staff')}
                  className="w-3.5 h-3.5"
                />
                <span className="text-sm text-gray-600">담당자 전달</span>
              </label>
            </div>
          </div>

          {/* 답변 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">답변</label>
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              rows={4}
              placeholder="AI가 고객에게 응답할 내용"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-1 focus:ring-gray-400 outline-none resize-none"
            />
          </div>

          {/* 가이드 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">답변 참고 <span className="text-gray-400 font-normal">(선택)</span></label>
            <textarea
              value={guide}
              onChange={(e) => setGuide(e.target.value)}
              rows={2}
              placeholder="답변 참고사항..."
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-1 focus:ring-gray-400 outline-none resize-none"
            />
          </div>

          {/* topic & tag */}
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-2">topic</label>
              <select
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none"
              >
                <option value="">선택</option>
                {TOPIC_OPTIONS.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-2">tag</label>
              <div className="flex flex-wrap gap-1">
                {TAG_OPTIONS.map(tag => (
                  <button
                    key={tag}
                    onClick={() => toggleTag(tag)}
                    className={`px-2 py-1 rounded-full text-xs font-medium transition-all ${
                      tags.includes(tag)
                        ? 'bg-gray-900 text-white'
                        : 'text-gray-500 border border-gray-200 hover:border-gray-400'
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* action */}
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-2">action product</label>
              <select
                value={actionProduct}
                onChange={(e) => setActionProduct(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none"
              >
                <option value="">없음</option>
                {ACTION_PRODUCTS.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-2">action type</label>
              <select
                value={actionType}
                onChange={(e) => setActionType(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none"
              >
                <option value="">없음</option>
                {ACTION_TYPES.map(a => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>
          </div>

          {/* skipExpander 토글 */}
          <div className="border border-gray-200 rounded-lg p-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={skipExpander}
                onChange={(e) => setSkipExpander(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-gray-300"
              />
              <span className="text-sm font-medium text-gray-700">AI 확장 건너뛰기</span>
              <span className="text-xs text-gray-400">(handler/rule 직접 지정)</span>
            </label>

            {skipExpander && handlerType === 'staff' && (
              <div className="mt-3 space-y-3 pl-6">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">handler</label>
                  <div className="flex gap-3">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="radio" name="handler" checked={handler === 'op'} onChange={() => setHandler('op')} className="w-3 h-3" />
                      <span className="text-sm text-gray-600">운영</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="radio" name="handler" checked={handler === 'manager'} onChange={() => setHandler('manager')} className="w-3 h-3" />
                      <span className="text-sm text-gray-600">현장</span>
                    </label>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">사전 안내 (조건부 전달)</label>
                  <textarea
                    value={rule}
                    onChange={(e) => setRule(e.target.value)}
                    rows={2}
                    placeholder="비워두면 바로 담당자에게 전달"
                    className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-1 focus:ring-gray-400 outline-none resize-none"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 푸터 */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || selectedTenants.size === 0}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {submitting ? '등록 중...' : `${selectedTenants.size}개 매장에 등록`}
          </button>
        </div>
      </div>
    </div>
  );
}