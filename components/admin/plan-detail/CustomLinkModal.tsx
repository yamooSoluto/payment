'use client';

import { useState, useEffect } from 'react';
import { Xmark, User, Search, RefreshDouble } from 'iconoir-react';
import Spinner from '@/components/admin/Spinner';
import { Plan, CustomLink, Member, LinkFormData } from './types';

interface CustomLinkModalProps {
  showModal: boolean;
  editingLink: CustomLink | null;
  plans: Plan[];
  onClose: () => void;
  onSave: (formData: LinkFormData) => Promise<void>;
}

function formatDateTime(dateString: string): string {
  return new Date(dateString).toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function CustomLinkModal({
  showModal,
  editingLink,
  plans,
  onClose,
  onSave,
}: CustomLinkModalProps) {
  // Initialize form data
  const getInitialFormData = (): LinkFormData => {
    if (editingLink) {
      return {
        planId: editingLink.planId,
        customAmount: editingLink.customAmount?.toString() || '',
        targetEmail: editingLink.targetEmail || '',
        targetUserName: editingLink.targetUserName || '',
        billingType: editingLink.billingType || 'recurring',
        subscriptionDays: editingLink.subscriptionDays?.toString() || '30',
        validFrom: editingLink.validFrom ? new Date(editingLink.validFrom).toISOString().slice(0, 16) : '',
        validUntil: editingLink.validUntil ? new Date(editingLink.validUntil).toISOString().slice(0, 16) : '',
        maxUses: editingLink.maxUses?.toString() || '0',
        memo: editingLink.memo || '',
      };
    }
    const now = new Date();
    const validUntil = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    return {
      planId: '',
      customAmount: '',
      targetEmail: '',
      targetUserName: '',
      billingType: 'recurring',
      subscriptionDays: '30',
      validFrom: now.toISOString().slice(0, 16),
      validUntil: validUntil.toISOString().slice(0, 16),
      maxUses: '1',
      memo: '',
    };
  };

  const [linkFormData, setLinkFormData] = useState<LinkFormData>(getInitialFormData());

  const [showMemberSearch, setShowMemberSearch] = useState(false);
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  const [memberSearchResults, setMemberSearchResults] = useState<Member[]>([]);
  const [memberSearchLoading, setMemberSearchLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Reset form data when modal opens/closes or editingLink changes
  useEffect(() => {
    if (showModal) {
      setLinkFormData(getInitialFormData());
      setShowMemberSearch(false);
      setMemberSearchQuery('');
      setMemberSearchResults([]);
    }
  }, [showModal, editingLink]);

  const selectedPlan = plans.find((p) => p.id === linkFormData.planId);

  const searchMembers = async (query: string) => {
    if (!query.trim()) {
      setMemberSearchResults([]);
      return;
    }
    setMemberSearchLoading(true);
    try {
      const response = await fetch(`/api/admin/members?search=${encodeURIComponent(query)}&limit=10`);
      if (response.ok) {
        const data = await response.json();
        setMemberSearchResults(data.members || []);
      }
    } catch (error) {
      console.error('Failed to search members:', error);
    } finally {
      setMemberSearchLoading(false);
    }
  };

  const handleSelectMember = (member: Member) => {
    setLinkFormData({
      ...linkFormData,
      targetEmail: member.email,
      targetUserName: member.displayName || member.name || '',
    });
    setShowMemberSearch(false);
    setMemberSearchQuery('');
    setMemberSearchResults([]);
  };

  const handleClearTargetMember = () => {
    setLinkFormData({
      ...linkFormData,
      targetEmail: '',
      targetUserName: '',
    });
  };

  const handleSave = async () => {
    if (!linkFormData.planId) {
      alert('플랜을 선택해주세요.');
      return;
    }
    if (!linkFormData.validFrom || !linkFormData.validUntil) {
      alert('유효기간을 설정해주세요.');
      return;
    }

    setSaving(true);
    try {
      await onSave(linkFormData);
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setShowMemberSearch(false);
    setMemberSearchQuery('');
    setMemberSearchResults([]);
    onClose();
  };

  if (!showModal) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl p-6 w-full max-w-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">
            {editingLink ? '링크 수정' : '새 커스텀 링크'}
          </h2>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <Xmark className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          {/* 플랜 선택 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              플랜 <span className="text-red-500">*</span>
            </label>
            <select
              value={linkFormData.planId}
              onChange={(e) => setLinkFormData({ ...linkFormData, planId: e.target.value })}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">플랜을 선택하세요</option>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name} ({plan.price.toLocaleString()}원/월)
                  {!plan.isActive && ' [숨김]'}
                </option>
              ))}
            </select>
          </div>

          {/* 커스텀 금액 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              커스텀 금액 (선택)
            </label>
            <div className="relative">
              <input
                type="number"
                value={linkFormData.customAmount}
                onChange={(e) => setLinkFormData({ ...linkFormData, customAmount: e.target.value })}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 pr-12"
                placeholder={selectedPlan ? selectedPlan.price.toString() : '플랜 가격 사용'}
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">원</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              비워두면 플랜의 기본 가격이 적용됩니다.
            </p>
          </div>

          {/* 결제 유형 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              결제 유형 <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setLinkFormData({ ...linkFormData, billingType: 'recurring' })}
                className={`flex-1 py-2.5 px-4 rounded-lg border-2 transition-colors ${
                  linkFormData.billingType === 'recurring'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 hover:border-gray-300 text-gray-600'
                }`}
              >
                <div className="font-medium">정기 결제</div>
                <div className="text-xs mt-0.5 opacity-75">매월 자동 갱신</div>
              </button>
              <button
                type="button"
                onClick={() => setLinkFormData({ ...linkFormData, billingType: 'onetime' })}
                className={`flex-1 py-2.5 px-4 rounded-lg border-2 transition-colors ${
                  linkFormData.billingType === 'onetime'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 hover:border-gray-300 text-gray-600'
                }`}
              >
                <div className="font-medium">1회성 결제</div>
                <div className="text-xs mt-0.5 opacity-75">지정 기간 후 해지</div>
              </button>
            </div>
          </div>

          {/* 이용 기간 (1회성일 때만) */}
          {linkFormData.billingType === 'onetime' && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <label className="block text-sm font-medium text-blue-700 mb-2">
                이용 기간 <span className="text-red-500">*</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {[
                  { days: 30, label: '1개월' },
                  { days: 60, label: '2개월' },
                  { days: 90, label: '3개월' },
                  { days: 180, label: '6개월' },
                  { days: 365, label: '1년' },
                ].map((option) => (
                  <button
                    key={option.days}
                    type="button"
                    onClick={() => setLinkFormData({ ...linkFormData, subscriptionDays: option.days.toString() })}
                    className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                      parseInt(linkFormData.subscriptionDays) === option.days
                        ? 'border-blue-500 bg-blue-100 text-blue-700'
                        : 'border-blue-200 hover:border-blue-300 text-blue-600'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <div className="mt-3 space-y-3">
                <div className="flex items-center gap-3">
                  <span className="text-sm text-blue-600 w-20">일수 입력:</span>
                  <input
                    type="number"
                    value={linkFormData.subscriptionDays}
                    onChange={(e) => setLinkFormData({ ...linkFormData, subscriptionDays: e.target.value })}
                    className="w-24 px-3 py-1.5 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                    min="1"
                  />
                  <span className="text-sm text-blue-600">일</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-blue-600 w-20">종료일:</span>
                  <input
                    type="date"
                    onChange={(e) => {
                      if (e.target.value) {
                        const endDate = new Date(e.target.value);
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        const diffDays = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                        if (diffDays > 0) {
                          setLinkFormData({ ...linkFormData, subscriptionDays: diffDays.toString() });
                        }
                      }
                    }}
                    className="w-40 px-3 py-1.5 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                    min={new Date().toISOString().split('T')[0]}
                  />
                </div>
              </div>
              <p className="text-xs text-blue-500 mt-2">
                결제 완료 후 {linkFormData.subscriptionDays}일간 서비스 이용 후 자동 해지됩니다.
              </p>
            </div>
          )}

          {/* 대상 회원 - MemberSearchDropdown 인라인 통합 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              대상 회원 (선택)
            </label>
            {linkFormData.targetEmail ? (
              <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <User className="w-5 h-5 text-blue-600" />
                <div className="flex-1 min-w-0">
                  {linkFormData.targetUserName && (
                    <p className="font-medium text-gray-900 truncate">{linkFormData.targetUserName}</p>
                  )}
                  <p className="text-sm text-gray-600 truncate">{linkFormData.targetEmail}</p>
                </div>
                <button
                  type="button"
                  onClick={handleClearTargetMember}
                  className="p-1 hover:bg-blue-100 rounded"
                >
                  <Xmark className="w-4 h-4 text-gray-500" />
                </button>
              </div>
            ) : (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowMemberSearch(!showMemberSearch)}
                  className="w-full flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg hover:border-gray-300 text-left"
                >
                  <Search className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-500">회원 검색...</span>
                </button>

                {showMemberSearch && (
                  <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg">
                    <div className="p-2 border-b">
                      <input
                        type="text"
                        value={memberSearchQuery}
                        onChange={(e) => {
                          setMemberSearchQuery(e.target.value);
                          searchMembers(e.target.value);
                        }}
                        placeholder="이름 또는 이메일로 검색"
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                        autoFocus
                      />
                    </div>
                    <div className="max-h-48 overflow-y-auto">
                      {memberSearchLoading ? (
                        <div className="p-4 text-center text-gray-500">
                          <Spinner size="sm" />
                        </div>
                      ) : memberSearchResults.length > 0 ? (
                        memberSearchResults.map((member) => (
                          <button
                            key={member.id}
                            type="button"
                            onClick={() => handleSelectMember(member)}
                            className="w-full flex items-center gap-3 px-4 py-2 hover:bg-gray-50 text-left"
                          >
                            <User className="w-4 h-4 text-gray-400" />
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-gray-900 truncate">
                                {member.displayName || member.name || '이름 없음'}
                              </p>
                              <p className="text-sm text-gray-500 truncate">{member.email}</p>
                            </div>
                          </button>
                        ))
                      ) : memberSearchQuery ? (
                        <div className="p-4 text-center text-gray-500 text-sm">
                          검색 결과가 없습니다
                        </div>
                      ) : (
                        <div className="p-4 text-center text-gray-500 text-sm">
                          이름 또는 이메일을 입력하세요
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
            <p className="text-xs text-gray-500 mt-1">
              비워두면 누구나 사용할 수 있습니다.
            </p>
          </div>

          {/* 링크 유효기간 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                링크 유효 시작일 <span className="text-red-500">*</span>
              </label>
              <input
                type="datetime-local"
                value={linkFormData.validFrom}
                onChange={(e) => setLinkFormData({ ...linkFormData, validFrom: e.target.value })}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                링크 유효 종료일 <span className="text-red-500">*</span>
              </label>
              <input
                type="datetime-local"
                value={linkFormData.validUntil}
                onChange={(e) => setLinkFormData({ ...linkFormData, validUntil: e.target.value })}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* 최대 사용 횟수 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              최대 사용 횟수
            </label>
            <input
              type="number"
              value={linkFormData.maxUses}
              onChange={(e) => setLinkFormData({ ...linkFormData, maxUses: e.target.value })}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="0"
              min="0"
            />
            <p className="text-xs text-gray-500 mt-1">
              0으로 설정하면 무제한 사용 가능합니다.
            </p>
          </div>

          {/* 메모 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              메모 (선택)
            </label>
            <textarea
              value={linkFormData.memo}
              onChange={(e) => setLinkFormData({ ...linkFormData, memo: e.target.value })}
              rows={2}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="관리용 메모 (예: ABC 기업 특가)"
            />
          </div>

          {/* 현재 사용 횟수 (수정 모드에서만) */}
          {editingLink && (
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm text-gray-600">
                현재 사용 횟수: <span className="font-medium">{editingLink.currentUses}회</span>
              </p>
              <p className="text-sm text-gray-500 mt-1">
                생성일: {formatDateTime(editingLink.createdAt)}
              </p>
            </div>
          )}
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={handleClose}
            className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {saving ? <RefreshDouble className="w-5 h-5 animate-spin mx-auto" /> : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}
