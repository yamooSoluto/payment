'use client';

import { Mail, Lock, Eye, EyeClosed, User, Phone, CheckCircle, WarningCircle, Refresh } from 'iconoir-react';
import { useRef } from 'react';

interface CompleteProfileFormProps {
  email: string;
  name: string;
  setName: (name: string) => void;
  phone: string;
  setPhone: (phone: string) => void;
  password: string;
  setPassword: (password: string) => void;
  confirmPassword: string;
  setConfirmPassword: (password: string) => void;
  showPassword: boolean;
  setShowPassword: (show: boolean) => void;
  agreeToTerms: boolean;
  setAgreeToTerms: (agree: boolean) => void;
  rememberMe: boolean;
  setRememberMe: (remember: boolean) => void;
  isPhoneVerified: boolean;
  verificationSent: boolean;
  verificationLoading: boolean;
  verificationCode: string[];
  setVerificationCode: (code: string[]) => void;
  phoneMessage: { type: 'success' | 'error'; text: string } | null;
  resendTimer: number;
  expiryTimer: number;
  loading: boolean;
  onCompleteProfile: () => void;
  onSendVerification: () => void;
  onVerifyCode: () => void;
  onExtendTime: () => void;
  onShowTermsModal: (type: 'terms' | 'privacy') => void;
  formatPhone: (value: string) => string;
  formatTime: (seconds: number) => string;
}

