'use client';

import { useState } from 'react';
import { User, Trash, WarningTriangle, Xmark } from 'iconoir-react';
import { Loader2 } from 'lucide-react';

interface UserSettingsProps {
  email: string;
  authParam: string;
  hasActiveSubscriptions: boolean;
}

export default function UserSettings({ email, authParam, hasActiveSubscriptions }: UserSettingsProps) {
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const parseAuthParam = () => {
    const params = new URLSearchParams(authParam);
    return {
      token: params.get('token'),
      email: params.get('email'),
    };
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== '회원탈퇴') {
      setDeleteError('확인 문구를 정확히 입력해주세요.');
      return;
    }

    if (hasActiveSubscriptions) {
      setDeleteError('활성 구독이 있는 경우 탈퇴할 수 없습니다. 모든 구독을 먼저 해지해주세요.');
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);

    try {
      const { token, email: emailFromParam } = parseAuthParam();

      const response = await fetch('/api/account/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          email: emailFromParam,
          confirmText: deleteConfirmText,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        alert('회원 탈퇴가 완료되었습니다. 이용해 주셔서 감사합니다.');
        window.location.href = '/';
      } else {
        setDeleteError(data.error || '회원 탈퇴에 실패했습니다.');
      }
    } catch {
      setDeleteError('오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      {/* 기본 정보 */}
      <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
            <User width={20} height={20} strokeWidth={1.5} className="text-gray-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">기본 정보</h2>
            <p className="text-sm text-gray-500">계정 정보를 확인하세요</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between py-3 border-b border-gray-100">
            <span className="text-gray-600">이메일</span>
            <span className="font-medium text-gray-900">{email}</span>
          </div>
          <div className="flex items-center justify-between py-3 border-b border-gray-100">
            <span className="text-gray-600">인증 방식</span>
            <span className="font-medium text-gray-900">
              {authParam.includes('token=') ? '포탈 SSO' : 'Firebase 인증'}
            </span>
          </div>
        </div>
      </div>

      {/* 계정 설정 */}
      <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
        <h2 className="text-lg font-bold text-gray-900 mb-4">계정 설정</h2>

        <div className="border border-red-200 rounded-lg p-4 bg-red-50/50">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <Trash width={20} height={20} strokeWidth={1.5} className="text-red-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900 mb-1">회원 탈퇴</h3>
              <p className="text-sm text-gray-600 mb-3">
                계정을 삭제하면 모든 데이터가 영구적으로 삭제되며 복구할 수 없습니다.
              </p>
              <button
                onClick={() => setShowDeleteModal(true)}
                className="px-4 py-2 text-sm font-medium text-red-600 border border-red-300 rounded-lg hover:bg-red-100 transition-colors"
              >
                회원 탈퇴
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 회원 탈퇴 확인 모달 */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowDeleteModal(false)}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Close button */}
            <button
              onClick={() => setShowDeleteModal(false)}
              className="absolute top-4 right-4 p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <Xmark width={20} height={20} strokeWidth={1.5} className="text-gray-500" />
            </button>

            {/* Icon */}
            <div className="pt-8 pb-4 flex justify-center">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
                <WarningTriangle width={32} height={32} strokeWidth={1.5} className="text-red-600" />
              </div>
            </div>

            {/* Content */}
            <div className="px-6 pb-6">
              <h3 className="text-xl font-bold text-gray-900 text-center mb-2">
                정말 탈퇴하시겠습니까?
              </h3>
              <p className="text-gray-600 text-center text-sm mb-6">
                회원 탈퇴 시 모든 데이터가 영구적으로 삭제되며<br />
                복구할 수 없습니다.
              </p>

              {hasActiveSubscriptions && (
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 mb-4">
                  <p className="text-sm text-orange-800">
                    <span className="font-semibold">활성 구독이 있습니다.</span><br />
                    회원 탈퇴 전 모든 구독을 먼저 해지해주세요.
                  </p>
                </div>
              )}

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  확인을 위해 <span className="text-red-600 font-bold">&apos;회원탈퇴&apos;</span>를 입력해주세요
                </label>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="회원탈퇴"
                  className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                />
              </div>

              {deleteError && (
                <p className="text-sm text-red-600 mb-4">{deleteError}</p>
              )}

              {/* Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowDeleteModal(false);
                    setDeleteConfirmText('');
                    setDeleteError(null);
                  }}
                  className="flex-1 py-3 px-4 rounded-lg font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={handleDeleteAccount}
                  disabled={isDeleting || deleteConfirmText !== '회원탈퇴' || hasActiveSubscriptions}
                  className="flex-1 py-3 px-4 rounded-lg font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isDeleting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      처리 중...
                    </>
                  ) : (
                    '회원 탈퇴'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
