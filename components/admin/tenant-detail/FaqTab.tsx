'use client';

import { useState, useEffect, useCallback } from 'react';
import useSWR from 'swr';
import {
  Database,
  NavArrowRight,
  RefreshDouble,
  Check,
} from 'iconoir-react';
import Spinner from '@/components/admin/Spinner';
import FaqTable from './FaqTable';

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
  answerRaw?: string;
  questionsRaw?: string[];
  guide?: string;
  keyData?: string;
  handlerType?: 'bot' | 'staff' | 'conditional';
  handler?: 'bot' | 'op' | 'manager';
  rule?: string;
  tags?: string[];
  topic?: string;
  tag_actions?: string[];
  action_product?: string | null;  // ticket|room|locker|seat|shop|reservation|null
  action?: string | null;          // change|cancel|refund|extend|transfer|check|issue|null
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
// ═══════════════════════════════════════════════════════════

export default function FaqTab({ tenantId }: FaqTabProps) {
  // 스키마 동적 로드
  const { data: schema } = useSWR<SchemaData>(
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
  const [localFaqs, setLocalFaqs] = useState<TenantFaq[]>([]);
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set());
  const [syncing, setSyncing] = useState(false);
  const [syncingDirty, setSyncingDirty] = useState(false);
  const [syncingTemplateId, setSyncingTemplateId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // 데이터 로드
  useEffect(() => {
    fetchData();
  }, [tenantId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const templatesRes = await fetch('/api/admin/vector-templates');
      if (templatesRes.ok) {
        const data = await templatesRes.json();
        setTemplates(data.templates || []);
      }

      const faqsRes = await fetch(`/api/admin/tenants/${tenantId}/faqs`);
      if (faqsRes.ok) {
        const data = await faqsRes.json();
        // tags가 비어있으면 tag_actions(AI 확장 결과)를 fallback으로 사용
        const normalized = (data.faqs || []).map((f: TenantFaq) => ({
          ...f,
          tags: (f.tags && f.tags.length > 0) ? f.tags : (f.tag_actions || []),
        }));
        setLocalFaqs(normalized);
        setDirtyIds(new Set());
      }
    } catch (error) {
      console.error('Failed to fetch FAQ data:', error);
    } finally {
      setLoading(false);
    }
  };

  // ── 인라인 셀 수정 ──
  const handleCellEdit = useCallback((faqId: string, updates: Partial<TenantFaq>) => {
    setLocalFaqs(prev => prev.map(faq =>
      faq.id === faqId ? { ...faq, ...updates } : faq
    ));
    setDirtyIds(prev => new Set(prev).add(faqId));
  }, []);

  // ── 변경된 행 일괄 동기화 ──
  const handleSyncDirty = async () => {
    if (dirtyIds.size === 0) return;
    setSyncingDirty(true);
    try {
      const dirtyFaqs = localFaqs.filter(f => dirtyIds.has(f.id));
      const results = await Promise.all(
        dirtyFaqs.map(faq =>
          fetch(`/api/admin/tenants/${tenantId}/faqs`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              faqId: faq.id,
              updates: {
                questions: faq.questions,
                answer: faq.answer,
                guide: faq.guide,
                handlerType: faq.handlerType,
                handler: faq.handler,
                rule: faq.rule,
                tags: faq.tags,
                topic: faq.topic,
                tag_actions: faq.tags,
                action_product: faq.action_product,
                action: faq.action,
              },
            }),
          })
        )
      );

      const failed = results.filter(r => !r.ok);
      if (failed.length > 0) {
        alert(`${dirtyFaqs.length}건 중 ${failed.length}건 저장 실패`);
      }

      setDirtyIds(new Set());
      fetchData();
    } catch (error) {
      console.error('Sync dirty failed:', error);
      alert('동기화 중 오류가 발생했습니다.');
    } finally {
      setSyncingDirty(false);
    }
  };

  // ── 전체 동기화 (템플릿 기반) ──
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

  // ── 단일 템플릿 동기화 ──
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

  // ── FAQ 삭제 ──
  const handleDeleteFaq = async (faqId: string) => {
    if (!confirm('이 FAQ를 삭제하시겠습니까?')) return;

    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}/faqs?faqId=${faqId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setLocalFaqs(prev => prev.filter(f => f.id !== faqId));
        setDirtyIds(prev => {
          const next = new Set(prev);
          next.delete(faqId);
          return next;
        });
      } else {
        const data = await res.json();
        alert(`삭제 실패: ${data.error}`);
      }
    } catch (error) {
      console.error('Delete FAQ failed:', error);
      alert('삭제 중 오류가 발생했습니다.');
    }
  };

  // 로딩 상태
  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Spinner size="lg" />
      </div>
    );
  }

  // 활성 FAQ만
  const activeFaqs = localFaqs.filter(f => f.isActive !== false);

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

        <div className="flex items-center gap-2">
          {/* 변경사항 동기화 버튼 */}
          {dirtyIds.size > 0 && (
            <button
              onClick={handleSyncDirty}
              disabled={syncingDirty}
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              <RefreshDouble className={`w-4 h-4 ${syncingDirty ? 'animate-spin' : ''}`} />
              {syncingDirty ? '저장 중...' : `${dirtyIds.size}건 변경됨 — 동기화`}
            </button>
          )}

          <button
            onClick={handleSyncAll}
            disabled={syncing}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-blue-600 border border-blue-300 rounded-lg hover:bg-blue-50 transition-colors disabled:opacity-50"
          >
            <RefreshDouble className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            전체 동기화
          </button>
        </div>
      </div>

      {/* FAQ 목록 탭 */}
      {activeTab === 'faqs' && (
        <FaqTable
          faqs={activeFaqs}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onCellEdit={handleCellEdit}
          onDelete={handleDeleteFaq}
          dirtyIds={dirtyIds}
        />
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
                                <>���� {TOPICS[source.topic || '']?.name || source.topic}: {source.facets?.map(f => FACETS[f]?.label || f).join(', ')}</>
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
