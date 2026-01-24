'use client';

import { useState, useEffect, useRef } from 'react';
import PricingCard from './PricingCard';
import TenantSelectModal from './TenantSelectModal';
import EnterpriseModal from './EnterpriseModal';
import TrialSuggestionModal from './TrialSuggestionModal';
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
  gridCols?: number;
}

export default function PricingClient({
  plans,
  currentPlan,
  subscriptionStatus,
  authParam,
  isLoggedIn,
  initialTenantId,
  initialTenants = [],
  gridCols = 4,
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
  const [isTrialSuggestionOpen, setIsTrialSuggestionOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string>('');
  const [trialApplied, setTrialApplied] = useState<boolean>(false);
  const [hasPaidSubscription, setHasPaidSubscription] = useState<boolean>(false);
  const [isUserDataLoaded, setIsUserDataLoaded] = useState<boolean>(false);
  const [pendingCheckoutData, setPendingCheckoutData] = useState<{ plan: string; url: string } | null>(null);

  // 중복 fetch 방지용 ref
  const hasFetchedRef = useRef(initialTenants.length > 0 || isLoggedIn);
  const hasFetchedUserRef = useRef(false);

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
    if (!userEmail || !user) {
      return;
    }

    hasFetchedRef.current = true;

    const fetchTenants = async () => {
      try {
        const idToken = await user.getIdToken();
        const response = await fetch(`/api/tenants?email=${encodeURIComponent(userEmail)}&skipSubscription=true`, {
          headers: {
            'Authorization': `Bearer ${idToken}`,
          },
        });
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
  }, [userEmail, user]);

  // 사용자 데이터 조회 (trialApplied 확인용)
  useEffect(() => {
    // 비로그인 상태면 로드 완료 처리
    if (!userEmail || !user) {
      setIsUserDataLoaded(true);
      return;
    }

    if (hasFetchedUserRef.current) {
      return;
    }

    hasFetchedUserRef.current = true;

    const fetchUserData = async () => {
      try {
        const idToken = await user.getIdToken();
        const response = await fetch(`/api/users/${encodeURIComponent(userEmail)}`, {
          headers: {
            'Authorization': `Bearer ${idToken}`,
          },
        });
        if (response.ok) {
          const data = await response.json();
          setTrialApplied(data.trialApplied || false);
          setHasPaidSubscription(data.hasPaidSubscription || false);
        }
      } catch (error) {
        console.error('Failed to fetch user data:', error);
      } finally {
        setIsUserDataLoaded(true);
      }
    };

    fetchUserData();
  }, [userEmail, user]);

  const handleSelectWithoutTenant = (planId: string) => {
    setSelectedPlan(planId);
    setIsModalOpen(true);
  };

  const handleSelectTenant = (tenantId: string) => {
    setSelectedTenantId(tenantId);
  };

  // 유료 구독 전 무료체험 체크
  const handleCheckTrialBeforeSubscribe = (planId: string, checkoutUrl: string) => {
    const plan = plans.find(p => p.id === planId);
    if (plan) {
      setSelectedPlan(planId);
      setPendingCheckoutData({ plan: planId, url: checkoutUrl });
      setIsTrialSuggestionOpen(true);
    }
  };

  // 무료체험 먼저하기
  const handleGoToTrial = () => {
    setIsTrialSuggestionOpen(false);
    window.location.href = '/trial';
  };

  // 바로 구독하기
  const handleProceedAnyway = () => {
    setIsTrialSuggestionOpen(false);
    if (pendingCheckoutData) {
      window.location.href = pendingCheckoutData.url;
    }
  };

  // 현재 선택된 tenantId (URL에서 받은 것 또는 자동 선택된 것)
  const effectiveTenantId = selectedTenantId || initialTenantId;
  const finalAuthParam = authParam || (userEmail ? `email=${encodeURIComponent(userEmail)}` : '');

  // 그리드 열 수에 따른 클래스 (Tailwind CSS는 동적 클래스를 지원하지 않으므로 미리 정의)
  const gridColsClass = gridCols === 3
    ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12'
    : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12';

  return (
    <>
      <div className={gridColsClass}>
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
            trialApplied={trialApplied}
            onSelectWithoutTenant={handleSelectWithoutTenant}
            onEnterpriseClick={() => setIsEnterpriseModalOpen(true)}
            onCheckTrialBeforeSubscribe={handleCheckTrialBeforeSubscribe}
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
        trialApplied={trialApplied}
        hasPaidSubscription={hasPaidSubscription}
        isUserDataLoaded={isUserDataLoaded}
        onSelectTenant={handleSelectTenant}
        onCheckTrialBeforeSubscribe={handleCheckTrialBeforeSubscribe}
      />

      <EnterpriseModal
        isOpen={isEnterpriseModalOpen}
        onClose={() => setIsEnterpriseModalOpen(false)}
      />

      <TrialSuggestionModal
        isOpen={isTrialSuggestionOpen}
        onClose={() => setIsTrialSuggestionOpen(false)}
        onGoToTrial={handleGoToTrial}
        onProceedAnyway={handleProceedAnyway}
        planName={plans.find(p => p.id === selectedPlan)?.name || ''}
      />
    </>
  );
}
