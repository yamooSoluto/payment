'use client';

import { useState, useEffect } from 'react';
import useSWR from 'swr';
import {
  Database,
  NavArrowRight,
  RefreshDouble,
  Check,
  Edit,
  Trash,
} from 'iconoir-react';
import Spinner from '@/components/admin/Spinner';

// ═══════════════════════════════════════════════════════════
// 타입 정의
// ═══════════════════════════════════════════════════════════

interface SchemaData {
  topics: Record<string, { id: string; name: string; icon: string }>;
  facets: Record<string, { label: string; aspect: string }>;
  storeinfoSections: Record<string, { id: string; label: string; icon: string }>;
}

interface KeyDataSource {
  type: 'datasheet' | 'storeinfo';
  topic?: string;
  facets?: string[];
  sectionIds?: string[];
}

interface VectorTemplate {
  id: string;
  questions: string[];
  keyDataSources: KeyDataSource[];
  source?: string;
  topic?: string;
  facet?: string;
  sectionId?: string;
  categoryName?: string;
  isActive: boolean;
  answer?: string;
  guide?: string;
  faqTopic?: string;
  tags?: string[];
  handlerType?: 'bot' | 'staff' | 'conditional';
  handler?: 'bot' | 'op' | 'manager';
  rule?: string;
}

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
  isActive: boolean;
  vectorStatus?: 'pending' | 'synced' | 'error';
  vectorUuid?: string;
  source?: string;
  createdAt?: number | Date;
  updatedAt?: number | Date;
}

interface FaqTabProps {
  tenantId: string;
}

// 스키마 API URL
const SCHEMA_API_URL = process.env.NEXT_PUBLIC_DATAPAGE_URL
  ? `${process.env.NEXT_PUBLIC_DATAPAGE_URL}/api/schema/data-types`
  : 'http://localhost:3001/api/schema/data-types';

// ═══════════════════════════════════════════════════════════
// 메인 컴포넌트
// ═══════���══════════════════════════════════════���════════════

