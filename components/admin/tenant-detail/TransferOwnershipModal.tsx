'use client';

import { useState } from 'react';
import { Xmark, WarningTriangle } from 'iconoir-react';

interface TransferOwnershipModalProps {
  tenantId: string;
  brandName: string;
  currentEmail: string;
  onSuccess: (newEmail: string) => void;
  onClose: () => void;
}

export default function TransferOwnershipModal({
  tenantId,
  brandName,
  currentEmail,
  onSuccess,
  onClose,
}: TransferOwnershipModalProps) {
  const [newEmail, setNewEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{
    userCreated: boolean;
    newEmail: string;
    cardsDeleted: boolean;
    subscriptionBillingCleared: boolean;
    managersTransferred: number;
    managersDetached: number;
  } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim()) return;

    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}/transfer-ownership`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newEmail: newEmail.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '오류가 발생했습니다.');
        return;
      }
      setResult({
        userCreated: data.userCreated,
        newEmail: data.newEmail,
        cardsDeleted: data.cardsDeleted,
        subscriptionBillingCleared: data.subscriptionBillingCleared,
        managersTransferred: data.managersTransferred,
        managersDetached: data.managersDetached,
      });
    } catch {
      setError('네트워크 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
      onClick={e => { if (e.target === e.currentTarget && !result) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div>
            <p className="font-semibold text-gray-900">소유자 이전</p>
            <p className="text-xs text-gray-400 mt-0.5">{brandName}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <Xmark className="w-5 h-5" />
          </button>
        </div>

        {/* 본문 */}
        <div className="px-6 py-5">
          {result ? (
            /* 완료 상태 */
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-4 text-sm text-green-800">
                <p className="font-medium mb-2">이전 완료</p>
                <p className="mb-3">
                  <span className="font-mono text-xs bg-green-100 px-1.5 py-0.5 rounded">{currentEmail}</span>
                  {' → '}
                  <span className="font-mono text-xs bg-green-100 px-1.5 py-0.5 rounded">{result.newEmail}</span>
                </p>
                <ul className="text-xs text-green-700 space-y-1">
                  {result.userCreated && <li>• 새 계정 생성됨 (회원가입 시 매장 바로 확인 가능)</li>}
                  {result.cardsDeleted && <li>• 구 오너 카드 정보 삭제됨</li>}
                  {result.subscriptionBillingCleared && <li>• 구독 결제 수단 초기화됨 (새 카드 등록 필요)</li>}
                  {result.managersTransferred > 0 && <li>• 매니저 {result.managersTransferred}명 승계됨</li>}
                </ul>
              </div>
              <button
                onClick={() => onSuccess(result.newEmail)}
                className="w-full py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                확인
              </button>
            </div>
          ) : (
            /* 입력 폼 */
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex gap-3">
                <WarningTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-amber-800 space-y-1">
                  <p className="font-medium">주의사항</p>
                  <ul className="list-disc pl-3 space-y-0.5">
                    <li>매장 소유 계정이 변경됩니다.</li>
                    <li>구 오너의 카드 정보가 삭제됩니다.</li>
                    <li>구독 결제 수단이 초기화됩니다 (새 오너가 카드 재등록 필요).</li>
                    <li>이 매장만 담당하는 매니저 계정은 새 오너 소속으로 승계됩니다.</li>
                    <li>새 이메일 계정이 없으면 자동으로 생성됩니다.</li>
                    <li>이 작업은 되돌리기 어렵습니다.</li>
                  </ul>
                </div>
              </div>

              <div>
                <p className="text-xs text-gray-500 mb-1.5">현재 소유자</p>
                <p className="text-sm font-mono bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-700">
                  {currentEmail}
                </p>
              </div>

              <div>
                <label className="text-xs text-gray-500 mb-1.5 block">새 소유자 이메일</label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={e => setNewEmail(e.target.value)}
                  placeholder="new@example.com"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  autoFocus
                />
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-2.5 text-sm text-gray-600 hover:bg-gray-100 border border-gray-200 rounded-xl transition-colors"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={saving || !newEmail.trim()}
                  className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {saving ? '처리 중...' : '소유자 이전'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
