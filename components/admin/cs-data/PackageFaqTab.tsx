'use client';

import { useState, useEffect, useRef, Fragment } from 'react';
import { Plus, Trash, Xmark, Check } from 'iconoir-react';

// ═══════════════════════════════════════════════════════════
// 타입
// ═══════════════════════════════════════════════════════��═══

interface FaqTemplate {
  id: string;
  questions: string[];
  answer: string;
  guide: string;
  keyDataRefs: string[];
  topic: string;
  tags: string[];
  handlerType: 'bot' | 'staff' | 'conditional';
  handler: 'bot' | 'op' | 'manager';
  rule: string;
  action_product: string | null;
  action: string | null;
}

interface RuleOption {
  id: string;
  platform: string;
  store: string[];
  label: string;
}

interface PackageFaqTabProps {
  faqTemplates: FaqTemplate[];
  onUpdateTemplates: (templates: FaqTemplate[]) => Promise<void>;
  appliedStores?: string[];
}

// ═══════════════════════════════════════════════════════════
// 상수
// ═══════════════════════════════════════════════════════════

const TOPIC_OPTIONS = [
  '매장/운영', '시설/환경', '상품/서비스', '예약/주문', '결제/환불',
  '회원/혜택', '기술/접속', '제보/신고', '기타',
];

const HANDLER_OPTIONS = [
  { value: 'bot', label: 'AI 답변' },
  { value: 'op', label: '운영팀' },
  { value: 'manager', label: '현장매니저' },
];

// ═══════════════════════════════════════════════════════════
// 규정 셀렉터
// ═══════════════════════════════════════════════════════════

