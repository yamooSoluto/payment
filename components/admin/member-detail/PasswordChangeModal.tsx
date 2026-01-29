'use client';

import { useState } from 'react';
import { RefreshDouble } from 'iconoir-react';

interface PasswordChangeModalProps {
  memberId: string;
  email: string;
  onClose: () => void;
}

export default function PasswordChangeModal({ memberId, email, onClose }: PasswordChangeModalProps) {
  const [form, setForm] = useState({ newPassword: '', confirmPassword: '' });
  const [changing, setChanging] = useState(false);

  const handleChange = async () => {
    if (!form.newPassword) { alert('새 비밀번호를 입력해주세요.'); return; }
    if (form.newPassword.length < 6) { alert('비밀번호는 최소 6자 이상이어야 합니다.'); return; }
    if (form.newPassword !== form.confirmPassword) { alert('비밀번호가 일치하지 않습니다.'); return; }
    if (!confirm('비밀번호를 변경하시겠습니까?')) return;

    setChanging(true);
    try {
      const response = await fetch(`/api/admin/members/${memberId}/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword: form.newPassword }),
      });
      const data = await response.json();
      if (response.ok) {
        alert('비밀번호가 변경되었습니다.');
        onClose();
      } else {
        alert(data.error || '비밀번호 변경에 실패했습니다.');
      }
    } catch (error) {
      console.error('Failed to change password:', error);
      alert('비밀번호 변경 중 오류가 발생했습니다.');
    } finally {
      setChanging(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-md w-full shadow-xl">
        <div className="p-6 border-b border-gray-100">
          <h3 className="text-lg font-bold text-gray-900">비밀번호 변경</h3>
          <p className="text-sm text-gray-500 mt-1">{email}</p>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">새 비밀번호</label>
            <input type="password" value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500" placeholder="새 비밀번호 입력" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">새 비밀번호 확인</label>
            <input type="password" value={form.confirmPassword} onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500" placeholder="비밀번호 확인" />
            {form.newPassword && form.confirmPassword && form.newPassword !== form.confirmPassword && (
              <p className="text-xs text-red-500 mt-1">비밀번호가 일치하지 않습니다.</p>
            )}
          </div>
        </div>
        <div className="p-6 border-t border-gray-100 flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50">취소</button>
          <button onClick={handleChange} disabled={changing || !form.newPassword || !form.confirmPassword || form.newPassword !== form.confirmPassword} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
            {changing ? (<><RefreshDouble className="w-4 h-4 animate-spin" />변경 중...</>) : '변경하기'}
          </button>
        </div>
      </div>
    </div>
  );
}
