'use client';

import { useState } from 'react';
import { Trash, RefreshDouble } from 'iconoir-react';

interface DeleteTenantModalProps {
  tenantId: string;
  brandName: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function DeleteTenantModal({ tenantId, brandName, onClose, onSuccess }: DeleteTenantModalProps) {
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (confirmText !== '매장 삭제') return;

    setDeleting(true);
    try {
      const response = await fetch(`/api/admin/tenants/${tenantId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        alert('매장이 삭제되었습니다.');
        onSuccess();
      } else {
        const data = await response.json();
        alert(data.error || '삭제에 실패했습니다.');
      }
    } catch (error) {
      console.error('Delete failed:', error);
      alert('삭제 중 오류가 발생했습니다.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl max-w-md w-full shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 border-b border-gray-100">
          <h3 className="text-lg font-bold text-red-600 flex items-center gap-2">
            <Trash className="w-5 h-5" />
            매장 삭제
          </h3>
        </div>
        <div className="p-6 space-y-4">
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-800 font-medium mb-2">
              &quot;{brandName}&quot; 매장을 삭제하시겠습니까?
            </p>
            <p className="text-xs text-red-600">
              • 삭제된 매장은 90일 후 영구 삭제됩니다.<br />
              • 삭제된 매장의 구독은 즉시 만료 처리됩니다.<br />
              • 이 작업은 취소할 수 없습니다.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              확인을 위해 <span className="font-bold text-red-600">&quot;매장 삭제&quot;</span>를 입력하세요
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="매장 삭제"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
            />
          </div>
        </div>
        <div className="flex gap-3 p-6 border-t border-gray-100">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
          >
            취소
          </button>
          <button
            onClick={handleDelete}
            disabled={confirmText !== '매장 삭제' || deleting}
            className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {deleting ? (
              <>
                <RefreshDouble className="w-4 h-4 animate-spin" />
                삭제 중...
              </>
            ) : (
              <>
                <Trash className="w-4 h-4" />
                삭제
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
