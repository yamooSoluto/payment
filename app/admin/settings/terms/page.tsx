'use client';

import { useState, useEffect, useCallback } from 'react';
import { Page, Check, Eye, Xmark, Clock, Calendar, Trash } from 'iconoir-react';
import { Loader2 } from 'lucide-react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import TextAlign from '@tiptap/extension-text-align';

type TabType = 'terms' | 'privacy';

interface PublishedInfo {
  content: string;
  publishedAt: string | null;
  publishedBy: string | null;
  version: number;
  effectiveDate: string | null;
}

interface HistoryItem {
  id: string;
  content: string;
  publishedAt: string;
  publishedBy: string;
  version: number;
  effectiveDate: string | null;
}

function EditorToolbar({ editor }: { editor: ReturnType<typeof useEditor> | null }) {
  if (!editor) return null;

  return (
    <div className="flex flex-wrap gap-1 p-2 border-b border-gray-200 bg-gray-50">
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        className={`px-2 py-1 text-sm rounded ${editor.isActive('heading', { level: 2 }) ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-200'
          }`}
        title="제목"
      >
        H2
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        className={`px-2 py-1 text-sm rounded ${editor.isActive('heading', { level: 3 }) ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-200'
          }`}
        title="소제목"
      >
        H3
      </button>
      <div className="w-px bg-gray-300 mx-1" />
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={`px-2 py-1 text-sm font-bold rounded ${editor.isActive('bold') ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-200'
          }`}
        title="굵게"
      >
        B
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={`px-2 py-1 text-sm italic rounded ${editor.isActive('italic') ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-200'
          }`}
        title="기울임"
      >
        I
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        className={`px-2 py-1 text-sm underline rounded ${editor.isActive('underline') ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-200'
          }`}
        title="밑줄"
      >
        U
      </button>
      <div className="w-px bg-gray-300 mx-1" />
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        className={`px-2 py-1 text-sm rounded ${editor.isActive('bulletList') ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-200'
          }`}
        title="글머리 기호"
      >
        • 목록
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        className={`px-2 py-1 text-sm rounded ${editor.isActive('orderedList') ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-200'
          }`}
        title="번호 목록"
      >
        1. 목록
      </button>
      <div className="w-px bg-gray-300 mx-1" />
      <button
        type="button"
        onClick={() => editor.chain().focus().setTextAlign('left').run()}
        className={`px-2 py-1 text-sm rounded ${editor.isActive({ textAlign: 'left' }) ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-200'
          }`}
        title="왼쪽 정렬"
      >
        ◀
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().setTextAlign('center').run()}
        className={`px-2 py-1 text-sm rounded ${editor.isActive({ textAlign: 'center' }) ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-200'
          }`}
        title="가운데 정렬"
      >
        ◆
      </button>
    </div>
  );
}

