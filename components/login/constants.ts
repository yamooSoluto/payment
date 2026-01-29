import { Mode } from './types';

export const MODE_TITLES: Record<Mode, string> = {
  login: '로그인',
  signup: '회원가입',
  'find-id': '아이디 찾기',
  'reset-password': '비밀번호 찾기',
  'complete-profile': '추가 정보 입력',
};

export const MODE_DESCRIPTIONS: Record<Mode, string | ((step?: number) => string)> = {
  login: 'YAMOO 계정으로 로그인하세요',
  signup: 'YAMOO 서비스를 시작해보세요',
  'find-id': '가입 시 등록한 정보로 아이디를 찾습니다',
  'reset-password': (step?: number) => {
    if (step === 2) return '새로운 비밀번호를 입력해주세요';
    return '가입 시 등록한 정보로 비밀번호를 재설정합니다';
  },
  'complete-profile': '회원가입을 완료하려면 아래 정보를 입력해주세요',
};

export const VALIDATION_RULES = {
  PASSWORD_MIN_LENGTH: 6,
  PHONE_MIN_LENGTH: 10,
  VERIFICATION_CODE_LENGTH: 6,
} as const;

export const TIMER_DURATIONS = {
  RESEND_TIMER: 30, // seconds
  EXPIRY_TIMER: 180, // seconds (3 minutes)
  EXTEND_TIME: 180, // seconds (3 minutes)
} as const;

export const ERROR_MESSAGES = {
  INVALID_EMAIL: '유효하지 않은 이메일 형식입니다.',
  INVALID_PHONE: '올바른 연락처를 입력해주세요.',
  INVALID_PASSWORD_LENGTH: `비밀번호는 ${VALIDATION_RULES.PASSWORD_MIN_LENGTH}자 이상이어야 합니다.`,
  PASSWORD_MISMATCH: '비밀번호가 일치하지 않습니다.',
  PHONE_VERIFICATION_REQUIRED: '연락처 인증을 완료해주세요.',
  NAME_REQUIRED: '이름을 입력해주세요.',
  TERMS_REQUIRED: '이용약관 및 개인정보처리방침에 동의해주세요.',
  VERIFICATION_CODE_REQUIRED: '6자리 인증번호를 입력해주세요.',
  VERIFICATION_CODE_EXPIRED: '인증번호가 만료되었습니다. 다시 요청해주세요.',
  VERIFICATION_SEND_FAILED: '인증번호 발송에 실패했습니다.',
  VERIFICATION_FAILED: '인증에 실패했습니다.',
  EMAIL_ALREADY_IN_USE: '이미 가입된 이메일입니다.',
  USER_NOT_FOUND: '이메일 또는 비밀번호가 올바르지 않습니다.',
  WRONG_PASSWORD: '이메일 또는 비밀번호가 올바르지 않습니다.',
  INVALID_CREDENTIAL: '이메일 또는 비밀번호가 올바르지 않습니다.',
  FIND_ID_FAILED: '일치하는 회원 정보가 없습니다.',
  RESET_PASSWORD_FAILED: '비밀번호 변경에 실패했습니다.',
  GOOGLE_LOGIN_FAILED: 'Google 로그인에 실패했습니다. 다시 시도해주세요.',
  SAVE_USER_FAILED: '사용자 정보 저장에 실패했습니다.',
  PROFILE_SAVE_FAILED: '프로필 저장에 실패했습니다.',
  SESSION_CREATE_FAILED: '세션 생성에 실패했습니다. 다시 시도해주세요.',
  TOKEN_GENERATE_FAILED: '인증 토큰 발급에 실패했습니다. 다시 시도해주세요.',
  GENERIC_ERROR: '오류가 발생했습니다. 다시 시도해주세요.',
} as const;

export const SUCCESS_MESSAGES = {
  VERIFICATION_SENT: '인증번호가 발송되었습니다.',
  VERIFICATION_COMPLETED: '인증이 완료되었습니다.',
  TIME_EXTENDED: '인증 시간이 3분 연장되었습니다.',
  FIND_ID_SUCCESS: '아이디를 찾았습니다!',
  PASSWORD_RESET_SUCCESS: '비밀번호가 변경되었습니다. 로그인해주세요.',
} as const;

export const AUTH_ERROR_CODES = {
  EMAIL_ALREADY_IN_USE: 'auth/email-already-in-use',
  INVALID_EMAIL: 'auth/invalid-email',
  USER_NOT_FOUND: 'auth/user-not-found',
  WRONG_PASSWORD: 'auth/wrong-password',
  INVALID_CREDENTIAL: 'auth/invalid-credential',
} as const;

export const SMS_VERIFICATION_PURPOSES = {
  SIGNUP: 'signup',
  FIND_ID: 'find-id',
  RESET_PASSWORD: 'reset-password',
} as const;
