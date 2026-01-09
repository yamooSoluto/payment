'use client';

import { useState, useEffect } from 'react';
import { Xmark, Sofa, Sparks, CreditCard, WarningCircle, ArrowRight, ArrowLeft } from 'iconoir-react';
import { cn } from '@/lib/utils';
import { INDUSTRY_OPTIONS } from '@/lib/constants';

interface Tenant {
  id: string;
  tenantId: string;
  brandName: string;
  subscription?: {
    plan: string;
    status: string;
    currentPeriodEnd?: string;
    nextBillingDate?: string;
    canceledAt?: string;
  } | null;
}

interface TenantSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenants: Tenant[];
  selectedPlan: string;
  authParam: string;
  email: string;
  trialApplied?: boolean;
  onSelectTenant: (tenantId: string) => void;
  onCheckTrialBeforeSubscribe?: (planId: string, checkoutUrl: string) => void;
}

interface AlertModalState {
  isOpen: boolean;
  type: 'same-plan' | 'change-plan' | 'trial-upgrade' | 'active-change';
  currentPlan: string;
  targetPlan: string;
  tenantId: string;
}

// 플랜별 색상 반환
function getPlanColors(plan: string): { bg: string; text: string; dateBg: string } {
  switch (plan?.toLowerCase()) {
    case 'trial':
      return { bg: 'bg-cyan-100', text: 'text-cyan-700', dateBg: 'text-cyan-600' };
    case 'basic':
      return { bg: 'bg-blue-100', text: 'text-blue-700', dateBg: 'text-blue-600' };
    case 'business':
      return { bg: 'bg-purple-100', text: 'text-purple-700', dateBg: 'text-purple-600' };
    case 'enterprise':
      return { bg: 'bg-amber-100', text: 'text-amber-700', dateBg: 'text-amber-600' };
    default:
      return { bg: 'bg-green-100', text: 'text-green-700', dateBg: 'text-green-600' };
  }
}

