'use client';

import { useState } from 'react';
import { NavArrowDown, NavArrowUp } from 'iconoir-react';

interface UserProfileProps {
  email: string;
  name: string;
  phone: string;
}

export default function UserProfile({ email, name, phone }: UserProfileProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-6 flex items-center justify-between bg-gray-900 hover:bg-gray-800 transition-colors"
      >
        <h2 className="text-lg font-bold text-white">기본 정보</h2>
        {isExpanded ? (
          <NavArrowUp width={20} height={20} strokeWidth={1.5} className="text-gray-300" />
        ) : (
          <NavArrowDown width={20} height={20} strokeWidth={1.5} className="text-gray-300" />
        )}
      </button>

      {isExpanded && (
        <div className="px-6 pb-6 space-y-4">
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
      )}
    </div>
  );
}
