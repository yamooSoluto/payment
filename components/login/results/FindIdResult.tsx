'use client';

import { CheckCircle } from 'iconoir-react';

interface FindIdResultProps {
  foundEmail: string;
  onLoginClick: () => void;
  onResetPasswordClick: () => void;
}

export default function FindIdResult({
  foundEmail,
  onLoginClick,
  onResetPasswordClick,
}: FindIdResultProps) {
  return (
    <div className="bg-green-50 rounded-xl p-6 text-center">
      <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
      <h3 className="text-lg font-bold text-gray-900 mb-2">아이디를 찾았습니다</h3>
      <p className="text-xl font-mono bg-white py-3 px-4 rounded-lg border border-green-200 mb-4">
        {foundEmail}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onLoginClick}
          className="flex-1 btn-primary py-3"
        >
          로그인하기
        </button>
        <button
          type="button"
          onClick={onResetPasswordClick}
          className="flex-1 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          비밀번호 찾기
        </button>
      </div>
    </div>
  );
}
