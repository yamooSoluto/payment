'use client';

import { useState } from 'react';
import { Xmark, Sofa, Sparks, CreditCard, WarningCircle, ArrowRight } from 'iconoir-react';
import { cn } from '@/lib/utils';

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
  type: 'same-plan' | 'change-plan' | 'trial-upgrade';
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

  if (!isOpen) return null;

  const hasTenants = tenants.length > 0;

  const handleTrialClick = () => {
    window.location.href = '/trial';
  };

  const handleDirectPayment = () => {
    const url = `/checkout?plan=${selectedPlan}&${authParam}&newTenant=true`;

    // 무료체험 이력이 없으면 팝업 표시 (trial 플랜 제외)
    if (selectedPlan !== 'trial' && !trialApplied && onCheckTrialBeforeSubscribe) {
      onCheckTrialBeforeSubscribe(selectedPlan, url);
    } else {
      window.location.href = url;
    }
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
        // 다른 플랜 구독중 → 플랜 변경 확인
        setAlertModal({
          isOpen: true,
          type: 'change-plan',
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
      // 즉시 전환: 바로 결제 진행
      window.location.href = `/checkout?plan=${alertModal.targetPlan}&${authParam}&tenantId=${alertModal.tenantId}`;
    } else {
      window.location.href = `/account/change-plan?${authParam}&tenantId=${alertModal.tenantId}`;
    }
  };

  const handleTrialSchedule = () => {
    // 플랜 예약: 체험 종료 후 자동 전환 예약
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
        <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b">
            <h2 className="text-xl font-bold text-gray-900">
              {hasTenants ? '매장 선택' : '서비스 시작하기'}
            </h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <Xmark width={20} height={20} strokeWidth={1.5} className="text-gray-500" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6">
            {hasTenants ? (
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
                        1개월 무료로 야무를 체험해보세요!<br />
                        신청서 작성 후 담당자가 연락드립니다.
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
                  : alertModal.type === 'trial-upgrade'
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
              {alertModal.type === 'trial-upgrade' ? (
                <div className="space-y-3">
                  <button
                    onClick={handleTrialSchedule}
                    className="w-full py-3 px-4 rounded-lg font-semibold border-2 border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <span className="block text-base">플랜 예약</span>
                    <span className="block text-xs text-gray-500 mt-0.5">체험 종료 후 자동 전환</span>
                  </button>
                  <button
                    onClick={handleAlertConfirm}
                    className="w-full py-3 px-4 rounded-lg font-semibold bg-yamoo-primary text-gray-900 hover:bg-yamoo-primary/90 transition-colors"
                  >
                    <span className="block text-base">즉시 전환</span>
                    <span className="block text-xs text-gray-700 mt-0.5">지금 바로 결제 진행</span>
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
