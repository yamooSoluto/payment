'use client';

import { User } from 'iconoir-react';

interface UserProfileProps {
  email: string;
  name: string;
  phone: string;
}

export default function UserProfile({ email, name, phone }: UserProfileProps) {
  return (
    <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
          <User width={20} height={20} strokeWidth={1.5} className="text-gray-600" />
        </div>
        <h2 className="text-lg font-bold text-gray-900">기본 정보</h2>
      </div>

      <div className="space-y-4">
        <div className="py-3 border-b border-gray-100">
          <span className="text-sm text-gray-500 block mb-1">이름</span>
          <span className="font-medium text-gray-900">{name || '-'}</span>
        </div>
        <div className="py-3 border-b border-gray-100">
          <span className="text-sm text-gray-500 block mb-1">연락처</span>
          <span className="font-medium text-gray-900">{phone || '-'}</span>
        </div>
        <div className="py-3">
          <span className="text-sm text-gray-500 block mb-1">이메일</span>
          <span className="font-medium text-gray-900">{email}</span>
        </div>
      </div>
    </div>
  );
}