function RuleMultiSelect({
  selected,
  options,
  onChange,
  appliedStores = [],
}: {
  selected: string[];
  options: RuleOption[];
  appliedStores?: string[];
  onChange: (refs: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // 매장 필터: 적용 매장이 있으면 공통 또는 해당 매장 포함된 규정만
  const storeFiltered = appliedStores.length > 0
    ? options.filter(r =>
        r.store.includes('공통') || r.store.some(s => appliedStores.includes(s))
      )
    : options;

  const filtered = storeFiltered.filter(r =>
    !search || r.label.toLowerCase().includes(search.toLowerCase()) || r.platform.includes(search) || r.store.some(s => s.includes(search))
  );

  const selectedRules = selected.map(id => options.find(r => r.id === id)).filter(Boolean) as RuleOption[];

  return (
    <div ref={ref} className="relative">
      <div
        onClick={() => setOpen(!open)}
        className="min-h-[32px] flex flex-wrap gap-1 items-center px-2 py-1 border border-gray-200 rounded-lg cursor-pointer hover:border-gray-300 text-xs"
      >
        {selectedRules.length === 0 ? (
          <span className="text-gray-400">규정 선택...</span>
        ) : (
          selectedRules.map(r => (
            <span key={r.id} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded">
              {r.label}
              <button
                onClick={e => { e.stopPropagation(); onChange(selected.filter(id => id !== r.id)); }}
                className="hover:text-red-500"
              >
                <Xmark className="w-3 h-3" />
              </button>
            </span>
          ))
        )}
      </div>

      {open && (
        <div className="absolute z-50 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="규정 검색..."
              className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
              autoFocus
            />
          </div>
          <div className="overflow-y-auto max-h-44">
            {filtered.length === 0 ? (
              <div className="p-3 text-xs text-gray-400 text-center">결과 없음</div>
            ) : (
              filtered.map(r => {
                const isSelected = selected.includes(r.id);
                return (
                  <button
                    key={r.id}
                    onClick={() => {
                      if (isSelected) {
                        onChange(selected.filter(id => id !== r.id));
                      } else {
                        onChange([...selected, r.id]);
                      }
                    }}
                    className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-50 flex items-center gap-2 ${
                      isSelected ? 'bg-blue-50' : ''
                    }`}
                  >
                    <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${
                      isSelected ? 'bg-blue-600 border-blue-600' : 'border-gray-300'
                    }`}>
                      {isSelected && <Check className="w-2.5 h-2.5 text-white" />}
                    </div>
                    <span className="text-gray-400">[{r.platform}]</span>
                    <span className="truncate">{r.label}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 메인 컴포넌트
// ═══════════════════════════════════════════════════════════

export default function PackageFaqTab({ faqTemplates, onUpdateTemplates, appliedStores = [] }: PackageFaqTabProps) {
  const [templates, setTemplates] = useState<FaqTemplate[]>(faqTemplates);
  const [rules, setRules] = useState<RuleOption[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // 규정 목록 로드
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/cs-data/rules');
        if (res.ok) {
          const data = await res.json();
          setRules((data.rules || []).map((r: any) => ({
            id: r.id,
            platform: r.platform || '-',
            store: r.store || ['공통'],
            label: r.label,
          })));
        }
      } catch (err) {
        console.error('[PackageFaqTab] load rules error:', err);
      }
    })();
  }, []);

  // 부모에서 faqTemplates가 변경되면 반영
  useEffect(() => {
    setTemplates(faqTemplates);
    setDirty(false);
  }, [faqTemplates]);

  // 필드 편집
  const handleEdit = (templateId: string, field: string, value: any) => {
    setTemplates(prev => prev.map(t =>
      t.id === templateId ? { ...t, [field]: value } : t
    ));
    setDirty(true);
  };

  // 새 FAQ 추가
  const handleAdd = () => {
    const newTemplate: FaqTemplate = {
      id: `ft_${Date.now().toString(36)}`,
      questions: [''],
      answer: '',
      guide: '',
      keyDataRefs: [],
      topic: '',
      tags: [],
      handlerType: 'bot',
      handler: 'bot',
      rule: '',
      action_product: null,
      action: null,
    };
    setTemplates(prev => [...prev, newTemplate]);
    setExpandedId(newTemplate.id);
    setDirty(true);
  };

  // 삭제
  const handleDelete = (templateId: string) => {
    if (!confirm('이 FAQ 템플릿을 삭제하시겠습니까?')) return;
    setTemplates(prev => prev.filter(t => t.id !== templateId));
    if (expandedId === templateId) setExpandedId(null);
    setDirty(true);
  };

  // 저장
  const handleSave = async () => {
    setSaving(true);
    try {
      await onUpdateTemplates(templates);
      setDirty(false);
    } catch {
      // error handled by parent
    } finally {
      setSaving(false);
    }
  };

  // 질문 편집 헬퍼
  const handleQuestionChange = (templateId: string, idx: number, value: string) => {
    setTemplates(prev => prev.map(t => {
      if (t.id !== templateId) return t;
      const newQ = [...t.questions];
      newQ[idx] = value;
      return { ...t, questions: newQ };
    }));
    setDirty(true);
  };

  const handleAddQuestion = (templateId: string) => {
    setTemplates(prev => prev.map(t => {
      if (t.id !== templateId) return t;
      return { ...t, questions: [...t.questions, ''] };
    }));
    setDirty(true);
  };

  const handleRemoveQuestion = (templateId: string, idx: number) => {
    setTemplates(prev => prev.map(t => {
      if (t.id !== templateId) return t;
      const newQ = t.questions.filter((_, i) => i !== idx);
      return { ...t, questions: newQ.length > 0 ? newQ : [''] };
    }));
    setDirty(true);
  };

  return (
    <div>
      {/* 상단 액션 */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-gray-400">
          FAQ 템플릿 {templates.length}건
          {dirty && <span className="ml-2 text-amber-600">(변경사항 있음)</span>}
        </span>
        <div className="flex items-center gap-2">
          {dirty && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-colors"
            >
              {saving ? '저장 중...' : '변경사항 저장'}
            </button>
          )}
          <button
            onClick={handleAdd}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            FAQ 추가
          </button>
        </div>
      </div>

      {/* 테이블 */}
      {templates.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm bg-white rounded-xl border border-gray-200">
          FAQ 템플릿이 없습니다. 추가해 보세요.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-visible">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs text-gray-400 font-medium">
                <th className="px-3 py-2.5 w-8">#</th>
                <th className="px-3 py-2.5">질문</th>
                <th className="px-3 py-2.5 w-28">topic</th>
                <th className="px-3 py-2.5 w-24">처리</th>
                <th className="px-3 py-2.5 w-40">규정 참조</th>
                <th className="px-3 py-2.5 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {templates.map((t, idx) => (
                <Fragment key={t.id}>
                  {/* 메인 행 */}
                  <tr
                    className={`border-b border-gray-50 hover:bg-gray-50/50 cursor-pointer ${
                      expandedId === t.id ? 'bg-blue-50/30' : ''
                    }`}
                    onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}
                  >
                    <td className="px-3 py-2.5 text-xs text-gray-400">{idx + 1}</td>
                    <td className="px-3 py-2.5">
                      <div className="text-sm text-gray-900 truncate max-w-md">
                        {t.questions[0] || <span className="text-gray-300 italic">질문 없음</span>}
                      </div>
                      {t.questions.length > 1 && (
                        <span className="text-xs text-gray-400">+{t.questions.length - 1}개</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="text-xs text-gray-500">{t.topic || '-'}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        t.handler === 'bot' ? 'bg-green-50 text-green-700' :
                        t.handler === 'op' ? 'bg-amber-50 text-amber-700' :
                        'bg-red-50 text-red-700'
                      }`}>
                        {t.handler === 'bot' ? 'AI' : t.handler === 'op' ? '운영' : '현장'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap gap-0.5">
                        {(t.keyDataRefs || []).length === 0 ? (
                          <span className="text-xs text-gray-300">-</span>
                        ) : (
                          (t.keyDataRefs || []).slice(0, 2).map(ref => {
                            const rule = rules.find(r => r.id === ref);
                            return (
                              <span key={ref} className="text-xs px-1 py-0.5 bg-gray-100 text-gray-600 rounded truncate max-w-[70px]">
                                {rule?.label || ref}
                              </span>
                            );
                          })
                        )}
                        {(t.keyDataRefs || []).length > 2 && (
                          <span className="text-xs text-gray-400">+{t.keyDataRefs.length - 2}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <button
                        onClick={e => { e.stopPropagation(); handleDelete(t.id); }}
                        className="p-1 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                      >
                        <Trash className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>

                  {/* 확장 영역 */}
                  {expandedId === t.id && (
                    <tr>
                      <td colSpan={6} className="p-4 bg-gray-50/50 border-b border-gray-100">
                        <div className="grid grid-cols-2 gap-4">
                          {/* 좌측: 질문들 */}
                          <div>
                            <label className="text-xs font-medium text-gray-500 mb-1.5 block">질문 ({t.questions.length}개)</label>
                            <div className="space-y-1.5">
                              {t.questions.map((q, qi) => (
                                <div key={qi} className="flex items-center gap-1">
                                  <input
                                    value={q}
                                    onChange={e => handleQuestionChange(t.id, qi, e.target.value)}
                                    onClick={e => e.stopPropagation()}
                                    placeholder={`질문 ${qi + 1}`}
                                    className="flex-1 text-xs px-2 py-1.5 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                                  />
                                  {t.questions.length > 1 && (
                                    <button
                                      onClick={e => { e.stopPropagation(); handleRemoveQuestion(t.id, qi); }}
                                      className="p-0.5 text-gray-300 hover:text-red-500 rounded"
                                    >
                                      <Xmark className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              ))}
                              <button
                                onClick={e => { e.stopPropagation(); handleAddQuestion(t.id); }}
                                className="text-xs text-blue-500 hover:text-blue-700"
                              >
                                + ���문 추가
                              </button>
                            </div>

                            {/* 답변 */}
                            <label className="text-xs font-medium text-gray-500 mb-1 mt-3 block">답변</label>
                            <textarea
                              value={t.answer}
                              onChange={e => handleEdit(t.id, 'answer', e.target.value)}
                              onClick={e => e.stopPropagation()}
                              rows={3}
                              placeholder="답변 ({{brandName}} 변수 사용 가능)"
                              className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400 resize-y"
                            />

                            {/* 가이드 */}
                            <label className="text-xs font-medium text-gray-500 mb-1 mt-2 block">가이드</label>
                            <textarea
                              value={t.guide}
                              onChange={e => handleEdit(t.id, 'guide', e.target.value)}
                              onClick={e => e.stopPropagation()}
                              rows={2}
                              placeholder="내부 가이드 ({{brandName}} 변수 사용 가능)"
                              className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400 resize-y"
                            />
                          </div>

                          {/* 우측: 설정 */}
                          <div className="space-y-3">
                            {/* 규정 참조 */}
                            <div onClick={e => e.stopPropagation()}>
                              <label className="text-xs font-medium text-gray-500 mb-1 block">규정 참조 (keyData)</label>
                              <RuleMultiSelect
                                selected={t.keyDataRefs || []}
                                options={rules}
                                onChange={refs => handleEdit(t.id, 'keyDataRefs', refs)}
                                appliedStores={appliedStores}
                              />
                            </div>

                            {/* Topic */}
                            <div onClick={e => e.stopPropagation()}>
                              <label className="text-xs font-medium text-gray-500 mb-1 block">Topic</label>
                              <select
                                value={t.topic}
                                onChange={e => handleEdit(t.id, 'topic', e.target.value)}
                                className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                              >
                                <option value="">선택...</option>
                                {TOPIC_OPTIONS.map(opt => (
                                  <option key={opt} value={opt}>{opt}</option>
                                ))}
                              </select>
                            </div>

                            {/* Handler */}
                            <div onClick={e => e.stopPropagation()}>
                              <label className="text-xs font-medium text-gray-500 mb-1 block">처리 방식</label>
                              <select
                                value={t.handler}
                                onChange={e => {
                                  const handler = e.target.value as 'bot' | 'op' | 'manager';
                                  handleEdit(t.id, 'handler', handler);
                                  handleEdit(t.id, 'handlerType', handler === 'bot' ? 'bot' : (t.rule.trim() ? 'conditional' : 'staff'));
                                }}
                                className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                              >
                                {HANDLER_OPTIONS.map(opt => (
                                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                              </select>
                            </div>

                            {/* Rule (조건) */}
                            {(t.handler === 'op' || t.handler === 'manager') && (
                              <div onClick={e => e.stopPropagation()}>
                                <label className="text-xs font-medium text-gray-500 mb-1 block">전달 조건</label>
                                <input
                                  value={t.rule}
                                  onChange={e => {
                                    const rule = e.target.value;
                                    handleEdit(t.id, 'rule', rule);
                                    handleEdit(t.id, 'handlerType', rule.trim() ? 'conditional' : 'staff');
                                  }}
                                  placeholder="조건 규칙..."
                                  className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                                />
                              </div>
                            )}

                            {/* Tags */}
                            <div onClick={e => e.stopPropagation()}>
                              <label className="text-xs font-medium text-gray-500 mb-1 block">태그</label>
                              <input
                                value={(t.tags || []).join(', ')}
                                onChange={e => handleEdit(t.id, 'tags', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                                placeholder="태그1, 태그2, ..."
                                className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                              />
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}