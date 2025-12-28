'use client';

import { useState, useEffect, useCallback } from 'react';
import { Page, Check, Eye, Xmark, Clock, Calendar, Upload, Trash } from 'iconoir-react';
import { Loader2 } from 'lucide-react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import TextAlign from '@tiptap/extension-text-align';

type TabType = 'terms' | 'privacy';

interface TermsHistory {
  id: string;
  termsOfService: string;
  privacyPolicy: string;
  publishedAt: string;
  publishedBy: string;
  version: number;
}

interface PublishedTerms {
  termsOfService: string;
  privacyPolicy: string;
  publishedAt: string | null;
  publishedBy: string | null;
  version: number;
}

function EditorToolbar({ editor }: { editor: ReturnType<typeof useEditor> | null }) {
  if (!editor) return null;

  return (
    <div className="flex flex-wrap gap-1 p-2 border-b border-gray-200 bg-gray-50">
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        className={`px-2 py-1 text-sm rounded ${
          editor.isActive('heading', { level: 2 }) ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-200'
        }`}
        title="제목"
      >
        H2
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        className={`px-2 py-1 text-sm rounded ${
          editor.isActive('heading', { level: 3 }) ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-200'
        }`}
        title="소제목"
      >
        H3
      </button>
      <div className="w-px bg-gray-300 mx-1" />
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={`px-2 py-1 text-sm font-bold rounded ${
          editor.isActive('bold') ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-200'
        }`}
        title="굵게"
      >
        B
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={`px-2 py-1 text-sm italic rounded ${
          editor.isActive('italic') ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-200'
        }`}
        title="기울임"
      >
        I
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        className={`px-2 py-1 text-sm underline rounded ${
          editor.isActive('underline') ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-200'
        }`}
        title="밑줄"
      >
        U
      </button>
      <div className="w-px bg-gray-300 mx-1" />
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        className={`px-2 py-1 text-sm rounded ${
          editor.isActive('bulletList') ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-200'
        }`}
        title="글머리 기호"
      >
        • 목록
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        className={`px-2 py-1 text-sm rounded ${
          editor.isActive('orderedList') ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-200'
        }`}
        title="번호 목록"
      >
        1. 목록
      </button>
      <div className="w-px bg-gray-300 mx-1" />
      <button
        type="button"
        onClick={() => editor.chain().focus().setTextAlign('left').run()}
        className={`px-2 py-1 text-sm rounded ${
          editor.isActive({ textAlign: 'left' }) ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-200'
        }`}
        title="왼쪽 정렬"
      >
        ◀
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().setTextAlign('center').run()}
        className={`px-2 py-1 text-sm rounded ${
          editor.isActive({ textAlign: 'center' }) ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-200'
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
  title,
  onClose
}: {
  type: 'terms' | 'privacy';
  content: string;
  title?: string;
  onClose: () => void;
}) {
  const defaultTitle = type === 'terms' ? 'YAMOO 서비스이용약관' : '개인정보처리방침';

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="bg-white rounded-xl max-w-3xl w-full mx-4 max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-bold">{title || defaultTitle}</h2>
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
  history,
  currentVersion,
  onClose,
  onSelect,
  onDelete,
  deleting
}: {
  history: TermsHistory[];
  currentVersion: number | null;
  onClose: () => void;
  onSelect: (item: TermsHistory, type: 'terms' | 'privacy') => void;
  onDelete: (item: TermsHistory) => void;
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

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="bg-white rounded-xl max-w-2xl w-full mx-4 max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-gray-500" />
            <h2 className="text-xl font-bold">배포 내역</h2>
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
                  <div className="flex gap-2">
                    <button
                      onClick={() => onSelect(item, 'terms')}
                      className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      이용약관 보기
                    </button>
                    <button
                      onClick={() => onSelect(item, 'privacy')}
                      className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      개인정보처리방침 보기
                    </button>
                  </div>
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
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<{
    item: TermsHistory;
    type: 'terms' | 'privacy';
  } | null>(null);
  const [termsContent, setTermsContent] = useState('');
  const [privacyContent, setPrivacyContent] = useState('');
  const [published, setPublished] = useState<PublishedTerms | null>(null);
  const [history, setHistory] = useState<TermsHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [publishSuccess, setPublishSuccess] = useState(false);
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
        setPublished(data.published);
        setHistory(data.history || []);
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

  const handlePublish = async () => {
    if (hasUnsavedChanges) {
      if (!confirm('저장되지 않은 변경사항이 있습니다. 먼저 저장하시겠습니까?')) {
        return;
      }
      await handleSave();
    }

    if (!confirm('약관을 배포하시겠습니까? 배포 후 즉시 사용자에게 공개됩니다.')) {
      return;
    }

    setPublishing(true);
    setPublishSuccess(false);
    setError('');

    try {
      const response = await fetch('/api/admin/settings/terms', {
        method: 'POST',
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        setPublishSuccess(true);
        setTimeout(() => setPublishSuccess(false), 3000);
        // 데이터 새로고침
        fetchTerms();
        alert(`v${data.version} 배포가 완료되었습니다.`);
      } else {
        const data = await response.json();
        setError(data.error || '배포에 실패했습니다.');
      }
    } catch (err) {
      console.error('Failed to publish terms:', err);
      setError('배포 중 오류가 발생했습니다.');
    } finally {
      setPublishing(false);
    }
  };

  const handleHistorySelect = (item: TermsHistory, type: 'terms' | 'privacy') => {
    setSelectedHistoryItem({ item, type });
    setShowHistory(false);
  };

  const handleDeleteHistory = async (item: TermsHistory) => {
    if (!confirm(`v${item.version} 배포 내역을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`)) {
      return;
    }

    setDeleting(item.id);
    setError('');

    try {
      const response = await fetch(`/api/admin/settings/terms?id=${item.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (response.ok) {
        setHistory(prev => prev.filter(h => h.id !== item.id));
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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Page className="w-8 h-8 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">약관 관리</h1>
            {published && (
              <p className="text-sm text-gray-500 mt-0.5">
                현재 배포: v{published.version} ({formatDate(published.publishedAt)})
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {(history.length > 0 || published) && (
            <button
              onClick={() => setShowHistory(true)}
              className="flex items-center gap-2 px-4 py-2 text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Clock className="w-4 h-4" />
              배포 내역
            </button>
          )}
          <button
            onClick={() => setShowPreview(true)}
            className="flex items-center gap-2 px-4 py-2 text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Eye className="w-4 h-4" />
            미리보기
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : saveSuccess ? (
              <Check className="w-4 h-4 text-green-600" />
            ) : null}
            {saving ? '저장 중...' : saveSuccess ? '저장됨' : '저장'}
          </button>
          <button
            onClick={handlePublish}
            disabled={publishing}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {publishing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : publishSuccess ? (
              <Check className="w-4 h-4" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            {publishing ? '배포 중...' : publishSuccess ? '배포됨' : '배포'}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      {hasUnsavedChanges && (
        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-800 text-sm">
          저장되지 않은 변경사항이 있습니다.
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {/* 탭 */}
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setActiveTab('terms')}
            className={`px-6 py-4 font-medium transition-colors ${
              activeTab === 'terms'
                ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            이용약관
          </button>
          <button
            onClick={() => setActiveTab('privacy')}
            className={`px-6 py-4 font-medium transition-colors ${
              activeTab === 'privacy'
                ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            개인정보처리방침
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
            저장 후 배포를 해야 홈페이지에 반영됩니다. 배포 전까지는 현재 버전이 유지됩니다.
          </p>
        </div>
      </div>

      {/* 미리보기 모달 */}
      {showPreview && (
        <PreviewModal
          type={activeTab}
          content={currentContent}
          onClose={() => setShowPreview(false)}
        />
      )}

      {/* 배포 내역 모달 */}
      {showHistory && (
        <HistoryModal
          history={history}
          currentVersion={published?.version || null}
          onClose={() => setShowHistory(false)}
          onSelect={handleHistorySelect}
          onDelete={handleDeleteHistory}
          deleting={deleting}
        />
      )}

      {/* 히스토리 상세 보기 모달 */}
      {selectedHistoryItem && (
        <PreviewModal
          type={selectedHistoryItem.type}
          content={
            selectedHistoryItem.type === 'terms'
              ? selectedHistoryItem.item.termsOfService
              : selectedHistoryItem.item.privacyPolicy
          }
          title={`v${selectedHistoryItem.item.version} - ${
            selectedHistoryItem.type === 'terms' ? '이용약관' : '개인정보처리방침'
          }`}
          onClose={() => setSelectedHistoryItem(null)}
        />
      )}
    </div>
  );
}
