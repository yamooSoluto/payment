'use client';

import { useState, useEffect, useRef } from 'react';
import PricingCard from './PricingCard';
import TenantSelectModal from './TenantSelectModal';
import EnterpriseModal from './EnterpriseModal';
import { useAuth } from '@/contexts/AuthContext';

interface Plan {
  id: string;
  name: string;
  price: string;
  priceNumber?: number;
  tagline?: string;
  description: string;
  features: string[];
  popular?: boolean;
}

interface Tenant {
  id: string;
  tenantId: string;
  brandName: string;
  subscription?: {
    plan: string;
    status: string;
  } | null;
}

interface PricingClientProps {
  plans: Plan[];
  currentPlan: string | null;
  subscriptionStatus: string | null;
  authParam: string;
  isLoggedIn: boolean;
  initialTenantId?: string | null;
  initialTenants?: Tenant[];
}

export default function PricingClient({
  plans,
  currentPlan,
  subscriptionStatus,
  authParam,
  isLoggedIn,
  initialTenantId,
  initialTenants = [],
}: PricingClientProps) {
  const { user } = useAuth();
  // 서버에서 받은 매장 목록 사용 (추가 API 호출 불필요)
  const [tenants, setTenants] = useState<Tenant[]>(initialTenants);
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(() => {
    // 매장이 1개면 자동 선택
    if (initialTenantId) return initialTenantId;
    if (initialTenants.length === 1) return initialTenants[0].tenantId;
    return null;
  });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEnterpriseModalOpen, setIsEnterpriseModalOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string>('');

  // 중복 fetch 방지용 ref
  const hasFetchedRef = useRef(initialTenants.length > 0 || isLoggedIn);

  // 서버 또는 클라이언트 인증 상태 확인
  const isAuthenticated = isLoggedIn || !!user;
  const userEmail = user?.email;

  // 클라이언트 Firebase Auth로 로그인한 경우에만 매장 조회
  useEffect(() => {
    // 이미 fetch 했으면 스킵
    if (hasFetchedRef.current) {
      return;
    }

    // 클라이언트에서 로그인한 경우에만 조회
    if (!userEmail) {
      return;
    }

    hasFetchedRef.current = true;

    const fetchTenants = async () => {
      try {
        const response = await fetch(`/api/tenants?email=${encodeURIComponent(userEmail)}`);
        if (response.ok) {
          const data = await response.json();
          setTenants(data.tenants || []);

          // 매장이 1개면 자동 선택
          if (data.tenants?.length === 1) {
            setSelectedTenantId(data.tenants[0].tenantId);
          }
        }
      } catch (error) {
        console.error('Failed to fetch tenants:', error);
      }
    };

    fetchTenants();
  }, [userEmail]);

  const handleSelectWithoutTenant = (planId: string) => {
    setSelectedPlan(planId);
    setIsModalOpen(true);
  };

  const handleSelectTenant = (tenantId: string) => {
    setSelectedTenantId(tenantId);
  };

  // 현재 선택된 tenantId (URL에서 받은 것 또는 자동 선택된 것)
  const effectiveTenantId = selectedTenantId || initialTenantId;
  const finalAuthParam = authParam || (userEmail ? `email=${encodeURIComponent(userEmail)}` : '');

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
        {plans.map((plan) => (
          <PricingCard
            key={plan.id}
            plan={plan}
            currentPlan={currentPlan}
            subscriptionStatus={subscriptionStatus}
            authParam={finalAuthParam}
            isLoggedIn={isAuthenticated}
            tenantId={effectiveTenantId}
            tenantCount={tenants.length}
            onSelectWithoutTenant={handleSelectWithoutTenant}
            onEnterpriseClick={() => setIsEnterpriseModalOpen(true)}
          />
        ))}
      </div>

      <TenantSelectModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        tenants={tenants}
        selectedPlan={selectedPlan}
        authParam={finalAuthParam}
        email={userEmail || ''}
        onSelectTenant={handleSelectTenant}
      />

      <EnterpriseModal
        isOpen={isEnterpriseModalOpen}
        onClose={() => setIsEnterpriseModalOpen(false)}
      />
    </>
  );
}
