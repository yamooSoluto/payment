'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Sofa, CheckCircle, WarningCircle, Clock, Plus, NavArrowRight, NavArrowDown, NavArrowUp, Shop } from 'iconoir-react';
import { Loader2 } from 'lucide-react';
import AddTenantModal from './AddTenantModal';

interface Subscription {
  plan: string;
  status: string;
  amount: number;
  nextBillingDate: string | null;
  currentPeriodEnd: string | null;
  canceledAt: string | null;
}

interface Tenant {
  id: string;
  tenantId: string;
  brandName: string;
  email: string;
  createdAt: string | null;
  subscription: Subscription | null;
  isPending?: boolean; // Optimistic UI용
}

interface TenantListProps {
  authParam: string;
  email: string;
  initialTenants: Tenant[];
}

const PLAN_CONFIG: Record<string, { label: string; color: string }> = {
  trial: { label: 'Trial', color: 'text-amber-700 bg-amber-50 border border-amber-200' },
  basic: { label: 'Basic', color: 'text-blue-700 bg-blue-50 border border-blue-200' },
  business: { label: 'Business', color: 'text-indigo-700 bg-indigo-50 border border-indigo-200' },
  enterprise: { label: 'Enterprise', color: 'text-pink-700 bg-pink-50 border border-pink-200' },
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  active: { label: '구독 중', color: 'text-green-600 bg-green-50', icon: CheckCircle },
  canceled: { label: '해지 예정', color: 'text-orange-600 bg-orange-50', icon: Clock },
  past_due: { label: '결제 실패', color: 'text-red-600 bg-red-50', icon: WarningCircle },
  trial: { label: '체험 중', color: 'text-blue-600 bg-blue-50', icon: Clock },
  expired: { label: '미구독', color: 'text-gray-600 bg-gray-100', icon: WarningCircle },
};

interface NewTenantData {
  tenantId: string;
  brandName: string;
  industry: string;
}

