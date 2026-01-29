import { useState, useRef, useEffect, useCallback } from 'react';

type VerificationPurpose = 'signup' | 'find-id' | 'reset-password';

interface UseSmsVerificationProps {
  phone: string;
  name?: string;
  mode: 'login' | 'signup' | 'find-id' | 'reset-password' | 'complete-profile';
  onVerificationSuccess?: () => void;
  onError?: (message: string) => void;
  onSuccess?: (message: string) => void;
}

export function useSmsVerification({
  phone,
  name = '',
  mode,
  onVerificationSuccess,
  onError,
  onSuccess,
}: UseSmsVerificationProps) {
  // State
  const [verificationCode, setVerificationCode] = useState<string[]>(['', '', '', '', '', '']);
  const [isPhoneVerified, setIsPhoneVerified] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const [expiryTimer, setExpiryTimer] = useState(0);
  const [phoneMessage, setPhoneMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // 인증번호 발송
  const sendVerification = useCallback(async () => {
    if (!phone || phone.replace(/-/g, '').length < 10) {
      onError?.('올바른 연락처를 입력해주세요.');
      return;
    }

    // 아이디 찾기, 프로필 완성일 때는 이름도 필수
    if ((mode === 'find-id' || mode === 'complete-profile') && !name.trim()) {
      onError?.('이름을 입력해주세요.');
      return;
    }

    setIsVerifying(true);
    setPhoneMessage(null);

    try {
      const purpose: VerificationPurpose =
        (mode === 'signup' || mode === 'complete-profile') ? 'signup'
        : mode === 'find-id' ? 'find-id'
        : 'reset-password';

      const res = await fetch('/api/auth/sms-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: phone.replace(/-/g, ''),
          action: 'send',
          purpose
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setPhoneMessage({ type: 'error', text: data.error || '인증번호 발송에 실패했습니다.' });
        return;
      }

      setVerificationSent(true);
      setVerificationCode(['', '', '', '', '', '']);
      setPhoneMessage({ type: 'success', text: '인증번호가 발송되었습니다.' });

      // 30초 재전송 타이머 시작
      setResendTimer(30);

      // 3분 만료 타이머 시작
      setExpiryTimer(180);

      // 첫 번째 입력창으로 포커스
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    } catch {
      setPhoneMessage({ type: 'error', text: '인증번호 발송 중 오류가 발생했습니다.' });
    } finally {
      setIsVerifying(false);
    }
  }, [phone, mode, name, onError]);

  // 인증번호 확인
  const verifyCode = useCallback(async () => {
    const code = verificationCode.join('');
    if (code.length !== 6) {
      onError?.('6자리 인증번호를 입력해주세요.');
      return;
    }

    if (expiryTimer <= 0) {
      onError?.('인증번호가 만료되었습니다. 다시 요청해주세요.');
      return;
    }

    setIsVerifying(true);
    setPhoneMessage(null);

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
        setPhoneMessage({ type: 'error', text: data.error || '인증에 실패했습니다.' });
        return;
      }

      setIsPhoneVerified(true);
      setPhoneMessage({ type: 'success', text: '인증이 완료되었습니다.' });

      // 인증 성공 콜백 호출
      onVerificationSuccess?.();
    } catch {
      setPhoneMessage({ type: 'error', text: '인증 확인 중 오류가 발생했습니다.' });
    } finally {
      setIsVerifying(false);
    }
  }, [verificationCode, expiryTimer, phone, onError, onVerificationSuccess]);

  // 시간 연장 (3분 추가)
  const extendTime = useCallback(() => {
    setExpiryTimer((prev) => prev + 180);
    onSuccess?.('인증 시간이 3분 연장되었습니다.');
  }, [onSuccess]);

  // 개별 숫자 입력 처리
  const handleCodeChange = useCallback((index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;

    const newCode = [...verificationCode];
    newCode[index] = value.slice(-1);
    setVerificationCode(newCode);

    // 다음 입력창으로 자동 이동
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  }, [verificationCode]);

  // 백스페이스 처리
  const handleKeyDown = useCallback((index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !verificationCode[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }, [verificationCode]);

  // 붙여넣기 처리
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    const newCode = [...verificationCode];
    for (let i = 0; i < pastedData.length; i++) {
      newCode[i] = pastedData[i];
    }
    setVerificationCode(newCode);
    // 마지막 입력된 위치로 포커스
    const lastIndex = Math.min(pastedData.length, 5);
    inputRefs.current[lastIndex]?.focus();
  }, [verificationCode]);

  // 재전송 타이머
  useEffect(() => {
    if (resendTimer <= 0) return;
    const timer = setInterval(() => {
      setResendTimer((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [resendTimer]);

  // 만료 타이머
  useEffect(() => {
    if (expiryTimer <= 0) return;
    const timer = setInterval(() => {
      setExpiryTimer((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [expiryTimer]);

  // 상태 초기화 함수
  const resetVerification = useCallback(() => {
    setVerificationCode(['', '', '', '', '', '']);
    setIsPhoneVerified(false);
    setVerificationSent(false);
    setExpiryTimer(0);
    setResendTimer(0);
    setPhoneMessage(null);
  }, []);

  return {
    // State
    verificationCode,
    isPhoneVerified,
    verificationSent,
    resendTimer,
    expiryTimer,
    isVerifying,
    phoneMessage,
    inputRefs,

    // Functions
    sendVerification,
    verifyCode,
    extendTime,
    handleCodeChange,
    handleKeyDown,
    handlePaste,
    resetVerification,

    // Setters (for when phone changes)
    setIsPhoneVerified,
    setVerificationSent,
  };
}
