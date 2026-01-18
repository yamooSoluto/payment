'use client';

import { useEditor, EditorContent, Node, mergeAttributes, NodeViewWrapper, NodeViewContent, ReactNodeViewRenderer } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Heading from '@tiptap/extension-heading';
import ImageResize from 'tiptap-extension-resize-image';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableCell } from '@tiptap/extension-table-cell';
import { Color } from '@tiptap/extension-color';
import { TextStyle } from '@tiptap/extension-text-style';
import { Highlight } from '@tiptap/extension-highlight';
import { Underline as UnderlineExtension } from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import { useEffect, useRef, useState, useCallback } from 'react';
import {
  TableRows,
  MediaImage,
  List,
  NumberedListLeft,
  QuoteMessage,
  Code,
  Minus,
  MinusCircle,
  Trash,
  NavArrowUp,
  NavArrowDown,
  NavArrowLeft,
  NavArrowRight,
  Link as LinkIcon,
  NavArrowDown as AccordionIcon,
} from 'iconoir-react';

// 아코디언 NodeView 컴포넌트 (에디터에서는 div로 렌더링)
const AccordionComponent = ({ deleteNode }: { editor: ReturnType<typeof useEditor>; getPos: () => number; deleteNode: () => void }) => {
  const [isOpen, setIsOpen] = useState(true);

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    deleteNode();
  };

  const handleToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsOpen(!isOpen);
  };

  return (
    <NodeViewWrapper className={`faq-accordion-editor ${isOpen ? 'is-open' : ''}`}>
      <div className="faq-accordion-toggle" onClick={handleToggle} contentEditable={false}>
        <span className="faq-accordion-arrow">▶</span>
      </div>
      <NodeViewContent className="faq-accordion-editor-content" />
      <button
        type="button"
        className="faq-accordion-delete"
        onClick={handleDelete}
        title="아코디언 삭제"
        contentEditable={false}
      >
        ×
      </button>
    </NodeViewWrapper>
  );
};

// Details (Accordion wrapper) 커스텀 노드
const Details = Node.create({
  name: 'details',
  group: 'block',
  content: 'detailsSummary detailsContent',
  defining: true,
  isolating: true,

  parseHTML() {
    return [{ tag: 'details' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['details', mergeAttributes(HTMLAttributes, { class: 'faq-accordion' }), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(AccordionComponent);
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Shift-a': () => {
        return this.editor.commands.insertContent({
          type: 'details',
          content: [
            { type: 'detailsSummary', content: [{ type: 'text', text: '제목' }] },
            { type: 'detailsContent', content: [{ type: 'paragraph', content: [{ type: 'text', text: '내용' }] }] },
          ],
        });
      },
      // 아코디언 블록 삭제
      'Mod-Shift-d': () => {
        const { state } = this.editor;
        const { $from } = state.selection;

        // 현재 위치에서 details 노드 찾기
        for (let depth = $from.depth; depth >= 0; depth--) {
          const node = $from.node(depth);
          if (node.type.name === 'details') {
            const pos = $from.before(depth);
            this.editor.commands.deleteRange({
              from: pos,
              to: pos + node.nodeSize,
            });
            return true;
          }
        }
        return false;
      },
      // Backspace로 빈 아코디언 삭제
      'Backspace': () => {
        const { state } = this.editor;
        const { $from, empty } = state.selection;

        if (!empty) return false;

        // summary의 시작 부분에서 backspace 누르면 전체 삭제
        if ($from.parent.type.name === 'detailsSummary' && $from.parentOffset === 0) {
          for (let depth = $from.depth; depth >= 0; depth--) {
            const node = $from.node(depth);
            if (node.type.name === 'details') {
              const pos = $from.before(depth);
              this.editor.commands.deleteRange({
                from: pos,
                to: pos + node.nodeSize,
              });
              return true;
            }
          }
        }
        return false;
      },
    };
  },
});

// Summary (Accordion title) 커스텀 노드
const DetailsSummary = Node.create({
  name: 'detailsSummary',
  group: 'block',
  content: 'inline*',
  defining: true,

  parseHTML() {
    return [{ tag: 'summary' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['summary', mergeAttributes(HTMLAttributes, { class: 'faq-accordion-summary' }), 0];
  },
});

// Details Content 커스텀 노드
const DetailsContent = Node.create({
  name: 'detailsContent',
  group: 'block',
  content: 'block+',
  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-details-content]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-details-content': '', class: 'faq-accordion-content' }), 0];
  },
});

interface RichTextEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
  faqId?: string; // FAQ ID for organizing images by FAQ
}

