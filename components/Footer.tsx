'use client';

import { useState } from 'react';
import { MessageCircle, Mail, Copy, Check } from 'lucide-react';
import TermsModal from './modals/TermsModal';
import PrivacyModal from './modals/PrivacyModal';

export default function Footer() {
  const [modalType, setModalType] = useState<'terms' | 'privacy' | null>(null);
  const [copied, setCopied] = useState(false);

  const openChannelTalk = () => {
    if (window.ChannelIO) {
      window.ChannelIO('showMessenger');
    }
  };

  const handleCopyEmail = async () => {
    try {
      await navigator.clipboard.writeText('yamoo@soluto.co.kr');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      const textArea = document.createElement('textarea');
      textArea.value = 'yamoo@soluto.co.kr';
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <>
      <footer className="bg-black py-8 px-4 mt-auto">
        <div className="max-w-4xl mx-auto text-sm text-gray-300 space-y-2">
          <p>
            상호: 주식회사 솔루투 | 대표자: 김채윤 |
            소재지: 경기도 화성시 메타폴리스로 42, 902호
          </p>
          <p>
            사업자등록번호: 610-86-36594 |
            통신판매신고번호: 2025-화성동탄-3518 |
            개인정보관리책임자: 김채윤
          </p>

          {/* 고객센터 */}
          <div className="mt-4 pt-4 border-t border-gray-700 space-y-2">
            <p className="font-semibold text-white">고객센터</p>
            <div className="flex items-center gap-2">
              <MessageCircle className="w-4 h-4 text-gray-400" />
              <button
                onClick={openChannelTalk}
                className="text-yamoo-primary hover:underline font-medium"
              >
                야무 YAMOO
              </button>
              <span>| 평일: 10:00~17:00, 점심: 12:00~13:00 (토, 일, 공휴일 휴무)</span>
            </div>
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-gray-400" />
              <span>yamoo@soluto.co.kr</span>
              <button
                onClick={handleCopyEmail}
                className="p-1 hover:bg-gray-800 rounded transition-colors"
                title="이메일 복사"
              >
                {copied ? (
                  <Check className="w-4 h-4 text-green-400" />
                ) : (
                  <Copy className="w-4 h-4 text-gray-400 hover:text-white" />
                )}
              </button>
              {copied && <span className="text-xs text-green-400">복사됨</span>}
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-gray-700 flex gap-4">
            <button
              onClick={() => setModalType('terms')}
              className="text-gray-300 hover:text-yamoo-primary underline underline-offset-2 transition-colors"
            >
              이용약관
            </button>
            <button
              onClick={() => setModalType('privacy')}
              className="text-gray-300 hover:text-yamoo-primary underline underline-offset-2 transition-colors"
            >
              개인정보처리방침
            </button>
          </div>

          <p className="mt-4 text-gray-500 text-xs">
            Copyright 2024. Soluto Inc. All rights reserved.
          </p>
        </div>
      </footer>

      {modalType === 'terms' && (
        <TermsModal onClose={() => setModalType(null)} />
      )}
      {modalType === 'privacy' && (
        <PrivacyModal onClose={() => setModalType(null)} />
      )}
    </>
  );
}
