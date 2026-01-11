'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { NavArrowDown, NavArrowUp, Edit, Phone, CheckCircle, WarningCircle, Refresh, Eye, EyeClosed, Lock, Xmark } from 'iconoir-react';
import { auth } from '@/lib/firebase';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth';
import { useAuth } from '@/contexts/AuthContext';

interface UserProfileProps {
  email: string;
  name: string;
  phone: string;
  onPhoneChange?: (newPhone: string) => void;
}

export default function UserProfile({ email, name, phone, onPhoneChange }: UserProfileProps) {
  const { user } = useAuth();
  const [isExpanded, setIsExpanded] = useState(true);
  const [showPhone, setShowPhone] = useState(false);
  const [isChangingPhone, setIsChangingPhone] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  // 이름 변경 상태
  const [isChangingName, setIsChangingName] = useState(false);
  const [newName, setNewName] = useState('');
  const [nameLoading, setNameLoading] = useState(false);
  const [nameError, setNameError] = useState('');
  const [nameSuccess, setNameSuccess] = useState('');
  const [currentName, setCurrentName] = useState(name);
  // 비밀번호 변경 상태
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [verificationCode, setVerificationCode] = useState(['', '', '', '', '', '']);
  const [verificationSent, setVerificationSent] = useState(false);
  const [isPhoneVerified, setIsPhoneVerified] = useState(false);
  const [verificationLoading, setVerificationLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const [expiryTimer, setExpiryTimer] = useState(0);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // 연락처 마스킹 (010-****-5678)
  const maskPhone = (phoneNumber: string) => {
    if (!phoneNumber) return '-';
    const cleaned = phoneNumber.replace(/-/g, '');
    if (cleaned.length === 11) {
      return `${cleaned.slice(0, 3)}-****-${cleaned.slice(7)}`;
    } else if (cleaned.length === 10) {
      return `${cleaned.slice(0, 3)}-***-${cleaned.slice(6)}`;
    }
    return phoneNumber;
  };

  // 전화번호 포맷팅
  const formatPhone = (value: string) => {
    const numbers = value.replace(/[^0-9]/g, '');
    if (numbers.length <= 3) return numbers;
    if (numbers.length <= 7) return `${numbers.slice(0, 3)}-${numbers.slice(3)}`;
    return `${numbers.slice(0, 3)}-${numbers.slice(3, 7)}-${numbers.slice(7, 11)}`;
  };

  // 타이머 포맷
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // 재전송 타이머
  useEffect(() => {
    if (resendTimer <= 0) return;
    const timer = setInterval(() => {
      setResendTimer((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendTimer]);

  // 만료 타이머
  useEffect(() => {
    if (expiryTimer <= 0) return;
    const timer = setInterval(() => {
      setExpiryTimer((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [expiryTimer]);

  // 인증번호 발송
  const handleSendVerification = useCallback(async () => {
    if (!newPhone || newPhone.replace(/-/g, '').length < 10) {
      setError('올바른 연락처를 입력해주세요.');
      return;
    }

    setVerificationLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/sms-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: newPhone.replace(/-/g, ''),
          action: 'send',
          purpose: 'change-phone'
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || '인증번호 발송에 실패했습니다.');
        return;
      }

      setVerificationSent(true);
      setVerificationCode(['', '', '', '', '', '']);
      setSuccess('인증번호가 발송되었습니다.');
      setResendTimer(30);
      setExpiryTimer(180);

      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    } catch {
      setError('인증번호 발송 중 오류가 발생했습니다.');
    } finally {
      setVerificationLoading(false);
    }
  }, [newPhone]);

  // 시간 연장
  const handleExtendTime = () => {
    setExpiryTimer((prev) => prev + 180);
    setSuccess('인증 시간이 3분 연장되었습니다.');
  };

  // 개별 숫자 입력 처리
  const handleCodeChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newCode = [...verificationCode];
    newCode[index] = value.slice(-1);
    setVerificationCode(newCode);
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  // 백스페이스 처리
  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !verificationCode[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  // 붙여넣기 처리
  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    const newCode = [...verificationCode];
    for (let i = 0; i < pastedData.length; i++) {
      newCode[i] = pastedData[i];
    }
    setVerificationCode(newCode);
    const lastIndex = Math.min(pastedData.length, 5);
    inputRefs.current[lastIndex]?.focus();
  };

  // 인증번호 확인 및 연락처 변경
  const handleVerifyAndChange = async () => {
    const code = verificationCode.join('');
    if (code.length !== 6) {
      setError('6자리 인증번호를 입력해주세요.');
      return;
    }

    if (expiryTimer <= 0) {
      setError('인증번호가 만료되었습니다. 다시 요청해주세요.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // 1. 인증번호 확인
      const verifyRes = await fetch('/api/auth/sms-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: newPhone.replace(/-/g, ''),
          action: 'verify',
          code
        }),
      });

      const verifyData = await verifyRes.json();

      if (!verifyRes.ok) {
        setError(verifyData.error || '인증에 실패했습니다.');
        return;
      }

      setIsPhoneVerified(true);

      // 2. 연락처 변경
      const changeHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      if (user) {
        const idToken = await user.getIdToken();
        changeHeaders['Authorization'] = `Bearer ${idToken}`;
      }

      const changeRes = await fetch('/api/auth/change-phone', {
        method: 'POST',
        headers: changeHeaders,
        body: JSON.stringify({
          email,
          newPhone: newPhone.replace(/-/g, ''),
        }),
      });

      const changeData = await changeRes.json();

      if (!changeRes.ok) {
        setError(changeData.error || '연락처 변경에 실패했습니다.');
        return;
      }

      setSuccess('연락처가 변경되었습니다.');
      onPhoneChange?.(newPhone.replace(/-/g, ''));

      // 상태 초기화
      setTimeout(() => {
        setIsChangingPhone(false);
        resetState();
      }, 1500);

    } catch {
      setError('연락처 변경 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 상태 초기화
  const resetState = () => {
    setNewPhone('');
    setVerificationCode(['', '', '', '', '', '']);
    setVerificationSent(false);
    setIsPhoneVerified(false);
    setResendTimer(0);
    setExpiryTimer(0);
    setError('');
    setSuccess('');
  };

  // 취소
  const handleCancel = () => {
    setIsChangingPhone(false);
    resetState();
  };

  // 이름 변경 처리
  const handleChangeName = async () => {
    if (!newName.trim()) {
      setNameError('이름을 입력해주세요.');
      return;
    }

    if (newName.trim().length < 2) {
      setNameError('이름은 2자 이상 입력해주세요.');
      return;
    }

    setNameLoading(true);
    setNameError('');

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (user) {
        const idToken = await user.getIdToken();
        headers['Authorization'] = `Bearer ${idToken}`;
      }

      const res = await fetch('/api/auth/change-name', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          email,
          newName: newName.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setNameError(data.error || '이름 변경에 실패했습니다.');
        return;
      }

      setNameSuccess('이름이 변경되었습니다.');
      setCurrentName(newName.trim());

      setTimeout(() => {
        setIsChangingName(false);
        setNewName('');
        setNameSuccess('');
      }, 1500);

    } catch {
      setNameError('이름 변경 중 오류가 발생했습니다.');
    } finally {
      setNameLoading(false);
    }
  };

  // 이름 변경 취소
  const handleCancelName = () => {
    setIsChangingName(false);
    setNewName('');
    setNameError('');
    setNameSuccess('');
  };

  // 비밀번호 변경 처리
  const handleChangePassword = async () => {
    setPasswordError('');

    // 유효성 검사
    if (!currentPassword) {
      setPasswordError('현재 비밀번호를 입력해주세요.');
      return;
    }

    if (!newPassword) {
      setPasswordError('새 비밀번호를 입력해주세요.');
      return;
    }

    if (newPassword.length < 6) {
      setPasswordError('비밀번호는 6자 이상이어야 합니다.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('비밀번호가 일치하지 않습니다.');
      return;
    }

    if (currentPassword === newPassword) {
      setPasswordError('현재 비밀번호와 다른 비밀번호를 입력해주세요.');
      return;
    }

    setPasswordLoading(true);

    try {
      const user = auth.currentUser;

      if (!user || !user.email) {
        setPasswordError('로그인 상태를 확인해주세요.');
        return;
      }

      // 현재 비밀번호로 재인증
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);

      // 비밀번호 변경
      await updatePassword(user, newPassword);

      setPasswordSuccess('비밀번호가 변경되었습니다.');

      setTimeout(() => {
        handleClosePasswordModal();
      }, 1500);

    } catch (error: unknown) {
      console.error('Password change error:', error);
      const firebaseError = error as { code?: string };
      if (firebaseError.code === 'auth/wrong-password' || firebaseError.code === 'auth/invalid-credential') {
        setPasswordError('현재 비밀번호가 올바르지 않습니다.');
      } else if (firebaseError.code === 'auth/weak-password') {
        setPasswordError('비밀번호가 너무 약합니다. 더 강력한 비밀번호를 사용해주세요.');
      } else if (firebaseError.code === 'auth/requires-recent-login') {
        setPasswordError('보안을 위해 다시 로그인 후 시도해주세요.');
      } else {
        setPasswordError('비밀번호 변경에 실패했습니다.');
      }
    } finally {
      setPasswordLoading(false);
    }
  };

  // 비밀번호 모달 닫기
  const handleClosePasswordModal = () => {
    setShowPasswordModal(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError('');
    setPasswordSuccess('');
    setShowCurrentPassword(false);
    setShowNewPassword(false);
    setShowConfirmPassword(false);
  };

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
            {!isChangingName ? (
              <div className="flex items-center gap-3">
                <span className="font-medium text-gray-900">{currentName || '-'}</span>
                <button
                  onClick={() => {
                    setNewName(currentName || '');
                    setIsChangingName(true);
                  }}
                  className="flex items-center gap-1 text-sm text-yamoo-dark hover:text-yamoo-primary transition-colors"
                >
                  <Edit className="w-4 h-4" />
                  변경
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {nameError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
                    <WarningCircle className="w-4 h-4 flex-shrink-0" />
                    {nameError}
                  </div>
                )}
                {nameSuccess && (
                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-700 text-sm">
                    <CheckCircle className="w-4 h-4 flex-shrink-0" />
                    {nameSuccess}
                  </div>
                )}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="flex-1 min-w-0 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-yamoo-primary focus:border-transparent outline-none"
                    placeholder="새 이름"
                  />
                  <button
                    onClick={handleChangeName}
                    disabled={nameLoading}
                    className="flex-shrink-0 px-3 py-2 bg-yamoo-primary hover:bg-yamoo-dark text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap"
                  >
                    {nameLoading ? '저장중...' : '저장'}
                  </button>
                  <button
                    onClick={handleCancelName}
                    className="flex-shrink-0 px-3 py-2 border border-gray-300 text-gray-600 text-sm rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap"
                  >
                    취소
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="py-3 border-b border-gray-100">
            <span className="text-sm text-gray-500 block mb-1">연락처</span>
            {!isChangingPhone ? (
              <div className="flex items-center gap-3">
                <span className="font-medium text-gray-900">
                  {showPhone ? phone : maskPhone(phone)}
                </span>
                <button
                  onClick={() => setShowPhone(!showPhone)}
                  className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                  title={showPhone ? "연락처 숨기기" : "연락처 보기"}
                >
                  {showPhone ? (
                    <EyeClosed className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
                <button
                  onClick={() => setIsChangingPhone(true)}
                  className="flex items-center gap-1 text-sm text-yamoo-dark hover:text-yamoo-primary transition-colors"
                >
                  <Edit className="w-4 h-4" />
                  변경
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {/* 에러/성공 메시지 */}
                {error && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
                    <WarningCircle className="w-4 h-4 flex-shrink-0" />
                    {error}
                  </div>
                )}
                {success && (
                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-700 text-sm">
                    <CheckCircle className="w-4 h-4 flex-shrink-0" />
                    {success}
                  </div>
                )}

                {/* 새 연락처 입력 */}
                {!verificationSent && (
                  <div className="flex gap-2">
                    <div className="relative flex-1 min-w-0">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="tel"
                        value={newPhone}
                        onChange={(e) => setNewPhone(formatPhone(e.target.value))}
                        className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-yamoo-primary focus:border-transparent outline-none"
                        placeholder="새 연락처"
                      />
                    </div>
                    <button
                      onClick={handleSendVerification}
                      disabled={verificationLoading}
                      className="flex-shrink-0 px-3 py-2 bg-yamoo-primary hover:bg-yamoo-dark text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap"
                    >
                      {verificationLoading ? '발송중...' : '인증요청'}
                    </button>
                    <button
                      onClick={handleCancel}
                      className="flex-shrink-0 px-3 py-2 border border-gray-300 text-gray-600 text-sm rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap"
                    >
                      취소
                    </button>
                  </div>
                )}

                {/* 인증번호 입력 UI */}
                {verificationSent && !isPhoneVerified && (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="text-center mb-3">
                      <p className="text-sm font-medium text-gray-900">인증번호를 입력해 주세요</p>
                      <p className="text-xs text-gray-500 mt-1">{newPhone}</p>
                    </div>

                    {/* 6자리 입력 박스 */}
                    <div className="flex justify-center gap-1.5 mb-3">
                      {verificationCode.map((digit, index) => (
                        <input
                          key={index}
                          ref={(el) => { inputRefs.current[index] = el; }}
                          type="text"
                          inputMode="numeric"
                          maxLength={1}
                          value={digit}
                          onChange={(e) => handleCodeChange(index, e.target.value)}
                          onKeyDown={(e) => handleKeyDown(index, e)}
                          onPaste={handlePaste}
                          className="w-9 h-10 text-center text-lg font-bold border-2 border-gray-200 rounded-lg focus:border-yamoo-primary focus:ring-1 focus:ring-yamoo-primary/20 outline-none transition-all"
                        />
                      ))}
                    </div>

                    {/* 타이머 및 버튼 */}
                    <div className="flex items-center justify-between text-xs mb-3">
                      <button
                        type="button"
                        onClick={() => {
                          if (resendTimer > 0) {
                            setError(`${resendTimer}초 후에 재전송할 수 있습니다.`);
                            return;
                          }
                          handleSendVerification();
                        }}
                        disabled={verificationLoading}
                        className="text-gray-500 hover:text-gray-700 disabled:opacity-50"
                      >
                        재전송
                      </button>

                      <div className="flex items-center gap-2">
                        <span className={`${expiryTimer <= 30 ? 'text-red-500' : 'text-gray-600'}`}>
                          {formatTime(expiryTimer)}
                        </span>
                        <button
                          type="button"
                          onClick={handleExtendTime}
                          className="text-gray-500 hover:text-gray-700 flex items-center gap-0.5"
                        >
                          <Refresh className="w-3 h-3" />
                          연장
                        </button>
                      </div>
                    </div>

                    {/* 버튼 */}
                    <div className="flex gap-2">
                      <button
                        onClick={handleVerifyAndChange}
                        disabled={loading || verificationCode.join('').length !== 6}
                        className="flex-1 py-2 bg-yamoo-primary hover:bg-yamoo-dark text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                      >
                        {loading ? '처리 중...' : '변경하기'}
                      </button>
                      <button
                        onClick={handleCancel}
                        className="px-4 py-2 border border-gray-300 text-gray-600 text-sm rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        취소
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="py-3 border-b border-gray-100">
            <span className="text-sm text-gray-500 block mb-1">이메일 (ID)</span>
            <span className="font-medium text-gray-900">{email}</span>
            <p className="text-xs text-gray-400 mt-1">* 이메일을 변경하시려면 고객센터로 문의해 주세요.</p>
          </div>

          <div className="py-3">
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500">비밀번호</span>
              <button
                onClick={() => setShowPasswordModal(true)}
                className="flex items-center gap-1 text-sm text-yamoo-dark hover:text-yamoo-primary transition-colors"
              >
                <Lock className="w-4 h-4" />
                변경
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 비밀번호 변경 모달 */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={handleClosePasswordModal}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Close button */}
            <button
              onClick={handleClosePasswordModal}
              className="absolute top-4 right-4 p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <Xmark width={20} height={20} strokeWidth={1.5} className="text-gray-500" />
            </button>

            {/* Header */}
            <div className="pt-8 pb-4 px-6">
              <div className="w-12 h-12 bg-yamoo-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Lock width={24} height={24} strokeWidth={1.5} className="text-yamoo-primary" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 text-center">비밀번호 변경</h3>
            </div>

            {/* Content */}
            <div className="px-6 pb-6 space-y-4">
              {passwordError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
                  <WarningCircle className="w-4 h-4 flex-shrink-0" />
                  {passwordError}
                </div>
              )}
              {passwordSuccess && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-700 text-sm">
                  <CheckCircle className="w-4 h-4 flex-shrink-0" />
                  {passwordSuccess}
                </div>
              )}

              {/* 현재 비밀번호 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">현재 비밀번호</label>
                <div className="relative">
                  <input
                    type={showCurrentPassword ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full px-4 py-3 pr-12 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-yamoo-primary focus:border-transparent"
                    placeholder="현재 비밀번호 입력"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
                  >
                    {showCurrentPassword ? <EyeClosed className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {/* 새 비밀번호 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">새 비밀번호</label>
                <div className="relative">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-4 py-3 pr-12 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-yamoo-primary focus:border-transparent"
                    placeholder="새 비밀번호 입력 (6자 이상)"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
                  >
                    {showNewPassword ? <EyeClosed className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {/* 비밀번호 확인 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">비밀번호 확인</label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-4 py-3 pr-12 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-yamoo-primary focus:border-transparent"
                    placeholder="새 비밀번호 다시 입력"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
                  >
                    {showConfirmPassword ? <EyeClosed className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {/* Buttons */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleClosePasswordModal}
                  className="flex-1 py-3 px-4 rounded-lg font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={handleChangePassword}
                  disabled={passwordLoading}
                  className="flex-1 py-3 px-4 rounded-lg font-semibold text-white bg-yamoo-primary hover:bg-yamoo-dark transition-colors disabled:opacity-50"
                >
                  {passwordLoading ? '변경 중...' : '변경하기'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
