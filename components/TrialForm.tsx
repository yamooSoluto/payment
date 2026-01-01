'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';
import DynamicTermsModal from '@/components/modals/DynamicTermsModal';

// 검증 함수
function validateEmail(email: string): boolean {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

function validatePhone(phone: string): boolean {
  const cleaned = phone.replace(/\D/g, '');
  return cleaned.length >= 10 && cleaned.length <= 11;
}

interface TrialFormProps {
  /** 폼 카드 스타일 (about 페이지용) */
  cardStyle?: boolean;
}

export default function TrialForm({ cardStyle = true }: TrialFormProps) {
  const { user } = useAuth();

  // 폼 상태
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    brandName: '',
    industry: '',
    agreeTerms: false
  });

  // SMS 인증 상태
  const [verificationCode, setVerificationCode] = useState('');
  const [isPhoneVerified, setIsPhoneVerified] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);
  const [verificationLoading, setVerificationLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);

  const [errors, setErrors] = useState({
    name: false,
    phone: false,
    email: false,
    brandName: false,
    industry: false
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [showErrorModal, setShowErrorModal] = useState(false);

  // 약관 모달 상태
  const [termsModalType, setTermsModalType] = useState<'terms' | 'privacy' | null>(null);

  // 타이머 효과
  useEffect(() => {
    if (resendTimer > 0) {
      const timer = setTimeout(() => setResendTimer(resendTimer - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendTimer]);

  // 로그인한 사용자 정보 자동 입력
  useEffect(() => {
    const fetchUserInfo = async () => {
      if (user?.email) {
        try {
          const response = await fetch(`/api/users/${encodeURIComponent(user.email)}`);
          if (response.ok) {
            const userData = await response.json();
            setFormData(prev => ({
              ...prev,
              name: userData.name || '',
              phone: userData.phone || '',
              email: userData.email || user.email || '',
            }));
            // 로그인한 사용자는 연락처 자동 인증 (이미 가입했으므로)
            if (userData.phone) {
              setIsPhoneVerified(true);
            }
          }
        } catch (error) {
          console.error('Failed to fetch user info:', error);
        }
      }
    };

    fetchUserInfo();
  }, [user]);

  // SMS 인증 발송
  const handleSendVerification = async () => {
    if (!validatePhone(formData.phone)) {
      setSubmitError('올바른 연락처를 입력해주세요.');
      setShowErrorModal(true);
      return;
    }

    setVerificationLoading(true);
    setSubmitError('');
    setShowErrorModal(false);

    try {
      const res = await fetch('/api/auth/sms-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: formData.phone.replace(/-/g, ''), action: 'send' }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || '인증번호 발송 실패');
      }

      setVerificationSent(true);
      setResendTimer(60); // 1분 (백엔드 재발송 제한과 일치)
      setSubmitError('');
      setShowErrorModal(false);
    } catch (error: any) {
      setSubmitError(error.message || '인증번호 발송에 실패했습니다.');
      setShowErrorModal(true);
    } finally {
      setVerificationLoading(false);
    }
  };

  // 인증번호 확인
  const handleVerifyCode = async () => {
    if (!verificationCode || verificationCode.length !== 6) {
      setSubmitError('6자리 인증번호를 입력해주세요.');
      setShowErrorModal(true);
      return;
    }

    setVerificationLoading(true);
    setSubmitError('');
    setShowErrorModal(false);

    try {
      const res = await fetch('/api/auth/sms-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: formData.phone.replace(/-/g, ''),
          action: 'verify',
          code: verificationCode
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || '인증번호가 일치하지 않습니다.');
      }

      setIsPhoneVerified(true);
      setSubmitError('');
      setShowErrorModal(false);
    } catch (error: any) {
      setSubmitError(error.message || '인증에 실패했습니다.');
      setShowErrorModal(true);
    } finally {
      setVerificationLoading(false);
    }
  };

  // 입력값 변경 핸들러
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;

    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));

    // 에러 초기화
    if (name in errors) {
      setErrors(prev => ({ ...prev, [name]: false }));
    }

    // 연락처 변경 시 인증 초기화
    if (name === 'phone' && isPhoneVerified && !user) {
      setIsPhoneVerified(false);
      setVerificationSent(false);
      setVerificationCode('');
    }
  };

  // 폼 검증
  const validateForm = (): boolean => {
    const newErrors = {
      name: formData.name.trim().length < 2,
      email: !validateEmail(formData.email.trim()),
      phone: !validatePhone(formData.phone.trim()),
      brandName: formData.brandName.trim().length < 2,
      industry: !formData.industry
    };

    setErrors(newErrors);
    return !Object.values(newErrors).some(Boolean);
  };

  // 폼 제출 핸들러
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 검증
    if (!validateForm()) {
      return;
    }

    // SMS 인증 확인
    if (!isPhoneVerified) {
      setSubmitError('연락처 인증을 완료해주세요.');
      setShowErrorModal(true);
      return;
    }

    // 동의 체크
    if (!formData.agreeTerms) {
      setSubmitError('개인정보 처리방침 및 이용약관에 동의해주세요.');
      setShowErrorModal(true);
      return;
    }

    // 중복 제출 방지
    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError('');
    setShowErrorModal(false);

    try {
      // /api/trial/create 호출
      const response = await fetch('/api/trial/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.name.trim(),
          email: formData.email.trim(),
          phone: formData.phone.trim(),
          brandName: formData.brandName.trim(),
          industry: formData.industry,
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '신청 중 오류가 발생했습니다.');
      }

      // 성공
      setIsSuccess(true);
    } catch (error: any) {
      console.error('Form submission error:', error);
      setSubmitError(error.message || '신청 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
      setShowErrorModal(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  // 성공 화면
  if (isSuccess) {
    return (
      <div className={cardStyle ? "bg-white rounded-2xl p-5 sm:p-8" : ""}>
        <div className="text-center py-6 sm:py-8">
          <div className="text-4xl sm:text-6xl mb-3 sm:mb-4">🎉</div>
          <h3 className="text-xl sm:text-2xl font-bold text-gray-900 mb-4">무료체험 신청이 완료되었습니다!</h3>

          <div className="bg-gray-50 rounded-lg p-4 mb-4">
            <p className="text-gray-600 text-sm sm:text-base mb-2">서비스 이용을 위한 정보가</p>
            <p className="text-gray-600 text-sm sm:text-base mb-3">
              <span className="font-semibold text-[#ffbf03]">{formData.phone}</span>으로 발송되었습니다.
            </p>
            <p className="text-gray-500 text-sm">
              📱 아이디: <strong>{formData.email}</strong>
            </p>
            <p className="text-gray-500 text-sm">
              🔑 임시 비밀번호 및 포탈 링크
            </p>
          </div>

          <p className="text-gray-500 text-xs sm:text-sm mb-6">
            카카오톡을 확인해 주세요.<br />
            <span className="text-gray-400">(카카오톡 미사용 시 문자를 확인해 주세요)</span>
          </p>

          <a
            href="https://app.yamoo.ai.kr"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block bg-[#ffbf03] hover:bg-[#e6ac00] text-gray-900 font-bold py-3 px-8 rounded-lg transition-colors"
          >
            포탈 이동
          </a>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={cardStyle ? "bg-white rounded-2xl p-5 sm:p-8" : ""}>
        <div className="text-center mb-4 sm:mb-6">
          <span className="text-3xl sm:text-4xl">🚀</span>
          <h3 className="text-xl sm:text-2xl font-bold text-gray-900 mt-2">AI 야무지니 무료 체험</h3>
          <p className="text-gray-500 text-sm sm:text-base mt-1">10분이면 시작 가능! 바로 체험해보세요</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 이름 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              이름<span className="text-red-500">*</span>
              {user && <span className="text-xs text-gray-500 ml-2">(자동입력)</span>}
            </label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              placeholder="홍길동"
              className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-yellow-400 focus:border-transparent outline-none ${
                errors.name ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {errors.name && (
              <p className="text-red-500 text-xs mt-1">이름을 2자 이상 입력해주세요</p>
            )}
          </div>

          {/* 연락처 + SMS 인증 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              연락처<span className="text-red-500">*</span>
              {user && <span className="text-xs text-gray-500 ml-2">(자동입력)</span>}
            </label>
            <div className="flex gap-1 sm:gap-2">
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleInputChange}
                placeholder="010-1234-5678"
                disabled={isPhoneVerified}
                className={`flex-1 px-2 sm:px-4 py-3 border rounded-lg focus:ring-2 focus:ring-yellow-400 focus:border-transparent outline-none ${
                  errors.phone ? 'border-red-500' : 'border-gray-300'
                } ${isPhoneVerified ? 'bg-gray-100 cursor-not-allowed' : ''}`}
              />
              {!isPhoneVerified && (
                <button
                  type="button"
                  onClick={handleSendVerification}
                  disabled={verificationLoading || !validatePhone(formData.phone) || resendTimer > 0}
                  className="px-2 sm:px-4 py-3 bg-[#ffbf03] hover:bg-[#e6ac00] text-gray-900 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap flex-shrink-0 min-w-[60px]"
                >
                  {verificationSent && resendTimer > 0
                    ? `${Math.floor(resendTimer / 60)}:${(resendTimer % 60).toString().padStart(2, '0')}`
                    : verificationSent
                    ? '재발송'
                    : '인증'}
                </button>
              )}
              {isPhoneVerified && (
                <span className="px-2 sm:px-4 py-3 bg-green-100 text-green-700 text-sm font-medium rounded-lg whitespace-nowrap flex-shrink-0 min-w-[70px] text-center">
                  인증완료
                </span>
              )}
            </div>

            {/* 인증번호 입력 */}
            {verificationSent && !isPhoneVerified && (
              <div className="mt-2 flex gap-1 sm:gap-2">
                <input
                  type="text"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                  className="flex-1 px-2 sm:px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-400 focus:border-transparent outline-none"
                  placeholder="인증번호 6자리"
                  maxLength={6}
                />
                <button
                  type="button"
                  onClick={handleVerifyCode}
                  disabled={verificationLoading || verificationCode.length !== 6}
                  className="px-2 sm:px-4 py-3 bg-[#ffbf03] hover:bg-[#e6ac00] text-gray-900 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap flex-shrink-0 min-w-[60px]"
                >
                  확인
                </button>
              </div>
            )}

            {errors.phone && (
              <p className="text-red-500 text-xs mt-1">올바른 연락처를 입력해주세요</p>
            )}
          </div>

          {/* 이메일 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              이메일 (ID)<span className="text-red-500">*</span>
              {user && <span className="text-xs text-gray-500 ml-2">(자동입력)</span>}
            </label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleInputChange}
              placeholder="company@example.com"
              className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-yellow-400 focus:border-transparent outline-none ${
                errors.email ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {errors.email && (
              <p className="text-red-500 text-xs mt-1">올바른 이메일 주소를 입력해주세요</p>
            )}
          </div>

          {/* 매장명(상호) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              매장명 (상호)<span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="brandName"
              value={formData.brandName}
              onChange={handleInputChange}
              placeholder="회사명 또는 브랜드명"
              className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-yellow-400 focus:border-transparent outline-none ${
                errors.brandName ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {errors.brandName && (
              <p className="text-red-500 text-xs mt-1">매장명(상호)을 2자 이상 입력해주세요</p>
            )}
          </div>

          {/* 업종 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              업종<span className="text-red-500">*</span>
            </label>
            <select
              name="industry"
              value={formData.industry}
              onChange={handleInputChange}
              className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-yellow-400 focus:border-transparent outline-none bg-white ${
                errors.industry ? 'border-red-500' : 'border-gray-300'
              }`}
            >
              <option value="">업종을 선택해주세요</option>
              <option value="study_cafe">📖 스터디카페 / 독서실</option>
              <option value="self_store">🏪 무인매장 / 셀프운영 매장</option>
              <option value="other">📋 기타</option>
            </select>
            {errors.industry && (
              <p className="text-red-500 text-xs mt-1">업종을 선택해주세요</p>
            )}
          </div>

          {/* 약관 동의 */}
          <div className="flex items-start gap-2">
            <input
              type="checkbox"
              id="agreeTerms"
              name="agreeTerms"
              checked={formData.agreeTerms}
              onChange={handleInputChange}
              className="mt-1"
            />
            <label htmlFor="agreeTerms" className="text-sm text-gray-600">
              <button
                type="button"
                onClick={() => setTermsModalType('privacy')}
                className="text-blue-500 hover:underline"
              >
                개인정보 처리방침
              </button>
              {' '}및{' '}
              <button
                type="button"
                onClick={() => setTermsModalType('terms')}
                className="text-blue-500 hover:underline"
              >
                이용약관
              </button>
              에 동의합니다
            </label>
          </div>

          {/* 제출 버튼 */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-[#ffbf03] hover:bg-[#e6ac00] text-gray-900 font-bold py-4 rounded-lg text-lg transition-colors disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                신청 중...
              </>
            ) : (
              '🚀 무료 체험 시작하기'
            )}
          </button>
        </form>

        <div className="text-center mt-4 text-sm text-gray-500">
          <p>
            💡 신청 후 <span className="text-[#ffbf03] font-bold">알림톡으로 포탈 접속 정보</span>를 받으세요<br />
            💳 카드 등록 불필요 • 🎁 무료 체험
          </p>
        </div>
      </div>

      {/* 에러 모달 */}
      {showErrorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowErrorModal(false)}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-sm w-full mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Icon */}
            <div className="pt-8 pb-4 flex justify-center">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
                <svg
                  className="w-8 h-8 text-red-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
            </div>

            {/* Content */}
            <div className="px-6 pb-6 text-center">
              <h3 className="text-lg font-bold text-gray-900 mb-2">
                오류
              </h3>
              <p className="text-gray-600 text-sm mb-6">
                {submitError}
              </p>

              {/* Button */}
              <button
                onClick={() => setShowErrorModal(false)}
                className="w-full py-3 px-4 rounded-lg bg-gray-900 text-white font-semibold hover:bg-gray-800 transition-colors"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 약관 모달 */}
      {termsModalType && (
        <DynamicTermsModal
          type={termsModalType}
          onClose={() => setTermsModalType(null)}
        />
      )}
    </>
  );
}
