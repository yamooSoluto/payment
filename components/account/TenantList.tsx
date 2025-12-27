'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Sofa, CheckCircle, WarningCircle, Clock, Plus, NavArrowRight, Shop } from 'iconoir-react';
import { formatPrice } from '@/lib/utils';

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
}

const PLAN_NAMES: Record<string, string> = {
  trial: '무료 체험',
  basic: 'Basic',
  business: 'Business',
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  active: { label: '구독 중', color: 'text-green-600 bg-green-50', icon: CheckCircle },
  canceled: { label: '해지 예정', color: 'text-orange-600 bg-orange-50', icon: Clock },
  past_due: { label: '결제 실패', color: 'text-red-600 bg-red-50', icon: WarningCircle },
  trial: { label: '체험 중', color: 'text-blue-600 bg-blue-50', icon: Clock },
};

export default function TenantList({ authParam, email }: TenantListProps) {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTenants = async () => {
      try {
        const response = await fetch(`/api/tenants?${authParam}`);
        if (!response.ok) {
          throw new Error('Failed to fetch tenants');
        }
        const data = await response.json();
        setTenants(data.tenants || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : '매장 목록을 불러오는데 실패했습니다.');
      } finally {
        setLoading(false);
      }
    };

    fetchTenants();
  }, [authParam]);

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-lg p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-1/3"></div>
          <div className="space-y-3">
            <div className="h-20 bg-gray-100 rounded-lg"></div>
            <div className="h-20 bg-gray-100 rounded-lg"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl shadow-lg p-8">
        <div className="text-center text-red-600">
          <WarningCircle width={48} height={48} strokeWidth={1.5} className="mx-auto mb-4" />
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (tenants.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-lg p-8 text-center">
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
    <div className="bg-white rounded-xl shadow-lg overflow-hidden">
      <div className="p-6 border-b border-gray-100">
        <h2 className="text-xl font-bold text-gray-900">내 매장</h2>
        <p className="text-sm text-gray-500 mt-1">
          총 {tenants.length}개의 매장
        </p>
      </div>

      <div className="divide-y divide-gray-100">
        {tenants.map((tenant) => {
          const status = tenant.subscription?.status || 'none';
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
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusConfig?.color || 'text-gray-600 bg-gray-100'}`}>
                          <StatusIcon width={12} height={12} strokeWidth={2} />
                          {statusConfig?.label || '미구독'}
                        </span>
                        <span className="text-sm text-gray-500">
                          {PLAN_NAMES[tenant.subscription.plan] || tenant.subscription.plan}
                        </span>
                        <span className="text-sm text-gray-400">
                          월 {formatPrice(tenant.subscription.amount)}원
                        </span>
                      </div>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-gray-600 bg-gray-100 mt-1">
                        미구독
                      </span>
                    )}
                  </div>
                </div>
                <NavArrowRight width={20} height={20} strokeWidth={2} className="text-gray-400" />
              </div>

              {/* 추가 정보 */}
              {tenant.subscription && (
                <div className="mt-3 ml-16 text-sm text-gray-500">
                  {tenant.subscription.status === 'canceled' && tenant.subscription.currentPeriodEnd && (
                    <p>
                      {new Date(tenant.subscription.currentPeriodEnd).toLocaleDateString('ko-KR')}까지 이용 가능
                    </p>
                  )}
                  {tenant.subscription.status === 'active' && tenant.subscription.nextBillingDate && (
                    <p>
                      다음 결제일: {new Date(tenant.subscription.nextBillingDate).toLocaleDateString('ko-KR')}
                    </p>
                  )}
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
    </div>
  );
}
