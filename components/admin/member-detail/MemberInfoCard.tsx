'use client';

import { User } from 'iconoir-react';
import { MEMBER_GROUPS, MEMBER_GROUP_OPTIONS } from '@/lib/constants';
import { Member } from './types';

interface MemberInfoCardProps {
  member: Member;
  editMode: boolean;
  formData: { name: string; phone: string; memo: string; newEmail: string; group: string };
  onFormChange: (data: { name: string; phone: string; memo: string; newEmail: string; group: string }) => void;
  onPasswordClick: () => void;
}

export default function MemberInfoCard({ member, editMode, formData, onFormChange, onPasswordClick }: MemberInfoCardProps) {
  return (
    <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-100">
      <div className="flex items-center gap-2 mb-4">
        <User className="w-5 h-5 text-blue-600" />
        <h2 className="text-lg font-semibold">기본 정보</h2>
      </div>
      <div className="space-y-0">
        {/* Row 1: 이메일, 이름, 연락처, 비밀번호 */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-4 pb-5 border-b border-gray-100">
          <div className="col-span-2 lg:col-span-1">
            <label className="block text-xs sm:text-sm text-gray-500 mb-1">이메일</label>
            {editMode ? (
              <div>
                <input
                  type="email"
                  value={formData.newEmail}
                  onChange={(e) => onFormChange({ ...formData, newEmail: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                />
                {formData.newEmail.toLowerCase() !== member.email.toLowerCase() && (
                  <p className="text-xs text-amber-600 mt-1">⚠️ 이메일 변경 시 재로그인 필요</p>
                )}
              </div>
            ) : (
              <p className="text-sm font-medium break-all text-left">{member.email || '-'}</p>
            )}
          </div>
          <div>
            <label className="block text-xs sm:text-sm text-gray-500 mb-1">이름</label>
            {editMode ? (
              <input type="text" value={formData.name} onChange={(e) => onFormChange({ ...formData, name: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm" />
            ) : (
              <p className="text-sm font-medium text-left">{member.name || '-'}</p>
            )}
          </div>
          <div>
            <label className="block text-xs sm:text-sm text-gray-500 mb-1">연락처</label>
            {editMode ? (
              <input type="text" value={formData.phone} onChange={(e) => onFormChange({ ...formData, phone: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm" />
            ) : (
              <p className="text-sm font-medium text-left">{member.phone || '-'}</p>
            )}
          </div>
          <div>
            <label className="block text-xs sm:text-sm text-gray-500 mb-1">비밀번호</label>
            {member?.deleted ? (
              <p className="text-xs sm:text-sm text-gray-400">삭제된 계정</p>
            ) : (
              <button onClick={onPasswordClick} className="px-3 py-1.5 bg-gray-100 text-gray-700 text-xs sm:text-sm rounded-lg hover:bg-gray-200 transition-colors">
                비밀번호 변경
              </button>
            )}
          </div>
        </div>

        {/* Row 2: 가입일, 최종 로그인, 최종 로그인 IP, 이용금액 */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-4 py-5 border-b border-gray-100">
          <div>
            <label className="block text-xs sm:text-sm text-gray-500 mb-1">가입일</label>
            <p className="text-sm font-medium text-left">{member.createdAt ? new Date(member.createdAt).toLocaleDateString('ko-KR') : '-'}</p>
          </div>
          <div>
            <label className="block text-xs sm:text-sm text-gray-500 mb-1">최종 로그인</label>
            <p className="text-sm font-medium text-left">{member.lastLoginAt ? new Date(member.lastLoginAt).toLocaleString('ko-KR') : '-'}</p>
          </div>
          <div>
            <label className="block text-xs sm:text-sm text-gray-500 mb-1">최종 로그인 IP</label>
            <p className="text-sm font-medium text-left">{member.lastLoginIP || '-'}</p>
          </div>
          <div>
            <label className="block text-xs sm:text-sm text-gray-500 mb-1">이용금액</label>
            <p className="text-sm font-medium text-blue-600 text-left">{(member.totalAmount ?? 0).toLocaleString()}원</p>
          </div>
        </div>

        {/* Row 3: 그룹, 무료체험, 메모 */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-4 pt-5">
          <div>
            <label className="block text-xs sm:text-sm text-gray-500 mb-1">그룹</label>
            {editMode ? (
              <select value={formData.group} onChange={(e) => onFormChange({ ...formData, group: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm">
                {MEMBER_GROUP_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            ) : (
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${member.group === 'internal' ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-gray-800'}`}>
                {MEMBER_GROUPS[member.group as keyof typeof MEMBER_GROUPS] || member.group || '일반'}
              </span>
            )}
          </div>
          <div>
            <label className="block text-xs sm:text-sm text-gray-500 mb-1">무료체험</label>
            {member.trialApplied ? (
              <div className="flex flex-col sm:flex-row sm:items-center gap-1">
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 w-fit">이용완료</span>
                <span className="text-xs text-gray-500">
                  {member.trialAppliedAt && new Date(member.trialAppliedAt).toLocaleDateString('ko-KR')}
                  {member.trialBrandName && ` · ${member.trialBrandName}`}
                </span>
              </div>
            ) : (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">미사용</span>
            )}
          </div>
          <div className="col-span-2">
            <label className="block text-xs sm:text-sm text-gray-500 mb-1">메모</label>
            {editMode ? (
              <textarea value={formData.memo} onChange={(e) => onFormChange({ ...formData, memo: e.target.value })} rows={2} className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm" placeholder="관리자 메모" />
            ) : (
              <p className="text-sm text-gray-600 text-left">{member.memo || '-'}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
