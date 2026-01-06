'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Sofa, CheckCircle, WarningCircle, Clock, Plus, NavArrowRight, NavArrowDown, NavArrowUp, Shop } from 'iconoir-react';

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
}

interface TenantListProps {
  authParam: string;
  email: string;
  initialTenants: Tenant[];
}

const PLAN_NAMES: Record<string, string> = {
  trial: 'Trial',
  basic: 'Basic',
  business: 'Business',
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  active: { label: '구독 중', color: 'text-green-600 bg-green-50', icon: CheckCircle },
  canceled: { label: '해지 예정', color: 'text-orange-600 bg-orange-50', icon: Clock },
  past_due: { label: '결제 실패', color: 'text-red-600 bg-red-50', icon: WarningCircle },
  trial: { label: '체험 중', color: 'text-blue-600 bg-blue-50', icon: Clock },
  expired: { label: '미구독', color: 'text-gray-600 bg-gray-100', icon: WarningCircle },
};

export default function TenantList({ authParam, initialTenants }: TenantListProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  // 서버에서 초기 데이터를 받아서 바로 표시 (로딩 지연 없음)
  const tenants = initialTenants;

  if (tenants.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-lg p-8 text-center border border-gray-100">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Shop width={32} height={32} strokeWidth={1.5} className="text-gray-400" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">
          등록된 매장이 없습니다
        </h2>
        <p className="text-gray-600 mb-6">
          포탈에서 매장을 먼저 등록해주세요.
        </p>
        <a
          href="https://app.yamoo.ai.kr"
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary inline-flex items-center gap-2"
        >
          <Plus width={20} height={20} strokeWidth={2} />
          포탈에서 매장 등록하기
        </a>
      </div>
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
          // plan이 'trial'이면 status도 'trial'로 처리 (데이터 불일치 대응)
          const plan = tenant.subscription?.plan;
          let status = tenant.subscription?.status || 'none';
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
                    <h3 className="font-semibold text-gray-900">
                      {tenant.brandName}
                    </h3>
                    {tenant.subscription ? (
                      <div className="flex items-center gap-2 mt-1">
                        {status === 'expired' || !statusConfig ? (
                          // 만료(즉시해지) 또는 상태 미인식 - 아이콘 없이 미구독 + 플랜명 표시
                          <>
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium text-gray-600 bg-gray-100">
                              미구독
                            </span>
                            <span className="text-sm text-gray-500">
                              {PLAN_NAMES[tenant.subscription.plan] || tenant.subscription.plan}
                            </span>
                          </>
                        ) : (
                          <>
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusConfig.color}`}>
                              <StatusIcon width={12} height={12} strokeWidth={2} />
                              {statusConfig.label}
                              {/* 해지 예정 또는 체험 중인 경우 종료일 표시 */}
                              {(status === 'canceled' || status === 'trial') && tenant.subscription.currentPeriodEnd && (
                                <span className="ml-0.5">
                                  (~{new Date(tenant.subscription.currentPeriodEnd).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })})
                                </span>
                              )}
                            </span>
                            <span className="text-sm text-gray-500">
                              {PLAN_NAMES[tenant.subscription.plan] || tenant.subscription.plan}
                            </span>
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
            <a
              href="https://app.yamoo.ai.kr"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-3 text-sm text-gray-600 hover:text-yamoo-primary transition-colors"
            >
              <Plus width={16} height={16} strokeWidth={2} />
              새 매장 추가하기
            </a>
          </div>
        </>
      )}
    </div>
  );
}