// HTML에서 이미지 URL 추출
function extractImageUrls(html: string): string[] {
  const urls: string[] = [];
  const regex = /<img[^>]+src="([^"]+)"/g;
  let match;
  while ((match = regex.exec(html)) !== null) {
    if (match[1].includes('storage.googleapis.com')) {
      urls.push(match[1]);
    }
  }
  return urls;
}

// 이미지 삭제 API 호출
async function deleteImage(url: string) {
  try {
    await fetch('/api/admin/upload', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
  } catch (error) {
    console.error('Failed to delete image:', error);
  }
}

// 툴바 버튼 컴포넌트
const ToolbarButton = ({
  onClick,
  isActive = false,
  title,
  children,
  className = '',
}: {
  onClick: () => void;
  isActive?: boolean;
  title: string;
  children: React.ReactNode;
  className?: string;
}) => (
  <button
    type="button"
    onClick={onClick}
    title={title}
    className={`w-8 h-8 flex items-center justify-center rounded transition-colors ${isActive
      ? 'bg-gray-200 text-gray-900'
      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
      } ${className}`}
  >
    {children}
  </button>
);

// 구분선 컴포넌트
const Divider = () => <div className="w-px h-5 bg-gray-200 mx-1" />;

// 색상 버튼 (드롭다운)
const ColorButton = ({
  editor,
  type,
}: {
  editor: ReturnType<typeof useEditor>;
  type: 'color' | 'highlight';
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const colors =
    type === 'color'
      ? [
        { value: '#ef4444', label: '빨강' },
        { value: '#f97316', label: '주황' },
        { value: '#eab308', label: '노랑' },
        { value: '#22c55e', label: '초록' },
        { value: '#3b82f6', label: '파랑' },
        { value: '#8b5cf6', label: '보라' },
        { value: '#374151', label: '검정' },
      ]
      : [
        { value: '#fef08a', label: '노랑' },
        { value: '#bbf7d0', label: '초록' },
        { value: '#bfdbfe', label: '파랑' },
        { value: '#fecaca', label: '빨강' },
        { value: '#e9d5ff', label: '보라' },
      ];

  const currentColor =
    type === 'color'
      ? editor?.getAttributes('textStyle').color
      : editor?.getAttributes('highlight').color;

  const handleColorSelect = (color: string | null) => {
    if (type === 'color') {
      if (color) {
        editor?.chain().focus().setColor(color).run();
      } else {
        editor?.chain().focus().unsetColor().run();
      }
    } else {
      if (color) {
        editor?.chain().focus().toggleHighlight({ color }).run();
      } else {
        editor?.chain().focus().unsetHighlight().run();
      }
    }
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        title={type === 'color' ? '텍스트 색상' : '형광펜'}
        className="w-8 h-8 flex items-center justify-center rounded text-gray-600 hover:bg-gray-100 hover:text-gray-900"
      >
        {type === 'color' ? (
          <span className="flex flex-col items-center">
            <span className="font-bold text-sm" style={{ color: currentColor || 'inherit' }}>A</span>
            <span
              className="w-4 h-1 rounded-sm -mt-0.5"
              style={{ backgroundColor: currentColor || '#374151' }}
            />
          </span>
        ) : (
          <span className="flex flex-col items-center">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15.5 4.5l-11 11V19h3.5l11-11-3.5-3.5zM12.5 7.5l3.5 3.5" />
            </svg>
            <span
              className="w-4 h-1 rounded-sm -mt-0.5"
              style={{ backgroundColor: currentColor || '#fef08a' }}
            />
          </span>
        )}
      </button>
      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute top-full left-0 mt-1 p-2 bg-white rounded-lg shadow-lg border border-gray-200 z-20">
            <div className="flex gap-1 mb-2">
              {colors.map((color) => (
                <button
                  key={color.value}
                  type="button"
                  onClick={() => handleColorSelect(color.value)}
                  title={color.label}
                  className={`w-6 h-6 rounded border-2 transition-transform hover:scale-110 ${currentColor === color.value ? 'border-gray-400' : 'border-transparent'
                    }`}
                  style={{
                    backgroundColor: type === 'highlight' ? color.value : 'white',
                    color: type === 'color' ? color.value : 'inherit',
                  }}
                >
                  {type === 'color' && <span className="font-bold text-xs">A</span>}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => handleColorSelect(null)}
              className="w-full text-xs text-gray-500 hover:text-gray-700 py-1"
            >
              {type === 'color' ? '색상 제거' : '형광펜 제거'}
            </button>
          </div>
        </>
      )}
    </div>
  );
};

const MenuBar = ({ editor, onImageClick, onLinkClick, onAccordionClick }: { editor: ReturnType<typeof useEditor> | null; onImageClick: () => void; onLinkClick: () => void; onAccordionClick: () => void }) => {
  if (!editor) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-gray-200 bg-white">
      {/* 텍스트 포맷팅 */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        isActive={editor.isActive('bold')}
        title="굵게 (Ctrl+B)"
      >
        <span className="font-bold text-sm">B</span>
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        isActive={editor.isActive('italic')}
        title="기울임 (Ctrl+I)"
      >
        <span className="italic text-sm">I</span>
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        isActive={editor.isActive('underline')}
        title="밑줄 (Ctrl+U)"
      >
        <span className="underline text-sm">U</span>
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleStrike().run()}
        isActive={editor.isActive('strike')}
        title="취소선"
      >
        <span className="line-through text-sm">S</span>
      </ToolbarButton>

      <Divider />

      {/* 링크 */}
      <ToolbarButton
        onClick={onLinkClick}
        isActive={editor.isActive('link')}
        title="링크 삽입 (Ctrl+K)"
      >
        <LinkIcon className="w-4 h-4" />
      </ToolbarButton>

      <Divider />

      {/* 색상 */}
      <ColorButton editor={editor} type="color" />
      <ColorButton editor={editor} type="highlight" />

      <Divider />

      {/* 제목 */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        isActive={editor.isActive('heading', { level: 2 })}
        title="제목 2"
      >
        <span className="text-xs font-bold">H2</span>
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        isActive={editor.isActive('heading', { level: 3 })}
        title="제목 3"
      >
        <span className="text-xs font-bold">H3</span>
      </ToolbarButton>

      <Divider />

      {/* 리스트 */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        isActive={editor.isActive('bulletList')}
        title="글머리 기호"
      >
        <List className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        isActive={editor.isActive('orderedList')}
        title="번호 매기기"
      >
        <NumberedListLeft className="w-4 h-4" />
      </ToolbarButton>

      <Divider />

      {/* 블록 요소 */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        isActive={editor.isActive('blockquote')}
        title="인용"
      >
        <QuoteMessage className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        isActive={editor.isActive('codeBlock')}
        title="코드"
      >
        <Code className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        title="구분선"
      >
        <Minus className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={onAccordionClick}
        isActive={editor.isActive('details')}
        title="펼치기/접기 블록 (Ctrl+Shift+A)"
      >
        <AccordionIcon className="w-4 h-4" />
      </ToolbarButton>

      <Divider />

      {/* 미디어 */}
      <ToolbarButton onClick={onImageClick} title="이미지 삽입">
        <MediaImage className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
        title="표 삽입"
      >
        <TableRows className="w-4 h-4" />
      </ToolbarButton>

      {/* 표 편집 버튼 (표 선택 시에만 표시) */}
      {editor.isActive('table') && (
        <>
          <Divider />
          <div className="flex items-center gap-0.5 px-1 py-0.5 bg-gray-50 rounded">
            <ToolbarButton
              onClick={() => editor.chain().focus().addColumnBefore().run()}
              title="왼쪽에 열 추가"
              className="w-7 h-7"
            >
              <NavArrowLeft className="w-3.5 h-3.5" />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => editor.chain().focus().addColumnAfter().run()}
              title="오른쪽에 열 추가"
              className="w-7 h-7"
            >
              <NavArrowRight className="w-3.5 h-3.5" />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => editor.chain().focus().deleteColumn().run()}
              title="열 삭제"
              className="w-7 h-7"
            >
              <MinusCircle className="w-3.5 h-3.5" />
            </ToolbarButton>
            <div className="w-px h-4 bg-gray-200 mx-0.5" />
            <ToolbarButton
              onClick={() => editor.chain().focus().addRowBefore().run()}
              title="위에 행 추가"
              className="w-7 h-7"
            >
              <NavArrowUp className="w-3.5 h-3.5" />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => editor.chain().focus().addRowAfter().run()}
              title="아래에 행 추가"
              className="w-7 h-7"
            >
              <NavArrowDown className="w-3.5 h-3.5" />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => editor.chain().focus().deleteRow().run()}
              title="행 삭제"
              className="w-7 h-7"
            >
              <MinusCircle className="w-3.5 h-3.5" />
            </ToolbarButton>
            <div className="w-px h-4 bg-gray-200 mx-0.5" />
            <ToolbarButton
              onClick={() => editor.chain().focus().deleteTable().run()}
              title="표 삭제"
              className="w-7 h-7 text-red-500 hover:text-red-600"
            >
              <Trash className="w-3.5 h-3.5" />
            </ToolbarButton>
          </div>
        </>
      )}
    </div>
  );
};

