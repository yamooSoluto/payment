'use client';

import Link from 'next/link';
import { Check } from 'iconoir-react';

export default function AccountDeletedPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
        {/* 아이콘 */}
        <div className="w-20 h-20 bg-gradient-to-br from-gray-100 to-gray-200 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
          <Check width={40} height={40} strokeWidth={2} className="text-gray-600" />
        </div>

        {/* 제목 */}
        <h1 className="text-2xl font-bold text-gray-900 mb-3">
          회원 탈퇴가 완료되었습니다
        </h1>

        {/* 메시지 */}
        <p className="text-gray-600 mb-8">
          그동안 YAMOO를 이용해 주셔서 감사합니다.<br />
          언제든 다시 찾아주시면 기쁘게 맞이하겠습니다.
        </p>

        {/* 안내 박스 */}
        <div className="bg-gray-50 rounded-xl p-5 mb-8 text-left border border-gray-100">
          <ul className="space-y-2 text-sm text-gray-600">
            <li className="flex items-start gap-2">
              <span className="text-gray-400 mt-0.5">•</span>
              <span>계정 정보는 더 이상 서비스에서 사용되지 않습니다.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-gray-400 mt-0.5">•</span>
              <span>관련 법령에 따라 일부 정보는 일정 기간 보관 후 파기됩니다.</span>
            </li>
          </ul>
        </div>

        {/* 버튼 */}
        <Link
          href="/"
          className="btn-primary w-full block text-center"
        >
          홈으로 이동
        </Link>
      </div>
    </div>
  );
}
