'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { RefreshDouble, Plus, Trash } from 'iconoir-react';
import Spinner from '@/components/admin/Spinner';
import CsFaqFilters, { type FaqFilters } from '@/components/admin/cs-data/CsFaqFilters';
import CsFaqTable, { type CsFaq, type TenantOption, faqKey } from '@/components/admin/cs-data/CsFaqTable';
import CsFaqAddModal, { type FaqAddData } from '@/components/admin/cs-data/CsFaqAddModal';

// ═══════════════════════════════════════════════════════════
// 타입 (TenantOption은 CsFaqTable에서 import)
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════
// 메인 페이지
// ═══════════════════════════════════════════════════════════

const PAGE_SIZE = 50;

// 같은 질문(첫 번째 질문 기준)을 가진 FAQ를 하나의 행으로 그룹핑
// → 매장 멀티셀렉에서 매장 추가/제거 시 중복 행 방지
function groupFaqs(rawFaqs: CsFaq[]): CsFaq[] {
  const map = new Map<string, CsFaq[]>();
  for (const faq of rawFaqs) {
    const key = faq.questions[0]?.trim().toLowerCase() || faq.id;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(faq);
  }
  return Array.from(map.values()).map(members => ({
    ...members[0],
    _groupTenantIds: members.map(f => f.tenantId),
  }));
}

