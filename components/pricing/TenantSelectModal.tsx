'use client';

import { useState } from 'react';
import { Xmark, Sofa, Sparks, CreditCard } from 'iconoir-react';
import { Loader2 } from 'lucide-react';
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
  } | null;
}

interface TenantSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenants: Tenant[];
  selectedPlan: string;
  authParam: string;
  email: string;
  onSelectTenant: (tenantId: string) => void;
}

export default function TenantSelectModal({
  isOpen,
  onClose,
  tenants,
  selectedPlan,
  authParam,
  email,
  onSelectTenant,
}: TenantSelectModalProps) {
  const [isLoading, setIsLoading] = useState<string | null>(null);

  if (!isOpen) return null;

  const hasTenants = tenants.length > 0;

  // 세션 생성 후 checkout으로 이동
  const createSessionAndRedirect = async (tenantId?: string, isNewTenant?: boolean) => {
    setIsLoading(tenantId || 'new');
    try {
      const token = authParam.startsWith('token=') ? authParam.replace('token=', '') : undefined;
      const response = await fetch('/api/checkout/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          plan: selectedPlan,
          tenantId,
          isNewTenant,
          token,
        }),
      });

      if (response.ok) {
        window.location.href = '/checkout';
      } else {
        console.error('Failed to create checkout session');
        setIsLoading(null);
      }
    } catch (error) {
      console.error('Error creating session:', error);
      setIsLoading(null);
    }
  };

  const handleTrialClick = () => {
    window.location.href = '/about#free-trial-form';
  };

  const handleDirectPayment = async () => {
    await createSessionAndRedirect(undefined, true);
  };

  const handleSelectTenant = async (tenant: Tenant) => {
    const isSubscribed = tenant.subscription?.status === 'active' || tenant.subscription?.status === 'trial';

    if (isSubscribed) {
      const currentPlan = tenant.subscription?.plan;

      if (currentPlan === selectedPlan) {
        // 같은 플랜 구독중
        alert(`이미 ${currentPlan} 플랜을 구독중입니다.\n플랜 변경 또는 구독 해지는 마이페이지에서 진행해주세요.`);
        return;
      } else {
        // 다른 플랜 구독중 → 플랜 변경
        const confirmed = confirm(`현재 ${currentPlan} 플랜을 구독중입니다.\n${selectedPlan} 플랜으로 변경하시겠습니까?`);
        if (confirmed) {
          window.location.href = `/account/change-plan?${authParam}&tenantId=${tenant.tenantId}`;
        }
        return;
      }
    }

    // 미구독 → 결제 진행
    onSelectTenant(tenant.tenantId);
    await createSessionAndRedirect(tenant.tenantId);
  };

  return (
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
                  disabled={isLoading !== null}
                  className={cn(
                    'w-full p-4 rounded-lg border-2 text-left transition-all',
                    'hover:border-yamoo-primary hover:bg-yamoo-primary/5',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                    tenant.subscription?.status === 'active'
                      ? 'border-gray-200 bg-gray-50'
                      : 'border-gray-200'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-black rounded-lg flex items-center justify-center">
                      {isLoading === tenant.tenantId ? (
                        <Loader2 className="w-5 h-5 text-white animate-spin" />
                      ) : (
                        <Sofa width={20} height={20} strokeWidth={1.5} className="text-white" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-gray-900">
                          {tenant.brandName}
                        </p>
                        {tenant.subscription?.status === 'active' || tenant.subscription?.status === 'trial' ? (
                          <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-700">
                            {tenant.subscription.plan} 플랜
                            {(tenant.subscription.currentPeriodEnd || tenant.subscription.nextBillingDate) && (
                              <span className="ml-1 text-green-600">
                                ~{new Date(tenant.subscription.currentPeriodEnd || tenant.subscription.nextBillingDate!).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-500">
                            미구독
                          </span>
                        )}
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
                disabled={isLoading !== null}
                className="w-full p-5 rounded-xl border-2 border-gray-200 text-left transition-all hover:border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    {isLoading === 'new' ? (
                      <Loader2 className="w-6 h-6 text-gray-600 animate-spin" />
                    ) : (
                      <CreditCard width={24} height={24} strokeWidth={1.5} className="text-gray-600" />
                    )}
                  </div>
                  <div>
                    <p className="font-bold text-gray-900 text-lg">
                      {isLoading === 'new' ? '처리 중...' : '바로 결제하기'}
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
  );
}
