'use client';

import { useState } from 'react';
import { ChatBubble, Mail, Copy, Check, Building, MapPin } from 'iconoir-react';
import DynamicTermsModal from './modals/DynamicTermsModal';

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
      <footer className="bg-gray-800 py-8 px-4 mt-auto">
        <div className="max-w-5xl mx-auto text-sm text-gray-300">
          {/* PC: 2열 레이아웃 (중앙 정렬), 모바일: 1열 */}
          <div className="flex flex-col md:flex-row md:justify-center md:gap-24">
            {/* 좌측: 회사 정보 */}
            <div className="space-y-2">
              <p className="font-semibold text-white">Company</p>
              <div className="space-y-1">
                <div className="flex items-center gap-2 md:hidden">
                  <Building width={16} height={16} strokeWidth={1.5} className="text-gray-400 flex-shrink-0" />
                  <p>주식회사 솔루투</p>
                </div>
                <div className="hidden md:flex items-center gap-2">
                  <Building width={16} height={16} strokeWidth={1.5} className="text-gray-400 flex-shrink-0" />
                  <p>주식회사 솔루투 | 대표자: 김채윤</p>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin width={16} height={16} strokeWidth={1.5} className="text-gray-400 flex-shrink-0" />
                  <p>경기도 화성시 메타폴리스로 42, 902호</p>
                </div>
                <p className="md:hidden">대표자: 김채윤</p>
                <p className="mt-2 md:mt-1">사업자등록번호: 610-86-36594</p>
                <p className="md:hidden">통신판매신고번호: 2025-화성동탄-3518</p>
                <p className="md:hidden">개인정보관리책임자: 김채윤</p>
                <p className="hidden md:block">통신판매신고번호: 2025-화성동탄-3518 | 개인정보관리책임자: 김채윤</p>
              </div>
            </div>

            {/* 우측: 고객센터 */}
            <div className="mt-4 pt-4 border-t border-gray-700 md:mt-0 md:pt-0 md:border-t-0 space-y-2">
              <p className="font-semibold text-white">고객센터</p>
              <div className="flex items-start gap-2">
                <ChatBubble width={16} height={16} strokeWidth={1.5} className="text-gray-400 mt-0.5 flex-shrink-0" />
                <div>
                  <button
                    onClick={openChannelTalk}
                    className="text-yamoo-primary hover:underline font-medium"
                  >
                    야무 YAMOO
                  </button>
                  <p className="text-gray-400 text-xs mt-0.5">
                    평일 10:00~17:00 (점심 12:00~13:00)
                  </p>
                  <p className="text-gray-500 text-xs">토, 일, 공휴일 휴무</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Mail width={16} height={16} strokeWidth={1.5} className="text-gray-400 flex-shrink-0" />
                <span>yamoo@soluto.co.kr</span>
                <button
                  onClick={handleCopyEmail}
                  className="p-1 hover:bg-gray-800 rounded transition-colors"
                  title="이메일 복사"
                >
                  {copied ? (
                    <Check width={16} height={16} strokeWidth={1.5} className="text-green-400" />
                  ) : (
                    <Copy width={16} height={16} strokeWidth={1.5} className="text-gray-400 hover:text-white" />
                  )}
                </button>
                {copied && <span className="text-xs text-green-400">복사됨</span>}
              </div>
            </div>
          </div>

          {/* 하단: 약관 링크 + 저작권 */}
          <div className="mt-6 pt-4 border-t border-gray-700 flex flex-col md:flex-row md:justify-center md:items-center gap-2 md:gap-6">
            <div className="flex gap-4">
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
            <p className="text-gray-500 text-xs">
              Copyright 2025. YAMOO All rights reserved.
            </p>
          </div>
        </div>
      </footer>

      {modalType && (
        <DynamicTermsModal
          type={modalType}
          onClose={() => setModalType(null)}
        />
      )}
    </>
  );
}
