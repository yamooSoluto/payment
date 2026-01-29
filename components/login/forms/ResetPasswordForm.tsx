'use client';

import { useState } from 'react';
import { User, Lock, Eye, EyeClosed } from 'iconoir-react';
import EmailInput from '../shared/EmailInput';
import PhoneInput from '../shared/PhoneInput';
import SmsVerificationInput from '../shared/SmsVerificationInput';

interface ResetPasswordFormProps {
  resetPasswordStep: number;
  name: string;
  setName: (value: string) => void;
  email: string;
  setEmail: (value: string) => void;
  phone: string;
  setPhone: (value: string) => void;
  isPhoneVerified: boolean;
  setIsPhoneVerified: (value: boolean) => void;
  verificationSent: boolean;
  setVerificationSent: (value: boolean) => void;
  verificationLoading: boolean;
  setVerificationLoading: (value: boolean) => void;
  verificationCode: string[];
  setVerificationCode: (value: string[]) => void;
  resendTimer: number;
  setResendTimer: (value: number) => void;
  expiryTimer: number;
  setExpiryTimer: (value: number) => void;
  message: { type: 'success' | 'error'; text: string } | null;
  setPhoneMessage: (value: { type: 'success' | 'error'; text: string } | null) => void;
  newPassword: string;
  setNewPassword: (value: string) => void;
  confirmNewPassword: string;
  setConfirmNewPassword: (value: string) => void;
  showPassword: boolean;
  setShowPassword: (value: boolean) => void;
  loading: boolean;
  onSendVerification: () => Promise<void>;
  onVerifyCode: () => Promise<void>;
  onExtendTime: () => void;
  onSubmit: (e: React.FormEvent) => Promise<void>;
}

export default function ResetPasswordForm({
  resetPasswordStep,
  name,
  setName,
  email,
  setEmail,
  phone,
  setPhone,
  isPhoneVerified,
  setIsPhoneVerified,
  verificationSent,
  setVerificationSent,
  verificationLoading,
  verificationCode,
  setVerificationCode,
  resendTimer,
  expiryTimer,
  setExpiryTimer,
  message,
  setPhoneMessage,
  newPassword,
  setNewPassword,
  confirmNewPassword,
  setConfirmNewPassword,
  showPassword,
  setShowPassword,
  loading,
  onSendVerification,
  onVerifyCode,
  onExtendTime,
  onSubmit,
}: ResetPasswordFormProps) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {/* Step 1: Name, Email, Phone + SMS Verification */}
      {resetPasswordStep === 1 && (
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

          <EmailInput
            value={email}
            onChange={setEmail}
            disabled={verificationSent}
            required
          />

          <PhoneInput
            value={phone}
            onChange={(value) => {
              setPhone(value);
              setIsPhoneVerified(false);
              setVerificationSent(false);
            }}
            isVerified={isPhoneVerified}
            verificationSent={verificationSent}
            verificationLoading={verificationLoading}
            message={message}
            onVerificationRequest={onSendVerification}
          />

          {verificationSent && !isPhoneVerified && (
            <SmsVerificationInput
              verificationCode={verificationCode}
              onChange={setVerificationCode}
              onPaste={(e) => {
                const paste = e.clipboardData.getData('text');
                const code = paste.replace(/[^0-9]/g, '').slice(0, 6);
                if (code.length === 6) {
                  setVerificationCode(code.split(''));
                }
              }}
              verificationLoading={verificationLoading}
              resendTimer={resendTimer}
              expiryTimer={expiryTimer}
              onResend={onSendVerification}
              onVerify={onVerifyCode}
              onExtend={onExtendTime}
            />
          )}
        </>
      )}

      {/* Step 2: New Password + Confirm Password */}
      {resetPasswordStep === 2 && (
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
    </form>
  );
}
