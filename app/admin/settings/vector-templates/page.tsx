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
  NavArrowDown,
  NavArrowRight,
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
  const [showAdvanced, setShowAdvanced] = useState(false);

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
    setShowAdvanced(false);
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

    // 고급 설정 펼침 여부
    setShowAdvanced(
      !!datasheetSource?.matchKeywords?.length ||
      template.handlerType !== 'bot' ||
      !!template.answer
    );
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
      {/* ���측: 템플릿 목록 */}
      <aside className="w-72 flex-shrink-0 bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-gray-100">
          <h1 className="text-lg font-bold text-gray-900 mb-3">질문 매핑</h1>
          <button
            onClick={handleStartAdd}
            className="w-full px-3 py-2.5 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-xl hover:bg-blue-100 transition-colors flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" />
            새 매핑 추가
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {templates.length === 0 ? (
            <div className="p-6 text-center text-gray-400 text-sm">
              <Database className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>등록된 매핑이 없습니다.</p>
              <p className="text-xs mt-1">위 버튼을 눌러 추가하세요</p>
            </div>
          ) : (
            <div className="space-y-1">
              {templates.map((template) => {
                const isSelected = selectedId === template.id;
                const firstQuestion = template.questions?.[0] || '(질문 없음)';
                const sources = template.keyDataSources || [];

                return (
                  <button
                    key={template.id}
                    onClick={() => handleSelect(template)}
                    className={`w-full text-left px-3 py-3 rounded-xl transition-all ${
                      isSelected
                        ? 'bg-blue-50 ring-1 ring-blue-200'
                        : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className="text-sm font-medium text-gray-800 truncate">
                      {firstQuestion}
                    </div>
                    <div className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                      {sources.map((source, idx) => (
                        <span key={idx} className={source.type === 'storeinfo' ? 'text-green-600' : 'text-blue-600'}>
                          {source.type === 'storeinfo' ? '📍' : '📊'}
                          {source.type === 'storeinfo'
                            ? source.sectionIds?.map(s => STOREINFO_SECTIONS[s]?.label).join(', ')
                            : TOPICS[source.topic || '']?.name}
                        </span>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </aside>

      {/* 우측: 편집 영역 */}
      <main className="flex-1 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
        {selectedTemplate || isAddingNew ? (
          <>
            {/* 헤더 */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">
                {isAddingNew ? '새 질문 템플릿 추가' : '질문 템플릿 편집'}
              </h2>
              <div className="flex items-center gap-2">
                {isEditMode ? (
                  <>
                    <button
                      onClick={handleCancel}
                      className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800"
                    >
                      취소
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                    >
                      {saving ? <Spinner size="sm" /> : <Check className="w-4 h-4" />}
                      저장
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={() => setIsEditing(true)} className="p-2 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50">
                      <Edit className="w-5 h-5" />
                    </button>
                    <button
                      onClick={handleBroadcast}
                      disabled={broadcasting}
                      className="p-2 text-gray-400 hover:text-green-600 rounded-lg hover:bg-green-50 disabled:opacity-50"
                      title="전체 테넌트에 적용"
                    >
                      {broadcasting ? <Spinner size="sm" /> : <SendDiagonal className="w-5 h-5" />}
                    </button>
                    <button onClick={handleDelete} className="p-2 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50">
                      <BinMinusIn className="w-5 h-5" />
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* 폼 영역 */}
            <div className="flex-1 overflow-y-auto">
              <div className="max-w-2xl mx-auto px-6 py-8 space-y-8">

                {/* STEP 1: 질문 입력 */}
                <section>
                  <div className="flex items-center gap-3 mb-4">
                    <span className="w-7 h-7 rounded-full bg-blue-600 text-white text-sm font-bold flex items-center justify-center">1</span>
                    <h3 className="text-base font-semibold text-gray-900">어떤 질문이 들어올까요?</h3>
                  </div>

                  <div className="space-y-3">
                    {(editForm.questions || []).map((q, idx) => (
                      <div key={idx} className="flex items-center gap-2 group">
                        <div className="flex-1 px-4 py-2.5 bg-gray-50 rounded-lg text-sm text-gray-700 border border-gray-100">
                          {q}
                        </div>
                        {isEditMode && (
                          <button
                            onClick={() => handleRemoveQuestion(idx)}
                            className="p-1.5 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Xmark className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}

                    {isEditMode && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={questionInput}
                            onChange={(e) => setQuestionInput(e.target.value)}
                            placeholder="예: 에어컨 있나요? ; 냉방 되나요?"
                            className="flex-1 px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                            className="px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 disabled:opacity-40"
                          >
                            추가
                          </button>
                        </div>
                        <p className="text-xs text-gray-400 pl-1">
                          비슷한 질문은 세미콜론(;)으로 구분해서 함께 입력하면 검색 정확도가 올라가요
                        </p>
                      </div>
                    )}
                  </div>
                </section>

                {/* STEP 2: 데이터 소스 선택 */}
                <section>
                  <div className="flex items-center gap-3 mb-4">
                    <span className="w-7 h-7 rounded-full bg-blue-600 text-white text-sm font-bold flex items-center justify-center">2</span>
                    <h3 className="text-base font-semibold text-gray-900">어디서 답변을 찾을까요?</h3>
                  </div>

                  {/* 소스 타입 선택 */}
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <button
                      type="button"
                      onClick={() => isEditMode && setSourceType('datasheet')}
                      disabled={!isEditMode}
                      className={`p-4 rounded-xl border-2 text-left transition-all ${
                        sourceType === 'datasheet'
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      } ${!isEditMode ? 'opacity-60 cursor-default' : 'cursor-pointer'}`}
                    >
                      <div className="text-2xl mb-1">📊</div>
                      <div className="font-medium text-gray-900">데이터시트</div>
                      <div className="text-xs text-gray-500 mt-0.5">공간, 시설, 좌석, 상품 정보</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => isEditMode && setSourceType('storeinfo')}
                      disabled={!isEditMode}
                      className={`p-4 rounded-xl border-2 text-left transition-all ${
                        sourceType === 'storeinfo'
                          ? 'border-green-500 bg-green-50'
                          : 'border-gray-200 hover:border-gray-300'
                      } ${!isEditMode ? 'opacity-60 cursor-default' : 'cursor-pointer'}`}
                    >
                      <div className="text-2xl mb-1">📍</div>
                      <div className="font-medium text-gray-900">매장정보</div>
                      <div className="text-xs text-gray-500 mt-0.5">영업시간, 주차, 출입방법</div>
                    </button>
                  </div>

                  {/* 데이터시트 상세 선택 */}
                  {sourceType === 'datasheet' && (
                    <div className="p-4 bg-blue-50/50 rounded-xl border border-blue-100 space-y-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-2">시트 선택</label>
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
                              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                                selectedTopic === key
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-white text-gray-600 border border-gray-200 hover:border-blue-400'
                              } ${!isEditMode ? 'opacity-60' : ''}`}
                            >
                              {val.icon} {val.name}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-2">
                          사용할 컬럼 <span className="text-gray-400">(복수 선택)</span>
                        </label>
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
                              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                                selectedFacets.includes(key)
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-white text-gray-600 border border-gray-200 hover:border-blue-400'
                              } ${!isEditMode ? 'opacity-60' : ''}`}
                            >
                              {val.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* 범위 선택 */}
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-2">검색 범위</label>
                        <div className="flex flex-wrap gap-2">
                          {[
                            { value: 'all', label: '전체' },
                            { value: 'category', label: '카테고리별' },
                            { value: 'item', label: '특정 항목' },
                            { value: 'group', label: '폴더별' },
                          ].map(opt => (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => {
                                if (!isEditMode) return;
                                setScope(opt.value as DataScope);
                                if (opt.value === 'all') setScopeFilter('');
                              }}
                              disabled={!isEditMode}
                              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                                scope === opt.value
                                  ? 'bg-indigo-600 text-white'
                                  : 'bg-white text-gray-600 border border-gray-200 hover:border-indigo-400'
                              } ${!isEditMode ? 'opacity-60' : ''}`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                        {scope !== 'all' && (
                          <div className="mt-2">
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
                              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg disabled:opacity-60"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* 매장정보 상세 선택 */}
                  {sourceType === 'storeinfo' && (
                    <div className="p-4 bg-green-50/50 rounded-xl border border-green-100">
                      <label className="block text-xs font-medium text-gray-600 mb-2">
                        섹션 선택 <span className="text-gray-400">(복수 선택)</span>
                      </label>
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
                            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                              selectedSections.includes(key)
                                ? 'bg-green-600 text-white'
                                : 'bg-white text-gray-600 border border-gray-200 hover:border-green-400'
                            } ${!isEditMode ? 'opacity-60' : ''}`}
                          >
                            {val.icon} {val.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </section>

                {/* FAQ 응답 설정 */}
                <section className="p-5 bg-purple-50/50 rounded-xl border border-purple-100">
                  <h3 className="text-sm font-semibold text-purple-800 mb-4">FAQ 응답 설정</h3>

                  <div className="space-y-4">
                    {/* 기본 답변 템플릿 */}
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-2">기본 답변 템플릿</label>
                      <textarea
                        value={answer}
                        onChange={(e) => setAnswer(e.target.value)}
                        disabled={!isEditMode}
                        placeholder={'{{keyData}}를 참고하여 답변을 작성합니다. 변수 사용 가능: {{storeName}}, {{keyData}}'}
                        rows={2}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg disabled:opacity-60 resize-none"
                      />
                    </div>

                    {/* 가이드 (주의사항) */}
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-2">가이드 (주의사항)</label>
                      <textarea
                        value={guide}
                        onChange={(e) => setGuide(e.target.value)}
                        disabled={!isEditMode}
                        placeholder="답변 시 참고할 주의사항이나 가이드라인"
                        rows={2}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg disabled:opacity-60 resize-none"
                      />
                    </div>

                    {/* FAQ 분류 토픽 */}
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-2">FAQ 분류 토픽</label>
                      <input
                        type="text"
                        value={faqTopic}
                        onChange={(e) => setFaqTopic(e.target.value)}
                        disabled={!isEditMode}
                        placeholder="예: 이용안내, 결제, 시설, 정책"
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg disabled:opacity-60"
                      />
                    </div>

                    {/* 태그 (tag_actions) - 멀티셀렉 버튼 */}
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-2">태그 (tag_actions)</label>
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
                            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                              selectedTags.includes(tag)
                                ? 'bg-purple-600 text-white'
                                : 'bg-white text-gray-600 border border-gray-200 hover:border-purple-400'
                            } ${!isEditMode ? 'opacity-60' : ''}`}
                          >
                            {tag}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* 처리 방식 - 3개 탭 */}
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-2">처리 방식</label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => isEditMode && setHandlerType('bot')}
                          disabled={!isEditMode}
                          className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                            handlerType === 'bot'
                              ? 'bg-purple-600 text-white'
                              : 'bg-white text-gray-600 border border-gray-200'
                          } ${!isEditMode ? 'opacity-60' : ''}`}
                        >
                          챗봇
                        </button>
                        <button
                          type="button"
                          onClick={() => isEditMode && setHandlerType('staff')}
                          disabled={!isEditMode}
                          className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                            handlerType === 'staff'
                              ? 'bg-purple-600 text-white'
                              : 'bg-white text-gray-600 border border-gray-200'
                          } ${!isEditMode ? 'opacity-60' : ''}`}
                        >
                          담당자
                        </button>
                        <button
                          type="button"
                          onClick={() => isEditMode && setHandlerType('conditional')}
                          disabled={!isEditMode}
                          className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                            handlerType === 'conditional'
                              ? 'bg-purple-600 text-white'
                              : 'bg-white text-gray-600 border border-gray-200'
                          } ${!isEditMode ? 'opacity-60' : ''}`}
                        >
                          조건부
                        </button>
                      </div>

                      {/* 담당자 선택 (staff일 때) */}
                      {handlerType === 'staff' && (
                        <div className="mt-3">
                          <select
                            value={handler}
                            onChange={(e) => setHandler(e.target.value as Handler)}
                            disabled={!isEditMode}
                            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg"
                          >
                            <option value="op">운영팀</option>
                            <option value="manager">매니저</option>
                          </select>
                        </div>
                      )}

                      {/* 조건 입력 (conditional일 때) - handler는 항상 bot, n8n에서 조건 평가 */}
                      {handlerType === 'conditional' && (
                        <div className="mt-3">
                          <label className="block text-xs font-medium text-gray-500 mb-1">전달 조건</label>
                          <textarea
                            value={rule}
                            onChange={(e) => setRule(e.target.value)}
                            disabled={!isEditMode}
                            placeholder="예: VIP 고객 / 결제 관련 / 불만 접수 시 전달"
                            rows={2}
                            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg disabled:opacity-60 resize-none"
                          />
                          <p className="text-xs text-gray-400 mt-1">
                            조건 미충족 시 챗봇이 응답, 충족 시 담당자에게 전달됩니다
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </section>

                {/* 고급 설정 (접이식) - 키워드 필터만 */}
                {sourceType === 'datasheet' && (
                  <section>
                    <button
                      type="button"
                      onClick={() => setShowAdvanced(!showAdvanced)}
                      className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"
                    >
                      {showAdvanced ? <NavArrowDown className="w-4 h-4" /> : <NavArrowRight className="w-4 h-4" />}
                      <span>고급 설정 (키워드 필터)</span>
                    </button>

                    {showAdvanced && (
                      <div className="mt-4 p-4 bg-gray-50 rounded-xl">
                        <label className="block text-xs font-medium text-gray-600 mb-2">
                          키워드 필터 <span className="text-gray-400">(선택)</span>
                        </label>
                        <p className="text-xs text-gray-400 mb-2">
                          특정 항목만 답변에 사용하고 싶을 때 (예: &ldquo;에어컨&rdquo; 관련 항목만)
                        </p>

                        {matchKeywords.length > 0 && (
                          <div className="flex flex-wrap gap-2 mb-2">
                            {matchKeywords.map(kw => (
                              <span key={kw} className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-100 text-amber-800 rounded-full text-sm">
                                {kw}
                                {isEditMode && (
                                  <button
                                    onClick={() => setMatchKeywords(prev => prev.filter(k => k !== kw))}
                                    className="hover:bg-amber-200 rounded-full p-0.5"
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
                              placeholder="키워드 입력 후 추가"
                              className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg"
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
                              className="px-3 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 disabled:opacity-40"
                            >
                              추가
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </section>
                )}

                {/* 미리보기 */}
                {previewText && (
                  <section className="p-4 bg-gray-900 rounded-xl">
                    <div className="text-xs text-gray-400 mb-2">답변 데이터 미리보기</div>
                    <div className="text-sm text-white">{previewText}</div>
                    <div className="text-xs text-gray-500 mt-2">
                      → 이 데이터를 기반으로 고객 질문에 답변합니다
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
              <Database className="w-16 h-16 mx-auto mb-4 opacity-20" />
              <p className="text-lg font-medium">질문 매핑을 선택하세요</p>
              <p className="text-sm mt-1">왼쪽에서 항목을 선택하거나 새로 추가하세요</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}