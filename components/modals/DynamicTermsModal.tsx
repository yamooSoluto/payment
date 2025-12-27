'use client';

import { useState, useEffect } from 'react';
import { Xmark } from 'iconoir-react';
import { Loader2 } from 'lucide-react';

interface DynamicTermsModalProps {
  type: 'terms' | 'privacy';
  onClose: () => void;
}

export default function DynamicTermsModal({ type, onClose }: DynamicTermsModalProps) {
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);

  const title = type === 'terms' ? 'YAMOO 서비스이용약관' : '개인정보처리방침';

  useEffect(() => {
    const fetchTerms = async () => {
      try {
        const response = await fetch('/api/terms');
        if (response.ok) {
          const data = await response.json();
          setContent(type === 'terms' ? data.termsOfService : data.privacyPolicy);
        }
      } catch (error) {
        console.error('Failed to load terms:', error);
        setContent('내용을 불러오는데 실패했습니다.');
      } finally {
        setLoading(false);
      }
    };

    fetchTerms();
  }, [type]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="bg-white rounded-xl max-w-3xl w-full mx-4 max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-bold">{title}</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <Xmark width={20} height={20} strokeWidth={1.5} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto text-sm text-gray-700">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
            </div>
          ) : (
            <div
              className="prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: content }}
            />
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
