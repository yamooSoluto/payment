export type Mode = 'login' | 'signup' | 'find-id' | 'reset-password' | 'complete-profile';

export interface GoogleUser {
  email: string;
  displayName?: string;
}

export interface SmsVerificationState {
  code: string[];
  isVerified: boolean;
  sent: boolean;
  loading: boolean;
  resendTimer: number;
  expiryTimer: number;
}

export interface MessageState {
  type: 'success' | 'error';
  text: string;
}

export interface LoginFormData {
  email: string;
  password: string;
  rememberMe: boolean;
}

export interface SignupFormData {
  name: string;
  phone: string;
  email: string;
  password: string;
  confirmPassword: string;
  agreeToTerms: boolean;
  rememberMe: boolean;
}

export interface FindIdFormData {
  name: string;
  phone: string;
}

export interface ResetPasswordFormData {
  name: string;
  email: string;
  phone: string;
  newPassword: string;
  confirmNewPassword: string;
}

export interface CompleteProfileFormData {
  email: string;
  name: string;
  phone: string;
  password: string;
  confirmPassword: string;
  agreeToTerms: boolean;
  rememberMe: boolean;
}

export interface AuthError {
  code?: string;
  message?: string;
}
