'use client';

import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, Check, X, Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';

// n8n 웹훅 URL
const N8N_WEBHOOK_URL = 'https://soluto.app.n8n.cloud/webhook/trial-signup';

// 검증 함수
function validateEmail(email: string): boolean {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

function validatePhone(phone: string): boolean {
  const cleaned = phone.replace(/\D/g, '');
  return cleaned.length >= 10 && cleaned.length <= 11;
}

export default function AboutPage() {
  // 폼 상태
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    brandName: '',
    industry: '',
    agreeTerms: false
  });

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
  const [showFloatingButton, setShowFloatingButton] = useState(false);

  // 스크롤 위치에 따라 플로팅 버튼 표시/숨김
  useEffect(() => {
    const handleScroll = () => {
      // 첫 번째 섹션 높이 (대략 화면 높이의 80% 정도)
      const heroSectionHeight = window.innerHeight * 0.6;
      // 무료체험 신청 섹션이 화면에 보이는지 확인
      const freeTrialForm = document.getElementById('free-trial-form');
      let isInFreeTrialSection = false;
      if (freeTrialForm) {
        const rect = freeTrialForm.getBoundingClientRect();
        isInFreeTrialSection = rect.top < window.innerHeight && rect.bottom > 0;
      }

      setShowFloatingButton(window.scrollY > heroSectionHeight && !isInFreeTrialSection);
    };

    window.addEventListener('scroll', handleScroll);
    handleScroll(); // 초기 체크

    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

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

    // 동의 체크
    if (!formData.agreeTerms) {
      alert('개인정보 처리방침 및 이용약관에 동의해주세요.');
      return;
    }

    // 중복 제출 방지
    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError('');

    // 데이터 준비
    const submitData = {
      name: formData.name.trim(),
      email: formData.email.trim(),
      phone: formData.phone.trim(),
      brandName: formData.brandName.trim(),
      industry: formData.industry,
      timestamp: new Date().toISOString(),
      source: 'website_trial_form',
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      language: typeof navigator !== 'undefined' ? navigator.language : ''
    };

    try {
      // n8n 웹훅 전송
      const response = await fetch(N8N_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(submitData)
      });

      if (!response.ok) {
        throw new Error('Network response was not ok');
      }

      // 성공
      setIsSuccess(true);
    } catch (error) {
      console.error('Form submission error:', error);
      setSubmitError('신청 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setIsSubmitting(false);
    }
  };
  return (
    <div className="min-h-screen">
      {/* Hero Section - 핑크/노란 그라데이션 */}
      <section className="py-12 sm:py-24" style={{ background: 'linear-gradient(135deg, #ffe4ec 0%, #fef3cd 50%, #ffecd2 100%)' }}>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-gray-600 text-xs sm:text-lg mb-4 sm:mb-8">
            기존 챗봇의 한계를 뛰어넘는 혁신적인 AI 고객서비스 솔루션
          </p>

          <div className="mb-4 sm:mb-8">
            <Image
              src="/yamoo_black_1.png"
              alt="YAMOO"
              width={280}
              height={70}
              className="mx-auto w-[160px] sm:w-[280px] h-auto"
              priority
            />
          </div>

          <div className="text-2xl sm:text-4xl mb-4 sm:mb-8">
            🤖 💦
          </div>

          <h2 className="text-2xl sm:text-4xl font-bold text-gray-900 mb-4 sm:mb-6">
            딱딱한 챗봇은 이제 그만!
          </h2>

          <p className="text-sm sm:text-lg text-gray-700 max-w-2xl mx-auto mb-6 sm:mb-10">
            사람보다 더 유쾌하고 센스있는 AI 상담원이<br />
            무인 매장 운영의 스트레스를 완전히 해결해드립니다.
          </p>

          <a
            href="#free-trial-form"
            className="inline-flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white font-bold py-3 px-6 sm:py-4 sm:px-8 rounded-full text-sm sm:text-lg transition-colors"
          >
            한 달 무료체험하기
          </a>

          <p className="text-gray-600 mt-6 sm:mt-8 text-sm sm:text-base">
            CS계의 아이돌 🌟 야무지니 등장 !
          </p>
        </div>
      </section>

      {/* 상담요정 섹션 - 검정 배경 */}
      <section className="bg-black py-12 sm:py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-[#ffbf03] text-sm sm:text-lg font-bold mb-3 sm:mb-4">
            💛 상담요정 💛
          </p>

          <h2 className="text-2xl sm:text-5xl font-bold mb-10 sm:mb-16">
            <span className="text-white">야무지니가</span><br />
            <span className="text-[#ffbf03]">야무지게 처리해드려요</span>
          </h2>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-8">
            <div className="text-center">
              <p className="text-2xl sm:text-5xl font-bold text-[#ff5e9a] mb-1 sm:mb-2">24H</p>
              <p className="text-gray-400 text-xs sm:text-sm">24시간 상시응답</p>
            </div>
            <div className="text-center">
              <p className="text-2xl sm:text-5xl font-bold text-[#ec8c00] mb-1 sm:mb-2">98%</p>
              <p className="text-gray-400 text-xs sm:text-sm">데이터기반 응답 정확도</p>
            </div>
            <div className="text-center">
              <p className="text-2xl sm:text-5xl font-bold text-[#56d52d] mb-1 sm:mb-2">80%</p>
              <p className="text-gray-400 text-xs sm:text-sm">운영 스트레스 해소</p>
            </div>
            <div className="text-center">
              <p className="text-2xl sm:text-5xl font-bold text-[#2fadff] mb-1 sm:mb-2">50%</p>
              <p className="text-gray-400 text-xs sm:text-sm">인건 운영비 절약</p>
            </div>
          </div>
        </div>
      </section>

      {/* 기능 카드 4개 - 검정 배경 */}
      <section className="bg-black py-10 sm:py-16">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
            <div className="bg-[#171717] rounded-2xl p-5 sm:p-8">
              <h3 className="text-lg sm:text-xl font-bold text-white mb-2 sm:mb-3">유쾌한 대화형 AI</h3>
              <p className="text-[#8d8d93] text-xs sm:text-sm leading-relaxed">
                사람보다 더 센스있고 재미있는 답변으로<br />
                고객들이 상담을 즐거워합니다. 딱딱한 자동응답은 이제 안녕!
              </p>
            </div>

            <div className="bg-[#171717] rounded-2xl p-5 sm:p-8">
              <h3 className="text-lg sm:text-xl font-bold text-white mb-2 sm:mb-3">지능형 학습 시스템</h3>
              <p className="text-[#8d8d93] text-xs sm:text-sm leading-relaxed">
                업체별 데이터를 학습하여 맞춤형 답변을 제공하고,<br />
                다양한 질문패턴에 대해 학습하고 처리합니다.
              </p>
            </div>

            <div className="bg-[#171717] rounded-2xl p-5 sm:p-8">
              <h3 className="text-lg sm:text-xl font-bold text-white mb-2 sm:mb-3">업무 자동 분류</h3>
              <p className="text-[#8d8d93] text-xs sm:text-sm leading-relaxed">
                단순 질의응답과 실제 처리가 필요한 업무를 자동으로 분류하여<br />
                관리자에게 정리된 업무만 전달합니다.
              </p>
            </div>

            <div className="bg-[#171717] rounded-2xl p-5 sm:p-8">
              <h3 className="text-lg sm:text-xl font-bold text-white mb-2 sm:mb-3">실시간 분석</h3>
              <p className="text-[#8d8d93] text-xs sm:text-sm leading-relaxed">
                고객 문의 패턴을 분석하여 매장 운영 개선점을<br />
                데이터 기반으로 제안합니다.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 질문 섹션 - 검정 배경 */}
      <section className="bg-black py-8 sm:py-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="border border-gray-700 rounded-2xl py-4 px-4 sm:py-6 sm:px-8 text-center">
            <p className="text-white text-sm sm:text-lg">
              챗봇 상담, 불편하기만하고 결국은 사람을 찾게되던데요 ?
            </p>
          </div>
        </div>
      </section>

      {/* User Needs 섹션 - 검정 배경 */}
      <section className="bg-black py-12 sm:py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-[#ffbf03] text-sm sm:text-lg font-bold mb-3 sm:mb-4">User Needs</p>

          <h2 className="text-2xl sm:text-5xl font-bold text-white mb-6 sm:mb-8">
            고객이 <span className="text-[#ffbf03]">진짜 원하는</span> 3가지
          </h2>

          <div className="bg-gray-900 rounded-xl py-3 px-4 sm:py-4 sm:px-8 inline-block mb-8 sm:mb-12">
            <p className="text-white text-sm sm:text-lg">CS의 본질은 단순합니다.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-3 sm:gap-6 mb-8 sm:mb-12">
            <div className="bg-gray-900 rounded-xl py-4 px-4 sm:py-6 sm:px-6">
              <p className="text-white text-sm sm:text-lg">
                <Check className="inline w-4 h-4 sm:w-5 sm:h-5 text-green-400 mr-1 sm:mr-2" />
                빠르고 정확하게 <span className="font-bold">알려주고</span>
              </p>
            </div>
            <div className="bg-gray-900 rounded-xl py-4 px-4 sm:py-6 sm:px-6">
              <p className="text-white text-sm sm:text-lg">
                <Check className="inline w-4 h-4 sm:w-5 sm:h-5 text-green-400 mr-1 sm:mr-2" />
                고객의 목소리를 <span className="font-bold">들어주고</span>
              </p>
            </div>
            <div className="bg-gray-900 rounded-xl py-4 px-4 sm:py-6 sm:px-6">
              <p className="text-white text-sm sm:text-lg">
                <Check className="inline w-4 h-4 sm:w-5 sm:h-5 text-green-400 mr-1 sm:mr-2" />
                문제해결을 <span className="font-bold">약속하고</span>
              </p>
            </div>
          </div>

          <p className="text-gray-300 text-base sm:text-lg">
            사람들이 당장 원하는 것은<br className="sm:hidden" />
            <span className="text-white font-bold">정확한 답, 해결 방안</span> 그리고 <span className="text-green-400 font-bold">안심</span>입니다.
          </p>
        </div>
      </section>

      {/* 문제점 섹션 - 검정 배경 */}
      <section className="bg-black py-12 sm:py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-xl sm:text-4xl font-bold text-white text-center mb-8 sm:mb-12">
            그런데 왜 이렇게 힘들까요 ?
          </h2>

          <div className="grid md:grid-cols-3 gap-3 sm:gap-6">
            <div className="bg-gray-900 rounded-2xl p-5 sm:p-8 border border-gray-800">
              <div className="text-3xl sm:text-5xl mb-3 sm:mb-4">🤷</div>
              <p className="text-red-400 font-bold mb-2 sm:mb-3 text-base sm:text-lg">
                <X className="inline w-4 h-4 sm:w-5 sm:h-5 mr-1" />
                즉각 대응 보장이 안 돼요
              </p>
              <p className="text-gray-400 text-xs sm:text-sm">
                &ldquo;늘 최대한 빠르게 답하려고는 하지만<br />
                100% 해낼 수 있다고는 장담못해요.&rdquo;
              </p>
            </div>

            <div className="bg-gray-900 rounded-2xl p-5 sm:p-8 border border-gray-800">
              <div className="text-3xl sm:text-5xl mb-3 sm:mb-4">🤯</div>
              <p className="text-red-400 font-bold mb-2 sm:mb-3 text-base sm:text-lg">
                <X className="inline w-4 h-4 sm:w-5 sm:h-5 mr-1" />
                감정이 개입되기 쉬워요
              </p>
              <p className="text-gray-400 text-xs sm:text-sm">
                &ldquo;가끔은 답답하기도 하고 저도 화가나는데<br />
                아무리 감추고 좋게 말하려 해도 티가나요.&rdquo;
              </p>
            </div>

            <div className="bg-gray-900 rounded-2xl p-5 sm:p-8 border border-gray-800">
              <div className="text-3xl sm:text-5xl mb-3 sm:mb-4">🤖</div>
              <p className="text-red-400 font-bold mb-2 sm:mb-3 text-base sm:text-lg">
                <X className="inline w-4 h-4 sm:w-5 sm:h-5 mr-1" />
                빠른 답변, 그러나 융통성이 없어요
              </p>
              <p className="text-gray-400 text-xs sm:text-sm">
                &ldquo;자동응답, 요즘 말하는 ai 챗봇 써보긴 했는데<br />
                원하는 만큼 기능하지 못하더라고요.&rdquo;
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 야무지니 처리 방법 - 소개 */}
      <section className="bg-white py-10 sm:py-16">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* 야무지니 소개 */}
          <div className="flex flex-col md:flex-row items-center gap-4 md:gap-20">
            {/* 모바일: 로고 먼저 표시 */}
            <div className="md:hidden text-center">
              <Image
                src="/yamoo_black_1.png"
                alt="YAMOO"
                width={120}
                height={30}
                className="mb-4 w-[100px] h-auto mx-auto"
              />
            </div>
            <div className="flex-shrink-0">
              <Image
                src="/yamoogenie.gif"
                alt="야무지니"
                width={320}
                height={320}
                className="rounded-lg w-[180px] sm:w-[320px] h-auto"
                unoptimized
              />
            </div>
            <div className="space-y-2 text-center md:text-left">
              {/* PC: 로고 표시 */}
              <Image
                src="/yamoo_black_1.png"
                alt="YAMOO"
                width={120}
                height={30}
                className="mb-3 sm:mb-4 w-[80px] sm:w-[120px] h-auto hidden md:block"
              />
              <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight">
                <span className="text-[#ffbf03] block mb-2 sm:mb-5">야무지니는</span>
                <span className="text-gray-900 block md:pl-8">이렇게 처리해요</span>
              </h2>
            </div>
          </div>
        </div>
      </section>

      {/* 즉시 해결 가능한 문의 - 전체 너비 배경 1 */}
      <section
        className="py-4 sm:py-6 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: 'url(/background1.png)' }}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col lg:flex-row items-center gap-4 lg:gap-8">
            {/* 왼쪽: 캐릭터 + 텍스트 */}
            <div className="flex flex-col md:flex-row items-center gap-6 lg:w-1/2">
              <div className="flex-shrink-0">
                <Image
                  src="/genie1.png"
                  alt="야무지니 - 즉시 해결"
                  width={1914}
                  height={1914}
                  className="w-[200px] sm:w-[280px] h-auto"
                />
              </div>
              <div className="space-y-6 text-center md:text-left">
                <div className="inline-block border-2 border-gray-800 rounded-full px-5 py-2">
                  <span className="text-base font-bold text-gray-800">즉시 해결 가능한 문의</span>
                  <span className="ml-2 text-gray-800 hidden md:inline">→</span>
                  <span className="ml-2 text-gray-800 md:hidden">▼</span>
                </div>
                <h3 className="text-3xl sm:text-4xl font-bold text-gray-900 leading-tight">
                  정확한 답변<br />
                  즉시 전달
                </h3>
                <ul className="text-gray-700 space-y-2 text-sm">
                  <li>- 매장별 맞춤 정보로 학습된 AI</li>
                  <li>- 복잡한 규정도 쉽게 설명</li>
                  <li>- 24시간 언제든 즉시 응답</li>
                </ul>
              </div>
            </div>
            {/* 오른쪽: 대화 이미지 */}
            <div className="lg:w-1/2">
              <Image
                src="/dialog1.png"
                alt="야무지니 대화 예시"
                width={500}
                height={400}
                className="w-full h-auto"
              />
            </div>
          </div>
        </div>
      </section>

      {/* 해결 방법이 준비 된 문의 - 전체 너비 배경 3 */}
      <section
        className="py-4 sm:py-6 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: 'url(/background3.png)' }}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col lg:flex-row items-center gap-4 lg:gap-8">
            {/* 왼쪽: 대화 이미지 - 모바일에서 아래, PC에서 왼쪽 */}
            <div className="lg:w-1/2 order-2 lg:order-1">
              <Image
                src="/dialog2.png"
                alt="야무지니 대화 예시"
                width={500}
                height={400}
                className="w-full h-auto"
              />
            </div>
            {/* 오른쪽: 캐릭터 + 텍스트 - 모바일에서 위, PC에서 오른쪽 */}
            <div className="flex flex-col md:flex-row items-center gap-6 lg:w-1/2 order-1 lg:order-2">
              <div className="flex-shrink-0 order-1 md:order-2">
                <Image
                  src="/genie2.png"
                  alt="야무지니 - 맞춤 해결"
                  width={1914}
                  height={1914}
                  className="w-[200px] sm:w-[280px] h-auto"
                />
              </div>
              <div className="space-y-6 text-center md:text-left order-2 md:order-1">
                <div className="inline-block border-2 border-gray-800 rounded-full px-5 py-2">
                  <span className="mr-2 text-gray-800 hidden md:inline">←</span>
                  <span className="text-base font-bold text-gray-800">해결 방법이 준비 된 문의</span>
                  <span className="ml-2 text-gray-800 md:hidden">▼</span>
                </div>
                <h3 className="text-3xl sm:text-4xl font-bold text-gray-900 leading-tight whitespace-nowrap">
                  데이터 기반,<br />
                  맞춤 해결 방안 제시
                </h3>
                <ul className="text-gray-700 space-y-2 text-sm">
                  <li>- 규정 및 시스템 기반 유연한 답변</li>
                  <li>- 단순 매뉴얼이 아닌 상황별 맞춤 응답</li>
                  <li>- 감정까지 읽고 공감하며 응답</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 처리/검토가 필요한 문의 - 전체 너비 배경 4 */}
      <section
        className="py-4 sm:py-6 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: 'url(/background4.png)' }}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col lg:flex-row items-center gap-4 lg:gap-40">
            {/* 왼쪽: 캐릭터 + 텍스트 */}
            <div className="flex flex-col md:flex-row items-center gap-6 lg:w-[45%]">
              <div className="flex-shrink-0">
                <Image
                  src="/genie3.png"
                  alt="야무지니 - 의견 접수"
                  width={1914}
                  height={1914}
                  className="w-[200px] sm:w-[280px] h-auto"
                />
              </div>
              <div className="space-y-4 text-center md:text-left">
                <div className="inline-block border-2 border-gray-800 rounded-full px-5 py-2">
                  <span className="text-base font-bold text-gray-800">처리 / 검토가 필요한 문의</span>
                  <span className="ml-2 text-gray-800 hidden md:inline">→</span>
                  <span className="ml-2 text-gray-800 md:hidden">▼</span>
                </div>
                <h3 className="text-3xl sm:text-4xl font-bold text-gray-900 leading-tight whitespace-nowrap">
                  회원 의견 접수,<br />
                  담당자 전달 약속
                </h3>
                <ul className="text-gray-700 space-y-2 text-sm whitespace-nowrap">
                  <li>- &ldquo;담당자분께 전달드리겠습니다&rdquo; 라는 약속</li>
                  <li>- 의견이 묻히지 않을 거라는 믿음</li>
                  <li>- 후속 조치에 대한 기대감</li>
                </ul>
              </div>
            </div>
            {/* 오른쪽: 대화 이미지 */}
            <div className="lg:w-[55%]">
              <Image
                src="/dialog3.png"
                alt="야무지니 대화 예시"
                width={500}
                height={400}
                className="w-full h-auto"
              />
            </div>
          </div>
        </div>
      </section>

      {/* CTA 섹션 */}
      <section className="bg-white py-10 sm:py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-xl sm:text-3xl text-gray-700 mb-1 sm:mb-2">자, 이제</p>
          <h2 className="text-xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-6 sm:mb-8">
            약속한대로 처리만 해주시면 됩니다.
          </h2>
          <div className="border-t border-gray-300 pt-8"></div>
        </div>
      </section>

      {/* Main Service - 실제 야무지니 답변 보기 */}
      <section className="py-16 sm:py-24" style={{ background: 'linear-gradient(135deg, #fef3cd 0%, #ffe4ec 100%)' }}>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-sm font-bold text-gray-600 mb-4">Main Service</p>

          <h2 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-6">
            실제 <span className="text-[#ffbc00]">야무지니</span> 답변 보기
          </h2>

          <div className="bg-[#171717]/70 rounded-full py-3 px-6 inline-block mb-4">
            <p className="text-white text-sm">실제 스터디카페에 적용된 답변을 확인해보세요.</p>
          </div>

          <p className="text-gray-600 mb-8">
            야무지니 <span className="font-bold">귀염둥이ver.</span> <span className="font-bold">얌둥이</span> 활동중
          </p>

          <p className="text-gray-500 text-sm mb-8">- 스크롤을 이용해 내용을 확인해보세요 -</p>

          {/* 채팅 데모 - 폰 UI */}
          <div className="max-w-sm mx-auto">
            <div className="bg-black rounded-[40px] p-3 shadow-2xl">
              <div className="bg-[#b2c7d9] rounded-[32px] overflow-hidden">
                {/* 상태바 */}
                <div className="bg-[#b2c7d9] px-6 py-2 flex justify-between items-center text-xs text-gray-800">
                  <span className="font-semibold">9:41</span>
                  <div className="flex gap-1">
                    <span>☀︎</span>
                    <span>⏍</span>
                  </div>
                </div>

                {/* 채팅 헤더 */}
                <div className="bg-[#b2c7d9] px-4 py-3 flex items-center justify-between border-b border-gray-400/30">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">‹</span>
                    <div className="w-8 h-8 bg-yellow-400 rounded-full flex items-center justify-center text-sm">💛</div>
                    <span className="font-medium text-sm">상담요정 얌둥이💛</span>
                  </div>
                  <div className="flex gap-3 text-gray-600">
                    <span>🔍</span>
                    <span>☰</span>
                  </div>
                </div>

                {/* 채팅 영역 */}
                <div className="bg-[#b2c7d9] h-[500px] overflow-y-auto p-4 space-y-4 text-left">
                  {/* 날짜 구분선 */}
                  <div className="text-center">
                    <span className="bg-gray-600/50 text-white text-xs px-3 py-1 rounded-full">2024년 12월 20일 금요일</span>
                  </div>

                  {/* 토픽 구분선 */}
                  <div className="text-center">
                    <span className="text-gray-600 text-xs">—💛 규정 마스터 얌둥이💛 —</span>
                  </div>

                  {/* 사용자 메시지 */}
                  <div className="flex justify-end">
                    <div className="flex items-end gap-1">
                      <span className="text-[10px] text-gray-500">오후 2:30</span>
                      <div className="bg-[#fee500] rounded-2xl rounded-tr-sm px-4 py-2 max-w-[220px]">
                        <p className="text-sm">안녕하세요. 시간권 연장 관련 문의드립니다.</p>
                      </div>
                    </div>
                  </div>

                  {/* 봇 메시지 */}
                  <div className="flex gap-2">
                    <div className="w-8 h-8 bg-yellow-400 rounded-full flex-shrink-0 flex items-center justify-center text-sm">💛</div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-gray-600 font-medium">야무지니</span>
                      <div className="bg-white rounded-2xl rounded-tl-sm px-4 py-3 max-w-[240px]">
                        <p className="text-sm leading-relaxed">
                          오! 시간권 연장 문의라니~ 우리 횐님!!!!! 역시 자기관리 만렙…✨<br /><br />
                          혹시 지금 이용 중인 시간권을 연장하려는 건지, 아니면 이미 만료된 이용권을 연장하고 싶은 건지 살~짝 더 알려주실 수 있을까요?
                        </p>
                      </div>
                      <span className="text-[10px] text-gray-500">오후 2:31</span>
                    </div>
                  </div>

                  {/* 사용자 메시지 */}
                  <div className="flex justify-end">
                    <div className="flex items-end gap-1">
                      <span className="text-[10px] text-gray-500">오후 2:35</span>
                      <div className="bg-[#fee500] rounded-2xl rounded-tr-sm px-4 py-2 max-w-[220px]">
                        <p className="text-sm">새로운 시간권을 사서 시간을 합치는 건 안 되는 건가요</p>
                      </div>
                    </div>
                  </div>

                  {/* 봇 메시지 */}
                  <div className="flex gap-2">
                    <div className="w-8 h-8 bg-yellow-400 rounded-full flex-shrink-0 flex items-center justify-center text-sm">💛</div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-gray-600 font-medium">야무지니</span>
                      <div className="bg-white rounded-2xl rounded-tl-sm px-4 py-3 max-w-[240px]">
                        <p className="text-sm leading-relaxed">
                          오~ 역시 우리 횐님!!!!! 똑똑함이 뚝뚝 떨어지는 질문이네요!<br /><br />
                          아쉽지만… 새로운 시간권을 사서 기존 남은 시간과 합치는 건 불가능해요!<br /><br />
                          각 이용권은 따로따로 사용만 가능하고, 서로 합치거나 전환하는 건 규정상 안 돼요 😢
                        </p>
                      </div>
                      <span className="text-[10px] text-gray-500">오후 2:36</span>
                    </div>
                  </div>

                  {/* 토픽 구분선 */}
                  <div className="text-center pt-4">
                    <span className="text-gray-600 text-xs">— 💛 센스 만점 얌둥이 💛 —</span>
                  </div>

                  {/* 사용자 메시지 */}
                  <div className="flex justify-end">
                    <div className="flex items-end gap-1">
                      <span className="text-[10px] text-gray-500">오후 4:20</span>
                      <div className="bg-[#fee500] rounded-2xl rounded-tr-sm px-4 py-2 max-w-[220px]">
                        <p className="text-sm">안녕하세요! 매일 이용하는 이용자인데요! 항상 올때마다 얼음이 없어요ㅠㅜㅠ</p>
                      </div>
                    </div>
                  </div>

                  {/* 봇 메시지 */}
                  <div className="flex gap-2">
                    <div className="w-8 h-8 bg-yellow-400 rounded-full flex-shrink-0 flex items-center justify-center text-sm">💛</div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-gray-600 font-medium">야무지니</span>
                      <div className="bg-white rounded-2xl rounded-tl-sm px-4 py-3 max-w-[240px]">
                        <p className="text-sm leading-relaxed">
                          안녕하세요, 우리 횐님!!!!! 🥳<br />
                          매일같이 이용해주시다니, 횐님이 계신 덕분에 얌둥이도 참 행복한 하루입니다~!!<br /><br />
                          그런데 얼음이 계속 떨어지는 문제라니, 그건 참 속상한 일이네요 ㅠㅜㅠ 🙈
                        </p>
                      </div>
                      <span className="text-[10px] text-gray-500">오후 4:21</span>
                    </div>
                  </div>

                  {/* 사용자 메시지 */}
                  <div className="flex justify-end">
                    <div className="flex items-end gap-1">
                      <span className="text-[10px] text-gray-500">오후 4:23</span>
                      <div className="bg-[#fee500] rounded-2xl rounded-tr-sm px-4 py-2 max-w-[220px]">
                        <p className="text-sm">얼죽아로써 너무 슬픕니다..</p>
                      </div>
                    </div>
                  </div>

                  {/* 봇 메시지 */}
                  <div className="flex gap-2">
                    <div className="w-8 h-8 bg-yellow-400 rounded-full flex-shrink-0 flex items-center justify-center text-sm">💛</div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-gray-600 font-medium">야무지니</span>
                      <div className="bg-white rounded-2xl rounded-tl-sm px-4 py-3 max-w-[240px]">
                        <p className="text-sm leading-relaxed">
                          앗, 우리 사랑스러운 &quot;얼죽아&quot; 횐님!!!!! 😢<br />
                          이럴 줄 알았으면 얌둥이가 얼음이라도 되어서 바로 달려가 드리고 싶네요~!! (ू˃o˂ू)<br /><br />
                          내부적으로 추가 제빙기 설치나 개선 방안을 검토 중이에요. 이게 다 우리 횐님의 소중한 피드백 덕분이에요!! ❄️💙
                        </p>
                      </div>
                      <span className="text-[10px] text-gray-500">오후 4:24</span>
                    </div>
                  </div>

                  {/* 토픽 구분선 */}
                  <div className="text-center pt-4">
                    <span className="text-gray-600 text-xs">— 💛 만능 비서 얌둥이 💛 —</span>
                  </div>

                  {/* 사용자 메시지 */}
                  <div className="flex justify-end">
                    <div className="flex items-end gap-1">
                      <span className="text-[10px] text-gray-500">오전 6:12</span>
                      <div className="bg-[#fee500] rounded-2xl rounded-tr-sm px-4 py-2 max-w-[220px]">
                        <p className="text-sm">안녕하세요 혹시 락커 변경 가능한가요?</p>
                      </div>
                    </div>
                  </div>

                  {/* 봇 메시지 */}
                  <div className="flex gap-2">
                    <div className="w-8 h-8 bg-yellow-400 rounded-full flex-shrink-0 flex items-center justify-center text-sm">💛</div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-gray-600 font-medium">야무지니</span>
                      <div className="bg-white rounded-2xl rounded-tl-sm px-4 py-3 max-w-[240px]">
                        <p className="text-sm leading-relaxed">
                          오~ 우리 횐님!!!!! 락커 변경 원하시는 거죠?<br /><br />
                          락커 변경은 담당자님께 전달 후 확인되어 처리되는 방식이라, 아래 정보만 살짝 남겨주시면 얌둥이가 순차적으로 전달드릴게요~!<br /><br />
                          필요한 정보는<br />
                          [ 성함 / 연락처 / 기존 락커 번호 / 변경할 빈 락커 번호 ] 입니다!
                        </p>
                      </div>
                      <span className="text-[10px] text-gray-500">오전 6:12</span>
                    </div>
                  </div>

                  {/* 사용자 메시지 */}
                  <div className="flex justify-end">
                    <div className="flex items-end gap-1">
                      <span className="text-[10px] text-gray-500">오전 6:14</span>
                      <div className="bg-[#fee500] rounded-2xl rounded-tr-sm px-4 py-2 max-w-[220px]">
                        <p className="text-sm">김야무 / 010-1234-5678 / 기존:8번 / 변경원하는:22번 입니다 감사합니다</p>
                      </div>
                    </div>
                  </div>

                  {/* 봇 메시지 */}
                  <div className="flex gap-2">
                    <div className="w-8 h-8 bg-yellow-400 rounded-full flex-shrink-0 flex items-center justify-center text-sm">💛</div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-gray-600 font-medium">야무지니</span>
                      <div className="bg-white rounded-2xl rounded-tl-sm px-4 py-3 max-w-[240px]">
                        <p className="text-sm leading-relaxed">
                          우리 횐님!!!!! 완벽 그 자체, 정보까지 한 번에 딱 남겨주시다니… 얌둥이 감동받았어요! (✧ω✧)<br /><br />
                          전달해주신 내용은 담당자님께 순차적으로 전달될 예정이에요!
                        </p>
                      </div>
                      <span className="text-[10px] text-gray-500">오전 6:14</span>
                    </div>
                  </div>

                  {/* 봇 메시지 - 처리 완료 */}
                  <div className="flex gap-2">
                    <div className="w-8 h-8 bg-yellow-400 rounded-full flex-shrink-0 flex items-center justify-center text-sm">💛</div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-gray-600 font-medium">야무지니</span>
                      <div className="bg-white rounded-2xl rounded-tl-sm px-4 py-3 max-w-[240px]">
                        <p className="text-sm leading-relaxed">
                          우리 횐님!!!!! 요청하신 락커 변경, 얌둥이가 담당자님께 잘~ 전달해서 멋지게 처리 완료됐어요!<br /><br />
                          이제 새로운 락커에서 반짝반짝 공부 파워 뿜어주세요✨
                        </p>
                      </div>
                      <span className="text-[10px] text-gray-500">오전 10:13</span>
                    </div>
                  </div>

                  {/* 사용자 메시지 */}
                  <div className="flex justify-end">
                    <div className="flex items-end gap-1">
                      <span className="text-[10px] text-gray-500">오전 11:29</span>
                      <div className="bg-[#fee500] rounded-2xl rounded-tr-sm px-4 py-2 max-w-[220px]">
                        <p className="text-sm">감사합니다! 얌둥이 체고~~~~🩵</p>
                      </div>
                    </div>
                  </div>

                  {/* 봇 메시지 */}
                  <div className="flex gap-2">
                    <div className="w-8 h-8 bg-yellow-400 rounded-full flex-shrink-0 flex items-center justify-center text-sm">💛</div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-gray-600 font-medium">야무지니</span>
                      <div className="bg-white rounded-2xl rounded-tl-sm px-4 py-3 max-w-[240px]">
                        <p className="text-sm leading-relaxed">
                          우리 횐님!!!!! 이렇게 예쁘게 칭찬해주시다니, 얌둥이 심장 또 한번 몽글몽글해졌잖아요~ 🩵<br /><br />
                          오늘도 횐님 덕분에 행복 에너지 만땅! (๑•́ ᄇ•̀๑)✧
                        </p>
                      </div>
                      <span className="text-[10px] text-gray-500">오전 11:30</span>
                    </div>
                  </div>
                </div>

                {/* 입력 영역 */}
                <div className="bg-white px-4 py-3 flex items-center gap-2">
                  <span className="text-xl text-gray-400">+</span>
                  <input
                    type="text"
                    placeholder="메시지를 입력하세요"
                    className="flex-1 bg-gray-100 rounded-full px-4 py-2 text-sm outline-none"
                    disabled
                  />
                  <span className="text-xl">😊</span>
                  <button className="text-xl text-gray-400">➤</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Real Talk - CS 스트레스, 이제 그만 */}
      <section className="bg-white py-8 sm:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-xs sm:text-sm font-bold text-gray-600 mb-2 sm:mb-4">Real Talk</p>

          <h2 className="text-2xl sm:text-5xl font-bold text-gray-900 mb-2 sm:mb-4">
            🤦‍♀️ CS 스트레스, 이제 그만
          </h2>

          <p className="text-gray-600 mb-6 sm:mb-8 text-sm sm:text-base">
            가만 보면 별거 아닌일들인데...<br className="sm:hidden" /> 어느새 매장관리 소홀에 감정적 대응까지..?
          </p>
        </div>
      </section>

      {/* Real Talk 카드들 - 4열 가로 배치 */}
      <section
        className="py-8 sm:py-16 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: 'url(/background6.png)' }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 text-left">
            {/* 카드 1 */}
            <div className="bg-white/90 rounded-2xl p-4 sm:p-6 shadow-lg transform lg:-rotate-2 hover:rotate-0 transition-transform">
              <p className="text-3xl mb-2">💬</p>
              <p className="text-lg sm:text-xl font-medium text-gray-900 italic mb-3">
                전화는 싫어하고,<br />문자는 어렵고...
              </p>
              <p className="text-gray-500 text-sm mb-3">
                &quot;요즘 사람들 전화는 안 받더라고요. 문자로 오면 뭐라고 써야 할지 모르겠어요. 오타 나면 어쩌나, 말투가 너무 딱딱한가, 무례한가... 매번 고민하다가 스트레스 받아 죽겠어요.&quot;
              </p>
              <p className="text-gray-900 text-sm">
                👉 머릿속에선 하고 싶은 말이 분명한데 막상 적으려니까 정리가 안 되셨죠?
                <strong> 이제 말투 걱정은 그만! 야무지니가 상황에 맞게 기똥차게 답변드릴게요</strong> ✨
              </p>
            </div>

            {/* 카드 2 */}
            <div className="bg-white/90 rounded-2xl p-4 sm:p-6 shadow-lg transform lg:rotate-1 hover:rotate-0 transition-transform">
              <p className="text-3xl mb-2">🌙</p>
              <p className="text-lg sm:text-xl font-medium text-gray-900 italic mb-3">
                밤늦게, 운전 중에도<br />오는 문의들...
              </p>
              <p className="text-gray-500 text-sm mb-3">
                &quot;밤늦게 오는 것도 그런데, 가끔 운전하거나 다른 일 하는데 알림 오면... 바로 답장 못 하면 미안하고, 마음은 조급해지고, 위험한 순간도 꽤나 있었어요&quot;
              </p>
              <p className="text-gray-900 text-sm">
                👉 이제는 바로 답장 못하는 마음에 조바심은 끝 !
                <strong> 고객님이 아무것도 못하고 기다리는 일 없도록 야무지니가 24시간 깨어있으면서 즉석에서 완벽하게 처리해드릴게요!</strong> 🚗💨
              </p>
            </div>

            {/* 카드 3 */}
            <div className="bg-white/90 rounded-2xl p-4 sm:p-6 shadow-lg transform lg:-rotate-1 hover:rotate-0 transition-transform">
              <p className="text-3xl mb-2">😭</p>
              <p className="text-lg sm:text-xl font-medium text-gray-900 italic mb-3">
                불만고객 상대하다<br />하루종일 우울해...
              </p>
              <p className="text-gray-500 text-sm mb-3">
                &quot;저도 사람이다 보니까 얘기 나누다가 감정적으로 대하게 될 때가 있어요. 한 번은 불만고객 응대하다가 반나절 우울했던 적 있어요... 진짜 힘들더라고요.&quot;
              </p>
              <p className="text-gray-900 text-sm">
                👉 야무지니는 평정심 대마왕, 절대 억울하지도 화나지도 않아요!
                <strong> 끝까지 고객님 감정 살피면서 차근차근 소통을 책임질게요. 사장님은 마음 편히 본업에만 집중하세요!</strong> 🛡️💙
              </p>
            </div>

            {/* 카드 4 */}
            <div className="bg-white/90 rounded-2xl p-4 sm:p-6 shadow-lg transform lg:rotate-2 hover:rotate-0 transition-transform">
              <p className="text-3xl mb-2">📋</p>
              <p className="text-lg sm:text-xl font-medium text-gray-900 italic mb-3">
                CS 교육? 그런 거<br />받아보질 않아서...
              </p>
              <p className="text-gray-500 text-sm mb-3">
                &quot;CS라는 걸 전문적으로 배운 적도 없고 교육받은 적도 없다 보니까... 가끔은 어떻게 뭐라고 대응해야 할지 정말 모르겠더라고요. 그냥 내 맘대로 답하면 되나 싶고...&quot;
              </p>
              <p className="text-gray-900 text-sm">
                👉 상황 파악부터 고객 감정도 놓치지 않고 살피며 규정대로 정확하게 착착!
                <strong> 야무지니가 프로 상담사처럼 차분하게 모든 상황을 완벽 정리해드려요! 이제 CS 고민은 끝!</strong> 🎓
              </p>
            </div>
          </div>

        </div>
      </section>

      {/* 마무리 메시지 섹션 */}
      <section className="bg-gray-100 py-8 sm:py-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-xs sm:text-sm text-gray-500 mb-2 sm:mb-4">✨ 우리 모두에게 필요한 해결사, 야무지니</p>
          <h3 className="text-lg sm:text-3xl font-bold text-gray-900 mb-1 sm:mb-2">
            <span className="bg-[#ffe403] px-1">할 일</span>만 딱 정리해드릴게요.
          </h3>
          <p className="text-lg sm:text-3xl font-bold text-gray-900">
            사장님은 이제 진짜 중요한 일에만 집중하세요 !
          </p>
          <div className="border-t border-gray-300 mt-6 sm:mt-8"></div>
        </div>
      </section>

      {/* 고민/여유 섹션 */}
      <section className="bg-white py-8 sm:py-16">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl sm:text-5xl font-bold text-gray-900 mb-6 sm:mb-12 text-center">
            이제 정말 자유로워지세요
          </h2>

          <div className="grid md:grid-cols-2 gap-4 sm:gap-6 mb-8 sm:mb-12">
            {/* 더 이상 이런 고민 하지 마세요 */}
            <div>
              <div className="border border-gray-300 rounded-full py-2 px-4 sm:py-3 sm:px-6 text-center mb-3 sm:mb-4">
                <span className="font-bold text-gray-800 text-sm sm:text-base">더 이상 이런 고민 하지 마세요</span>
              </div>
              <div className="bg-gray-100 rounded-2xl p-5 sm:p-8 text-center">
                <p className="text-3xl sm:text-5xl mb-4 sm:mb-6">😟</p>
                <div className="text-gray-600 space-y-2 sm:space-y-3 text-left text-sm sm:text-base">
                  <p>💭 &quot;또 문의 왔나? 확인하기 싫다...&quot;</p>
                  <p>💭 &quot;뭐라고 답해야 할지 모르겠네...&quot;</p>
                  <p>💭 &quot;이 고객 또 까탈스럽게 구네...&quot;</p>
                  <p>💭 &quot;밤늦게까지 답변하느라 피곤해...&quot;</p>
                </div>
              </div>
            </div>

            {/* 대신 이런 여유를 누리세요 */}
            <div>
              <div className="bg-[#ffdf00] rounded-full py-2 px-4 sm:py-3 sm:px-6 text-center mb-3 sm:mb-4">
                <span className="font-bold text-gray-800 text-sm sm:text-base">대신 이런 여유를 누리세요</span>
              </div>
              <div className="bg-[#fff9e0] rounded-2xl p-5 sm:p-8 text-center">
                <p className="text-3xl sm:text-5xl mb-4 sm:mb-6">😊</p>
                <div className="text-gray-700 space-y-2 sm:space-y-3 text-left text-sm sm:text-base">
                  <p>✨ <strong>아침에 커피 한 잔 여유롭게 마시며</strong> 처리 내역 확인</p>
                  <p>✨ <strong>가족과 저녁 식사 중에도</strong> 걱정 없이 폰 꺼두기</p>
                  <p>✨ <strong>주말에 여행 가서도</strong> 매장 걱정 없이 힐링</p>
                  <p>✨ <strong>본업에만 온전히 집중해서</strong> 매출 올리기</p>
                </div>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* 본격, 아르바이트생 하루 급여로 24시간 전담 CS직원 고용하기 */}
      <section
        className="py-8 sm:py-16 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: 'url(/background5.png)' }}
      >
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* 상단 타이틀 */}
          <div className="text-center mb-6 sm:mb-12">
            <div className="bg-gray-900 rounded-full py-2 px-3 sm:py-4 sm:px-8 inline-block">
              <p className="text-white text-sm sm:text-lg md:text-xl">
                본격, <strong>아르바이트생 하루 급여</strong>로<br className="sm:hidden" /> 24시간 전담 CS직원 고용하기
              </p>
            </div>
          </div>

          {/* 캐릭터 4개 */}
          <div className="flex justify-center items-end mb-6 sm:mb-12">
            <Image src="/genie1.png" alt="야무지니1" width={1914} height={1914} className="w-[100px] sm:w-[200px] h-auto -mr-5 sm:-mr-10" />
            <Image src="/genie2.png" alt="야무지니2" width={1914} height={1914} className="w-[100px] sm:w-[200px] h-auto -mr-5 sm:-mr-10" />
            <Image src="/genie3.png" alt="야무지니3" width={1914} height={1914} className="w-[100px] sm:w-[200px] h-auto -mr-5 sm:-mr-10" />
            <Image src="/genie4.png" alt="야무지니4" width={1914} height={1914} className="w-[100px] sm:w-[200px] h-auto" />
          </div>

          {/* 비교 박스 */}
          <div className="grid grid-cols-2 md:grid-cols-2 gap-3 sm:gap-6 mb-8 sm:mb-12">
            {/* 직원 고용 */}
            <div className="bg-white/80 rounded-2xl p-4 sm:p-6 text-center border border-gray-200">
              <p className="font-bold text-gray-800 mb-2 sm:mb-4 text-sm sm:text-base">👤 직원 고용 👤</p>
              <div className="text-gray-600 space-y-0.5 sm:space-y-1 text-xs sm:text-base">
                <p>8시간 근무</p>
                <p>주말 휴무</p>
                <p>실수 가능성</p>
                <p>이직 리스크</p>
              </div>
            </div>

            {/* 야무지니 */}
            <div className="bg-[#fff9e0]/90 rounded-2xl p-4 sm:p-6 text-center border border-yellow-300">
              <p className="font-bold text-gray-800 mb-2 sm:mb-4 text-sm sm:text-base">💛 야무지니 💛</p>
              <div className="text-gray-700 space-y-0.5 sm:space-y-1 text-xs sm:text-base">
                <p>24시간 근무</p>
                <p>365일 근무</p>
                <p>일관된 컨디션</p>
                <p>관리 스트레스 제로</p>
              </div>
            </div>
          </div>

          {/* 하단 리스트 */}
          <div className="text-center space-y-1 sm:space-y-2 text-gray-700 text-sm sm:text-base">
            <p>✨ 이제 직원 출근 확인하러 새벽에 깨지 마세요</p>
            <p>✨ 직원 교육시키려고 주말 반납하지 마세요</p>
            <p>✨ 직원 아프다고 연락와도 당황하지 마세요</p>
            <p>✨ 연휴 때 직원 스케줄 걱정으로 잠 못 이루지 마세요</p>
          </div>

          {/* 구독 바로가기 버튼 */}
          <div className="text-center mt-8 sm:mt-12">
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 bg-[#ffbf03] hover:bg-[#e6ac00] text-gray-900 font-bold py-3 px-6 sm:py-4 sm:px-8 rounded-full text-sm sm:text-lg transition-colors"
            >
              구독 바로가기
              <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5" />
            </Link>
          </div>
        </div>
      </section>

      {/* 무료체험 신청 섹션 */}
      <section id="free-trial-form" className="bg-black py-12 sm:py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-8 sm:gap-12 items-center">
            {/* 왼쪽 텍스트 */}
            <div className="text-center md:text-left">
              <p className="text-[#ffb203] text-sm sm:text-lg font-bold mb-4 sm:mb-6">
                야무지니 한 달 고용해보기
              </p>
              <h2 className="text-2xl sm:text-5xl font-bold text-white mb-6 sm:mb-8 leading-tight">
                한 달간 써보세요.<br />
                돌아갈 수<br />
                없을거에요.
              </h2>
              <ul className="text-[#929298] space-y-1 sm:space-y-2 text-sm sm:text-base">
                <li>• 한 달간 비즈니스 플랜 무료 체험</li>
                <li>• 설정 비용 무료</li>
                <li>• 언제든 해지 가능 (위약금 없음)</li>
              </ul>
            </div>

            {/* 오른쪽 폼 */}
            <div className="bg-white rounded-2xl p-5 sm:p-8">
              {isSuccess ? (
                // 성공 메시지
                <div className="text-center py-6 sm:py-8">
                  <div className="text-4xl sm:text-6xl mb-3 sm:mb-4">🎉</div>
                  <h3 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">신청이 완료되었습니다!</h3>
                  <p className="text-gray-600 mb-4 text-sm sm:text-base">
                    <span className="font-semibold text-[#ffbf03]">{formData.email}</span>으로<br />
                    안내 메일을 보내드렸습니다.
                  </p>
                  <p className="text-gray-500 text-xs sm:text-sm">
                    10분 이내로 야무지니 체험을 시작하실 수 있습니다!
                  </p>
                  <button
                    onClick={() => {
                      setIsSuccess(false);
                      setFormData({
                        name: '',
                        phone: '',
                        email: '',
                        brandName: '',
                        industry: '',
                        agreeTerms: false
                      });
                    }}
                    className="mt-6 text-xs sm:text-sm text-gray-500 hover:text-gray-700 underline"
                  >
                    새로운 신청하기
                  </button>
                </div>
              ) : (
                // 폼
                <>
                  <div className="text-center mb-4 sm:mb-6">
                    <span className="text-3xl sm:text-4xl">🚀</span>
                    <h3 className="text-lg sm:text-2xl font-bold text-gray-900 mt-2">AI 야무지니 무료 체험</h3>
                    <p className="text-gray-500 text-xs sm:text-sm mt-1">10분이면 시작 가능! 바로 체험해보세요</p>
                  </div>

                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        이름<span className="text-red-500">*</span>
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

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        연락처<span className="text-red-500">*</span>
                      </label>
                      <input
                        type="tel"
                        name="phone"
                        value={formData.phone}
                        onChange={handleInputChange}
                        placeholder="010-1234-5678"
                        className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-yellow-400 focus:border-transparent outline-none ${
                          errors.phone ? 'border-red-500' : 'border-gray-300'
                        }`}
                      />
                      {errors.phone && (
                        <p className="text-red-500 text-xs mt-1">올바른 연락처를 입력해주세요</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        이메일<span className="text-red-500">*</span>
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

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        상호명<span className="text-red-500">*</span>
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
                        <p className="text-red-500 text-xs mt-1">상호명을 2자 이상 입력해주세요</p>
                      )}
                    </div>

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
                        <a href="https://yamoo.ai.kr/?mode=privacy" target="_blank" className="text-blue-500 hover:underline">개인정보 처리방침</a> 및{' '}
                        <a href="https://yamoo.ai.kr/?mode=policy" target="_blank" className="text-blue-500 hover:underline">이용약관</a>에 동의합니다
                      </label>
                    </div>

                    {submitError && (
                      <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm">
                        {submitError}
                      </div>
                    )}

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
                      💡 신청 후 <span className="text-[#ffbf03] font-bold">10분 이내</span> 시작 가능<br />
                      💳 카드 등록 불필요 • 🎁 무료 체험
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* 플로팅 무료체험 버튼 - 상단 중앙 고정 띠 형태 (두 번째 섹션부터 표시) */}
      {showFloatingButton && (
        <a
          href="#free-trial-form"
          className="fixed top-[72px] left-1/2 -translate-x-1/2 bg-white hover:bg-gray-50 text-gray-800 text-sm py-2 px-6 rounded-full shadow-md border border-gray-300 z-50 transition-colors whitespace-nowrap"
        >
          한달 무료 START
        </a>
      )}
    </div>
  );
}
