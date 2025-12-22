'use client';

import { useState } from 'react';
import TermsModal from './modals/TermsModal';
import PrivacyModal from './modals/PrivacyModal';

export default function Footer() {
  const [modalType, setModalType] = useState<'terms' | 'privacy' | null>(null);

  return (
    <>
      <footer className="bg-gray-100 py-8 px-4 mt-auto">
        <div className="max-w-4xl mx-auto text-sm text-gray-600 space-y-2">
          <p>
            상호: 주식회사 솔루투 | 대표자: 김채윤 |
            소재지: 경기도 화성시 메타폴리스로 42, 902호
          </p>
          <p>
            사업자등록번호: 610-86-36594 |
            통신판매신고번호: 2025-화성동탄-3518 |
            개인정보관리책임자: 김채윤
          </p>
          <p className="mt-4 pt-4 border-t border-gray-300">
            <span className="font-semibold">고객센터 문의</span> | 야무 YAMOO |
            평일: 10:00~17:00, 점심: 12:00~13:00 (토, 일, 공휴일 휴무)
          </p>
          <p>
            이메일 문의:{' '}
            <a href="mailto:yamoo@soluto.co.kr" className="text-yamoo-primary hover:underline">
              yamoo@soluto.co.kr
            </a>
          </p>

          <div className="mt-4 pt-4 border-t border-gray-300 flex gap-4">
            <button
              onClick={() => setModalType('terms')}
              className="text-gray-700 hover:text-yamoo-primary underline underline-offset-2 transition-colors"
            >
              이용약관
            </button>
            <button
              onClick={() => setModalType('privacy')}
              className="text-gray-700 hover:text-yamoo-primary underline underline-offset-2 transition-colors"
            >
              개인정보처리방침
            </button>
          </div>

          <p className="mt-4 text-gray-400 text-xs">
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
