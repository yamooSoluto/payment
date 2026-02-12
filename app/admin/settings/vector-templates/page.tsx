'use client';

import { useState, useMemo } from 'react';
import useSWR from 'swr';
import {
  Database,
  Plus,
  Edit,
  BinMinusIn,
  Check,
  Xmark,
  SendDiagonal,
} from 'iconoir-react';
import Spinner from '@/components/admin/Spinner';

// ═══════════════════════════════════════════════════════════
// 스키마 타입 정의
// ���══════════════════════════════════════════════════════════

interface SchemaData {
  topics: Record<string, { id: string; name: string; icon: string }>;
  facets: Record<string, { label: string; aspect: string }>;
  aspects: Record<string, { id: string; label: string; color: string; facets: string[] }>;
  topicFacets: Record<string, string[]>;
  storeinfoSections: Record<string, { id: string; label: string; icon: string }>;
}

const SCHEMA_API_URL = process.env.NEXT_PUBLIC_DATAPAGE_URL
  ? `${process.env.NEXT_PUBLIC_DATAPAGE_URL}/api/schema/data-types`
  : 'http://localhost:3001/api/schema/data-types';

type DataScope = 'all' | 'category' | 'item' | 'group';

interface KeyDataSource {
  type: 'datasheet' | 'storeinfo';
  topic?: string;
  facets?: string[];
  sectionIds?: string[];
  matchKeywords?: string[];
  includeCategory?: boolean;
  scope?: DataScope;
  categoryFilter?: string;
  itemPattern?: string;
  groupFilter?: string;
}

// 핸들러 타입: 3개 (스크��샷 기준)
type HandlerType = 'bot' | 'staff' | 'conditional';
type Handler = 'bot' | 'op' | 'manager';

// 태그 프리셋 (스크린샷 기준)
const TAG_PRESETS = ['문의', '칭찬', '건의', '불만', '요청', '긴급'];

// FAQ 분류 토픽 옵션
const FAQ_TOPIC_OPTIONS = [
  { value: '', label: '선택 안함' },
  { value: '기본정보', label: '기본정보' },
  { value: '이용방법', label: '이용방법' },
  { value: '정책/규정', label: '정책/규정' },
  { value: '결제/환불', label: '결제/환불' },
  { value: '문제/해결', label: '문제/해결' },
  { value: '혜택/이벤트', label: '혜택/이벤트' },
  { value: '기타', label: '기타' },
];

interface QuestionTemplate {
  id: string;
  questions: string[];
  keyDataSources: KeyDataSource[];
  source?: 'datasheet' | 'storeinfo';
  topic?: string;
  itemPattern?: string;
  facet?: string;
  sectionId?: string;
  isActive: boolean;
  createdAt?: Date;
  // FAQ 응답 설정
  answer?: string;       // 기본 답변 템플릿
  guide?: string;        // 가이드 (주의사항)
  faqTopic?: string;     // FAQ 분류 토픽
  tags?: string[];       // 태그 (문의, 칭찬, 건의, 불만, 요청, 긴급)
  // 처리 방식
  handlerType?: HandlerType;  // 'bot' | 'staff' | 'conditional'
  handler?: Handler;          // 'bot' | 'op' | 'manager'
  rule?: string;              // 전달조건 (conditional일 때)
}