export default function TenantSelectModal({
  isOpen,
  onClose,
  tenants,
  selectedPlan,
  authParam,
  email,
  trialApplied = false,
  onSelectTenant,
  onCheckTrialBeforeSubscribe,
}: TenantSelectModalProps) {
  const [alertModal, setAlertModal] = useState<AlertModalState>({
    isOpen: false,
    type: 'same-plan',
    currentPlan: '',
    targetPlan: '',
    tenantId: '',
  });

  // 매장 정보 입력 폼 상태
  const [showTenantForm, setShowTenantForm] = useState(false);
  const [brandName, setBrandName] = useState('');
  const [industry, setIndustry] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [agreedNoTrial, setAgreedNoTrial] = useState(false);

  // 모달이 닫힐 때 폼 상태 초기화
  useEffect(() => {
    if (!isOpen) {
      setShowTenantForm(false);
      setBrandName('');
      setIndustry('');
      setFormError(null);
      setAgreedNoTrial(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const hasTenants = tenants.length > 0;

  const handleTrialClick = () => {
    window.location.href = '/trial';
  };

  const handleDirectPayment = () => {
    // 매장 정보 입력 폼 표시
    setShowTenantForm(true);
    setFormError(null);
  };

  const handleBackToSelection = () => {
    setShowTenantForm(false);
    setBrandName('');
    setIndustry('');
    setFormError(null);
    setAgreedNoTrial(false);
  };

  const handleTenantFormSubmit = () => {
    if (!brandName.trim()) {
      setFormError('매장명을 입력해주세요.');
      return;
    }
    if (!industry) {
      setFormError('업종을 선택해주세요.');
      return;
    }

    // 매장 정보와 함께 결제 페이지로 이동
    const url = `/checkout?plan=${selectedPlan}&${authParam}&newTenant=true&brandName=${encodeURIComponent(brandName.trim())}&industry=${encodeURIComponent(industry)}`;
    window.location.href = url;
  };

  const handleSelectTenant = (tenant: Tenant) => {
    // plan이 'trial'인 경우도 구독 중으로 처리 (데이터 불일치 대응)
    const isTrial = tenant.subscription?.plan === 'trial' ||
                    tenant.subscription?.status === 'trial';
    const isSubscribed = tenant.subscription?.status === 'active' ||
                         tenant.subscription?.status === 'trial' ||
                         tenant.subscription?.status === 'canceled' ||
                         tenant.subscription?.plan === 'trial';

    if (isSubscribed) {
      const currentPlan = tenant.subscription?.plan || '';

      if (currentPlan === selectedPlan) {
        // 같은 플랜 구독중 → 커스텀 알림
        setAlertModal({
          isOpen: true,
          type: 'same-plan',
          currentPlan,
          targetPlan: selectedPlan,
          tenantId: tenant.tenantId,
        });
        return;
      } else if (isTrial) {
        // 무료체험 중 → 플랜 예약/즉시 전환 선택
        setAlertModal({
          isOpen: true,
          type: 'trial-upgrade',
          currentPlan,
          targetPlan: selectedPlan,
          tenantId: tenant.tenantId,
        });
        return;
      } else {
        // 다른 유료 플랜 구독중 → 플랜 예약/즉시 전환 선택
        setAlertModal({
          isOpen: true,
          type: 'active-change',
          currentPlan,
          targetPlan: selectedPlan,
          tenantId: tenant.tenantId,
        });
        return;
      }
    }

    // 미구독 → 결제 진행 (무료체험 체크)
    onSelectTenant(tenant.tenantId);
    const url = `/checkout?plan=${selectedPlan}&${authParam}&tenantId=${tenant.tenantId}`;

    // 무료체험 이력이 없으면 팝업 표시 (trial 플랜 제외)
    if (selectedPlan !== 'trial' && !trialApplied && onCheckTrialBeforeSubscribe) {
      onCheckTrialBeforeSubscribe(selectedPlan, url);
    } else {
      window.location.href = url;
    }
  };

  const handleAlertConfirm = () => {
    if (alertModal.type === 'same-plan') {
      window.location.href = `/account/${alertModal.tenantId}?${authParam}`;
    } else if (alertModal.type === 'trial-upgrade') {
      // 무료체험 즉시 전환: 바로 결제 진행
      window.location.href = `/checkout?plan=${alertModal.targetPlan}&${authParam}&tenantId=${alertModal.tenantId}&mode=immediate`;
    } else if (alertModal.type === 'active-change') {
      // 유료 플랜 즉시 변경: 플랜 변경 페이지로 이동
      window.location.href = `/account/change-plan?${authParam}&tenantId=${alertModal.tenantId}`;
    } else {
      window.location.href = `/account/change-plan?${authParam}&tenantId=${alertModal.tenantId}`;
    }
  };

  const handleSchedule = () => {
    // 플랜 예약: 현재 구독/체험 종료 후 자동 전환 예약
    window.location.href = `/checkout?plan=${alertModal.targetPlan}&${authParam}&tenantId=${alertModal.tenantId}&mode=reserve`;
  };

  const handleAlertClose = () => {
    setAlertModal(prev => ({ ...prev, isOpen: false }));
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          onClick={onClose}
        />

        {/* Modal */}
        <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b flex-shrink-0">
            {showTenantForm && (
              <button
                onClick={handleBackToSelection}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors mr-2"
              >
                <ArrowLeft width={20} height={20} strokeWidth={1.5} className="text-gray-500" />
              </button>
            )}
            <h2 className="text-xl font-bold text-gray-900 flex-1">
              {showTenantForm ? '매장 정보 입력' : hasTenants ? '매장 선택' : '서비스 시작하기'}
            </h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <Xmark width={20} height={20} strokeWidth={1.5} className="text-gray-500" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 overflow-y-auto flex-1">
            {showTenantForm ? (
              // 매장 정보 입력 폼
              <div className="space-y-4">
                <p className="text-gray-600 text-center mb-4">
                  구독할 매장의 정보를 입력해주세요.
                </p>

                {/* 매장명 입력 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    매장명 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={brandName}
                    onChange={(e) => setBrandName(e.target.value)}
                    placeholder="예: 야무 강남점"
                    className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                  />
                </div>

                {/* 업종 선택 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    업종 <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent bg-white"
                  >
                    <option value="">업종을 선택해주세요</option>
                    {INDUSTRY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-gray-500">
                    업종은 최초 설정 후 변경할 수 없습니다.
                  </p>
                </div>

                {/* 무료체험 불가 안내 */}
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <WarningCircle width={20} height={20} strokeWidth={1.5} className="text-amber-600 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-amber-800">
                      <p className="font-semibold mb-1">무료체험 불가 안내</p>
                      <p className="text-amber-700">
                        유료 결제 이후에는 동일 명의로 무료체험을 신청하실 수 없습니다.
                        (탈퇴 후 재가입해도 동일)
                        무료체험을 원하시면 이전으로 돌아가 &apos;무료체험 신청하기&apos;를 선택해주세요.
                      </p>
                    </div>
                  </div>
                </div>

                {/* 동의 체크박스 */}
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={agreedNoTrial}
                    onChange={(e) => setAgreedNoTrial(e.target.checked)}
                    className="w-5 h-5 mt-0.5 rounded border-gray-300 text-black focus:ring-black cursor-pointer"
                  />
                  <span className="text-sm text-gray-700">
                    유료 결제 후 동일 명의로 무료체험을 신청할 수 없음을 확인했습니다.
                  </span>
                </label>

                {formError && (
                  <p className="text-sm text-red-600">{formError}</p>
                )}

                {/* 버튼 */}
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleBackToSelection}
                    className="flex-1 py-3 px-4 rounded-lg font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
                  >
                    이전
                  </button>
                  <button
                    type="button"
                    onClick={handleTenantFormSubmit}
                    disabled={!brandName.trim() || !industry || !agreedNoTrial}
                    className="flex-1 py-3 px-4 rounded-lg font-semibold text-white bg-black hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    결제 진행
                  </button>
                </div>
              </div>
            ) : hasTenants ? (
              // 매장이 있는 경우: 매장 선택
              <div className="space-y-3">
                <p className="text-gray-600 mb-4">
                  구독을 적용할 매장을 선택해주세요.
                </p>
                {tenants.map((tenant) => (
                  <button
                    key={tenant.tenantId}
                    onClick={() => handleSelectTenant(tenant)}
                    className={cn(
                      'w-full p-4 rounded-lg border-2 text-left transition-all',
                      'hover:border-yamoo-primary hover:bg-yamoo-primary/5',
                      tenant.subscription?.status === 'active' || tenant.subscription?.status === 'trial'
                        ? 'border-gray-200 bg-gray-50'
                        : 'border-gray-200'
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-black rounded-lg flex items-center justify-center">
                        <Sofa width={20} height={20} strokeWidth={1.5} className="text-white" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-gray-900">
                            {tenant.brandName}
                          </p>
                          {(() => {
                            const status = tenant.subscription?.status;

                            // 활성 or 체험중
                            if (status === 'active' || status === 'trial') {
                              const colors = getPlanColors(tenant.subscription!.plan);
                              const endDate = tenant.subscription!.currentPeriodEnd || tenant.subscription!.nextBillingDate;
                              return (
                                <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${colors.bg} ${colors.text}`}>
                                  {tenant.subscription!.plan} 플랜
                                  {endDate && (
                                    <span className={`ml-1 ${colors.dateBg}`}>
                                      ~{new Date(endDate).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}
                                    </span>
                                  )}
                                </span>
                              );
                            }

                            // 해지 예정 (예약 해지)
                            if (status === 'canceled') {
                              const endDate = tenant.subscription?.currentPeriodEnd || tenant.subscription?.nextBillingDate;
                              return (
                                <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-orange-100 text-orange-700">
                                  해지 예정
                                  {endDate && (
                                    <span className="ml-1">
                                      ~{new Date(endDate).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}
                                    </span>
                                  )}
                                </span>
                              );
                            }

                            // 미구독 (만료 or 없음)
                            return (
                              <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-500">
                                미구독
                              </span>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              // 매장이 없는 경우: 무료체험 or 바로결제
              <div className="space-y-4">
                <p className="text-gray-600 text-center">
                  등록된 매장이 없습니다.<br />
                  아래 옵션 중 선택해주세요.
                </p>

                {/* 무료체험 옵션 */}
                <button
                  onClick={handleTrialClick}
                  className="w-full p-5 rounded-xl border-2 border-yamoo-primary bg-yamoo-primary/5 text-left transition-all hover:bg-yamoo-primary/10"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-yamoo-primary rounded-lg flex items-center justify-center flex-shrink-0">
                      <Sparks width={24} height={24} strokeWidth={1.5} className="text-white" />
                    </div>
                    <div>
                      <p className="font-bold text-gray-900 text-lg">
                        무료체험 신청하기
                      </p>
                      <p className="text-sm text-gray-600 mt-1">
                        1개월 무료로 야무를 체험해보세요!
                      </p>
                    </div>
                  </div>
                </button>

                {/* 바로결제 옵션 */}
                <button
                  onClick={handleDirectPayment}
                  className="w-full p-5 rounded-xl border-2 border-gray-200 text-left transition-all hover:border-gray-300 hover:bg-gray-50"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <CreditCard width={24} height={24} strokeWidth={1.5} className="text-gray-600" />
                    </div>
                    <div>
                      <p className="font-bold text-gray-900 text-lg">
                        바로 결제하기
                      </p>
                      <p className="text-sm text-gray-600 mt-1">
                        이미 야무 서비스를 알고 계신가요?<br />
                        바로 결제를 진행합니다.
                      </p>
                    </div>
                  </div>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Custom Alert Modal */}
      {alertModal.isOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={handleAlertClose}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-sm w-full mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Icon */}
            <div className="pt-8 pb-4 flex justify-center">
              <div className={cn(
                "w-16 h-16 rounded-full flex items-center justify-center",
                alertModal.type === 'same-plan'
                  ? "bg-amber-100"
                  : alertModal.type === 'trial-upgrade'
                  ? "bg-cyan-100"
                  : "bg-blue-100"
              )}>
                {alertModal.type === 'same-plan' ? (
                  <WarningCircle width={32} height={32} strokeWidth={1.5} className="text-amber-600" />
                ) : alertModal.type === 'trial-upgrade' ? (
                  <Sparks width={32} height={32} strokeWidth={1.5} className="text-cyan-600" />
                ) : (
                  <ArrowRight width={32} height={32} strokeWidth={1.5} className="text-blue-600" />
                )}
              </div>
            </div>

            {/* Content */}
            <div className="px-6 pb-6 text-center">
              <h3 className="text-lg font-bold text-gray-900 mb-2">
                {alertModal.type === 'same-plan'
                  ? '이미 구독중인 플랜입니다'
                  : (alertModal.type === 'trial-upgrade' || alertModal.type === 'active-change')
                  ? '플랜 전환 방식을 선택해주세요'
                  : '플랜을 변경하시겠습니까?'}
              </h3>
              <p className="text-gray-600 text-sm mb-6">
                {alertModal.type === 'same-plan' ? (
                  <>
                    현재 <span className="font-semibold text-gray-900">{alertModal.currentPlan}</span> 플랜을 구독중입니다.<br />
                    플랜 변경 또는 구독 해지는<br />
                    마이페이지에서 진행해주세요.
                  </>
                ) : alertModal.type === 'trial-upgrade' ? (
                  <>
                    현재 <span className="font-semibold text-cyan-600">무료체험</span> 중입니다.<br />
                    <span className="font-semibold text-gray-900">{alertModal.targetPlan}</span> 플랜으로 전환하시겠습니까?
                  </>
                ) : (
                  <>
                    현재 <span className="font-semibold text-gray-900">{alertModal.currentPlan}</span> 플랜을 구독중입니다.<br />
                    <span className="font-semibold text-gray-900">{alertModal.targetPlan}</span> 플랜으로 변경하시겠습니까?
                  </>
                )}
              </p>

              {/* Buttons */}
              {(alertModal.type === 'trial-upgrade' || alertModal.type === 'active-change') ? (
                <div className="space-y-3">
                  <button
                    onClick={handleSchedule}
                    className="w-full py-3 px-4 rounded-lg font-semibold border-2 border-gray-300 text-gray-700 hover:bg-yamoo-primary hover:border-yamoo-primary hover:text-gray-900 transition-colors"
                  >
                    <span className="block text-base">플랜 예약</span>
                    <span className="block text-xs opacity-70 mt-0.5">
                      {alertModal.type === 'trial-upgrade' ? '체험 종료 후 자동 전환' : '현재 구독 종료 후 자동 전환'}
                    </span>
                  </button>
                  <button
                    onClick={handleAlertConfirm}
                    className="w-full py-3 px-4 rounded-lg font-semibold border-2 border-gray-300 text-gray-700 hover:bg-yamoo-primary hover:border-yamoo-primary hover:text-gray-900 transition-colors"
                  >
                    <span className="block text-base">즉시 전환</span>
                    <span className="block text-xs opacity-70 mt-0.5">지금 바로 결제 진행</span>
                  </button>
                  <button
                    onClick={handleAlertClose}
                    className="w-full py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
                  >
                    취소
                  </button>
                </div>
              ) : (
                <div className="flex gap-3">
                  <button
                    onClick={handleAlertClose}
                    className="flex-1 py-3 px-4 rounded-lg border-2 border-gray-200 text-gray-700 font-semibold hover:bg-gray-50 transition-colors"
                  >
                    닫기
                  </button>
                  <button
                    onClick={handleAlertConfirm}
                    className={cn(
                      "flex-1 py-3 px-4 rounded-lg font-semibold transition-colors",
                      alertModal.type === 'same-plan'
                        ? "bg-gray-900 text-white hover:bg-gray-800"
                        : "bg-yamoo-primary text-gray-900 hover:bg-yamoo-primary/90"
                    )}
                  >
                    {alertModal.type === 'same-plan' ? '마이페이지로 이동' : '플랜 변경하기'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
