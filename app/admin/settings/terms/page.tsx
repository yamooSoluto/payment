'use client';

import { Page } from 'iconoir-react';

export default function TermsSettingsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Page className="w-8 h-8 text-blue-600" />
        <h1 className="text-2xl font-bold text-gray-900">약관 관리</h1>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
        <p className="text-gray-500">약관 관리 기능은 준비 중입니다.</p>
      </div>
    </div>
  );
}