export default function CompleteProfileForm({
  email,
  name,
  setName,
  phone,
  setPhone,
  password,
  setPassword,
  confirmPassword,
  setConfirmPassword,
  showPassword,
  setShowPassword,
  agreeToTerms,
  setAgreeToTerms,
  rememberMe,
  setRememberMe,
  isPhoneVerified,
  verificationSent,
  verificationLoading,
  verificationCode,
  setVerificationCode,
  phoneMessage,
  resendTimer,
  expiryTimer,
  loading,
  onCompleteProfile,
  onSendVerification,
  onVerifyCode,
  onExtendTime,
  onShowTermsModal,
  formatPhone,
  formatTime,
}: CompleteProfileFormProps) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // 개별 숫자 입력 처리
  const handleCodeChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;

    const newCode = [...verificationCode];
    newCode[index] = value.slice(-1);
    setVerificationCode(newCode);

    // 다음 입력창으로 자동 이동
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

  // 6자리 인증번호 입력 UI
  const renderVerificationCodeInput = () => (
    <div className="bg-gray-50 rounded-xl p-6 mt-4">
      <div className="text-center mb-4">
        <h3 className="text-lg font-bold text-gray-900 mb-1">문자를 발송했어요</h3>
        <p className="text-gray-600">인증번호를 입력해 주세요</p>
      </div>

      {/* 6자리 입력 박스 */}
      <div className="flex justify-center gap-2 mb-4">
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
            className="w-12 h-14 text-center text-xl font-bold border-2 border-gray-200 rounded-lg focus:border-yamoo-primary focus:ring-2 focus:ring-yamoo-primary/20 outline-none transition-all"
          />
        ))}
      </div>

      {/* 타이머 및 버튼 */}
      <div className="flex items-center justify-between text-sm">
        <button
          type="button"
          onClick={() => {
            if (resendTimer > 0) return;
            onSendVerification();
          }}
          disabled={verificationLoading}
          className="text-gray-500 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          재전송
        </button>

        <div className="flex items-center gap-3">
          <span className={`${expiryTimer <= 30 ? 'text-red-500' : 'text-gray-600'}`}>
            남은 시간 {formatTime(expiryTimer)}
          </span>
          <button
            type="button"
            onClick={onExtendTime}
            className="text-gray-500 hover:text-gray-700 underline flex items-center gap-1"
          >
            <Refresh className="w-4 h-4" />
            시간연장
          </button>
        </div>
      </div>

      {/* 확인 버튼 */}
      <button
        type="button"
        onClick={onVerifyCode}
        disabled={verificationLoading || verificationCode.join('').length !== 6}
        className="w-full mt-4 btn-primary py-3 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {verificationLoading ? '확인 중...' : '다음'}
      </button>
    </div>
  );

  return (
    <>
      {/* 이메일 표시 (읽기전용) */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          이메일(ID)
        </label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="email"
            value={email}
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
            className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yamoo-primary focus:border-transparent outline-none transition-all"
            placeholder="홍길동"
            required
          />
        </div>
      </div>

      {/* 연락처 + SMS 인증 */}
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
              onChange={(e) => setPhone(formatPhone(e.target.value))}
              className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-yamoo-primary focus:border-transparent outline-none transition-all ${
                isPhoneVerified ? 'border-green-500 bg-green-50' : 'border-gray-300'
              }`}
              placeholder="010-1234-5678"
              disabled={isPhoneVerified}
              required
            />
          </div>
          {!verificationSent && (
            <button
              type="button"
              onClick={onSendVerification}
              disabled={verificationLoading || isPhoneVerified}
              className="px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {verificationLoading ? '발송중...' : isPhoneVerified ? '인증완료' : '인증요청'}
            </button>
          )}
        </div>
        {/* SMS 인증 메시지 */}
        {phoneMessage && (
          <p className={`mt-2 text-sm flex items-center gap-1 ${phoneMessage.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
            {phoneMessage.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <WarningCircle className="w-4 h-4" />}
            {phoneMessage.text}
          </p>
        )}
      </div>

      {/* 인증번호 입력 UI */}
      {verificationSent && !isPhoneVerified && renderVerificationCodeInput()}

      {/* 비밀번호 설정 (포탈 로그인용) */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          비밀번호 <span className="text-red-500">*</span> <span className="text-gray-400 text-xs">(포탈 로그인용)</span>
        </label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full pl-10 pr-12 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yamoo-primary focus:border-transparent outline-none transition-all"
            placeholder="6자 이상"
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            {showPassword ? <EyeClosed width={20} height={20} strokeWidth={1.5} /> : <Eye width={20} height={20} strokeWidth={1.5} />}
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
            className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yamoo-primary focus:border-transparent outline-none transition-all"
            placeholder="비밀번호 재입력"
            required
          />
        </div>
      </div>

      {/* 이용약관 동의 */}
      <div className="flex items-start gap-2 pt-2">
        <input
          type="checkbox"
          id="agreeToTermsGoogle"
          checked={agreeToTerms}
          onChange={(e) => setAgreeToTerms(e.target.checked)}
          className="mt-1 w-4 h-4 text-yamoo-primary border-gray-300 rounded focus:ring-yamoo-primary cursor-pointer"
        />
        <label htmlFor="agreeToTermsGoogle" className="text-sm text-gray-600 cursor-pointer">
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); onShowTermsModal('terms'); }}
            className="text-yamoo-dark hover:underline"
          >
            이용약관
          </button>
          {' '}및{' '}
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); onShowTermsModal('privacy'); }}
            className="text-yamoo-dark hover:underline"
          >
            개인정보처리방침
          </button>
          에 동의합니다. <span className="text-red-500">(필수)</span>
        </label>
      </div>

      {/* 로그인 상태 유지 */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={rememberMe}
          onChange={(e) => setRememberMe(e.target.checked)}
          className="w-4 h-4 text-yamoo-primary border-gray-300 rounded focus:ring-yamoo-primary cursor-pointer"
        />
        <span className="text-sm text-gray-600">로그인 상태 유지</span>
      </label>

      {/* 완료 버튼 */}
      <button
        type="button"
        onClick={onCompleteProfile}
        disabled={loading || !isPhoneVerified || !agreeToTerms}
        className="w-full btn-primary py-3 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? '처리 중...' : '가입 완료'}
      </button>
    </>
  );
}
