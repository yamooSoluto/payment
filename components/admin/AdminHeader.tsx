'use client';

import { useState, useRef, useEffect } from 'react';
import { Menu, LogOut, User, NavArrowDown, Lock, Xmark } from 'iconoir-react';
import { useAdminAuth } from '@/contexts/AdminAuthContext';

interface AdminHeaderProps {
  onMenuClick: () => void;
}

const roleLabels: Record<string, string> = {
  super: '최고 관리자',
  admin: '관리자',
  viewer: '뷰어',
};

export default function AdminHeader({ onMenuClick }: AdminHeaderProps) {
  const { admin, logout } = useAdminAuth();
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [showPwModal, setShowPwModal] = useState(false);
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState('');

  // 외부 클릭 시 드롭다운 닫기
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    setShowDropdown(false);
    await logout();
  };

  const handleOpenPwModal = () => {
    setShowDropdown(false);
    setPwForm({ current: '', next: '', confirm: '' });
    setPwError('');
    setShowPwModal(true);
  };

  const handleChangePw = async () => {
    if (!pwForm.current || !pwForm.next || !pwForm.confirm) {
      setPwError('모든 항목을 입력해주세요.'); return;
    }
    if (pwForm.next !== pwForm.confirm) {
      setPwError('새 비밀번호가 일치하지 않습니다.'); return;
    }
    if (pwForm.next.length < 6) {
      setPwError('새 비밀번호는 6자 이상이어야 합니다.'); return;
    }
    setPwSaving(true);
    setPwError('');
    try {
      const res = await fetch('/api/admin/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: pwForm.current, newPassword: pwForm.next }),
      });
      const data = await res.json();
      if (!res.ok) { setPwError(data.error || '변경 실패'); return; }
      setShowPwModal(false);
    } catch {
      setPwError('오류가 발생했습니다.');
    } finally {
      setPwSaving(false);
    }
  };

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 lg:px-6">
      {/* 좌측: 햄버거 메뉴 (모바일) */}
      <button
        onClick={onMenuClick}
        className="lg:hidden p-2 text-gray-600 hover:bg-gray-100 rounded-lg"
      >
        <Menu className="w-6 h-6" />
      </button>

      {/* 좌측: 타이틀 (데스크탑) */}
      <div className="hidden lg:block">
        <h1 className="text-lg font-semibold text-gray-900">관리자 대시보드</h1>
      </div>

      {/* 우측: 관리자 정보 */}
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
            <User className="w-4 h-4 text-white" />
          </div>
          <div className="hidden sm:block text-left">
            <p className="text-sm font-medium text-gray-900">{admin?.name}</p>
            <p className="text-xs text-gray-500">{admin?.role ? roleLabels[admin.role] : ''}</p>
          </div>
          <NavArrowDown className={`w-4 h-4 text-gray-400 transition-transform ${showDropdown ? 'rotate-180' : ''}`} />
        </button>

        {/* 드롭다운 메뉴 */}
        {showDropdown && (
          <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
            <div className="px-4 py-2 border-b border-gray-100">
              <p className="text-sm font-medium text-gray-900">{admin?.name}</p>
              <p className="text-xs text-gray-500">{admin?.loginId}</p>
            </div>
            <button
              onClick={handleOpenPwModal}
              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Lock className="w-4 h-4" />
              비밀번호 변경
            </button>
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              로그아웃
            </button>
          </div>
        )}
      </div>

      {/* 비밀번호 변경 모달 */}
      {showPwModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-sm mx-4">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-bold text-gray-900">비밀번호 변경</h2>
              <button onClick={() => setShowPwModal(false)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <Xmark className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">현재 비밀번호</label>
                <input
                  type="password"
                  value={pwForm.current}
                  onChange={e => setPwForm(p => ({ ...p, current: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  placeholder="현재 비밀번호"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">새 비밀번호</label>
                <input
                  type="password"
                  value={pwForm.next}
                  onChange={e => setPwForm(p => ({ ...p, next: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  placeholder="6자 이상"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">새 비밀번호 확인</label>
                <input
                  type="password"
                  value={pwForm.confirm}
                  onChange={e => setPwForm(p => ({ ...p, confirm: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && handleChangePw()}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  placeholder="새 비밀번호 재입력"
                />
              </div>
              {pwError && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{pwError}</p>}
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setShowPwModal(false)}
                className="flex-1 py-2 border border-gray-200 text-sm text-gray-600 rounded-lg hover:bg-gray-50"
              >
                취소
              </button>
              <button
                onClick={handleChangePw}
                disabled={pwSaving}
                className="flex-1 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {pwSaving ? '변경 중...' : '변경'}
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
