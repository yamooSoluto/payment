'use client';

import { X, Store, Sparkles, CreditCard } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Tenant {
  id: string;
  tenantId: string;
  brandName: string;
  subscription?: {
    plan: string;
    status: string;
  } | null;
}

interface TenantSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenants: Tenant[];
  selectedPlan: string;
  authParam: string;
  onSelectTenant: (tenantId: string) => void;
}

export default function TenantSelectModal({
  isOpen,
  onClose,
  tenants,
  selectedPlan,
  authParam,
  onSelectTenant,
}: TenantSelectModalProps) {
  if (!isOpen) return null;

  const hasTenants = tenants.length > 0;

  const handleTrialClick = () => {
    window.location.href = '/about#free-trial-form';
  };

  const handleDirectPayment = () => {
    // tenantId 없이 결제 페이지로 이동 (신규 매장 생성 필요)
    const url = `/checkout?plan=${selectedPlan}&${authParam}&newTenant=true`;
    window.location.href = url;
  };

  const handleSelectTenant = (tenantId: string) => {
    onSelectTenant(tenantId);
    const url = `/checkout?plan=${selectedPlan}&${authParam}&tenantId=${tenantId}`;
    window.location.href = url;
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
            <X className="w-5 h-5 text-gray-500" />
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
                  onClick={() => handleSelectTenant(tenant.tenantId)}
                  className={cn(
                    'w-full p-4 rounded-lg border-2 text-left transition-all',
                    'hover:border-yamoo-primary hover:bg-yamoo-primary/5',
                    tenant.subscription?.status === 'active'
                      ? 'border-gray-200 bg-gray-50'
                      : 'border-gray-200'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-yamoo-primary/10 rounded-lg flex items-center justify-center">
                      <Store className="w-5 h-5 text-yamoo-primary" />
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-gray-900">
                        {tenant.brandName}
                      </p>
                      {tenant.subscription?.status === 'active' && (
                        <p className="text-sm text-gray-500">
                          현재: {tenant.subscription.plan} 플랜
                        </p>
                      )}
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
                    <Sparkles className="w-6 h-6 text-white" />
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
                    <CreditCard className="w-6 h-6 text-gray-600" />
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
  );
}
