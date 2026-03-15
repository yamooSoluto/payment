'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  RefreshDouble,
  Check,
} from 'iconoir-react';
import Spinner from '@/components/admin/Spinner';
import FaqTable from './FaqTable';

// ═══════════════════════════════════════════════════════════
// 타입 정의
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

interface FaqTabProps {
  tenantId: string;
}

// ═══════════════════════════════════════════════════════════
// 메인 컴포넌트
// ═══════════════════════════════════════════════════════════

export default function FaqTab({ tenantId }: FaqTabProps) {
  const [loading, setLoading] = useState(true);
  const [localFaqs, setLocalFaqs] = useState<TenantFaq[]>([]);
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set());
  const [syncingDirty, setSyncingDirty] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // 데이터 로드
  useEffect(() => {
    fetchData();
  }, [tenantId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const faqsRes = await fetch(`/api/admin/tenants/${tenantId}/faqs`);
      if (faqsRes.ok) {
        const data = await faqsRes.json();
        setLocalFaqs(data.faqs || []);
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
                intent: faq.intent,
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
          <span className="text-sm font-medium text-gray-700">
            등록된 FAQ ({activeFaqs.length})
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* 변경사항 저장 버튼 */}
          {dirtyIds.size > 0 && (
            <button
              onClick={handleSyncDirty}
              disabled={syncingDirty}
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {syncingDirty ? (
                <RefreshDouble className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              {syncingDirty ? '저장 중...' : `${dirtyIds.size}건 변경됨 — 저장`}
            </button>
          )}

          {/* 새로고침 */}
          <button
            onClick={fetchData}
            disabled={loading}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
            title="새로고침"
          >
            <RefreshDouble className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* FAQ 목록 */}
      <FaqTable
        faqs={activeFaqs}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onCellEdit={handleCellEdit}
        onDelete={handleDeleteFaq}
        dirtyIds={dirtyIds}
      />
    </div>
  );
}