export default function FaqTab({ tenantId }: FaqTabProps) {
  // 스키마 동적 로드
  const { data: schema, isLoading: schemaLoading } = useSWR<SchemaData>(
    SCHEMA_API_URL,
    { revalidateOnFocus: false }
  );

  const TOPICS = schema?.topics || {};
  const FACETS = schema?.facets || {};
  const STOREINFO_SECTIONS = schema?.storeinfoSections || {};

  // 상태
  const [activeTab, setActiveTab] = useState<'faqs' | 'templates'>('faqs');
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<VectorTemplate[]>([]);
  const [faqs, setFaqs] = useState<TenantFaq[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [syncingTemplateId, setSyncingTemplateId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingFaq, setEditingFaq] = useState<TenantFaq | null>(null);
  const [saving, setSaving] = useState(false);

  // 데이터 로드 (스키마와 무관하게 즉시 실행)
  useEffect(() => {
    fetchData();
  }, [tenantId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 템플릿 조회
      const templatesRes = await fetch('/api/admin/vector-templates');
      if (templatesRes.ok) {
        const data = await templatesRes.json();
        setTemplates(data.templates || []);
      }

      // 테넌트 FAQ 조회
      const faqsRes = await fetch(`/api/admin/tenants/${tenantId}/faqs`);
      if (faqsRes.ok) {
        const data = await faqsRes.json();
        setFaqs(data.faqs || []);
      }
    } catch (error) {
      console.error('Failed to fetch FAQ data:', error);
    } finally {
      setLoading(false);
    }
  };


  // 전체 동기화
  const handleSyncAll = async () => {
    setSyncing(true);
    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}/faqs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync_all' }),
      });

      const data = await res.json();

      if (res.ok) {
        alert(`동기화 완료: ${data.result?.templatesMatched || 0}개 템플릿 매칭, ${data.result?.faqsCreated || 0}개 FAQ 생성/업데이트`);
        fetchData();
      } else {
        alert(`동기화 실패: ${data.error}`);
      }
    } catch (error) {
      console.error('Sync all failed:', error);
      alert('동기화 중 오류가 발생했습니다.');
    } finally {
      setSyncing(false);
    }
  };

  // 단일 템플릿 동기화
  const handleSyncTemplate = async (templateId: string) => {
    setSyncingTemplateId(templateId);
    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}/faqs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync_template', templateId }),
      });

      const data = await res.json();

      if (res.ok) {
        alert('템플릿 동기화 완료');
        fetchData();
      } else {
        alert(`동기화 실패: ${data.error}`);
      }
    } catch (error) {
      console.error('Sync template failed:', error);
      alert('동기화 중 오류가 발생했습니다.');
    } finally {
      setSyncingTemplateId(null);
    }
  };

  // FAQ 수정 저장
  const handleSaveFaq = async () => {
    if (!editingFaq) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}/faqs`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          faqId: editingFaq.id,
          updates: {
            questions: editingFaq.questions,
            answer: editingFaq.answer,
            guide: editingFaq.guide,
            handlerType: editingFaq.handlerType,
            handler: editingFaq.handler,
            rule: editingFaq.rule,
            tags: editingFaq.tags,
            topic: editingFaq.topic,
            tag_actions: editingFaq.tags, // tag_actions는 tags와 동일하게 저장
          },
        }),
      });

      if (res.ok) {
        setEditingFaq(null);
        fetchData();
      } else {
        const data = await res.json();
        alert(`저장 실패: ${data.error}`);
      }
    } catch (error) {
      console.error('Save FAQ failed:', error);
      alert('저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  // FAQ 삭제
  const handleDeleteFaq = async (faqId: string) => {
    if (!confirm('이 FAQ를 삭제하시겠습니까?')) return;

    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}/faqs?faqId=${faqId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        fetchData();
      } else {
        const data = await res.json();
        alert(`삭제 실패: ${data.error}`);
      }
    } catch (error) {
      console.error('Delete FAQ failed:', error);
      alert('삭제 중 오류가 발생했습니다.');
    }
  };

  // 핸들러 타입 라벨
  const getHandlerLabel = (faq: TenantFaq) => {
    if (faq.handlerType === 'bot') return '챗봇';
    if (faq.handlerType === 'staff') return faq.handler === 'manager' ? '매니저' : '운영팀';
    if (faq.handlerType === 'conditional') return '조건부';
    return '챗봇';
  };

  // 로딩 상태
  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Spinner size="lg" />
      </div>
    );
  }

  // 활성 FAQ만 필터링
  const activeFaqs = faqs.filter(f => f.isActive !== false);

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between pb-4 border-b border-gray-100">
        <div className="flex items-center gap-4">
          {/* 탭 */}
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setActiveTab('faqs')}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                activeTab === 'faqs'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              등록된 FAQ ({activeFaqs.length})
            </button>
            <button
              onClick={() => setActiveTab('templates')}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                activeTab === 'templates'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              질문 템플릿 ({templates.length})
            </button>
          </div>
        </div>

        <button
          onClick={handleSyncAll}
          disabled={syncing}
          className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-blue-600 border border-blue-300 rounded-lg hover:bg-blue-50 transition-colors disabled:opacity-50"
        >
          <RefreshDouble className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
          전체 동기화
        </button>
      </div>

      {/* FAQ 목록 탭 */}
      {activeTab === 'faqs' && (
        <div className="space-y-3">
          {activeFaqs.length === 0 ? (
            <div className="text-center py-10">
              <Database className="w-12 h-12 mx-auto text-gray-300 mb-4" />
              <p className="text-gray-500 mb-2">등록된 FAQ가 없습니다.</p>
              <p className="text-sm text-gray-400">
                &apos;전체 동기화&apos; 버튼을 클릭하여 템플릿 기반 FAQ를 생성하세요.
              </p>
            </div>
          ) : (
            activeFaqs.map((faq) => (
              <div
                key={faq.id}
                className="border border-gray-200 rounded-xl overflow-hidden"
              >
                {/* FAQ 헤더 */}
                <button
                  onClick={() => setExpandedId(expandedId === faq.id ? null : faq.id)}
                  className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {/* 벡터 상태 표시 */}
                    <div
                      className={`w-2 h-2 rounded-full ${
                        faq.vectorStatus === 'synced'
                          ? 'bg-green-500'
                          : faq.vectorStatus === 'error'
                          ? 'bg-red-500'
                          : 'bg-yellow-500'
                      }`}
                      title={
                        faq.vectorStatus === 'synced'
                          ? '벡터화 완료'
                          : faq.vectorStatus === 'error'
                          ? '벡터화 오류'
                          : '벡터화 대기'
                      }
                    />
                    <div className="text-left">
                      <div className="text-sm font-medium text-gray-700">
                        {faq.questions[0] || '(질문 없음)'}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-2">
                        <span className={`px-1.5 py-0.5 rounded text-xs ${
                          faq.handlerType === 'bot'
                            ? 'bg-blue-50 text-blue-600'
                            : faq.handlerType === 'staff'
                            ? 'bg-purple-50 text-purple-600'
                            : 'bg-amber-50 text-amber-600'
                        }`}>
                          {getHandlerLabel(faq)}
                        </span>
                        {faq.source === 'template' && (
                          <span className="text-gray-400">템플릿 생성</span>
                        )}
                        {faq.tags && faq.tags.length > 0 && (
                          <span className="text-gray-400">
                            #{faq.tags.join(' #')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <NavArrowRight
                    className={`w-5 h-5 text-gray-400 transition-transform ${
                      expandedId === faq.id ? 'rotate-90' : ''
                    }`}
                  />
                </button>

                {/* FAQ 상세 */}
                {expandedId === faq.id && (
                  <div className="px-4 pb-4 border-t border-gray-100 bg-gray-50/50">
                    {editingFaq?.id === faq.id ? (
                      // 편집 모드
                      <div className="mt-4 space-y-4">
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-2">질문</label>
                          <div className="space-y-2">
                            {editingFaq.questions.map((q, idx) => (
                              <div key={idx} className="flex gap-2">
                                <input
                                  type="text"
                                  value={q}
                                  onChange={(e) => {
                                    const newQuestions = [...editingFaq.questions];
                                    newQuestions[idx] = e.target.value;
                                    setEditingFaq({ ...editingFaq, questions: newQuestions });
                                  }}
                                  placeholder="유사표현은 세미콜론(;)으로 구분"
                                  className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-1 focus:ring-gray-400 focus:border-gray-400 outline-none"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    const newQuestions = editingFaq.questions.filter((_, i) => i !== idx);
                                    setEditingFaq({ ...editingFaq, questions: newQuestions.length ? newQuestions : [''] });
                                  }}
                                  className="px-2 py-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                                  title="삭제"
                                >
                                  <Trash className="w-4 h-4" />
                                </button>
                              </div>
                            ))}
                            <button
                              type="button"
                              onClick={() => setEditingFaq({ ...editingFaq, questions: [...editingFaq.questions, ''] })}
                              className="w-full px-3 py-2 text-sm text-gray-500 border border-dashed border-gray-300 rounded-lg hover:bg-gray-50 hover:text-gray-700 transition-colors"
                            >
                              + 질문 추가
                            </button>
                          </div>
                          <p className="text-xs text-gray-400 mt-1">유사표현은 세미콜론(;)으로 구분</p>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-2">답변</label>
                          <textarea
                            value={editingFaq.answer}
                            onChange={(e) =>
                              setEditingFaq({ ...editingFaq, answer: e.target.value })
                            }
                            rows={4}
                            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-1 focus:ring-gray-400 focus:border-gray-400 outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-2">가이드</label>
                          <textarea
                            value={editingFaq.guide || ''}
                            onChange={(e) =>
                              setEditingFaq({ ...editingFaq, guide: e.target.value })
                            }
                            rows={2}
                            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-1 focus:ring-gray-400 focus:border-gray-400 outline-none"
                          />
                        </div>

                        {/* 처리 방식 */}
                        <div>
                          <label className="block text-[13px] font-medium text-gray-400 mb-2">처리</label>
                          <div className="inline-flex bg-gray-100 rounded-full p-0.5">
                            {[
                              { type: 'bot' as const, label: '챗봇' },
                              { type: 'staff' as const, label: '담당자' },
                              { type: 'conditional' as const, label: '조건부' },
                            ].map(({ type, label }) => (
                              <button
                                key={type}
                                type="button"
                                onClick={() => setEditingFaq({
                                  ...editingFaq,
                                  handlerType: type,
                                  handler: type === 'bot' ? 'bot' : type === 'staff' ? 'op' : editingFaq.handler
                                })}
                                className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${
                                  editingFaq.handlerType === type
                                    ? 'bg-white text-gray-900 shadow-sm'
                                    : 'text-gray-500 hover:text-gray-700'
                                }`}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* 담당자 선택 (staff일 때) */}
                        {editingFaq.handlerType === 'staff' && (
                          <div>
                            <label className="block text-[13px] font-medium text-gray-400 mb-1.5">담당자 지정</label>
                            <select
                              value={editingFaq.handler || 'op'}
                              onChange={(e) => setEditingFaq({ ...editingFaq, handler: e.target.value as 'op' | 'manager' })}
                              className="w-full sm:w-1/2 px-3.5 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:ring-1 focus:ring-gray-400 focus:border-gray-400 outline-none"
                            >
                              <option value="op">운영팀</option>
                              <option value="manager">매니저</option>
                            </select>
                          </div>
                        )}

                        {/* 조건 입력 (conditional일 때) */}
                        {editingFaq.handlerType === 'conditional' && (
                          <div>
                            <label className="block text-[13px] font-medium text-gray-400 mb-1.5">전달 조건</label>
                            <textarea
                              value={editingFaq.rule || ''}
                              onChange={(e) => setEditingFaq({ ...editingFaq, rule: e.target.value })}
                              rows={2}
                              placeholder="예: 환불/취소를 원하면 담당자에게 전달"
                              className="w-full px-3.5 py-2 text-sm border border-gray-200 rounded-lg resize-none focus:ring-1 focus:ring-gray-400 focus:border-gray-400 outline-none"
                            />
                            <p className="text-xs text-gray-400 mt-1">
                              조건 미충족 시 챗봇이 응답, 충족 시 담당자에게 전달됩니다
                            </p>
                          </div>
                        )}

                        {/* 태그 (tag_actions) - 멀티셀렉 */}
                        <div>
                          <label className="block text-[13px] font-medium text-gray-400 mb-2">태그</label>
                          <div className="flex flex-wrap gap-2">
                            {['문의', '칭찬', '건의', '불만', '요청', '긴급'].map(tag => (
                              <button
                                key={tag}
                                type="button"
                                onClick={() => {
                                  const currentTags = editingFaq.tags || [];
                                  const newTags = currentTags.includes(tag)
                                    ? currentTags.filter(t => t !== tag)
                                    : [...currentTags, tag];
                                  setEditingFaq({ ...editingFaq, tags: newTags });
                                }}
                                className={`px-3 py-1.5 rounded-full text-xs transition-all ${
                                  (editingFaq.tags || []).includes(tag)
                                    ? 'bg-gray-900 text-white'
                                    : 'text-gray-500 border border-gray-200 hover:border-gray-300 hover:text-gray-700'
                                }`}
                              >
                                {tag}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Topic */}
                        <div>
                          <label className="block text-[13px] font-medium text-gray-400 mb-1.5">주제</label>
                          <select
                            value={editingFaq.topic || ''}
                            onChange={(e) =>
                              setEditingFaq({ ...editingFaq, topic: e.target.value })
                            }
                            className="w-full sm:w-1/2 px-3.5 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:ring-1 focus:ring-gray-400 focus:border-gray-400 outline-none"
                          >
                            <option value="">선택 안함</option>
                            <option value="기본정보">기본정보</option>
                            <option value="이용방법">이용방법</option>
                            <option value="정책/규정">정책/규정</option>
                            <option value="결제/환불">결제/환불</option>
                            <option value="문제/해결">문제/해결</option>
                            <option value="혜택/이벤트">혜택/이벤트</option>
                            <option value="기타">기타</option>
                          </select>
                        </div>
                        <div className="flex justify-end gap-2 pt-2">
                          <button
                            onClick={() => setEditingFaq(null)}
                            className="px-4 py-1.5 text-sm font-medium text-gray-500 hover:text-gray-800 rounded-full"
                          >
                            취소
                          </button>
                          <button
                            onClick={handleSaveFaq}
                            disabled={saving}
                            className="px-4 py-1.5 text-sm font-medium text-white bg-gray-900 rounded-full hover:bg-gray-800 disabled:opacity-50"
                          >
                            {saving ? '저장 중...' : '저장'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      // 보기 모드
                      <>
                        <div className="mt-4">
                          <div className="text-xs font-medium text-gray-500 mb-2">질���</div>
                          <div className="space-y-1">
                            {faq.questions.map((q, idx) => (
                              <div key={idx} className="text-sm text-gray-600 pl-3 border-l-2 border-gray-200">
                                {q}
                              </div>
                            ))}
                          </div>
                        </div>

                        {faq.answer && (
                          <div className="mt-4">
                            <div className="text-xs font-medium text-gray-500 mb-2">답변</div>
                            <div className="text-sm text-gray-600 p-3 bg-white rounded-lg border border-gray-200">
                              {faq.answer}
                            </div>
                          </div>
                        )}

                        {faq.keyData && (
                          <div className="mt-4">
                            <div className="text-xs font-medium text-gray-500 mb-2">Key Data</div>
                            <div className="text-sm text-gray-600 p-3 bg-blue-50 rounded-lg border border-blue-200">
                              {faq.keyData}
                            </div>
                          </div>
                        )}

                        {faq.guide && (
                          <div className="mt-4">
                            <div className="text-xs font-medium text-gray-500 mb-2">가이드</div>
                            <div className="text-sm text-gray-600 p-3 bg-amber-50 rounded-lg border border-amber-200">
                              {faq.guide}
                            </div>
                          </div>
                        )}

                        <div className="mt-4 flex items-center justify-between pt-3 border-t border-gray-200">
                          <div className="text-xs text-gray-400">
                            {faq.vectorUuid && (
                              <span className="font-mono">{faq.vectorUuid}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setEditingFaq({ ...faq, tags: faq.tag_actions || faq.tags || [] })}
                              className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title="수정"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteFaq(faq.id)}
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="삭제"
                            >
                              <Trash className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* 템플릿 목록 탭 */}
      {activeTab === 'templates' && (
        <div className="space-y-3">
          {templates.length === 0 ? (
            <div className="text-center py-10">
              <Database className="w-12 h-12 mx-auto text-gray-300 mb-4" />
              <p className="text-gray-500 mb-2">등록된 질문 템플릿이 없습니다.</p>
              <p className="text-sm text-gray-400">
                설정 &gt; 벡터 템플릿에서 질문 매핑을 먼저 설정해주세요.
              </p>
            </div>
          ) : (
            templates.map((template) => {
              // 이 템플릿으로 생성된 FAQ 찾기
              const linkedFaq = activeFaqs.find(f => f.templateId === template.id);

              return (
                <div
                  key={template.id}
                  className="border border-gray-200 rounded-xl overflow-hidden"
                >
                  <button
                    onClick={() => setExpandedId(expandedId === template.id ? null : template.id)}
                    className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${linkedFaq ? 'bg-green-500' : 'bg-gray-300'}`} />
                      <div className="text-left">
                        <div className="text-sm font-medium text-gray-700">
                          {template.questions[0] || '(질문 없음)'}
                        </div>
                        <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-2">
                          {template.keyDataSources.map((source, idx) => (
                            <span
                              key={idx}
                              className={source.type === 'storeinfo' ? 'text-green-600' : 'text-blue-600'}
                            >
                              {source.type === 'storeinfo' ? '📍' : '📊'}
                              {source.type === 'storeinfo'
                                ? source.sectionIds?.map(s => STOREINFO_SECTIONS[s]?.label || s).join(', ')
                                : `${TOPICS[source.topic || '']?.name || source.topic}(${source.facets?.length || 0})`}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <NavArrowRight
                      className={`w-5 h-5 text-gray-400 transition-transform ${expandedId === template.id ? 'rotate-90' : ''}`}
                    />
                  </button>

                  {expandedId === template.id && (
                    <div className="px-4 pb-4 border-t border-gray-100 bg-gray-50/50">
                      <div className="mt-4">
                        <div className="text-xs font-medium text-gray-500 mb-2">예상 질문</div>
                        <div className="space-y-1">
                          {template.questions.map((q, idx) => (
                            <div key={idx} className="text-sm text-gray-600 pl-3 border-l-2 border-gray-200">
                              {q}
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="mt-4">
                        <div className="text-xs font-medium text-gray-500 mb-2">데이터 소스</div>
                        <div className="flex flex-wrap gap-2">
                          {template.keyDataSources.map((source, idx) => (
                            <div
                              key={idx}
                              className={`px-2 py-1 text-xs rounded-lg ${
                                source.type === 'storeinfo'
                                  ? 'bg-green-50 text-green-700 border border-green-200'
                                  : 'bg-blue-50 text-blue-700 border border-blue-200'
                              }`}
                            >
                              {source.type === 'storeinfo' ? (
                                <>📍 매장정보: {source.sectionIds?.map(s => STOREINFO_SECTIONS[s]?.label || s).join(', ')}</>
                              ) : (
                                <>📊 {TOPICS[source.topic || '']?.name || source.topic}: {source.facets?.map(f => FACETS[f]?.label || f).join(', ')}</>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="mt-4 flex items-center justify-between pt-3 border-t border-gray-200">
                        <div className="text-xs text-gray-400">
                          {linkedFaq ? (
                            <span className="text-green-600 flex items-center gap-1">
                              <Check className="w-3 h-3" />
                              FAQ 생성됨
                            </span>
                          ) : (
                            '아직 동기화되지 않음'
                          )}
                        </div>
                        <button
                          onClick={() => handleSyncTemplate(template.id)}
                          disabled={syncingTemplateId === template.id}
                          className="px-3 py-1 text-xs font-medium text-blue-600 border border-blue-300 rounded-lg hover:bg-blue-50 transition-colors disabled:opacity-50"
                        >
                          {syncingTemplateId === template.id ? (
                            <RefreshDouble className="w-3 h-3 animate-spin inline mr-1" />
                          ) : null}
                          동기화
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}