function PreviewModal({
  type,
  content,
  effectiveDate,
  title,
  onClose
}: {
  type: 'terms' | 'privacy';
  content: string;
  effectiveDate?: string | null;
  title?: string;
  onClose: () => void;
}) {
  const defaultTitle = type === 'terms' ? 'YAMOO 서비스이용약관' : '개인정보처리방침';

  // 시행일 포맷
  const formatEffectiveDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    return date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formattedDate = formatEffectiveDate(effectiveDate);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="bg-white rounded-xl max-w-3xl w-full mx-4 max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-xl font-bold">{title || defaultTitle}</h2>
            {formattedDate && (
              <p className="text-sm text-gray-500 mt-1">시행일: {formattedDate}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <Xmark width={20} height={20} strokeWidth={1.5} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto text-sm text-gray-700">
          <div
            className="prose prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: content }}
          />
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

function HistoryModal({
  type,
  history,
  currentVersion,
  onClose,
  onSelect,
  onDelete,
  deleting
}: {
  type: TabType;
  history: HistoryItem[];
  currentVersion: number | null;
  onClose: () => void;
  onSelect: (item: HistoryItem) => void;
  onDelete: (item: HistoryItem) => void;
  deleting: string | null;
}) {
  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const typeLabel = type === 'terms' ? '이용약관' : '개인정보처리방침';

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="bg-white rounded-xl max-w-2xl w-full mx-4 max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-gray-500" />
            <h2 className="text-xl font-bold">{typeLabel} 배포 내역</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <Xmark width={20} height={20} strokeWidth={1.5} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto">
          {history.length === 0 ? (
            <p className="text-gray-500 text-center py-8">이전 배포 내역이 없습니다.</p>
          ) : (
            <div className="space-y-3">
              {currentVersion && (
                <div className="text-sm text-gray-500 mb-4">
                  현재 배포 버전: <span className="font-medium text-blue-600">v{currentVersion}</span>
                </div>
              )}
              {history.map((item) => (
                <div
                  key={item.id}
                  className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">
                        v{item.version}
                      </span>
                      <div className="flex items-center gap-1 text-sm text-gray-500">
                        <Calendar className="w-4 h-4" />
                        {formatDate(item.publishedAt)}
                      </div>
                    </div>
                    <button
                      onClick={() => onDelete(item)}
                      disabled={deleting === item.id}
                      className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                      title="삭제"
                    >
                      {deleting === item.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  <button
                    onClick={() => onSelect(item)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    내용 보기
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-6 border-t">
          <button onClick={onClose} className="btn-secondary w-full">
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TermsSettingsPage() {
  const [activeTab, setActiveTab] = useState<TabType>('terms');
  const [showPreview, setShowPreview] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<HistoryItem | null>(null);
  const [termsContent, setTermsContent] = useState('');
  const [privacyContent, setPrivacyContent] = useState('');
  const [termsPublished, setTermsPublished] = useState<PublishedInfo | null>(null);
  const [privacyPublished, setPrivacyPublished] = useState<PublishedInfo | null>(null);
  const [termsHistory, setTermsHistory] = useState<HistoryItem[]>([]);
  const [privacyHistory, setPrivacyHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishingTerms, setPublishingTerms] = useState(false);
  const [publishingPrivacy, setPublishingPrivacy] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [publishTermsSuccess, setPublishTermsSuccess] = useState(false);
  const [publishPrivacySuccess, setPublishPrivacySuccess] = useState(false);
  const [error, setError] = useState('');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const termsEditor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link.configure({ openOnClick: false }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
    ],
    content: termsContent,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none min-h-[400px] p-4 focus:outline-none',
      },
    },
    onUpdate: ({ editor }) => {
      setTermsContent(editor.getHTML());
      setHasUnsavedChanges(true);
    },
  });

  const privacyEditor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link.configure({ openOnClick: false }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
    ],
    content: privacyContent,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none min-h-[400px] p-4 focus:outline-none',
      },
    },
    onUpdate: ({ editor }) => {
      setPrivacyContent(editor.getHTML());
      setHasUnsavedChanges(true);
    },
  });

  const fetchTerms = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/settings/terms', {
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        setTermsContent(data.draft?.termsOfService || '');
        setPrivacyContent(data.draft?.privacyPolicy || '');
        setTermsPublished(data.termsPublished);
        setPrivacyPublished(data.privacyPublished);
        setTermsHistory(data.termsHistory || []);
        setPrivacyHistory(data.privacyHistory || []);
        setHasUnsavedChanges(false);

        if (termsEditor) {
          termsEditor.commands.setContent(data.draft?.termsOfService || '');
        }
        if (privacyEditor) {
          privacyEditor.commands.setContent(data.draft?.privacyPolicy || '');
        }
      } else {
        setError('약관을 불러오는데 실패했습니다.');
      }
    } catch (err) {
      console.error('Failed to fetch terms:', err);
      setError('약관을 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }, [termsEditor, privacyEditor]);

  useEffect(() => {
    fetchTerms();
  }, []);

  useEffect(() => {
    if (termsEditor && termsContent && !termsEditor.getText()) {
      termsEditor.commands.setContent(termsContent);
    }
  }, [termsEditor, termsContent]);

  useEffect(() => {
    if (privacyEditor && privacyContent && !privacyEditor.getText()) {
      privacyEditor.commands.setContent(privacyContent);
    }
  }, [privacyEditor, privacyContent]);

  const handleSave = async () => {
    setSaving(true);
    setSaveSuccess(false);
    setError('');

    try {
      const response = await fetch('/api/admin/settings/terms', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          termsOfService: termsContent,
          privacyPolicy: privacyContent,
        }),
      });

      if (response.ok) {
        setSaveSuccess(true);
        setHasUnsavedChanges(false);
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        const data = await response.json();
        setError(data.error || '저장에 실패했습니다.');
      }
    } catch (err) {
      console.error('Failed to save terms:', err);
      setError('저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async (type: 'terms' | 'privacy') => {
    if (hasUnsavedChanges) {
      if (!confirm('저장되지 않은 변경사항이 있습니다. 먼저 저장하시겠습니까?')) {
        return;
      }
      await handleSave();
    }

    const typeLabel = type === 'terms' ? '이용약관' : '개인정보처리방침';
    if (!confirm(`${typeLabel}을 배포하시겠습니까? 배포 후 즉시 사용자에게 공개됩니다.`)) {
      return;
    }

    if (type === 'terms') {
      setPublishingTerms(true);
      setPublishTermsSuccess(false);
    } else {
      setPublishingPrivacy(true);
      setPublishPrivacySuccess(false);
    }
    setError('');

    try {
      const response = await fetch(`/api/admin/settings/terms?type=${type}`, {
        method: 'POST',
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        if (type === 'terms') {
          setPublishTermsSuccess(true);
          setTimeout(() => setPublishTermsSuccess(false), 3000);
        } else {
          setPublishPrivacySuccess(true);
          setTimeout(() => setPublishPrivacySuccess(false), 3000);
        }
        fetchTerms();
        alert(data.message);
      } else {
        const data = await response.json();
        setError(data.error || '배포에 실패했습니다.');
      }
    } catch (err) {
      console.error('Failed to publish:', err);
      setError('배포 중 오류가 발생했습니다.');
    } finally {
      if (type === 'terms') {
        setPublishingTerms(false);
      } else {
        setPublishingPrivacy(false);
      }
    }
  };

  const handleHistorySelect = (item: HistoryItem) => {
    setSelectedHistoryItem(item);
    setShowHistory(false);
  };

  const handleDeleteHistory = async (item: HistoryItem) => {
    if (!confirm(`v${item.version} 배포 내역을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`)) {
      return;
    }

    setDeleting(item.id);
    setError('');

    try {
      const response = await fetch(`/api/admin/settings/terms?id=${item.id}&type=${activeTab}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (response.ok) {
        if (activeTab === 'terms') {
          setTermsHistory(prev => prev.filter(h => h.id !== item.id));
        } else {
          setPrivacyHistory(prev => prev.filter(h => h.id !== item.id));
        }
      } else {
        const data = await response.json();
        setError(data.error || '삭제에 실패했습니다.');
      }
    } catch (err) {
      console.error('Failed to delete history:', err);
      setError('삭제 중 오류가 발생했습니다.');
    } finally {
      setDeleting(null);
    }
  };

  const currentEditor = activeTab === 'terms' ? termsEditor : privacyEditor;
  const currentContent = activeTab === 'terms' ? termsContent : privacyContent;
  const currentPublished = activeTab === 'terms' ? termsPublished : privacyPublished;
  const currentHistory = activeTab === 'terms' ? termsHistory : privacyHistory;

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start md:items-center gap-3">
          <Page className="w-8 h-8 text-blue-600 shrink-0 mt-1 md:mt-0" />
          <div className="min-w-0">
            <h1 className="text-xl md:text-2xl font-bold text-gray-900 break-keep">약관 / 개인정보처리방침 관리</h1>
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 mt-1">
              {termsPublished && (
                <span className="text-xs text-gray-500 truncate">
                  이용약관: v{termsPublished.version} ({formatDate(termsPublished.effectiveDate || termsPublished.publishedAt)})
                </span>
              )}
              {privacyPublished && (
                <span className="text-xs text-gray-500 truncate">
                  개인정보: v{privacyPublished.version} ({formatDate(privacyPublished.effectiveDate || privacyPublished.publishedAt)})
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowHistory(true)}
            className="flex-1 sm:flex-none justify-center flex items-center gap-2 px-3 py-2 text-sm text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap"
          >
            <Clock className="w-4 h-4" />
            <span className="hidden sm:inline">배포 내역</span>
            <span className="sm:hidden">내역</span>
          </button>
          <button
            onClick={() => setShowPreview(true)}
            className="flex-1 sm:flex-none justify-center flex items-center gap-2 px-3 py-2 text-sm text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap"
          >
            <Eye className="w-4 h-4" />
            <span className="hidden sm:inline">미리보기</span>
            <span className="sm:hidden">보기</span>
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 sm:flex-none justify-center flex items-center gap-2 px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : saveSuccess ? (
              <Check className="w-4 h-4 text-green-600" />
            ) : null}
            {saving ? '저장...' : saveSuccess ? '저장됨' : '저장'}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm break-keep">
          {error}
        </div>
      )}

      {hasUnsavedChanges && (
        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-800 text-sm break-keep">
          저장되지 않은 변경사항이 있습니다.
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {/* 탭 */}
        <div className="flex flex-col sm:flex-row border-b border-gray-200">
          <button
            onClick={() => setActiveTab('terms')}
            className={`flex-1 px-4 sm:px-6 py-3 sm:py-4 font-medium transition-colors flex items-center justify-between ${activeTab === 'terms'
                ? 'text-blue-600 border-l-4 sm:border-l-0 sm:border-b-2 border-blue-600 bg-blue-50/50'
                : 'text-gray-500 hover:text-gray-700'
              }`}
          >
            <span className="text-sm sm:text-base">이용약관</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handlePublish('terms');
              }}
              disabled={publishingTerms}
              className={`ml-2 px-2.5 py-1 text-xs rounded-lg transition-colors whitespace-nowrap ${activeTab === 'terms'
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                } disabled:opacity-50`}
            >
              {publishingTerms ? '배포...' : publishTermsSuccess ? '배포됨' : '배포'}
            </button>
          </button>
          <button
            onClick={() => setActiveTab('privacy')}
            className={`flex-1 px-4 sm:px-6 py-3 sm:py-4 font-medium transition-colors flex items-center justify-between ${activeTab === 'privacy'
                ? 'text-blue-600 border-l-4 sm:border-l-0 sm:border-b-2 border-blue-600 bg-blue-50/50'
                : 'text-gray-500 hover:text-gray-700'
              }`}
          >
            <span className="text-sm sm:text-base">개인정보처리방침</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handlePublish('privacy');
              }}
              disabled={publishingPrivacy}
              className={`ml-2 px-2.5 py-1 text-xs rounded-lg transition-colors whitespace-nowrap ${activeTab === 'privacy'
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                } disabled:opacity-50`}
            >
              {publishingPrivacy ? '배포...' : publishPrivacySuccess ? '배포됨' : '배포'}
            </button>
          </button>
        </div>

        {/* 에디터 영역 */}
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
          </div>
        ) : (
          <div>
            <EditorToolbar editor={currentEditor} />
            <div className="bg-white">
              {activeTab === 'terms' ? (
                <EditorContent editor={termsEditor} />
              ) : (
                <EditorContent editor={privacyEditor} />
              )}
            </div>
          </div>
        )}

        {/* 안내 메시지 */}
        <div className="p-4 bg-gray-50 border-t border-gray-100">
          <p className="text-sm text-gray-500">
            이용약관과 개인정보처리방침은 개별적으로 배포됩니다. 저장 후 각 탭의 &quot;배포&quot; 버튼을 눌러 홈페이지에 반영하세요.
          </p>
          {currentPublished && (
            <p className="text-sm text-blue-600 mt-1">
              현재 {activeTab === 'terms' ? '이용약관' : '개인정보처리방침'} 배포 버전: v{currentPublished.version} (시행일: {formatDate(currentPublished.effectiveDate || currentPublished.publishedAt)})
            </p>
          )}
        </div>
      </div>

      {/* 미리보기 모달 */}
      {showPreview && (
        <PreviewModal
          type={activeTab}
          content={currentContent}
          effectiveDate={new Date().toISOString()}
          onClose={() => setShowPreview(false)}
        />
      )}

      {/* 배포 내역 모달 */}
      {showHistory && (
        <HistoryModal
          type={activeTab}
          history={currentHistory}
          currentVersion={currentPublished?.version || null}
          onClose={() => setShowHistory(false)}
          onSelect={handleHistorySelect}
          onDelete={handleDeleteHistory}
          deleting={deleting}
        />
      )}

      {/* 히스토리 상세 보기 모달 */}
      {selectedHistoryItem && (
        <PreviewModal
          type={activeTab}
          content={selectedHistoryItem.content}
          effectiveDate={selectedHistoryItem.effectiveDate || selectedHistoryItem.publishedAt}
          title={`v${selectedHistoryItem.version} - ${activeTab === 'terms' ? '이용약관' : '개인정보처리방침'}`}
          onClose={() => setSelectedHistoryItem(null)}
        />
      )}
    </div>
  );
}
