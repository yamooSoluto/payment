'use client';

import { useState } from 'react';
import { WarningTriangle, Xmark, NavArrowDown, NavArrowUp } from 'iconoir-react';
import { Loader2 } from 'lucide-react';

interface AccountDeletionProps {
  authParam: string;
  hasActiveSubscriptions: boolean;
}

export default function AccountDeletion({ authParam, hasActiveSubscriptions }: AccountDeletionProps) {
  const [isExpanded, setIsExpanded] = useState(false);
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
      setDeleteError('구독 중, 체험 중, 또는 해지 예정인 매장이 있는 경우 탈퇴할 수 없습니다.');
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
      <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
        {/* Header - 클릭하면 펼침/접힘 */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full p-6 flex items-center justify-between bg-gray-900 hover:bg-gray-800 transition-colors"
        >
          <h2 className="text-lg font-bold text-white">회원 탈퇴</h2>
          {isExpanded ? (
            <NavArrowUp width={20} height={20} strokeWidth={1.5} className="text-gray-300" />
          ) : (
            <NavArrowDown width={20} height={20} strokeWidth={1.5} className="text-gray-300" />
          )}
        </button>

        {/* Content - 펼쳐졌을 때만 표시 */}
        {isExpanded && (
          <div className="px-6 pt-6 pb-6">
            <div className="border border-red-200 rounded-lg p-4 bg-red-50/50">
              <p className="text-sm text-gray-600 mb-3">
                {hasActiveSubscriptions
                  ? '구독 중, 체험 중, 또는 해지 예정인 매장이 있어 탈퇴할 수 없습니다. 모든 구독/체험이 종료된 후 탈퇴가 가능합니다.'
                  : '계정을 삭제하면 모든 데이터가 영구적으로 삭제되며 복구할 수 없습니다.'}
              </p>
              <button
                onClick={() => setShowDeleteModal(true)}
                disabled={hasActiveSubscriptions}
                className="px-4 py-2 text-sm font-medium text-red-600 border border-red-300 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                회원 탈퇴
              </button>
            </div>
          </div>
        )}
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
                  disabled={isDeleting || deleteConfirmText !== '회원탈퇴'}
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
