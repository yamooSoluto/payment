'use client';

import { useState, useEffect } from 'react';
import { Xmark, NavArrowLeft } from 'iconoir-react';
import { Loader2 } from 'lucide-react';

interface HistoryItem {
  id: string;
  content: string;
  publishedAt: string;
  effectiveDate: string | null;
  version: number;
  // 하위 호환
  termsOfService?: string;
  privacyPolicy?: string;
}

interface DynamicTermsModalProps {
  type: 'terms' | 'privacy';
  onClose: () => void;
}

export default function DynamicTermsModal({ type, onClose }: DynamicTermsModalProps) {
  const [currentContent, setCurrentContent] = useState<string>('');
  const [currentEffectiveDate, setCurrentEffectiveDate] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewingHistory, setViewingHistory] = useState<HistoryItem | null>(null);

  const baseTitle = type === 'terms' ? 'YAMOO 서비스이용약관' : '개인정보처리방침';

  useEffect(() => {
    const fetchTerms = async () => {
      try {
        const response = await fetch('/api/terms');
        if (response.ok) {
          const data = await response.json();
          setCurrentContent(type === 'terms' ? data.termsOfService : data.privacyPolicy);
          setCurrentEffectiveDate(type === 'terms' ? data.termsEffectiveDate : data.privacyEffectiveDate);
          // 새 구조의 히스토리 사용
          const historyData = type === 'terms' ? data.termsHistory : data.privacyHistory;
          setHistory(historyData || []);
        }
      } catch (error) {
        console.error('Failed to load terms:', error);
        setCurrentContent('내용을 불러오는데 실패했습니다.');
      } finally {
        setLoading(false);
      }
    };

    fetchTerms();
  }, [type]);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
  };

  const displayContent = viewingHistory
    ? (viewingHistory.content || viewingHistory.termsOfService || viewingHistory.privacyPolicy || '')
    : currentContent;

  // 히스토리 항목의 시행일 포맷
  const getHistoryEffectiveDate = (item: HistoryItem) => {
    if (item.effectiveDate) {
      // effectiveDate가 이미 포맷된 문자열인 경우
      if (typeof item.effectiveDate === 'string' && item.effectiveDate.includes('년')) {
        return item.effectiveDate;
      }
      return formatDate(item.effectiveDate);
    }
    return formatDate(item.publishedAt);
  };

  const title = baseTitle;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="bg-white rounded-xl max-w-3xl w-full mx-4 max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center gap-2">
            {viewingHistory && (
              <button
                onClick={() => setViewingHistory(null)}
                className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
                title="현재 약관으로 돌아가기"
              >
                <NavArrowLeft width={20} height={20} strokeWidth={1.5} />
              </button>
            )}
            <h2 className="text-xl font-bold">{title}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <Xmark width={20} height={20} strokeWidth={1.5} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto text-sm text-gray-700 flex-1">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
            </div>
          ) : (
            <>
              <div
                className="prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: displayContent }}
              />

              {/* 과거 약관 목록 - 현재 약관 보기 상태일 때만 표시 */}
              {!viewingHistory && history.length > 0 && (
                <div className="mt-8 pt-6 border-t border-gray-200">
                  <h3 className="text-sm font-semibold text-gray-600 mb-3">과거 약관 보기</h3>
                  <ul className="space-y-2">
                    {history.map((item) => (
                      <li key={item.id}>
                        <button
                          onClick={() => setViewingHistory(item)}
                          className="text-sm text-yamoo-dark hover:underline"
                        >
                          v{item.version} - {getHistoryEffectiveDate(item)} 시행
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>

        <div className="p-6 border-t">
          <button onClick={onClose} className="btn-primary w-full">
            확인
          </button>
        </div>
      </div>
    </div>
  );
}