export default function CsDataFaqsPage() {
  // 데이터 상태
  const [faqs, setFaqs] = useState<CsFaq[]>([]);
  const [tenants, setTenants] = useState<TenantOption[]>([]); // branchNo 포함
  const [loading, setLoading] = useState(true);

  // 필터 상태
  const [filters, setFilters] = useState<FaqFilters>({
    tenantId: null,
    source: null,
    topic: null,
    handler: null,
    search: '',
  });

  // 커서 페이지네이션
  const [cursors, setCursors] = useState<string[]>([]); // 이전 페이지 커서 스택
  const [currentCursor, setCurrentCursor] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  // 편집 상태
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set());
  const [syncingDirty, setSyncingDirty] = useState(false);

  // 벌크 선택
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<string | null>(null);

  // 매장 멀티셀렉 pending (로컬에서 변경 → 배치 반영)
  const [pendingTenantChanges, setPendingTenantChanges] = useState<
    Map<string, { add: Set<string>; remove: Set<string> }>
  >(new Map());
  const [applyingTenantChanges, setApplyingTenantChanges] = useState(false);

  // 모달
  const [addModalOpen, setAddModalOpen] = useState(false);

  // ── 데이터 로드 ──
  const fetchData = useCallback(async (cursor?: string | null) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('limit', String(PAGE_SIZE));
      if (cursor) params.set('cursor', cursor);
      if (filters.tenantId) params.set('tenantId', filters.tenantId);
      if (filters.source) params.set('source', filters.source);
      if (filters.topic) params.set('topic', filters.topic);
      if (filters.handler) params.set('handler', filters.handler);
      if (filters.search) params.set('search', filters.search);

      const res = await fetch(`/api/admin/cs-data/faqs?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();

      setFaqs(data.faqs || []);
      setHasMore(data.hasMore || false);
      setNextCursor(data.nextCursor || null);
      if (data.tenants) setTenants(data.tenants);
      setSelectedIds(new Set());
    } catch (error) {
      console.error('Failed to fetch FAQ data:', error);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  // 필터/페이지 변경 시 다시 로드
  useEffect(() => {
    setCursors([]);
    setCurrentCursor(null);
    fetchData(null);
  }, [filters]);

  // 같은 질문을 가진 FAQ를 하나의 행으로 그룹핑 (중복 행 방지)
  const groupedFaqs = useMemo(() => groupFaqs(faqs), [faqs]);

  // ── 페이지네이션 ──
  const goNextPage = () => {
    if (!nextCursor) return;
    setCursors(prev => [...prev, currentCursor || '']);
    setCurrentCursor(nextCursor);
    fetchData(nextCursor);
  };

  const goPrevPage = () => {
    if (cursors.length === 0) return;
    const prevCursors = [...cursors];
    const prevCursor = prevCursors.pop() || null;
    setCursors(prevCursors);
    setCurrentCursor(prevCursor);
    fetchData(prevCursor || null);
  };

  const goFirstPage = () => {
    setCursors([]);
    setCurrentCursor(null);
    fetchData(null);
  };

  const currentPage = cursors.length + 1;

  // ── 인라인 셀 편집 ──
  const handleCellEdit = useCallback((faqId: string, tenantId: string, updates: Partial<CsFaq>) => {
    let allDirtyKeys: string[] = [];

    setFaqs(prev => {
      const editedFaq = prev.find(f => f.id === faqId && f.tenantId === tenantId);
      if (!editedFaq) return prev;

      // 같은 질문을 가진 모든 FAQ를 찾아 일괄 수정 (그룹 내 모든 매장 반영)
      const qKey = editedFaq.questions[0]?.trim().toLowerCase();
      const linkedKeys = qKey
        ? prev.filter(f => f.questions[0]?.trim().toLowerCase() === qKey).map(f => faqKey(f))
        : [faqKey(editedFaq)];

      allDirtyKeys = linkedKeys;

      return prev.map(faq =>
        linkedKeys.includes(faqKey(faq)) ? { ...faq, ...updates } : faq
      );
    });

    setDirtyIds(prev => {
      const next = new Set(prev);
      for (const key of allDirtyKeys) next.add(key);
      return next;
    });
  }, []);

  // ── 변경된 행 일괄 동기화 ──
  const handleSyncDirty = async () => {
    if (dirtyIds.size === 0) return;
    setSyncingDirty(true);
    try {
      const dirtyFaqs = faqs.filter(f => dirtyIds.has(faqKey(f)));
      const results = await Promise.all(
        dirtyFaqs.map(faq =>
          fetch(`/api/admin/cs-data/faqs/${faq.id}?tenantId=${faq.tenantId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
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
      fetchData(currentCursor);
    } catch (error) {
      console.error('Sync dirty failed:', error);
      alert('동기화 중 오류가 발생했습니다.');
    } finally {
      setSyncingDirty(false);
    }
  };

  // ── FAQ 삭제 ──
  const handleDeleteFaq = async (faqId: string, tenantId: string) => {
    if (!confirm('이 FAQ를 삭제하시겠습니까?')) return;
    const compositeKey = `${tenantId}_${faqId}`;
    try {
      const res = await fetch(`/api/admin/cs-data/faqs/${faqId}?tenantId=${tenantId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setFaqs(prev => prev.filter(f => faqKey(f) !== compositeKey));
        setDirtyIds(prev => {
          const next = new Set(prev);
          next.delete(compositeKey);
          return next;
        });
        setSelectedIds(prev => {
          const next = new Set(prev);
          next.delete(compositeKey);
          return next;
        });
      } else {
        const data = await res.json();
        alert(`삭제 실패: ${data.error}`);
      }
    } catch {
      alert('삭제 중 오류가 발생했습니다.');
    }
  };

  // ── FAQ 추가 ──
  const handleAddFaq = async (data: FaqAddData) => {
    const res = await fetch('/api/admin/cs-data/faqs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error);
    alert(result.message);
    fetchData(currentCursor);
  };

  // ── 매장 멀티셀렉: 로컬 토글 (즉시 API 호출 X → pending에 누적) ──
  const handleTenantToggle = useCallback((faq: CsFaq, tenantId: string, action: 'add' | 'remove') => {
    const qKey = faq.questions[0]?.trim().toLowerCase() || '';
    setPendingTenantChanges(prev => {
      const next = new Map(prev);
      const existing = next.get(qKey) || { add: new Set<string>(), remove: new Set<string>() };
      const updated = { add: new Set(existing.add), remove: new Set(existing.remove) };

      if (action === 'add') {
        if (updated.remove.has(tenantId)) {
          updated.remove.delete(tenantId); // 삭제 예정이었던 것 취소
        } else {
          updated.add.add(tenantId);
        }
      } else {
        if (updated.add.has(tenantId)) {
          updated.add.delete(tenantId); // 추가 예정이었던 것 취소
        } else {
          updated.remove.add(tenantId);
        }
      }

      if (updated.add.size === 0 && updated.remove.size === 0) {
        next.delete(qKey);
      } else {
        next.set(qKey, updated);
      }
      return next;
    });
  }, []);

  // ── 매장 변경 배치 반영 ──
  const totalPendingTenantChanges = useMemo(() =>
    Array.from(pendingTenantChanges.values()).reduce(
      (sum, { add, remove }) => sum + add.size + remove.size, 0
    ), [pendingTenantChanges]);

  const handleApplyTenantChanges = async () => {
    if (pendingTenantChanges.size === 0) return;
    setApplyingTenantChanges(true);
    try {
      const allOps: Promise<Response>[] = [];

      for (const [qKey, { add, remove }] of pendingTenantChanges) {
        const sourceFaq = faqs.find(f => f.questions[0]?.trim().toLowerCase() === qKey);
        if (!sourceFaq) continue;

        // 추가: 한 번의 POST로 여러 매장에 생성
        if (add.size > 0) {
          allOps.push(
            fetch('/api/admin/cs-data/faqs', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                tenantIds: Array.from(add),
                questions: sourceFaq.questions,
                answer: sourceFaq.answer,
                guide: sourceFaq.guide || '',
                topic: sourceFaq.topic || '',
                tags: sourceFaq.tags || [],
                action_product: sourceFaq.action_product || null,
                action: sourceFaq.action || null,
                handlerType: sourceFaq.handlerType || 'bot',
                handler: sourceFaq.handler || 'bot',
                rule: sourceFaq.rule || '',
                skipExpander: true,
              }),
            })
          );
        }

        // 삭제: 각 매장별 FAQ 문서 찾아서 DELETE
        for (const tenantId of remove) {
          const targetFaq = faqs.find(f =>
            f.tenantId === tenantId && f.questions[0]?.trim().toLowerCase() === qKey
          );
          if (targetFaq) {
            allOps.push(
              fetch(`/api/admin/cs-data/faqs/${targetFaq.id}?tenantId=${tenantId}`, {
                method: 'DELETE',
              })
            );
          }
        }
      }

      const results = await Promise.all(allOps);
      const failed = results.filter(r => !r.ok);
      if (failed.length > 0) {
        alert(`${allOps.length}건 중 ${failed.length}건 실패`);
      }
      setPendingTenantChanges(new Map());
      fetchData(currentCursor);
    } catch {
      alert('매장 변경 반영 중 오류가 발생했습니다.');
    } finally {
      setApplyingTenantChanges(false);
    }
  };

  // ── 벌크 작업 ──
  const handleBulkAction = async (action: string, value?: string) => {
    const selectedFaqs = faqs.filter(f => selectedIds.has(faqKey(f)));
    if (selectedFaqs.length === 0) return;

    if (action === 'delete') {
      if (!confirm(`${selectedFaqs.length}건의 FAQ���� 삭��하시겠습니까?`)) return;
      const results = await Promise.all(
        selectedFaqs.map(faq =>
          fetch(`/api/admin/cs-data/faqs/${faq.id}?tenantId=${faq.tenantId}`, { method: 'DELETE' })
        )
      );
      const failed = results.filter(r => !r.ok);
      if (failed.length > 0) {
        alert(`${selectedFaqs.length}건 중 ${failed.length}건 삭제 실패`);
      }
      setSelectedIds(new Set());
      fetchData(currentCursor);
      return;
    }

    if (action === 'handler' && value) {
      const results = await Promise.all(
        selectedFaqs.map(faq =>
          fetch(`/api/admin/cs-data/faqs/${faq.id}?tenantId=${faq.tenantId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              updates: value === 'bot'
                ? { handlerType: 'bot', handler: 'bot', rule: '' }
                : { handlerType: 'staff', handler: value },
            }),
          })
        )
      );
      const failed = results.filter(r => !r.ok);
      if (failed.length > 0) {
        alert(`${selectedFaqs.length}건 중 ${failed.length}건 변경 실패`);
      }
      setSelectedIds(new Set());
      fetchData(currentCursor);
      return;
    }

    if (action === 'topic' && value) {
      const results = await Promise.all(
        selectedFaqs.map(faq =>
          fetch(`/api/admin/cs-data/faqs/${faq.id}?tenantId=${faq.tenantId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ updates: { topic: value } }),
          })
        )
      );
      const failed = results.filter(r => !r.ok);
      if (failed.length > 0) {
        alert(`${selectedFaqs.length}건 중 ${failed.length}건 변경 실패`);
      }
      setSelectedIds(new Set());
      fetchData(currentCursor);
    }
  };

  // ── 선택 핸들러 ──
  const handleSelectToggle = (faqId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(faqId)) next.delete(faqId);
      else next.add(faqId);
      return next;
    });
  };

  const handleSelectAll = (ids: string[]) => {
    setSelectedIds(new Set(ids));
  };

  const handleDeselectAll = () => {
    setSelectedIds(new Set());
  };

  // ── 로딩 ──
  if (loading && faqs.length === 0) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-bold text-gray-900 mb-6">CS 데이터 &gt; FAQ 관리</h1>
        <div className="flex items-center justify-center py-20">
          <Spinner size="lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">CS 데이터 &gt; FAQ 관리</h1>
        <div className="flex items-center gap-2">
          {totalPendingTenantChanges > 0 && (
            <button
              onClick={handleApplyTenantChanges}
              disabled={applyingTenantChanges}
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50"
            >
              <RefreshDouble className={`w-4 h-4 ${applyingTenantChanges ? 'animate-spin' : ''}`} />
              {applyingTenantChanges ? '반영 중...' : `매장 변경 ${totalPendingTenantChanges}건 반영`}
            </button>
          )}
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
            onClick={() => setAddModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800 transition-colors"
          >
            <Plus className="w-4 h-4" />
            FAQ 추가
          </button>
        </div>
      </div>

      {/* 필터바 */}
      <CsFaqFilters
        filters={filters}
        onFiltersChange={setFilters}
        tenants={tenants}
      />

      {/* 벌크 액션바 */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg">
          <span className="text-sm font-medium text-gray-700">{selectedIds.size}건 선택됨</span>
          <div className="flex items-center gap-2 ml-auto">
            <select
              value={bulkAction || ''}
              onChange={(e) => {
                const val = e.target.value;
                if (val.startsWith('handler:')) {
                  handleBulkAction('handler', val.split(':')[1]);
                } else if (val.startsWith('topic:')) {
                  handleBulkAction('topic', val.split(':')[1]);
                }
                setBulkAction(null);
              }}
              className="px-2 py-1 text-sm border border-gray-200 rounded-lg outline-none"
            >
              <option value="">일괄 변경...</option>
              <optgroup label="handler 변경">
                <option value="handler:bot">AI 답변</option>
                <option value="handler:op">운영</option>
                <option value="handler:manager">현장</option>
              </optgroup>
              <optgroup label="topic 변경">
                <option value="topic:매장/운영">매장/운영</option>
                <option value="topic:공간/환경">공간/환경</option>
                <option value="topic:좌석/룸">좌석/룸</option>
                <option value="topic:시설/비품">시설/비품</option>
                <option value="topic:상품/서비스">상품/서비스</option>
                <option value="topic:정책/규정">정책/규정</option>
                <option value="topic:결제/환불">결제/환불</option>
                <option value="topic:문제/해결">문제/해결</option>
                <option value="topic:혜택/이벤트">혜택/이벤트</option>
                <option value="topic:기타">기타</option>
              </optgroup>
            </select>
            <button
              onClick={() => handleBulkAction('delete')}
              className="flex items-center gap-1.5 px-3 py-1 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
            >
              <Trash className="w-3.5 h-3.5" />
              일괄 삭제
            </button>
          </div>
        </div>
      )}

      {/* 결과 통계 */}
      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>{groupedFaqs.length}건 표시 (페이지 {currentPage})</span>
        {loading && <Spinner size="sm" />}
      </div>

      {/* 테이블 */}
      <CsFaqTable
        faqs={groupedFaqs}
        tenants={tenants}
        onCellEdit={handleCellEdit}
        onDelete={handleDeleteFaq}
        onTenantToggle={handleTenantToggle}
        pendingTenantChanges={pendingTenantChanges}
        dirtyIds={dirtyIds}
        selectedIds={selectedIds}
        onSelectToggle={handleSelectToggle}
        onSelectAll={handleSelectAll}
        onDeselectAll={handleDeselectAll}
      />

      {/* 커서 기반 페이지네이션 */}
      <div className="flex items-center justify-center gap-2 pt-2">
        <button
          onClick={goFirstPage}
          disabled={currentPage === 1}
          className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          처음
        </button>
        <button
          onClick={goPrevPage}
          disabled={currentPage === 1}
          className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          이전
        </button>
        <span className="px-3 py-1.5 text-sm font-medium text-gray-700">
          {currentPage} 페이지
        </span>
        <button
          onClick={goNextPage}
          disabled={!hasMore}
          className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          다음
        </button>
      </div>

      {/* FAQ 추가 모달 */}
      <CsFaqAddModal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onSubmit={handleAddFaq}
        tenants={tenants}
      />
    </div>
  );
}