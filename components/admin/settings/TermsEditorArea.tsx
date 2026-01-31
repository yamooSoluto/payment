'use client';

import { useEffect, forwardRef, useImperativeHandle } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import TextAlign from '@tiptap/extension-text-align';

const editorExtensions = [
  StarterKit,
  Underline,
  Link.configure({ openOnClick: false }),
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
];

const editorProps = {
  attributes: {
    class: 'prose prose-sm max-w-none min-h-[400px] p-4 focus:outline-none',
  },
};

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

export interface TermsEditorAreaHandle {
  setTermsContent: (content: string) => void;
  setPrivacyContent: (content: string) => void;
}

interface TermsEditorAreaProps {
  activeTab: 'terms' | 'privacy';
  onTermsChange: (html: string) => void;
  onPrivacyChange: (html: string) => void;
}

export default forwardRef<TermsEditorAreaHandle, TermsEditorAreaProps>(
  function TermsEditorArea({ activeTab, onTermsChange, onPrivacyChange }, ref) {
    const termsEditor = useEditor({
      extensions: editorExtensions,
      content: '',
      immediatelyRender: false,
      editorProps,
      onUpdate: ({ editor }) => {
        onTermsChange(editor.getHTML());
      },
    });

    const privacyEditor = useEditor({
      extensions: editorExtensions,
      content: '',
      immediatelyRender: false,
      editorProps,
      onUpdate: ({ editor }) => {
        onPrivacyChange(editor.getHTML());
      },
    });

    useImperativeHandle(ref, () => ({
      setTermsContent: (content: string) => {
        termsEditor?.commands.setContent(content);
      },
      setPrivacyContent: (content: string) => {
        privacyEditor?.commands.setContent(content);
      },
    }), [termsEditor, privacyEditor]);

    const currentEditor = activeTab === 'terms' ? termsEditor : privacyEditor;

    return (
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
    );
  }
);
