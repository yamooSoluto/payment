'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Mail, Lock, Eye, EyeClosed, WarningCircle, CheckCircle } from 'iconoir-react';

function LoginForm() {
  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showResetOption, setShowResetOption] = useState(false);
  const [loading, setLoading] = useState(false);

  const { signIn, signUp, signInWithGoogle, resetPassword } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  // 로그인 후 리다이렉트할 URL (없으면 /pricing)
  const redirectUrl = searchParams.get('redirect') || '/pricing';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // 비밀번호 재설정 모드
    if (mode === 'reset') {
      if (!email) {
        setError('이메일을 입력해주세요.');
        return;
      }
      setLoading(true);
      try {
        await resetPassword(email);
        setSuccess('비밀번호 재설정 이메일을 보냈습니다. 이메일을 확인해주세요.');
      } catch (err: unknown) {
        const error = err as { code?: string };
        if (error.code === 'auth/user-not-found') {
          setError('등록되지 않은 이메일입니다.');
        } else if (error.code === 'auth/invalid-email') {
          setError('유효하지 않은 이메일 형식입니다.');
        } else {
          setError('오류가 발생했습니다. 다시 시도해주세요.');
        }
      } finally {
        setLoading(false);
      }
      return;
    }

    if (mode === 'signup' && password !== confirmPassword) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }

    if (password.length < 6) {
      setError('비밀번호는 6자 이상이어야 합니다.');
      return;
    }

    setLoading(true);

    try {
      if (mode === 'signup') {
        await signUp(email, password);
      } else {
        await signIn(email, password);
      }
      // 로그인한 이메일을 URL에 추가해서 리다이렉트
      // 이미 email 파라미터가 있으면 교체, 없으면 추가
      let finalUrl = redirectUrl;
      const url = new URL(redirectUrl, window.location.origin);
      url.searchParams.set('email', email);
      finalUrl = url.pathname + url.search;
      router.push(finalUrl);
    } catch (err: unknown) {
      const error = err as { code?: string };
      if (error.code === 'auth/email-already-in-use') {
        setError('이미 가입된 이메일입니다. 비밀번호를 재설정해주세요.');
        setShowResetOption(true);
      } else if (error.code === 'auth/invalid-email') {
        setError('유효하지 않은 이메일 형식입니다.');
      } else if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
        setError('이메일 또는 비밀번호가 올바르지 않습니다.');
      } else if (error.code === 'auth/invalid-credential') {
        setError('이메일 또는 비밀번호가 올바르지 않습니다.');
      } else {
        setError('오류가 발생했습니다. 다시 시도해주세요.');
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
      // 로그인한 이메일을 URL에 추가해서 리다이렉트
      // 이미 email 파라미터가 있으면 교체, 없으면 추가
      const userEmail = user.email || '';
      const url = new URL(redirectUrl, window.location.origin);
      url.searchParams.set('email', userEmail);
      const finalUrl = url.pathname + url.search;
      router.push(finalUrl);
    } catch (err) {
      setError('Google 로그인에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const getTitle = () => {
    if (mode === 'reset') return '비밀번호 재설정';
    if (mode === 'signup') return '회원가입';
    return '로그인';
  };

  const getDescription = () => {
    if (mode === 'reset') return '가입한 이메일로 재설정 링크를 보내드립니다';
    if (mode === 'signup') return 'YAMOO 서비스를 시작해보세요';
    return 'YAMOO 계정으로 로그인하세요';
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
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
          {success && (
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
                  onClick={() => {
                    setMode('reset');
                    setError('');
                    setShowResetOption(false);
                  }}
                  className="mt-3 w-full py-2 px-4 bg-red-100 hover:bg-red-200 text-red-800 text-sm font-medium rounded-lg transition-colors"
                >
                  비밀번호 재설정하기
                </button>
              )}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                이메일
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

            {mode !== 'reset' && (
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

            {/* Forgot Password Link */}
            {mode === 'login' && (
              <div className="text-right">
                <button
                  type="button"
                  onClick={() => {
                    setMode('reset');
                    setError('');
                    setSuccess('');
                    setShowResetOption(false);
                  }}
                  className="text-sm text-yamoo-dark hover:underline"
                >
                  비밀번호를 잊으셨나요?
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full btn-primary py-3 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading
                ? '처리 중...'
                : mode === 'reset'
                ? '재설정 이메일 보내기'
                : mode === 'signup'
                ? '회원가입'
                : '로그인'}
            </button>
          </form>

          {/* Divider - only show for login/signup */}
          {mode !== 'reset' && (
            <>
              <div className="my-6 flex items-center">
                <div className="flex-1 border-t border-gray-200"></div>
                <span className="px-4 text-sm text-gray-500">또는</span>
                <div className="flex-1 border-t border-gray-200"></div>
              </div>

              {/* Google Sign In */}
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

          {/* Mode Toggle */}
          <p className="mt-6 text-center text-gray-600">
            {mode === 'reset' ? (
              <button
                onClick={() => {
                  setMode('login');
                  setError('');
                  setSuccess('');
                  setShowResetOption(false);
                }}
                className="text-yamoo-dark font-medium hover:underline"
              >
                로그인으로 돌아가기
              </button>
            ) : mode === 'signup' ? (
              <>
                이미 계정이 있으신가요?{' '}
                <button
                  onClick={() => {
                    setMode('login');
                    setError('');
                    setShowResetOption(false);
                  }}
                  className="text-yamoo-dark font-medium hover:underline"
                >
                  로그인
                </button>
              </>
            ) : (
              <>
                계정이 없으신가요?{' '}
                <button
                  onClick={() => {
                    setMode('signup');
                    setError('');
                    setShowResetOption(false);
                  }}
                  className="text-yamoo-dark font-medium hover:underline"
                >
                  회원가입
                </button>
              </>
            )}
          </p>
        </div>
      </div>
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
