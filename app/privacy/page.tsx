'use client';

import { useState, useEffect } from 'react';
import { NavArrowLeft } from 'iconoir-react';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';

interface HistoryItem {
  id: string;
  content: string;
  publishedAt: string;
  effectiveDate: string | null;
  version: number;
  privacyPolicy?: string;
}

export default function PrivacyPage() {
  const [currentContent, setCurrentContent] = useState<string>('');
  const [currentEffectiveDate, setCurrentEffectiveDate] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewingHistory, setViewingHistory] = useState<HistoryItem | null>(null);

  useEffect(() => {
    const fetchTerms = async () => {
      try {
        const response = await fetch('/api/terms');
        if (response.ok) {
          const data = await response.json();
          setCurrentContent(data.privacyPolicy);
          setCurrentEffectiveDate(data.privacyEffectiveDate);
          setHistory(data.privacyHistory || []);
        }
      } catch (error) {
        console.error('Failed to load privacy policy:', error);
        setCurrentContent('내용을 불러오는데 실패했습니다.');
      } finally {
        setLoading(false);
      }
    };

    fetchTerms();
  }, []);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    if (typeof dateStr === 'string' && dateStr.includes('년')) return dateStr;
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
  };

  const displayContent = viewingHistory
    ? (viewingHistory.content || viewingHistory.privacyPolicy || '')
    : currentContent;

  const getHistoryEffectiveDate = (item: HistoryItem) => {
    if (item.effectiveDate) {
      if (typeof item.effectiveDate === 'string' && item.effectiveDate.includes('년')) {
        return item.effectiveDate;
      }
      return formatDate(item.effectiveDate);
    }
    return formatDate(item.publishedAt);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="mb-6">
          <Link href="/" className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
            ← 돌아가기
          </Link>
        </div>

        <div className="bg-white rounded-xl shadow-sm border">
          <div className="p-6 border-b">
            <div className="flex items-center gap-2">
              {viewingHistory && (
                <button
                  onClick={() => setViewingHistory(null)}
                  className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
                  title="현재 방침으로 돌아가기"
                >
                  <NavArrowLeft width={20} height={20} strokeWidth={1.5} />
                </button>
              )}
              <h1 className="text-xl font-bold">
                개인정보처리방침
                {viewingHistory && (
                  <span className="text-sm font-normal text-gray-500 ml-2">
                    (v{viewingHistory.version})
                  </span>
                )}
              </h1>
            </div>
            {!viewingHistory && currentEffectiveDate && (
              <p className="text-sm text-gray-500 mt-1">시행일: {formatDate(currentEffectiveDate)}</p>
            )}
          </div>

          <div className="p-6 text-sm text-gray-700">
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

                {!viewingHistory && history.length > 0 && (
                  <div className="mt-8 pt-6 border-t border-gray-200">
                    <h3 className="text-sm font-semibold text-gray-600 mb-3">과거 방침 보기</h3>
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
        </div>
      </div>
    </div>
  );
}
