'use client';

import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';
import TrialForm from '@/components/TrialForm';

export default function TrialPage() {
  const { loading } = useAuth();

  // 로딩 중
  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black py-12 sm:py-16">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* 헤더 */}
        <div className="text-center mb-8 sm:mb-12">
          <p className="text-[#ffb203] text-sm sm:text-lg font-bold mb-4">
            야무지니 한 달 고용해보기
          </p>
          <h1 className="text-3xl sm:text-5xl font-bold text-white mb-4 sm:mb-6 leading-tight">
            한 달간 써보세요.<br />
            돌아갈 수 없을거에요.
          </h1>
          <ul className="text-gray-300 space-y-2 text-sm sm:text-base">
            <li>• 한 달간 비즈니스 플랜 무료 체험</li>
            <li>• 설정 비용 무료</li>
            <li>• 언제든 해지 가능 (위약금 없음)</li>
          </ul>
        </div>

        {/* 폼 카드 */}
        <TrialForm />
      </div>
    </div>
  );
}