export default function VectorTemplatesPage() {
  const { data: schema, isLoading: schemaLoading } = useSWR<SchemaData>(
    SCHEMA_API_URL,
    { revalidateOnFocus: false }
  );

  const TOPICS = schema?.topics || {};
  const FACETS = schema?.facets || {};
  const TOPIC_FACETS = schema?.topicFacets || {};
  const STOREINFO_SECTIONS = schema?.storeinfoSections || {};

  const { data: swrData, isLoading: loading, mutate } = useSWR<{ templates: QuestionTemplate[] }>(
    '/api/admin/vector-templates',
    { fallbackData: { templates: [] } }
  );

  const [saving, setSaving] = useState(false);
  const [broadcasting, setBroadcasting] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isAddingNew, setIsAddingNew] = useState(false);


  const [editForm, setEditForm] = useState<Partial<QuestionTemplate>>({
    questions: [],
    keyDataSources: [],
    isActive: true,
  });
  const [questionInput, setQuestionInput] = useState('');

  // 데이터 소스 타입
  const [sourceType, setSourceType] = useState<'datasheet' | 'storeinfo' | null>(null);
  const [selectedTopic, setSelectedTopic] = useState<string>('space');
  const [selectedFacets, setSelectedFacets] = useState<string[]>([]);
  const [selectedSections, setSelectedSections] = useState<string[]>([]);

  // 범위 설정
  const [scope, setScope] = useState<DataScope>('all');
  const [scopeFilter, setScopeFilter] = useState('');

  // 고급 옵션 (키워드 필터)
  const [matchKeywords, setMatchKeywords] = useState<string[]>([]);
  const [newKeyword, setNewKeyword] = useState('');

  // FAQ 응답 설정
  const [answer, setAnswer] = useState('');
  const [guide, setGuide] = useState('');
  const [faqTopic, setFaqTopic] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  // 처리 방식 (3개 탭: 챗봇/담당자/조건부)
  const [handlerType, setHandlerType] = useState<HandlerType>('bot');
  const [handler, setHandler] = useState<Handler>('op');
  const [rule, setRule] = useState('');

  const availableFacets = useMemo(() => {
    const topicFacetKeys = TOPIC_FACETS[selectedTopic] || [];
    if (topicFacetKeys.length === 0) return FACETS;
    return Object.entries(FACETS)
      .filter(([key]) => topicFacetKeys.includes(key))
      .reduce((acc, [key, val]) => {
        acc[key] = val;
        return acc;
      }, {} as typeof FACETS);
  }, [FACETS, TOPIC_FACETS, selectedTopic]);

  const templates = swrData?.templates || [];
  const selectedTemplate = templates.find((t) => t.id === selectedId);
  const isEditMode = isEditing || isAddingNew;

  // ═══════════════════════════════════════════════════════════
  // 핸들러
  // ═══════════════════════════════════════════════════════════

  const resetForm = () => {
    setEditForm({ questions: [], keyDataSources: [], isActive: true });
    setQuestionInput('');
    setSourceType(null);
    setSelectedTopic('space');
    setSelectedFacets([]);
    setSelectedSections([]);
    setScope('all');
    setScopeFilter('');
    setMatchKeywords([]);
    setNewKeyword('');
    // FAQ 설정
    setAnswer('');
    setGuide('');
    setFaqTopic('');
    setSelectedTags([]);
    // 처리 방식
    setHandlerType('bot');
    setHandler('op');
    setRule('');
  };

  const handleSelect = (template: QuestionTemplate) => {
    if (isEditMode && !confirm('수정 중인 내용이 있습니다. 다른 항목을 선택하시겠습니까?')) return;

    setSelectedId(template.id);
    setEditForm({ ...template });
    setIsEditing(false);
    setIsAddingNew(false);

    const sources = template.keyDataSources || [];
    const datasheetSource = sources.find(s => s.type === 'datasheet');
    const storeinfoSource = sources.find(s => s.type === 'storeinfo');

    if (datasheetSource) {
      setSourceType('datasheet');
      setSelectedTopic(datasheetSource.topic || 'space');
      setSelectedFacets(datasheetSource.facets || []);
      setMatchKeywords(datasheetSource.matchKeywords || []);
      setScope(datasheetSource.scope || 'all');
      setScopeFilter(
        datasheetSource.categoryFilter ||
        datasheetSource.itemPattern ||
        datasheetSource.groupFilter ||
        ''
      );
    } else if (storeinfoSource) {
      setSourceType('storeinfo');
      setSelectedSections(storeinfoSource.sectionIds || []);
    } else {
      setSourceType(null);
    }

    // FAQ 설정 로드
    setAnswer(template.answer || '');
    setGuide(template.guide || '');
    setFaqTopic(template.faqTopic || '');
    setSelectedTags(template.tags || []);

    // 처리 방식 로드
    setHandlerType(template.handlerType || 'bot');
    setHandler(template.handler || 'op');
    setRule(template.rule || '');

  };

  const handleStartAdd = () => {
    if (isEditMode && !confirm('수정 중인 내용이 있습니다. 새로 추가하시겠습니까?')) return;
    setSelectedId(null);
    resetForm();
    setIsAddingNew(true);
    setIsEditing(false);
  };

  const handleAddQuestion = () => {
    if (!questionInput.trim()) return;
    setEditForm(prev => ({
      ...prev,
      questions: [...(prev.questions || []), questionInput.trim()],
    }));
    setQuestionInput('');
  };

  const handleRemoveQuestion = (idx: number) => {
    setEditForm(prev => ({
      ...prev,
      questions: (prev.questions || []).filter((_, i) => i !== idx),
    }));
  };

  const handleSave = async () => {
    if (!editForm.questions?.length) {
      alert('질문을 최소 1개 이상 입력해주세요.');
      return;
    }
    if (!sourceType) {
      alert('답변을 찾을 데이터 소스를 선택해주세요.');
      return;
    }
    if (sourceType === 'datasheet' && selectedFacets.length === 0) {
      alert('데이터시트에서 사용할 컬럼을 선택해주세요.');
      return;
    }
    if (sourceType === 'storeinfo' && selectedSections.length === 0) {
      alert('매장정보에서 사용할 섹션을 선택해주세요.');
      return;
    }

    setSaving(true);
    try {
      const keyDataSources: KeyDataSource[] = [];

      if (sourceType === 'datasheet') {
        const source: KeyDataSource = {
          type: 'datasheet',
          topic: selectedTopic,
          facets: selectedFacets,
          scope,
        };
        if (matchKeywords.length > 0) {
          source.matchKeywords = matchKeywords;
        }
        if (scope === 'category' && scopeFilter) {
          source.categoryFilter = scopeFilter;
        } else if (scope === 'item' && scopeFilter) {
          source.itemPattern = scopeFilter;
        } else if (scope === 'group' && scopeFilter) {
          source.groupFilter = scopeFilter;
        }
        keyDataSources.push(source);
      } else if (sourceType === 'storeinfo') {
        keyDataSources.push({
          type: 'storeinfo',
          sectionIds: selectedSections,
        });
      }

      const payload = {
        ...editForm,
        keyDataSources,
        source: sourceType,
        topic: selectedTopic,
        facet: selectedFacets[0],
        sectionId: selectedSections[0],
        // FAQ 응답 설정
        answer: answer || undefined,
        guide: guide || undefined,
        faqTopic: faqTopic || undefined,
        tags: selectedTags.length > 0 ? selectedTags : undefined,
        // 처리 방식 (Weaviate 매핑)
        // - bot: handler="bot", rule 없음
        // - staff: handler="op"|"manager" (선택), rule 없음
        // - conditional: handler 미지정 (n8n에서 rule 파싱 후 LLM이 결정), rule="조건텍스트"
        handlerType,
        handler: handlerType === 'bot' ? 'bot' : (handlerType === 'staff' ? handler : undefined),
        rule: handlerType === 'conditional' ? rule : undefined,
      };

      const url = isAddingNew
        ? '/api/admin/vector-templates'
        : `/api/admin/vector-templates/${selectedId}`;
      const method = isAddingNew ? 'POST' : 'PUT';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const data = await response.json();
        if (isAddingNew) {
          setSelectedId(data.id);
        }
        setIsAddingNew(false);
        setIsEditing(false);
        mutate();
      } else {
        const error = await response.json();
        alert(error.error || '저장에 실패했습니다.');
      }
    } catch (error) {
      console.error('Save error:', error);
      alert('오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedId || !confirm('정말 삭제하시겠습니까?')) return;
    try {
      const response = await fetch(`/api/admin/vector-templates/${selectedId}`, { method: 'DELETE' });
      if (response.ok) {
        setSelectedId(null);
        setIsEditing(false);
        mutate();
      }
    } catch (error) {
      console.error('Delete error:', error);
    }
  };

  const handleCancel = () => {
    if (isAddingNew) {
      setIsAddingNew(false);
      setSelectedId(null);
      resetForm();
    } else {
      setIsEditing(false);
      if (selectedTemplate) {
        handleSelect(selectedTemplate);
      }
    }
  };

  const handleBroadcast = async () => {
    if (!selectedId) return;
    if (!confirm('이 템플릿을 전체 활성 테넌트에 적용하시겠습니까?\n\n기존에 이 템플릿으로 생성된 FAQ가 있다면 업데이트됩니다.')) return;

    setBroadcasting(true);
    try {
      const response = await fetch('/api/admin/vector-templates/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId: selectedId }),
      });

      const result = await response.json();

      if (response.ok) {
        alert(`전체 적용 완료\n\n총 테넌트: ${result.totalTenants}개\n적용됨: ${result.syncedTenants}개\n실패: ${result.failedTenants}개`);
      } else {
        alert(result.error || '브로드캐스트에 실패했습니다.');
      }
    } catch (error) {
      console.error('Broadcast error:', error);
      alert('오류가 발생했습니다.');
    } finally {
      setBroadcasting(false);
    }
  };

  // ═══════════════════════════════════════════════════════════
  // 미리보기 텍스트 생성
  // ═══════════════════════════════════════════════════════════

  const previewText = useMemo(() => {
    if (!sourceType) return null;

    if (sourceType === 'datasheet') {
      const topicName = TOPICS[selectedTopic]?.name || selectedTopic;
      const facetLabels = selectedFacets.map(f => FACETS[f]?.label || f);
      if (facetLabels.length === 0) return null;

      let scopeNote = '';
      if (scope === 'category' && scopeFilter) {
        scopeNote = ` [${scopeFilter} 카테고리]`;
      } else if (scope === 'item' && scopeFilter) {
        scopeNote = ` [${scopeFilter} 항목]`;
      } else if (scope === 'group' && scopeFilter) {
        scopeNote = ` [${scopeFilter} 폴더]`;
      }

      const keywordNote = matchKeywords.length > 0
        ? ` (키워드: ${matchKeywords.join(', ')})`
        : '';

      return `📊 ${topicName} 시트${scopeNote}의 [${facetLabels.join(', ')}] 데이터${keywordNote}`;
    }

    if (sourceType === 'storeinfo') {
      const sectionLabels = selectedSections.map(s => STOREINFO_SECTIONS[s]?.label || s);
      if (sectionLabels.length === 0) return null;
      return `📍 매장정보의 [${sectionLabels.join(', ')}] 섹션`;
    }

    return null;
  }, [sourceType, selectedTopic, selectedFacets, selectedSections, scope, scopeFilter, matchKeywords, TOPICS, FACETS, STOREINFO_SECTIONS]);

  // ═══════════════════════════════════════════════════════════
  // 로딩/에러 상태
  // ═══════════════════════════════════════════════════════════

  if (loading || schemaLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!schema) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-500">
        <Database className="w-12 h-12 mb-4 opacity-30" />
        <p>스키마를 불러오지 못했습니다.</p>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // 렌더링
  // ═══════════════════════════════════════════════════════════

  return (
    <div className="flex h-[calc(100vh-120px)] gap-6">
      {/* 좌측: 템플릿 목록 */}
      <aside className="w-64 flex-shrink-0 bg-white rounded-xl border border-gray-200 flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h1 className="text-[15px] font-semibold text-gray-900">질문 매핑</h1>
          <button
            onClick={handleStartAdd}
            className="p-1 text-gray-400 hover:text-gray-900 rounded-md hover:bg-gray-100"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-1.5">
          {templates.length === 0 ? (
            <div className="p-6 text-center text-gray-400">
              <Database className="w-8 h-8 mx-auto mb-2 opacity-20" />
              <p className="text-xs">매핑을 추가하세요</p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {templates.map((template) => {
                const isSelected = selectedId === template.id;
                const firstQuestion = template.questions?.[0] || '(질문 없음)';
                const sources = template.keyDataSources || [];

                return (
                  <button
                    key={template.id}
                    onClick={() => handleSelect(template)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors ${
                      isSelected
                        ? 'bg-gray-100'
                        : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className="text-sm font-medium text-gray-800 truncate">
                      {firstQuestion}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5 truncate">
                      {sources.map((source) =>
                        source.type === 'storeinfo'
                          ? source.sectionIds?.map(s => STOREINFO_SECTIONS[s]?.label).join(', ')
                          : TOPICS[source.topic || '']?.name
                      ).join(' · ')}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </aside>

      {/* 우측: 편집 영역 */}
      <main className="flex-1 bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col">
        {selectedTemplate || isAddingNew ? (
          <>
            {/* 헤더 */}
            <div className="flex items-center justify-between px-6 py-3 border-b border-gray-100">
              <h2 className="text-sm font-medium text-gray-900">
                {isAddingNew ? '새 템플릿' : (editForm.questions?.[0] || '템플릿 편집')}
              </h2>
              <div className="flex items-center gap-1.5">
                {isEditMode ? (
                  <>
                    <button
                      onClick={handleCancel}
                      className="px-3.5 py-1.5 text-sm font-medium text-gray-500 hover:text-gray-800 rounded-full"
                    >
                      취소
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="px-4 py-1.5 bg-gray-900 text-white rounded-full text-sm font-medium hover:bg-gray-800 disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {saving ? <Spinner size="sm" /> : <Check className="w-3.5 h-3.5" />}
                      저장
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={() => setIsEditing(true)} className="p-1.5 text-gray-400 hover:text-gray-700 rounded-full hover:bg-gray-100">
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={handleBroadcast}
                      disabled={broadcasting}
                      className="p-1.5 text-gray-400 hover:text-gray-700 rounded-full hover:bg-gray-100 disabled:opacity-50"
                      title="전체 테넌트에 적용"
                    >
                      {broadcasting ? <Spinner size="sm" /> : <SendDiagonal className="w-4 h-4" />}
                    </button>
                    <button onClick={handleDelete} className="p-1.5 text-gray-400 hover:text-red-500 rounded-full hover:bg-gray-100">
                      <BinMinusIn className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* 폼 영역 */}
            <div className="flex-1 overflow-y-auto">
              <div className="max-w-2xl mx-auto px-6 py-6 space-y-0 divide-y divide-gray-100">

                {/* STEP 1: 질문 입력 */}
                <section className="pb-6">
                  <label className="block text-sm font-medium text-gray-900 mb-3">질문</label>

                  <div className="space-y-2">
                    {(editForm.questions || []).map((q, idx) => (
                      <div key={idx} className="flex items-center gap-2 group">
                        <div className="flex-1 px-3.5 py-2 bg-gray-50 rounded-lg text-sm text-gray-700">
                          {q}
                        </div>
                        {isEditMode && (
                          <button
                            onClick={() => handleRemoveQuestion(idx)}
                            className="p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Xmark className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}

                    {isEditMode && (
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={questionInput}
                            onChange={(e) => setQuestionInput(e.target.value)}
                            placeholder="예: 에어컨 있나요? ; 냉방 되나요?"
                            className="flex-1 px-3.5 py-2 border border-gray-200 rounded-lg text-sm focus:ring-1 focus:ring-gray-400 focus:border-gray-400 outline-none"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAddQuestion();
                              }
                            }}
                          />
                          <button
                            onClick={handleAddQuestion}
                            disabled={!questionInput.trim()}
                            className="px-3 py-2 text-sm font-medium text-gray-500 hover:text-gray-900 disabled:opacity-30"
                          >
                            추가
                          </button>
                        </div>
                        <p className="text-xs text-gray-400">
                          세미콜론(;)으로 구분하면 유사 질문으로 함께 등록됩니다
                        </p>
                      </div>
                    )}
                  </div>
                </section>

                {/* STEP 2: 데이터 소스 선택 */}
                <section className="py-6">
                  <label className="block text-sm font-medium text-gray-900 mb-3">데이터 소스</label>

                  {/* 소스 타입 - 소프트 세그먼트 */}
                  <div className="inline-flex bg-gray-100 rounded-full p-0.5 mb-5">
                    <button
                      type="button"
                      onClick={() => isEditMode && setSourceType('datasheet')}
                      disabled={!isEditMode}
                      className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                        sourceType === 'datasheet'
                          ? 'bg-white text-gray-900 shadow-sm'
                          : 'text-gray-500 hover:text-gray-700'
                      } ${!isEditMode ? 'opacity-60' : ''}`}
                    >
                      데이터시트
                    </button>
                    <button
                      type="button"
                      onClick={() => isEditMode && setSourceType('storeinfo')}
                      disabled={!isEditMode}
                      className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                        sourceType === 'storeinfo'
                          ? 'bg-white text-gray-900 shadow-sm'
                          : 'text-gray-500 hover:text-gray-700'
                      } ${!isEditMode ? 'opacity-60' : ''}`}
                    >
                      매장정보
                    </button>
                  </div>

                  {/* 데이터시트 상세 */}
                  {sourceType === 'datasheet' && (
                    <div className="space-y-5">
                      <div>
                        <label className="block text-[13px] font-medium text-gray-400 mb-2">시트</label>
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(TOPICS).map(([key, val]) => (
                            <button
                              key={key}
                              type="button"
                              onClick={() => {
                                if (!isEditMode) return;
                                setSelectedTopic(key);
                                const newTopicFacets = TOPIC_FACETS[key] || [];
                                if (newTopicFacets.length > 0) {
                                  setSelectedFacets(prev => prev.filter(f => newTopicFacets.includes(f)));
                                }
                              }}
                              disabled={!isEditMode}
                              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                                selectedTopic === key
                                  ? 'bg-gray-900 text-white'
                                  : 'text-gray-500 bg-gray-50 hover:bg-gray-100'
                              } ${!isEditMode ? 'opacity-60' : ''}`}
                            >
                              {val.icon} {val.name}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-[13px] font-medium text-gray-400 mb-2">컬럼 (복수 선택)</label>
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(availableFacets).map(([key, val]) => (
                            <button
                              key={key}
                              type="button"
                              onClick={() => {
                                if (!isEditMode) return;
                                setSelectedFacets(prev =>
                                  prev.includes(key)
                                    ? prev.filter(f => f !== key)
                                    : [...prev, key]
                                );
                              }}
                              disabled={!isEditMode}
                              className={`px-3 py-1.5 rounded-full text-xs transition-all ${
                                selectedFacets.includes(key)
                                  ? 'bg-gray-900 text-white'
                                  : 'text-gray-500 border border-gray-200 hover:border-gray-300 hover:text-gray-700'
                              } ${!isEditMode ? 'opacity-60' : ''}`}
                            >
                              {val.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-[13px] font-medium text-gray-400 mb-2">범위</label>
                        <div className="inline-flex bg-gray-100 rounded-full p-0.5">
                          {[
                            { value: 'all', label: '전체' },
                            { value: 'category', label: '카테고리' },
                            { value: 'item', label: '항목' },
                            { value: 'group', label: '폴더' },
                          ].map((opt) => (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => {
                                if (!isEditMode) return;
                                setScope(opt.value as DataScope);
                                if (opt.value === 'all') setScopeFilter('');
                              }}
                              disabled={!isEditMode}
                              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                                scope === opt.value
                                  ? 'bg-white text-gray-900 shadow-sm'
                                  : 'text-gray-500 hover:text-gray-700'
                              } ${!isEditMode ? 'opacity-60' : ''}`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                        {scope !== 'all' && (
                          <input
                            type="text"
                            value={scopeFilter}
                            onChange={(e) => setScopeFilter(e.target.value)}
                            disabled={!isEditMode}
                            placeholder={
                              scope === 'category' ? '예: 음료, 디저트' :
                              scope === 'item' ? '예: *에어컨*, 냉방*' :
                              '예: 1층, VIP존'
                            }
                            className="mt-2 w-full px-3.5 py-2 text-sm border border-gray-200 rounded-lg disabled:opacity-60"
                          />
                        )}
                      </div>

                      {/* 키워드 필터 */}
                      <div>
                        <label className="block text-[13px] font-medium text-gray-400 mb-1.5">키워드 필터</label>
                        <p className="text-xs text-gray-400 mb-2">
                          특정 항목만 사용 (예: &ldquo;에어컨&rdquo; 관련만)
                        </p>

                        {matchKeywords.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mb-2">
                            {matchKeywords.map(kw => (
                              <span key={kw} className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-100 text-gray-700 rounded-full text-xs">
                                {kw}
                                {isEditMode && (
                                  <button
                                    onClick={() => setMatchKeywords(prev => prev.filter(k => k !== kw))}
                                    className="hover:text-red-500 p-0.5"
                                  >
                                    <Xmark className="w-3 h-3" />
                                  </button>
                                )}
                              </span>
                            ))}
                          </div>
                        )}

                        {isEditMode && (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={newKeyword}
                              onChange={(e) => setNewKeyword(e.target.value)}
                              placeholder="키워드 입력"
                              className="flex-1 px-3.5 py-1.5 text-sm border border-gray-200 rounded-lg"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && newKeyword.trim()) {
                                  e.preventDefault();
                                  if (!matchKeywords.includes(newKeyword.trim())) {
                                    setMatchKeywords(prev => [...prev, newKeyword.trim()]);
                                  }
                                  setNewKeyword('');
                                }
                              }}
                            />
                            <button
                              onClick={() => {
                                if (newKeyword.trim() && !matchKeywords.includes(newKeyword.trim())) {
                                  setMatchKeywords(prev => [...prev, newKeyword.trim()]);
                                }
                                setNewKeyword('');
                              }}
                              disabled={!newKeyword.trim()}
                              className="px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-900 disabled:opacity-30"
                            >
                              추가
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* 매장정보 상세 */}
                  {sourceType === 'storeinfo' && (
                    <div>
                      <label className="block text-[13px] font-medium text-gray-400 mb-2">섹션 (복수 선택)</label>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(STOREINFO_SECTIONS).map(([key, val]) => (
                          <button
                            key={key}
                            type="button"
                            onClick={() => {
                              if (!isEditMode) return;
                              setSelectedSections(prev =>
                                prev.includes(key)
                                  ? prev.filter(s => s !== key)
                                  : [...prev, key]
                              );
                            }}
                            disabled={!isEditMode}
                            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                              selectedSections.includes(key)
                                ? 'bg-gray-900 text-white'
                                : 'text-gray-500 border border-gray-200 hover:border-gray-300 hover:text-gray-700'
                            } ${!isEditMode ? 'opacity-60' : ''}`}
                          >
                            {val.icon} {val.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </section>

                {/* STEP 3: FAQ 응답 설정 */}
                <section className="py-6">
                  <label className="block text-sm font-medium text-gray-900 mb-3">FAQ 응답</label>

                  <div className="space-y-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[13px] font-medium text-gray-400 mb-1.5">분류 토픽</label>
                        <select
                          value={faqTopic}
                          onChange={(e) => setFaqTopic(e.target.value)}
                          disabled={!isEditMode}
                          className="w-full px-3.5 py-2 text-sm border border-gray-200 rounded-lg disabled:opacity-60 bg-white"
                        >
                          {FAQ_TOPIC_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[13px] font-medium text-gray-400 mb-1.5">처리 방식</label>
                        <div className="inline-flex bg-gray-100 rounded-full p-0.5 w-full">
                          {[
                            { value: 'bot', label: '챗봇' },
                            { value: 'staff', label: '담당자' },
                            { value: 'conditional', label: '조건부' },
                          ].map((opt) => (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => isEditMode && setHandlerType(opt.value as HandlerType)}
                              disabled={!isEditMode}
                              className={`flex-1 px-3 py-2 rounded-full text-xs font-medium transition-all ${
                                handlerType === opt.value
                                  ? 'bg-white text-gray-900 shadow-sm'
                                  : 'text-gray-500 hover:text-gray-700'
                              } ${!isEditMode ? 'opacity-60' : ''}`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {handlerType === 'staff' && (
                      <div>
                        <label className="block text-[13px] font-medium text-gray-400 mb-1.5">담당자 지정</label>
                        <select
                          value={handler}
                          onChange={(e) => setHandler(e.target.value as Handler)}
                          disabled={!isEditMode}
                          className="w-full sm:w-1/2 px-3.5 py-2 text-sm border border-gray-200 rounded-lg bg-white disabled:opacity-60"
                        >
                          <option value="op">운영팀</option>
                          <option value="manager">매니저</option>
                        </select>
                      </div>
                    )}

                    {handlerType === 'conditional' && (
                      <div>
                        <label className="block text-[13px] font-medium text-gray-400 mb-1.5">전달 조건</label>
                        <textarea
                          value={rule}
                          onChange={(e) => setRule(e.target.value)}
                          disabled={!isEditMode}
                          placeholder="예: VIP 고객 / 결제 관련 / 불만 접수 시 전달"
                          rows={2}
                          className="w-full px-3.5 py-2 text-sm border border-gray-200 rounded-lg disabled:opacity-60 resize-none"
                        />
                        <p className="text-xs text-gray-400 mt-1">미충족 시 챗봇, 충족 시 담당자에게 전달</p>
                      </div>
                    )}

                    <div>
                      <label className="block text-[13px] font-medium text-gray-400 mb-1.5">답변 템플릿</label>
                      <textarea
                        value={answer}
                        onChange={(e) => setAnswer(e.target.value)}
                        disabled={!isEditMode}
                        placeholder={'{{keyData}}를 참고하여 답변합니다. 변수: {{storeName}}, {{keyData}}'}
                        rows={2}
                        className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-lg disabled:opacity-60 resize-none"
                      />
                    </div>

                    <div>
                      <label className="block text-[13px] font-medium text-gray-400 mb-1.5">가이드 (주의사항)</label>
                      <textarea
                        value={guide}
                        onChange={(e) => setGuide(e.target.value)}
                        disabled={!isEditMode}
                        placeholder="답변 시 참고할 주의사항이나 가이드라인"
                        rows={2}
                        className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-lg disabled:opacity-60 resize-none"
                      />
                    </div>

                    <div>
                      <label className="block text-[13px] font-medium text-gray-400 mb-1.5">태그</label>
                      <div className="flex flex-wrap gap-2">
                        {TAG_PRESETS.map(tag => (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => {
                              if (!isEditMode) return;
                              setSelectedTags(prev =>
                                prev.includes(tag)
                                  ? prev.filter(t => t !== tag)
                                  : [...prev, tag]
                              );
                            }}
                            disabled={!isEditMode}
                            className={`px-3 py-1.5 rounded-full text-xs transition-all ${
                              selectedTags.includes(tag)
                                ? 'bg-gray-900 text-white'
                                : 'text-gray-500 border border-gray-200 hover:border-gray-300 hover:text-gray-700'
                            } ${!isEditMode ? 'opacity-60' : ''}`}
                          >
                            {tag}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </section>

                {/* 미리보기 */}
                {previewText && (
                  <section className="pt-6">
                    <div className="px-4 py-3 bg-gray-50 rounded-lg">
                      <div className="text-[13px] font-medium text-gray-400 mb-1">미리보기</div>
                      <div className="text-sm text-gray-700">{previewText}</div>
                    </div>
                  </section>
                )}

              </div>
            </div>
          </>
        ) : (
          /* 선택 안됨 상태 */
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-gray-400">
              <Database className="w-10 h-10 mx-auto mb-3 opacity-15" />
              <p className="text-sm font-medium text-gray-500">항목을 선택하세요</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}