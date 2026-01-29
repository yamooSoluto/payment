'use client';

import { Mail, Lock, Eye, EyeClosed } from 'iconoir-react';

interface LoginFormProps {
  email: string;
  setEmail: (email: string) => void;
  password: string;
  setPassword: (password: string) => void;
  showPassword: boolean;
  setShowPassword: (show: boolean) => void;
  rememberMe: boolean;
  setRememberMe: (remember: boolean) => void;
  loading: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onFindId: () => void;
  onResetPassword: () => void;
}

export default function LoginForm({
  email,
  setEmail,
  password,
  setPassword,
  showPassword,
  setShowPassword,
  rememberMe,
  setRememberMe,
  loading,
  onSubmit,
  onFindId,
  onResetPassword,
}: LoginFormProps) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {/* 이메일 */}
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

      {/* 비밀번호 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          비밀번호(PW)
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

      {/* 로그인 상태 유지 + 아이디/비밀번호 찾기 */}
      <div className="flex items-center justify-between text-sm">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
            className="w-4 h-4 text-yamoo-primary border-gray-300 rounded focus:ring-yamoo-primary cursor-pointer"
          />
          <span className="text-gray-600">로그인 상태 유지</span>
        </label>
        <div>
          <button
            type="button"
            onClick={onFindId}
            className="text-gray-500 hover:text-gray-700"
          >
            아이디 찾기
          </button>
          <span className="mx-2 text-gray-300">|</span>
          <button
            type="button"
            onClick={onResetPassword}
            className="text-gray-500 hover:text-gray-700"
          >
            비밀번호 찾기
          </button>
        </div>
      </div>

      {/* Submit 버튼 */}
      <button
        type="submit"
        disabled={loading}
        className="w-full btn-primary py-3 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? '처리 중...' : '로그인'}
      </button>
    </form>
  );
}
