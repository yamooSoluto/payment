'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { NavArrowDown, NavArrowUp, Edit, Phone, CheckCircle, WarningCircle, Refresh } from 'iconoir-react';

interface UserProfileProps {
  email: string;
  name: string;
  phone: string;
  onPhoneChange?: (newPhone: string) => void;
}

export default function UserProfile({ email, name, phone, onPhoneChange }: UserProfileProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isChangingPhone, setIsChangingPhone] = useState(false);
  const [newPhone, setNewPhone] = useState('');
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
      const changeRes = await fetch('/api/auth/change-phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
            {!isChangingPhone ? (
              <div className="flex items-center justify-between">
                <span className="font-medium text-gray-900">{maskPhone(phone)}</span>
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
                    <div className="relative flex-1">
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
                      className="px-3 py-2 bg-yamoo-primary hover:bg-yamoo-dark text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                    >
                      {verificationLoading ? '발송중...' : '인증요청'}
                    </button>
                    <button
                      onClick={handleCancel}
                      className="px-3 py-2 border border-gray-300 text-gray-600 text-sm rounded-lg hover:bg-gray-50 transition-colors"
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

          <div className="py-3">
            <span className="text-sm text-gray-500 block mb-1">이메일</span>
            <span className="font-medium text-gray-900">{email}</span>
          </div>
        </div>
      )}
    </div>
  );
}
