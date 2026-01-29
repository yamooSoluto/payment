'use client';

import { User, Phone, CheckCircle, WarningCircle, Refresh } from 'iconoir-react';
import { useRef } from 'react';

interface FindIdFormProps {
  name: string;
  setName: (name: string) => void;
  phone: string;
  setPhone: (phone: string) => void;
  isPhoneVerified: boolean;
  verificationSent: boolean;
  verificationLoading: boolean;
  verificationCode: string[];
  setVerificationCode: (code: string[]) => void;
  phoneMessage: { type: 'success' | 'error'; text: string } | null;
  resendTimer: number;
  expiryTimer: number;
  onSubmit: (e: React.FormEvent) => void;
  onSendVerification: () => void;
  onVerifyCode: () => void;
  onExtendTime: () => void;
  formatPhone: (value: string) => string;
  formatTime: (seconds: number) => string;
}

export default function FindIdForm({
  name,
  setName,
  phone,
  setPhone,
  isPhoneVerified,
  verificationSent,
  verificationLoading,
  verificationCode,
  setVerificationCode,
  phoneMessage,
  resendTimer,
  expiryTimer,
  onSubmit,
  onSendVerification,
  onVerifyCode,
  onExtendTime,
  formatPhone,
  formatTime,
}: FindIdFormProps) {
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
    <form onSubmit={onSubmit} className="space-y-4">
      {/* 이름 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          이름
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
            disabled={verificationSent}
          />
        </div>
      </div>

      {/* 연락처 + SMS 인증 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          연락처
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
    </form>
  );
}