export default function TenantList({ authParam, email, initialTenants }: TenantListProps) {
  const router = useRouter();
  const [isExpanded, setIsExpanded] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [pendingTenants, setPendingTenants] = useState<Tenant[]>([]);

  // initialTenants가 업데이트되면 pending에서 중복 제거
  useEffect(() => {
    if (pendingTenants.length > 0) {
      const existingIds = new Set(initialTenants.map(t => t.tenantId));
      setPendingTenants(prev => prev.filter(p => !existingIds.has(p.tenantId)));
    }
  }, [initialTenants, pendingTenants.length]);

  // 서버 데이터 + 로컬 pending 데이터 병합
  const tenants = [...pendingTenants, ...initialTenants];

  const handleAddSuccess = (newTenant?: NewTenantData) => {
    if (newTenant) {
      // Optimistic UI: 즉시 목록에 추가
      setPendingTenants(prev => [{
        id: newTenant.tenantId,
        tenantId: newTenant.tenantId,
        brandName: newTenant.brandName,
        email,
        createdAt: new Date().toISOString(),
        subscription: null,
        isPending: true,
      }, ...prev]);
    }
    // 백그라운드에서 실제 데이터 새로고침
    router.refresh();
  };

  if (tenants.length === 0) {
    return (
      <>
        <div className="bg-white rounded-xl shadow-lg p-8 text-center border border-gray-100">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Shop width={32} height={32} strokeWidth={1.5} className="text-gray-400" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            등록된 매장이 없습니다
          </h2>
          <p className="text-gray-600 mb-6">
            새 매장을 추가해주세요.
          </p>
          <button
            onClick={() => setShowAddModal(true)}
            className="btn-primary inline-flex items-center gap-2"
          >
            <Plus width={20} height={20} strokeWidth={2} />
            새 매장 추가하기
          </button>
        </div>

        {showAddModal && (
          <AddTenantModal
            onClose={() => setShowAddModal(false)}
            onSuccess={handleAddSuccess}
            authParam={authParam}
          />
        )}
      </>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-gray-100">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-6 flex items-center justify-between bg-gray-900 hover:bg-gray-800 transition-colors"
      >
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold text-white">내 매장</h2>
          <span className="text-sm text-gray-400">총 {tenants.length}개</span>
        </div>
        {isExpanded ? (
          <NavArrowUp width={20} height={20} strokeWidth={1.5} className="text-gray-300" />
        ) : (
          <NavArrowDown width={20} height={20} strokeWidth={1.5} className="text-gray-300" />
        )}
      </button>

      {isExpanded && (
        <>
          <div className="divide-y divide-gray-100 border-t border-gray-100">
        {tenants.map((tenant) => {
          // plan이 없거나 빈 값이면 미구독으로 처리
          const plan = tenant.subscription?.plan;
          const hasValidSubscription = tenant.subscription && plan;

          let status = tenant.subscription?.status || 'none';
          // plan이 'trial'이면 status도 'trial'로 처리 (데이터 불일치 대응)
          if (plan === 'trial' && status !== 'expired') {
            status = 'trial';
          }
          const statusConfig = STATUS_CONFIG[status];
          const StatusIcon = statusConfig?.icon || Sofa;

          return (
            <Link
              key={tenant.tenantId}
              href={`/account/${tenant.tenantId}?${authParam}`}
              className="block p-6 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-black rounded-xl flex items-center justify-center">
                    <Sofa width={24} height={24} strokeWidth={1.5} className="text-white" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                      {tenant.brandName}
                      {tenant.isPending && (
                        <Loader2 className="w-3 h-3 animate-spin text-gray-400" />
                      )}
                    </h3>
                    {hasValidSubscription ? (
                      <div className="flex items-center gap-2 mt-1">
                        {status === 'expired' || !statusConfig ? (
                          // 만료(즉시해지) 또는 상태 미인식 - 미구독만 표시
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium text-gray-600 bg-gray-100">
                            미구독
                          </span>
                        ) : (
                          <>
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusConfig.color}`}>
                              <StatusIcon width={12} height={12} strokeWidth={2} />
                              {statusConfig.label}
                              {/* 해지 예정 또는 체험 중인 경우 종료일 표시 */}
                              {(status === 'canceled' || status === 'trial') && tenant.subscription!.currentPeriodEnd && (
                                <span className="ml-0.5">
                                  (~{new Date(tenant.subscription!.currentPeriodEnd).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })})
                                </span>
                              )}
                            </span>
                            {/* 플랜 라벨 (trial은 상태 라벨에서 이미 표시되므로 제외) */}
                            {plan !== 'trial' && (
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${PLAN_CONFIG[plan]?.color || 'text-gray-600 bg-gray-100'}`}>
                                {PLAN_CONFIG[plan]?.label || plan}
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium text-gray-600 bg-gray-100 mt-1">
                        미구독
                      </span>
                    )}
                  </div>
                </div>
                <NavArrowRight width={20} height={20} strokeWidth={2} className="text-gray-400" />
              </div>

              {/* 추가 정보 */}
              {tenant.subscription && tenant.subscription.status === 'active' && tenant.subscription.nextBillingDate && (
                <div className="mt-3 ml-16 text-sm text-gray-500">
                  <p>
                    다음 결제일: {new Date(tenant.subscription.nextBillingDate).toLocaleDateString('ko-KR')}
                  </p>
                </div>
              )}
            </Link>
          );
        })}
          </div>

          {/* 새 매장 추가 버튼 */}
          <div className="p-4 bg-gray-50 border-t border-gray-100">
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center justify-center gap-2 w-full py-3 text-sm text-gray-600 hover:text-yamoo-primary transition-colors"
            >
              <Plus width={16} height={16} strokeWidth={2} />
              새 매장 추가하기
            </button>
          </div>
        </>
      )}

      {showAddModal && (
        <AddTenantModal
          onClose={() => setShowAddModal(false)}
          onSuccess={handleAddSuccess}
          authParam={authParam}
        />
      )}
    </div>
  );
}
