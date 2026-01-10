'use client';

import { Suspense, useState, useRef, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Mail, Lock, Eye, EyeClosed, WarningCircle, CheckCircle, User, Phone, Refresh } from 'iconoir-react';
import DynamicTermsModal from '@/components/modals/DynamicTermsModal';

type Mode = 'login' | 'signup' | 'find-id' | 'reset-password' | 'complete-profile';

function LoginForm() {
  const [mode, setMode] = useState<Mode>('login');

  // 공통 필드
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // 회원가입/아이디찾기/비밀번호찾기 추가 필드
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  // SMS 인증 관련
  const [verificationCode, setVerificationCode] = useState(['', '', '', '', '', '']);
  const [isPhoneVerified, setIsPhoneVerified] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);
  const [verificationLoading, setVerificationLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const [expiryTimer, setExpiryTimer] = useState(0);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // 회원가입 약관
  const [agreeToTerms, setAgreeToTerms] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState<'terms' | 'privacy' | null>(null);

  // UI 상태
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showResetOption, setShowResetOption] = useState(false);
  const [loading, setLoading] = useState(false);

  // 아이디 찾기 결과
  const [foundEmail, setFoundEmail] = useState('');

  // Google 로그인 후 프로필 완성용
  const [googleUser, setGoogleUser] = useState<{ email: string; displayName?: string } | null>(null);

  // 비밀번호 찾기 단계 (1: 정보입력+인증, 2: 새 비밀번호 입력)
  const [resetPasswordStep, setResetPasswordStep] = useState(1);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  const { signIn, signUp, signInWithGoogle } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  // 로그인 후 리다이렉트할 URL (없으면 /account)
  const redirectUrl = searchParams.get('redirect') || '/account';

  // 프로필 미완성으로 리다이렉트된 경우 처리
  const incompleteProfile = searchParams.get('incomplete') === 'true';
  const incompleteEmail = searchParams.get('email');

  // 프로필 미완성 상태로 리다이렉트된 경우 자동으로 complete-profile 모드 설정
  useEffect(() => {
    if (incompleteProfile && incompleteEmail) {
      setGoogleUser({ email: incompleteEmail, displayName: '' });
      setEmail(incompleteEmail);
      setMode('complete-profile');
    }
  }, [incompleteProfile, incompleteEmail]);

  // 전화번호 포맷팅 (010-1234-5678)
  const formatPhone = (value: string) => {
    const numbers = value.replace(/[^0-9]/g, '');
    if (numbers.length <= 3) return numbers;
    if (numbers.length <= 7) return `${numbers.slice(0, 3)}-${numbers.slice(3)}`;
    return `${numbers.slice(0, 3)}-${numbers.slice(3, 7)}-${numbers.slice(7, 11)}`;
  };

  // 타이머 포맷 (mm:ss)
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

    // 아이디 찾기, 프로필 완성일 때는 이름도 필수
    if ((mode === 'find-id' || mode === 'complete-profile') && !name.trim()) {
      setError('이름을 입력해주세요.');
      return;
    }

    setVerificationLoading(true);
    setError('');

    try {
      const purpose = (mode === 'signup' || mode === 'complete-profile') ? 'signup' : mode === 'find-id' ? 'find-id' : 'reset-password';

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
        setError(data.error || '인증번호 발송에 실패했습니다.');
        if (data.error?.includes('이미 가입된')) {
          setShowResetOption(true);
        }
        return;
      }

      setVerificationSent(true);
      setVerificationCode(['', '', '', '', '', '']);
      setSuccess('인증번호가 발송되었습니다.');

      // 30초 재전송 타이머 시작
      setResendTimer(30);

      // 3분 만료 타이머 시작
      setExpiryTimer(180);

      // 첫 번째 입력창으로 포커스
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    } catch {
      setError('인증번호 발송 중 오류가 발생했습니다.');
    } finally {
      setVerificationLoading(false);
    }
  }, [phone, mode, name]);

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

  // 시간 연장 (3분 추가)
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
    // 마지막 입력된 위치로 포커스
    const lastIndex = Math.min(pastedData.length, 5);
    inputRefs.current[lastIndex]?.focus();
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

      // 아이디 찾기인 경우 바로 아이디 조회
      if (mode === 'find-id') {
        await handleFindId();
      }

      // 비밀번호 찾기인 경우 다음 단계로
      if (mode === 'reset-password') {
        setResetPasswordStep(2);
        setSuccess('인증이 완료되었습니다. 새 비밀번호를 입력해주세요.');
      }
    } catch {
      setError('인증 확인 중 오류가 발생했습니다.');
    } finally {
      setVerificationLoading(false);
    }
  };

  // 아이디 찾기
  const handleFindId = async () => {
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/find-id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          phone: phone.replace(/-/g, ''),
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.found) {
        setError(data.error || '일치하는 회원 정보가 없습니다.');
        return;
      }

      setFoundEmail(data.email);
      setSuccess('아이디를 찾았습니다!');
    } catch {
      setError('아이디 찾기 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 비밀번호 재설정
  const handleResetPassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      setError('비밀번호는 6자 이상이어야 합니다.');
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          phone: phone.replace(/-/g, ''),
          newPassword,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || '비밀번호 변경에 실패했습니다.');
        return;
      }

      setSuccess('비밀번호가 변경되었습니다. 로그인해주세요.');
      setTimeout(() => handleModeChange('login'), 2000);
    } catch {
      setError('비밀번호 변경 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // 아이디 찾기 모드
    if (mode === 'find-id') {
      if (!isPhoneVerified) {
        setError('연락처 인증을 완료해주세요.');
        return;
      }
      await handleFindId();
      return;
    }

    // 비밀번호 찾기 모드
    if (mode === 'reset-password') {
      if (resetPasswordStep === 2) {
        await handleResetPassword();
      } else {
        if (!isPhoneVerified) {
          setError('연락처 인증을 완료해주세요.');
          return;
        }
      }
      return;
    }

    // 회원가입 유효성 검사
    if (mode === 'signup') {
      if (!name.trim()) {
        setError('이름을 입력해주세요.');
        return;
      }
      if (!isPhoneVerified) {
        setError('연락처 인증을 완료해주세요.');
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
    }

    if (password.length < 6) {
      setError('비밀번호는 6자 이상이어야 합니다.');
      return;
    }

    setLoading(true);

    try {
      if (mode === 'signup') {
        await signUp(email, password);

        const saveRes = await fetch('/api/auth/save-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            name,
            phone: phone.replace(/-/g, ''),
          }),
        });

        if (!saveRes.ok) {
          const saveData = await saveRes.json();
          if (saveData.error?.includes('이미 가입된')) {
            setError(saveData.error);
            setShowResetOption(true);
            return;
          }
          throw new Error(saveData.error || '사용자 정보 저장에 실패했습니다.');
        }
      } else {
        await signIn(email, password);
      }

      const url = new URL(redirectUrl, window.location.origin);
      url.searchParams.set('email', email);
      const finalUrl = url.pathname + url.search;
      router.push(finalUrl);
    } catch (err: unknown) {
      const error = err as { code?: string; message?: string };
      if (error.code === 'auth/email-already-in-use') {
        setError('이미 가입된 이메일입니다.');
        setShowResetOption(true);
      } else if (error.code === 'auth/invalid-email') {
        setError('유효하지 않은 이메일 형식입니다.');
      } else if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
        setError('이메일 또는 비밀번호가 올바르지 않습니다.');
      } else if (error.code === 'auth/invalid-credential') {
        setError('이메일 또는 비밀번호가 올바르지 않습니다.');
      } else {
        setError(error.message || '오류가 발생했습니다. 다시 시도해주세요.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setLoading(true);

    try {
      const user = await signInWithGoogle();
      const userEmail = user.email || '';

      // 사용자 프로필 확인 (이름, 연락처 있는지)
      const checkRes = await fetch('/api/auth/check-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail }),
      });

      const checkData = await checkRes.json();

      if (checkData.needsProfile) {
        // Google 로그인 시 기본 정보 먼저 저장 (email, provider만)
        await fetch('/api/auth/save-google-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: userEmail,
            displayName: user.displayName || '',
          }),
        });

        // 프로필 완성 필요 - 이름/연락처 입력 모드로 전환
        setGoogleUser({ email: userEmail, displayName: user.displayName || '' });
        setEmail(userEmail);
        setName(user.displayName || '');
        setMode('complete-profile');
        setLoading(false);
        return;
      }

      // 프로필 완성됨 - 바로 이동
      const url = new URL(redirectUrl, window.location.origin);
      url.searchParams.set('email', userEmail);
      const finalUrl = url.pathname + url.search;
      router.push(finalUrl);
    } catch {
      setError('Google 로그인에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // Google 로그인 후 프로필 완성 처리
  const handleCompleteProfile = async () => {
    if (!googleUser) return;

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
      // 1. 프로필 저장 + 비밀번호 설정 (서버에서 처리)
      const saveRes = await fetch('/api/auth/save-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: googleUser.email,
          name,
          phone: phone.replace(/-/g, ''),
          password,  // 비밀번호 추가
          provider: 'google',
        }),
      });

      if (!saveRes.ok) {
        const saveData = await saveRes.json();
        throw new Error(saveData.error || '프로필 저장에 실패했습니다.');
      }

      // 프로필 저장 완료 - 이동
      const url = new URL(redirectUrl, window.location.origin);
      url.searchParams.set('email', googleUser.email);
      const finalUrl = url.pathname + url.search;
      router.push(finalUrl);
    } catch (err: unknown) {
      const error = err as { message?: string };
      setError(error.message || '프로필 저장 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const getTitle = () => {
    if (mode === 'find-id') return '아이디 찾기';
    if (mode === 'reset-password') return '비밀번호 찾기';
    if (mode === 'signup') return '회원가입';
    if (mode === 'complete-profile') return '추가 정보 입력';
    return '로그인';
  };

  const getDescription = () => {
    if (mode === 'find-id') return '가입 시 등록한 정보로 아이디를 찾습니다';
    if (mode === 'reset-password') {
      if (resetPasswordStep === 2) return '새로운 비밀번호를 입력해주세요';
      return '가입 시 등록한 정보로 비밀번호를 재설정합니다';
    }
    if (mode === 'signup') return 'YAMOO 서비스를 시작해보세요';
    if (mode === 'complete-profile') return '회원가입을 완료하려면 아래 정보를 입력해주세요';
    return 'YAMOO 계정으로 로그인하세요';
  };

  // 모드 변경 시 상태 초기화
  const handleModeChange = (newMode: Mode) => {
    setMode(newMode);
    setError('');
    setSuccess('');
    setShowResetOption(false);
    setFoundEmail('');
    setResetPasswordStep(1);
    setNewPassword('');
    setConfirmNewPassword('');
    setVerificationCode(['', '', '', '', '', '']);
    setIsPhoneVerified(false);
    setVerificationSent(false);
    setExpiryTimer(0);
    setResendTimer(0);
    if (newMode !== 'signup' && newMode !== 'find-id' && newMode !== 'reset-password') {
      setName('');
      setPhone('');
      setAgreeToTerms(false);
    }
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
            if (resendTimer > 0) {
              setError(`${resendTimer}초 후에 재전송할 수 있습니다.`);
              return;
            }
            handleSendVerification();
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
            onClick={handleExtendTime}
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
        onClick={handleVerifyCode}
        disabled={verificationLoading || verificationCode.join('').length !== 6}
        className="w-full mt-4 btn-primary py-3 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {verificationLoading ? '확인 중...' : '다음'}
      </button>
    </div>
  );

  // 아이디 찾기 결과
  const renderFoundEmail = () => (
    <div className="bg-green-50 rounded-xl p-6 text-center">
      <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
      <h3 className="text-lg font-bold text-gray-900 mb-2">아이디를 찾았습니다</h3>
      <p className="text-xl font-mono bg-white py-3 px-4 rounded-lg border border-green-200 mb-4">
        {foundEmail}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => handleModeChange('login')}
          className="flex-1 btn-primary py-3"
        >
          로그인하기
        </button>
        <button
          type="button"
          onClick={() => handleModeChange('reset-password')}
          className="flex-1 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          비밀번호 찾기
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-lg p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              {getTitle()}
            </h1>
            <p className="text-gray-600">{getDescription()}</p>
          </div>

          {/* Success Message */}
          {success && !foundEmail && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-700">
              <CheckCircle className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm">{success}</span>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
              <div className="flex items-center gap-2">
                <WarningCircle width={20} height={20} strokeWidth={1.5} className="flex-shrink-0" />
                <span className="text-sm">{error}</span>
              </div>
              {showResetOption && (
                <button
                  type="button"
                  onClick={() => handleModeChange('reset-password')}
                  className="mt-3 w-full py-2 px-4 bg-red-100 hover:bg-red-200 text-red-800 text-sm font-medium rounded-lg transition-colors"
                >
                  비밀번호 재설정하기
                </button>
              )}
            </div>
          )}

          {/* 아이디 찾기 결과 표시 */}
          {mode === 'find-id' && foundEmail ? (
            renderFoundEmail()
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* 아이디 찾기: 이름 */}
              {mode === 'find-id' && (
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
              )}

              {/* 아이디 찾기: 연락처 + SMS 인증 */}
              {mode === 'find-id' && (
                <>
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
                          onChange={(e) => {
                            setPhone(formatPhone(e.target.value));
                            setIsPhoneVerified(false);
                            setVerificationSent(false);
                          }}
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
                          onClick={handleSendVerification}
                          disabled={verificationLoading || isPhoneVerified}
                          className="px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                        >
                          {verificationLoading ? '발송중...' : isPhoneVerified ? '인증완료' : '인증요청'}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* 인증번호 입력 UI */}
                  {verificationSent && !isPhoneVerified && renderVerificationCodeInput()}
                </>
              )}

              {/* Google 로그인 후 프로필 완성 */}
              {mode === 'complete-profile' && (
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
                          onChange={(e) => {
                            setPhone(formatPhone(e.target.value));
                            setIsPhoneVerified(false);
                            setVerificationSent(false);
                          }}
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
                          onClick={handleSendVerification}
                          disabled={verificationLoading || isPhoneVerified}
                          className="px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                        >
                          {verificationLoading ? '발송중...' : isPhoneVerified ? '인증완료' : '인증요청'}
                        </button>
                      )}
                    </div>
                    {/* 인증 완료 메시지 */}
                    {isPhoneVerified && (
                      <p className="mt-2 text-sm text-green-600 flex items-center gap-1">
                        <CheckCircle className="w-4 h-4" />
                        연락처 인증이 완료되었습니다.
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
                        onClick={(e) => { e.preventDefault(); setShowTermsModal('terms'); }}
                        className="text-yamoo-dark hover:underline"
                      >
                        이용약관
                      </button>
                      {' '}및{' '}
                      <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); setShowTermsModal('privacy'); }}
                        className="text-yamoo-dark hover:underline"
                      >
                        개인정보처리방침
                      </button>
                      에 동의합니다. <span className="text-red-500">(필수)</span>
                    </label>
                  </div>

                  {/* 완료 버튼 */}
                  <button
                    type="button"
                    onClick={handleCompleteProfile}
                    disabled={loading || !isPhoneVerified || !agreeToTerms}
                    className="w-full btn-primary py-3 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? '처리 중...' : '가입 완료'}
                  </button>
                </>
              )}

              {/* 비밀번호 찾기 1단계: 이름 + 이메일 + 연락처 */}
              {mode === 'reset-password' && resetPasswordStep === 1 && (
                <>
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

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      이메일(ID)
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yamoo-primary focus:border-transparent outline-none transition-all"
                        placeholder="email@example.com"
                        required
                        disabled={verificationSent}
                      />
                    </div>
                  </div>

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
                          onChange={(e) => {
                            setPhone(formatPhone(e.target.value));
                            setIsPhoneVerified(false);
                            setVerificationSent(false);
                          }}
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
                          onClick={handleSendVerification}
                          disabled={verificationLoading || isPhoneVerified}
                          className="px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                        >
                          {verificationLoading ? '발송중...' : isPhoneVerified ? '인증완료' : '인증요청'}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* 인증번호 입력 UI */}
                  {verificationSent && !isPhoneVerified && renderVerificationCodeInput()}
                </>
              )}

              {/* 비밀번호 찾기 2단계: 새 비밀번호 입력 */}
              {mode === 'reset-password' && resetPasswordStep === 2 && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      새 비밀번호
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
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

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      새 비밀번호 확인
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={confirmNewPassword}
                        onChange={(e) => setConfirmNewPassword(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yamoo-primary focus:border-transparent outline-none transition-all"
                        placeholder="비밀번호 재입력"
                        required
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full btn-primary py-3 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? '처리 중...' : '비밀번호 변경'}
                  </button>
                </>
              )}

              {/* 회원가입: 이름 */}
              {mode === 'signup' && (
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
                    />
                  </div>
                </div>
              )}

              {/* 회원가입: 연락처 + SMS 인증 */}
              {mode === 'signup' && (
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
                        onChange={(e) => {
                          setPhone(formatPhone(e.target.value));
                          setIsPhoneVerified(false);
                          setVerificationSent(false);
                        }}
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
                        onClick={handleSendVerification}
                        disabled={verificationLoading || isPhoneVerified}
                        className="px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                      >
                        {verificationLoading ? '발송중...' : isPhoneVerified ? '인증완료' : '인증요청'}
                      </button>
                    )}
                  </div>

                  {/* 인증번호 입력 */}
                  {verificationSent && !isPhoneVerified && renderVerificationCodeInput()}
                </div>
              )}

              {/* 로그인/회원가입: 이메일 */}
              {(mode === 'login' || mode === 'signup') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    이메일(ID)
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yamoo-primary focus:border-transparent outline-none transition-all"
                      placeholder="email@example.com"
                      required
                    />
                  </div>
                </div>
              )}

              {/* 로그인/회원가입: 비밀번호 */}
              {(mode === 'login' || mode === 'signup') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    비밀번호
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
              )}

              {/* 회원가입: 비밀번호 확인 */}
              {mode === 'signup' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    비밀번호 확인
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
              )}

              {/* 회원가입: 이용약관 동의 */}
              {mode === 'signup' && (
                <div className="flex items-start gap-2 pt-2">
                  <input
                    type="checkbox"
                    id="agreeToTerms"
                    checked={agreeToTerms}
                    onChange={(e) => setAgreeToTerms(e.target.checked)}
                    className="mt-1 w-4 h-4 text-yamoo-primary border-gray-300 rounded focus:ring-yamoo-primary cursor-pointer"
                  />
                  <label htmlFor="agreeToTerms" className="text-sm text-gray-600 cursor-pointer">
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); setShowTermsModal('terms'); }}
                      className="text-yamoo-dark hover:underline"
                    >
                      이용약관
                    </button>
                    {' '}및{' '}
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); setShowTermsModal('privacy'); }}
                      className="text-yamoo-dark hover:underline"
                    >
                      개인정보처리방침
                    </button>
                    에 동의합니다. <span className="text-red-500">(필수)</span>
                  </label>
                </div>
              )}

              {/* 로그인: 아이디 찾기 / 비밀번호 찾기 링크 */}
              {mode === 'login' && (
                <div className="text-center text-sm">
                  <button
                    type="button"
                    onClick={() => handleModeChange('find-id')}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    아이디 찾기
                  </button>
                  <span className="mx-2 text-gray-300">|</span>
                  <button
                    type="button"
                    onClick={() => handleModeChange('reset-password')}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    비밀번호 찾기
                  </button>
                </div>
              )}

              {/* Submit 버튼 */}
              {(mode === 'login' || mode === 'signup') && (
                <button
                  type="submit"
                  disabled={loading || (mode === 'signup' && (!isPhoneVerified || !agreeToTerms))}
                  className="w-full btn-primary py-3 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading
                    ? '처리 중...'
                    : mode === 'signup'
                    ? '회원가입'
                    : '로그인'}
                </button>
              )}
            </form>
          )}

          {/* Google 로그인 - 로그인/회원가입 모드에서만 */}
          {(mode === 'login' || mode === 'signup') && (
            <>
              <div className="my-6 flex items-center">
                <div className="flex-1 border-t border-gray-200"></div>
                <span className="px-4 text-sm text-gray-500">또는</span>
                <div className="flex-1 border-t border-gray-200"></div>
              </div>

              <button
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="w-full flex items-center justify-center gap-3 py-3 px-4 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                <span className="text-gray-700 font-medium">Google로 계속하기</span>
              </button>
            </>
          )}

          {/* 모드 전환 링크 */}
          <p className="mt-6 text-center text-gray-600">
            {mode === 'find-id' ? (
              <button
                onClick={() => handleModeChange('login')}
                className="text-yamoo-dark font-medium hover:underline"
              >
                로그인으로 돌아가기
              </button>
            ) : mode === 'reset-password' ? (
              <>
                <button
                  onClick={() => handleModeChange('find-id')}
                  className="text-gray-500 hover:text-gray-700"
                >
                  아이디 찾기
                </button>
                <span className="mx-2 text-gray-300">|</span>
                <button
                  onClick={() => handleModeChange('login')}
                  className="text-yamoo-dark font-medium hover:underline"
                >
                  로그인으로 돌아가기
                </button>
              </>
            ) : mode === 'signup' ? (
              <>
                이미 계정이 있으신가요?{' '}
                <button
                  onClick={() => handleModeChange('login')}
                  className="text-yamoo-dark font-medium hover:underline"
                >
                  로그인
                </button>
              </>
            ) : (
              <>
                계정이 없으신가요?{' '}
                <button
                  onClick={() => handleModeChange('signup')}
                  className="text-yamoo-dark font-medium hover:underline"
                >
                  회원가입
                </button>
              </>
            )}
          </p>
        </div>
      </div>

      {/* 이용약관/개인정보처리방침 모달 */}
      {showTermsModal && (
        <DynamicTermsModal
          type={showTermsModal}
          onClose={() => setShowTermsModal(null)}
        />
      )}
    </div>
  );
}

// 로딩 폴백 컴포넌트
function LoginFormFallback() {
  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-lg p-8 animate-pulse">
          <div className="text-center mb-8">
            <div className="h-8 bg-gray-200 rounded w-32 mx-auto mb-2"></div>
            <div className="h-4 bg-gray-200 rounded w-48 mx-auto"></div>
          </div>
          <div className="space-y-4">
            <div className="h-12 bg-gray-200 rounded"></div>
            <div className="h-12 bg-gray-200 rounded"></div>
            <div className="h-12 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFormFallback />}>
      <LoginForm />
    </Suspense>
  );
}