export default function RichTextEditor({ content, onChange, placeholder, faqId }: RichTextEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const previousImagesRef = useRef<string[]>([]);
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkText, setLinkText] = useState('');

  // 폴더 경로 결정
  const getFolder = useCallback(() => {
    if (faqId) {
      return `web_faq/${faqId}`;
    }
    return 'web_faq/temp';
  }, [faqId]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
      }),
      Heading.configure({
        levels: [2, 3],
        HTMLAttributes: {
          class: 'tiptap-heading',
        },
      }),
      ImageResize.configure({
        HTMLAttributes: {
          class: 'tiptap-image',
        },
      }),
      Table.configure({
        resizable: true,
        HTMLAttributes: {
          class: 'tiptap-table',
        },
      }),
      TableRow,
      TableHeader,
      TableCell,
      TextStyle,
      Color,
      Highlight.configure({
        multicolor: true,
      }),
      UnderlineExtension,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'tiptap-link',
          target: '_blank',
          rel: 'noopener noreferrer',
        },
      }),
      Details,
      DetailsSummary,
      DetailsContent,
    ],
    content: content || '',
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      const newHtml = editor.getHTML();
      const newImages = extractImageUrls(newHtml);
      const oldImages = previousImagesRef.current;

      // 삭제된 이미지 찾아서 Storage에서도 삭제
      const removedImages = oldImages.filter(url => !newImages.includes(url));
      removedImages.forEach(url => {
        deleteImage(url);
      });

      previousImagesRef.current = newImages;
      onChange(newHtml);
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none min-h-[200px] p-4 focus:outline-none',
      },
    },
  });

  // 초기 콘텐츠에서 이미지 URL 추출
  useEffect(() => {
    if (content) {
      previousImagesRef.current = extractImageUrls(content);
    }
  }, []);

  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content || '');
      previousImagesRef.current = extractImageUrls(content || '');
    }
  }, [content, editor]);

  const handleImageClick = () => {
    fileInputRef.current?.click();
  };

  const handleLinkClick = () => {
    if (!editor) return;

    // 현재 선택된 텍스트 또는 기존 링크 정보 가져오기
    const { from, to } = editor.state.selection;
    const selectedText = editor.state.doc.textBetween(from, to, '');
    const existingLink = editor.getAttributes('link').href;

    setLinkText(selectedText);
    setLinkUrl(existingLink || '');
    setLinkModalOpen(true);
  };

  const handleLinkSave = () => {
    if (!editor) return;

    if (!linkUrl) {
      // URL이 없으면 링크 제거
      editor.chain().focus().unsetLink().run();
    } else {
      // URL 정규화: 프로토콜이 없으면 https:// 추가
      let normalizedUrl = linkUrl.trim();
      if (normalizedUrl && !normalizedUrl.match(/^https?:\/\//i) && !normalizedUrl.startsWith('mailto:') && !normalizedUrl.startsWith('tel:')) {
        normalizedUrl = 'https://' + normalizedUrl;
      }

      // 텍스트가 선택되어 있으면 그 텍스트에 링크 적용
      // 선택된 텍스트가 없으면 URL을 텍스트로 사용
      const { from, to } = editor.state.selection;
      if (from === to && linkText) {
        // 커서만 있는 경우 텍스트와 링크 함께 삽입
        editor
          .chain()
          .focus()
          .insertContent(`<a href="${normalizedUrl}" target="_blank" rel="noopener noreferrer">${linkText}</a>`)
          .run();
      } else {
        // 텍스트가 선택된 경우 해당 텍스트에 링크 적용
        editor.chain().focus().setLink({ href: normalizedUrl }).run();
      }
    }

    setLinkModalOpen(false);
    setLinkUrl('');
    setLinkText('');
  };

  const handleAccordionClick = () => {
    if (!editor) return;

    editor.commands.insertContent({
      type: 'details',
      content: [
        { type: 'detailsSummary', content: [{ type: 'text', text: '제목' }] },
        { type: 'detailsContent', content: [{ type: 'paragraph', content: [{ type: 'text', text: '내용' }] }] },
      ],
    });
  };

  // 이미지 파일 업로드 (파일 선택 및 클립보드 붙여넣기 공용)
  const uploadImage = useCallback(async (file: File) => {
    if (!editor) return;

    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folder', getFolder());

      const response = await fetch('/api/admin/upload', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        editor.chain().focus().setImage({ src: data.url }).run();
      } else {
        const error = await response.json();
        alert(error.error || '이미지 업로드에 실패했습니다.');
      }
    } catch (error) {
      console.error('Image upload error:', error);
      alert('이미지 업로드 중 오류가 발생했습니다.');
    } finally {
      setUploading(false);
    }
  }, [editor, getFolder]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editor) return;

    await uploadImage(file);

    // 같은 파일 재선택 가능하도록 초기화
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // 클립보드 이미지 붙여넣기 핸들러
  const handlePaste = useCallback((event: ClipboardEvent) => {
    const items = event.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        event.preventDefault();
        const file = item.getAsFile();
        if (file) {
          uploadImage(file);
        }
        return;
      }
    }
  }, [uploadImage]);

  // 에디터에 paste 이벤트 리스너 등록
  useEffect(() => {
    const editorElement = document.querySelector('.ProseMirror');
    if (editorElement) {
      editorElement.addEventListener('paste', handlePaste as EventListener);
      return () => {
        editorElement.removeEventListener('paste', handlePaste as EventListener);
      };
    }
  }, [handlePaste]);

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden relative">
      <MenuBar editor={editor} onImageClick={handleImageClick} onLinkClick={handleLinkClick} onAccordionClick={handleAccordionClick} />
      <EditorContent editor={editor} placeholder={placeholder} />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        onChange={handleImageUpload}
        className="hidden"
      />
      {uploading && (
        <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
          <div className="flex items-center gap-2 text-gray-600">
            <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            이미지 업로드 중...
          </div>
        </div>
      )}

      {/* 링크 삽입 모달 */}
      {linkModalOpen && (
        <>
          <div className="fixed inset-0 bg-black/50 z-50" onClick={() => setLinkModalOpen(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-xl p-6 z-50 w-96">
            <h3 className="text-lg font-semibold mb-4">링크 삽입</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">링크 텍스트</label>
                <input
                  type="text"
                  value={linkText}
                  onChange={(e) => setLinkText(e.target.value)}
                  placeholder="표시될 텍스트"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">URL</label>
                <input
                  type="url"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  placeholder="https://example.com"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleLinkSave();
                    if (e.key === 'Escape') setLinkModalOpen(false);
                  }}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                type="button"
                onClick={() => setLinkModalOpen(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleLinkSave}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                {linkUrl ? '저장' : '링크 제거'}
              </button>
            </div>
          </div>
        </>
      )}
      <style jsx global>{`
        .ProseMirror {
          min-height: 200px;
        }
        .ProseMirror:focus {
          outline: none;
        }
        .ProseMirror h2 {
          font-size: 1.5rem;
          font-weight: 700;
          margin-top: 1.5rem;
          margin-bottom: 0.75rem;
        }
        .ProseMirror h3 {
          font-size: 1.25rem;
          font-weight: 600;
          margin-top: 1.25rem;
          margin-bottom: 0.5rem;
        }
        .ProseMirror p {
          margin-bottom: 0.75rem;
        }
        .ProseMirror ul,
        .ProseMirror ol {
          padding-left: 1.5rem;
          margin-bottom: 0.75rem;
        }
        .ProseMirror ul {
          list-style: disc;
        }
        .ProseMirror ol {
          list-style: decimal;
        }
        .ProseMirror blockquote {
          border-left: 3px solid #e5e7eb;
          padding-left: 1rem;
          margin-left: 0;
          color: #6b7280;
        }
        .ProseMirror code {
          background: #f3f4f6;
          padding: 0.125rem 0.25rem;
          border-radius: 0.25rem;
          font-family: monospace;
        }
        .ProseMirror pre {
          background: #1f2937;
          color: #f9fafb;
          padding: 1rem;
          border-radius: 0.5rem;
          overflow-x: auto;
          margin-bottom: 0.75rem;
        }
        .ProseMirror pre code {
          background: none;
          padding: 0;
        }
        .ProseMirror hr {
          border: none;
          border-top: 1px solid #e5e7eb;
          margin: 1.5rem 0;
        }
        .ProseMirror p.is-editor-empty:first-child::before {
          color: #9ca3af;
          content: attr(data-placeholder);
          float: left;
          height: 0;
          pointer-events: none;
        }
        .ProseMirror img.tiptap-image {
          max-width: 100%;
          height: auto;
          border-radius: 0.5rem;
          margin: 1rem 0;
        }
        .ProseMirror img.ProseMirror-selectednode {
          outline: 2px solid #3b82f6;
        }
        .ProseMirror .image-resizer {
          display: inline-flex;
          position: relative;
          flex-grow: 0;
        }
        .ProseMirror .image-resizer .resize-trigger {
          position: absolute;
          right: -6px;
          bottom: -6px;
          width: 12px;
          height: 12px;
          background: #3b82f6;
          border: 2px solid white;
          border-radius: 50%;
          cursor: se-resize;
          opacity: 0;
          transition: opacity 0.2s;
        }
        .ProseMirror .image-resizer:hover .resize-trigger,
        .ProseMirror .image-resizer.resizing .resize-trigger {
          opacity: 1;
        }
        /* 테이블 스타일 */
        .ProseMirror table {
          border-collapse: collapse;
          table-layout: fixed;
          width: 100%;
          margin: 1rem 0;
          overflow: hidden;
        }
        .ProseMirror table td,
        .ProseMirror table th {
          min-width: 1em;
          border: 1px solid #e5e7eb;
          padding: 0.5rem 0.75rem;
          vertical-align: top;
          box-sizing: border-box;
          position: relative;
        }
        .ProseMirror table th {
          font-weight: 600;
          text-align: left;
          background-color: #f9fafb;
        }
        .ProseMirror table .selectedCell:after {
          z-index: 2;
          position: absolute;
          content: "";
          left: 0;
          right: 0;
          top: 0;
          bottom: 0;
          background: rgba(59, 130, 246, 0.1);
          pointer-events: none;
        }
        .ProseMirror table .column-resize-handle {
          position: absolute;
          right: -2px;
          top: 0;
          bottom: -2px;
          width: 4px;
          background-color: #3b82f6;
          pointer-events: none;
        }
        .ProseMirror.resize-cursor {
          cursor: col-resize;
        }
        /* 링크 스타일 */
        .ProseMirror a.tiptap-link {
          color: #3b82f6;
          text-decoration: underline;
          cursor: pointer;
        }
        .ProseMirror a.tiptap-link:hover {
          color: #2563eb;
        }
        /* 에디터용 아코디언 스타일 */
        .ProseMirror .faq-accordion-editor {
          position: relative;
          margin: 1rem 0;
          border: 1px solid #e5e7eb;
          border-radius: 0.5rem;
          overflow: hidden;
        }
        .ProseMirror .faq-accordion-editor:hover .faq-accordion-delete {
          opacity: 1;
        }
        .ProseMirror .faq-accordion-toggle {
          position: absolute;
          top: 0;
          left: 0;
          width: 2.5rem;
          height: 3rem;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          z-index: 10;
          user-select: none;
          background: #f9fafb;
        }
        .ProseMirror .faq-accordion-arrow {
          font-size: 0.75rem;
          color: #6b7280;
          transition: transform 0.2s;
        }
        .ProseMirror .faq-accordion-delete {
          position: absolute;
          top: 0.5rem;
          right: 0.5rem;
          width: 1.5rem;
          height: 1.5rem;
          border: none;
          background: #ef4444;
          color: white;
          border-radius: 50%;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1rem;
          font-weight: bold;
          line-height: 1;
          opacity: 0;
          transition: opacity 0.2s, background-color 0.2s;
          z-index: 10;
        }
        .ProseMirror .faq-accordion-delete:hover {
          background: #dc2626;
        }
        .ProseMirror .faq-accordion-editor-content {
          display: block;
        }
        .ProseMirror .faq-accordion-editor-content > summary.faq-accordion-summary {
          padding: 1rem 2.5rem;
          background: #f9fafb;
          font-weight: 600;
          display: block;
          list-style: none;
        }
        .ProseMirror .faq-accordion-editor-content > summary.faq-accordion-summary::-webkit-details-marker {
          display: none;
        }
        .ProseMirror .faq-accordion-editor summary.faq-accordion-summary::before {
          display: none !important;
          content: none !important;
        }
        .ProseMirror .faq-accordion-editor-content > div.faq-accordion-content {
          padding: 1rem;
          border-top: 1px solid #e5e7eb;
        }
        .ProseMirror .faq-accordion-editor:not(.is-open) .faq-accordion-editor-content > div.faq-accordion-content {
          display: none;
        }
      `}</style>
    </div>
  );
}
