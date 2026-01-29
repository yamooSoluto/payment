'use client';

import { useRef, useEffect } from 'react';
import { Refresh } from 'iconoir-react';

interface SmsVerificationInputProps {
  verificationCode: string[];
  onChange: (code: string[]) => void;
  onPaste: (e: React.ClipboardEvent) => void;
  onVerify: () => void;
  onResend: () => void;
  onExtend: () => void;
  resendTimer: number;
  expiryTimer: number;
  verificationLoading: boolean;
  onResendError?: (message: string) => void;
  verifyButtonText?: string;
  loadingText?: string;
}

export default function SmsVerificationInput({
  verificationCode,
  onChange,
  onPaste,
  onVerify,
  onResend,
  onExtend,
  resendTimer,
  expiryTimer,
  verificationLoading,
  onResendError,
  verifyButtonText = '다음',
  loadingText = '확인 중...',
}: SmsVerificationInputProps) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleCodeChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;

    const newCode = [...verificationCode];
    newCode[index] = value.slice(-1);
    onChange(newCode);

    // 다음 입력창으로 자동 이동
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !verificationCode[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleResendClick = () => {
    if (resendTimer > 0) {
      if (onResendError) {
        onResendError(`${resendTimer}초 후에 재전송할 수 있습니다.`);
      }
      return;
    }
    onResend();
  };

  // 첫 번째 입력창 자동 포커스
  useEffect(() => {
    if (verificationCode.every(digit => digit === '')) {
      inputRefs.current[0]?.focus();
    }
  }, [verificationCode]);

  return (
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
            onPaste={onPaste}
            className="w-12 h-14 text-center text-xl font-bold border-2 border-gray-200 rounded-lg focus:border-yamoo-primary focus:ring-2 focus:ring-yamoo-primary/20 outline-none transition-all"
          />
        ))}
      </div>

      {/* 타이머 및 버튼 */}
      <div className="flex items-center justify-between text-sm">
        <button
          type="button"
          onClick={handleResendClick}
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
            onClick={onExtend}
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
        onClick={onVerify}
        disabled={verificationLoading || verificationCode.join('').length !== 6}
        className="w-full mt-4 btn-primary py-3 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {verificationLoading ? loadingText : verifyButtonText}
      </button>
    </div>
  );
}
