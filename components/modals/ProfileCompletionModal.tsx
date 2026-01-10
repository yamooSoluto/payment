'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Mail, Lock, Eye, EyeClosed, User, Phone, CheckCircle, WarningCircle, Refresh } from 'iconoir-react';
import DynamicTermsModal from './DynamicTermsModal';

export default function ProfileCompletionModal() {
  const { user } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 폼 필드
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [agreeToTerms, setAgreeToTerms] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState<'terms' | 'privacy' | null>(null);

  // SMS 인증
  const [verificationCode, setVerificationCode] = useState(['', '', '', '', '', '']);
  const [isPhoneVerified, setIsPhoneVerified] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);
  const [verificationLoading, setVerificationLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const [expiryTimer, setExpiryTimer] = useState(0);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // 프로필 체크
  useEffect(() => {
    const checkProfile = async () => {
      if (!user?.email) return;

      try {
        const res = await fetch('/api/auth/check-profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: user.email }),
        });
        const data = await res.json();

        if (data.needsProfile) {
          setShowModal(true);
          setName(user.displayName || '');
        }
      } catch (err) {
        console.error('Profile check failed:', err);
      }
    };

    checkProfile();
  }, [user]);

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

  // 인증번호 발송
  const handleSendVerification = useCallback(async () => {
    if (!phone || phone.replace(/-/g, '').length < 10) {
      setError('올바른 연락처를 입력해주세요.');
      return;
    }

    if (!name.trim()) {
      setError('이름을 입력해주세요.');
      return;
    }

    setVerificationLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/sms-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: phone.replace(/-/g, ''),
          action: 'send',
          purpose: 'signup'
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || '인증번호 발송에 실패했습니다.');
        return;
      }

      setVerificationSent(true);
      setVerificationCode(['', '', '', '', '', '']);
      setResendTimer(30);
      setExpiryTimer(180);
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    } catch {
      setError('인증번호 발송 중 오류가 발생했습니다.');
    } finally {
      setVerificationLoading(false);
    }
  }, [phone, name]);

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

  // 개별 숫자 입력
  const handleCodeChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newCode = [...verificationCode];
    newCode[index] = value.slice(-1);
    setVerificationCode(newCode);
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  // 백스페이스
  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !verificationCode[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  // 붙여넣기
  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    const newCode = [...verificationCode];
    for (let i = 0; i < pastedData.length; i++) {
      newCode[i] = pastedData[i];
    }
    setVerificationCode(newCode);
  };

  // 인증번호 확인
  const handleVerifyCode = async () => {
    const code = verificationCode.join('');
    if (code.length !== 6) {
      setError('6자리 인증번호를 입력해주세요.');
      return;
    }

    if (expiryTimer <= 0) {
      setError('인증번호가 만료되었습니다. 다시 요청해주세요.');
      return;
    }

    setVerificationLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/sms-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: phone.replace(/-/g, ''),
          action: 'verify',
          code
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || '인증에 실패했습니다.');
        return;
      }

      setIsPhoneVerified(true);
    } catch {
      setError('인증 확인 중 오류가 발생했습니다.');
    } finally {
      setVerificationLoading(false);
    }
  };

  // 프로필 완성 제출
  const handleSubmit = async () => {
    if (!name.trim()) {
      setError('이름을 입력해주세요.');
      return;
    }
    if (!isPhoneVerified) {
      setError('연락처 인증을 완료해주세요.');
      return;
    }
    if (password.length < 6) {
      setError('비밀번호는 6자 이상이어야 합니다.');
      return;
    }
    if (password !== confirmPassword) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }
    if (!agreeToTerms) {
      setError('이용약관 및 개인정보처리방침에 동의해주세요.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/save-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: user?.email,
          name,
          phone: phone.replace(/-/g, ''),
          password,
          provider: 'google',
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '프로필 저장에 실패했습니다.');
      }

      setShowModal(false);
      window.location.reload();
    } catch (err: unknown) {
      const error = err as { message?: string };
      setError(error.message || '프로필 저장 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  if (!showModal) return null;

  return (
    <>
      {/* 배경 오버레이 */}
      <div className="fixed inset-0 bg-black/60 z-50" />

      {/* 모달 */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
          <div className="p-6">
            {/* 헤더 */}
            <div className="text-center mb-6">
              <h2 className="text-xl font-bold text-gray-900 mb-2">추가 정보 입력</h2>
              <p className="text-gray-600 text-sm">서비스 이용을 위해 아래 정보를 입력해주세요</p>
            </div>

            {/* 에러 메시지 */}
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
                <WarningCircle className="w-5 h-5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-4">
              {/* 이메일 (읽기전용) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">이메일(ID)</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="email"
                    value={user?.email || ''}
                    className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg bg-gray-50 text-gray-600"
                    disabled
                  />
                </div>
              </div>

              {/* 이름 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  이름 <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yamoo-primary focus:border-transparent outline-none"
                    placeholder="홍길동"
                  />
                </div>
              </div>

              {/* 연락처 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  연락처 <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => {
                        setPhone(formatPhone(e.target.value));
                        setIsPhoneVerified(false);
                        setVerificationSent(false);
                      }}
                      className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-yamoo-primary focus:border-transparent outline-none ${
                        isPhoneVerified ? 'border-green-500 bg-green-50' : 'border-gray-300'
                      }`}
                      placeholder="010-1234-5678"
                      disabled={isPhoneVerified}
                    />
                  </div>
                  {!verificationSent && (
                    <button
                      type="button"
                      onClick={handleSendVerification}
                      disabled={verificationLoading || isPhoneVerified}
                      className="px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap"
                    >
                      {verificationLoading ? '발송중...' : isPhoneVerified ? '인증완료' : '인증요청'}
                    </button>
                  )}
                </div>
                {isPhoneVerified && (
                  <p className="mt-2 text-sm text-green-600 flex items-center gap-1">
                    <CheckCircle className="w-4 h-4" />
                    연락처 인증이 완료되었습니다.
                  </p>
                )}
              </div>

              {/* 인증번호 입력 */}
              {verificationSent && !isPhoneVerified && (
                <div className="bg-gray-50 rounded-xl p-4">
                  <div className="text-center mb-3">
                    <p className="text-gray-600 text-sm">인증번호를 입력해 주세요</p>
                  </div>
                  <div className="flex justify-center gap-2 mb-3">
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
                        className="w-10 h-12 text-center text-lg font-bold border-2 border-gray-200 rounded-lg focus:border-yamoo-primary outline-none"
                      />
                    ))}
                  </div>
                  <div className="flex items-center justify-between text-xs mb-3">
                    <button
                      type="button"
                      onClick={() => resendTimer === 0 && handleSendVerification()}
                      disabled={verificationLoading || resendTimer > 0}
                      className="text-gray-500 hover:text-gray-700 disabled:opacity-50"
                    >
                      재전송
                    </button>
                    <div className="flex items-center gap-2">
                      <span className={expiryTimer <= 30 ? 'text-red-500' : 'text-gray-600'}>
                        {formatTime(expiryTimer)}
                      </span>
                      <button
                        type="button"
                        onClick={() => setExpiryTimer(prev => prev + 180)}
                        className="text-gray-500 hover:text-gray-700 flex items-center gap-1"
                      >
                        <Refresh className="w-3 h-3" />
                        연장
                      </button>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleVerifyCode}
                    disabled={verificationLoading || verificationCode.join('').length !== 6}
                    className="w-full btn-primary py-2 text-sm disabled:opacity-50"
                  >
                    {verificationLoading ? '확인 중...' : '확인'}
                  </button>
                </div>
              )}

              {/* 비밀번호 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  비밀번호 <span className="text-red-500">*</span>
                  <span className="text-gray-400 text-xs ml-1">(포탈 로그인용)</span>
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-12 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yamoo-primary focus:border-transparent outline-none"
                    placeholder="6자 이상"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeClosed className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {/* 비밀번호 확인 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  비밀번호 확인 <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yamoo-primary focus:border-transparent outline-none"
                    placeholder="비밀번호 재입력"
                  />
                </div>
              </div>

              {/* 이용약관 */}
              <div className="flex items-start gap-2 pt-2">
                <input
                  type="checkbox"
                  id="agreeToTermsModal"
                  checked={agreeToTerms}
                  onChange={(e) => setAgreeToTerms(e.target.checked)}
                  className="mt-1 w-4 h-4 text-yamoo-primary border-gray-300 rounded focus:ring-yamoo-primary cursor-pointer"
                />
                <label htmlFor="agreeToTermsModal" className="text-sm text-gray-600 cursor-pointer">
                  <button
                    type="button"
                    onClick={() => setShowTermsModal('terms')}
                    className="text-yamoo-dark hover:underline"
                  >
                    이용약관
                  </button>
                  {' '}및{' '}
                  <button
                    type="button"
                    onClick={() => setShowTermsModal('privacy')}
                    className="text-yamoo-dark hover:underline"
                  >
                    개인정보처리방침
                  </button>
                  에 동의합니다. <span className="text-red-500">(필수)</span>
                </label>
              </div>

              {/* 제출 버튼 */}
              <button
                type="button"
                onClick={handleSubmit}
                disabled={loading || !isPhoneVerified || !agreeToTerms}
                className="w-full btn-primary py-3 disabled:opacity-50"
              >
                {loading ? '처리 중...' : '가입 완료'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 약관 모달 */}
      {showTermsModal && (
        <DynamicTermsModal
          type={showTermsModal}
          onClose={() => setShowTermsModal(null)}
        />
      )}
    </>
  );
}
