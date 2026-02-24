'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Sofa, CheckCircle, WarningCircle, Clock, Plus, NavArrowRight, NavArrowDown, NavArrowUp, Xmark, Box3dCenter, Shop, CoffeeCup, Gym, Scissor, Book, Key, Cart, Home, SleeperChair } from 'iconoir-react';
import { INDUSTRY_LABEL_TO_CODE, type IndustryCode } from '@/lib/constants';
import { Loader2 } from 'lucide-react';
import AddTenantModal from './AddTenantModal';

// 요금제 선택 안내 모달
interface PricingGuidanceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function PricingGuidanceModal({ isOpen, onClose }: PricingGuidanceModalProps) {
  const router = useRouter();

  if (!isOpen) return null;

  const handleGoPricing = () => {
    router.push('/plan');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 hover:bg-gray-100 rounded-full transition-colors z-10"
        >
          <Xmark width={20} height={20} strokeWidth={1.5} className="text-gray-500" />
        </button>

        {/* Content */}
        <div className="p-8 text-center">
          <div className="w-16 h-16 bg-yamoo-primary/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <Box3dCenter width={32} height={32} strokeWidth={1.5} className="text-yamoo-primary" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">
            요금제를 먼저 선택해주세요
          </h3>
          <p className="text-gray-600 mb-6 text-sm">
            1개월 무료체험도 가능합니다!
          </p>
          <div className="flex flex-col gap-3">
            <button
              onClick={handleGoPricing}
              className="w-full py-3 bg-yamoo-primary text-gray-900 rounded-lg font-semibold hover:bg-yamoo-primary/90 transition-colors"
            >
              요금제 선택하러 가기
            </button>
            <button
              onClick={onClose}
              className="w-full py-3 text-gray-500 hover:text-gray-700 transition-colors text-sm"
            >
              취소
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface Subscription {
  plan: string;
  status: string;
  amount: number;
  nextBillingDate: string | null;
  currentPeriodEnd: string | null;
  canceledAt: string | null;
  cancelMode?: 'scheduled' | 'immediate'; // 해지 모드
}

interface Tenant {
  id: string;
  tenantId: string;
  brandName: string;
  email: string;
  industry?: string | null;
  createdAt: string | null;
  subscription: Subscription | null;
  isPending?: boolean; // Optimistic UI용
}

// 업종별 아이콘 컴포넌트 매핑 (코드 + 한글 라벨 모두 지원)
const INDUSTRY_ICON_COMPONENTS: Record<string, React.ElementType> = {
  // 코드로 접근
  study_cafe: SleeperChair,
  self_store: Shop,
  cafe_restaurant: CoffeeCup,
  fitness: Gym,
  beauty: Scissor,
  education: Book,
  rental_space: Key,
  retail_business: Cart,
  other: Sofa,
  // 한글 라벨로 접근 (DB에 한글로 저장된 경우)
  '스터디카페 / 독서실': SleeperChair,
  '무인매장 / 셀프운영 매장': Shop,
  '카페 / 음식점': CoffeeCup,
  '피트니스 / 운동공간': Gym,
  '뷰티 / 미용': Scissor,
  '교육 / 학원': Book,
  '공간대여 / 숙박': Key,
  '소매 / 유통 / 판매업': Cart,
  '기타': Sofa,
};

interface TenantListProps {
  authParam: string;
  email: string;
  initialTenants: Tenant[];
  hasTrialHistory?: boolean;
}

const PLAN_CONFIG: Record<string, { label: string; color: string }> = {
  trial: { label: 'Trial', color: 'text-amber-700 bg-amber-50 border border-amber-200' },
  basic: { label: 'Basic', color: 'text-blue-700 bg-blue-50 border border-blue-200' },
  business: { label: 'Business', color: 'text-indigo-700 bg-indigo-50 border border-indigo-200' },
  enterprise: { label: 'Enterprise', color: 'text-pink-700 bg-pink-50 border border-pink-200' },
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  active: { label: '구독 중', color: 'text-green-600 bg-green-50', icon: CheckCircle },
  pending_cancel: { label: '해지 예정', color: 'text-orange-600 bg-orange-50', icon: Clock },
  canceled: { label: '해지됨', color: 'text-gray-600 bg-gray-100', icon: WarningCircle },
  past_due: { label: '결제 실패', color: 'text-red-600 bg-red-50', icon: WarningCircle },
  suspended: { label: '이용 정지', color: 'text-red-600 bg-red-50', icon: WarningCircle },
  trial: { label: '체험 중', color: 'text-blue-600 bg-blue-50', icon: Clock },
  expired: { label: '미구독', color: 'text-gray-600 bg-gray-100', icon: WarningCircle },
};

interface NewTenantData {
  tenantId: string;
  brandName: string;
  industry: string;
}

export default function TenantList({ authParam, email, initialTenants, hasTrialHistory = false }: TenantListProps) {
  const router = useRouter();
  const [isExpanded, setIsExpanded] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPricingGuidance, setShowPricingGuidance] = useState(false);
  const [pendingTenants, setPendingTenants] = useState<Tenant[]>([]);

  // initialTenants가 업데이트되면 pending에서 중복 제거
  useEffect(() => {
    if (pendingTenants.length > 0) {
      const existingIds = new Set(initialTenants.map(t => t.tenantId));
      setPendingTenants(prev => prev.filter(p => !existingIds.has(p.tenantId)));
    }
  }, [initialTenants, pendingTenants.length]);

  // 서버 데이터 + 로컬 pending 데이터 병합 (새 매장은 목록 맨 아래에 표시)
  const tenants = [...initialTenants, ...pendingTenants];

  const handleAddSuccess = (newTenant?: NewTenantData) => {
    if (newTenant) {
      // 매장 목록에 즉시 추가 (폴링으로 이미 생성 확인됨, isPending 불필요)
      setPendingTenants(prev => [{
        id: newTenant.tenantId,
        tenantId: newTenant.tenantId,
        brandName: newTenant.brandName,
        email,
        industry: newTenant.industry as IndustryCode,
        createdAt: new Date().toISOString(),
        subscription: null,
      }, ...prev]);
    }
  };

  // 매장 추가 버튼 클릭 핸들러
  const handleAddTenantClick = () => {
    // 첫 매장 추가 시 무료체험 이력이 없으면 요금제 선택으로 유도
    // (구독 중인 매장이 없고, 무료체험도 안 해봤으면)
    const hasAnySubscription = tenants.some(t =>
      t.subscription?.status === 'active' ||
      t.subscription?.status === 'trial' ||
      t.subscription?.status === 'canceled'
    );

    if (tenants.length === 0 && !hasTrialHistory && !hasAnySubscription) {
      setShowPricingGuidance(true);
    } else {
      setShowAddModal(true);
    }
  };

  if (tenants.length === 0) {
    return (
      <>
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg p-8 text-center border border-white/60">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Sofa width={32} height={32} strokeWidth={1.5} className="text-gray-400" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            등록된 매장이 없습니다
          </h2>
          <p className="text-gray-600 mb-6">
            {!hasTrialHistory
              ? '요금제를 선택하고 첫 매장을 추가해주세요.'
              : '새 매장을 추가해주세요.'}
          </p>
          <button
            onClick={handleAddTenantClick}
            className="btn-primary inline-flex items-center gap-2"
          >
            <Plus width={20} height={20} strokeWidth={2} />
            {!hasTrialHistory ? '시작하기' : '새 매장 추가하기'}
          </button>
        </div>

        {showAddModal && (
          <AddTenantModal
            onClose={() => setShowAddModal(false)}
            onSuccess={handleAddSuccess}
            authParam={authParam}
          />
        )}

        <PricingGuidanceModal
          isOpen={showPricingGuidance}
          onClose={() => setShowPricingGuidance(false)}
        />
      </>
    );
  }

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg overflow-hidden border border-white/60">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-6 py-5 flex items-center justify-between hover:bg-white/40 transition-colors"
      >
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-gray-900">내 매장</h2>
          <span className="text-sm text-gray-400">총 {tenants.length}개</span>
        </div>
        {isExpanded ? (
          <NavArrowUp width={20} height={20} strokeWidth={1.5} className="text-gray-400" />
        ) : (
          <NavArrowDown width={20} height={20} strokeWidth={1.5} className="text-gray-400" />
        )}
      </button>

      {isExpanded && (
        <>
          <div className="p-3 pt-2 space-y-1.5 border-t border-gray-100/70">
            {tenants.map((tenant) => {
              const plan = tenant.subscription?.plan;
              let status = tenant.subscription?.status || 'none';
              if (plan === 'trial' && status !== 'expired') status = 'trial';
              if (status === 'canceled') status = 'expired';
              const statusConfig = STATUS_CONFIG[status];
              const IndustryIcon = (tenant.industry && INDUSTRY_ICON_COMPONENTS[tenant.industry]) || Sofa;
              const hasSubscription = plan && status !== 'expired' && statusConfig;

              const statusDotColor: Record<string, string> = {
                active: 'bg-green-400',
                pending_cancel: 'bg-orange-400',
                trial: 'bg-blue-400',
                past_due: 'bg-red-400',
                suspended: 'bg-red-400',
              };

              return (
                <Link
                  key={tenant.tenantId}
                  href={`/account/${tenant.tenantId}${authParam ? `?${authParam}` : ''}`}
                  className="flex items-center gap-3.5 px-4 py-3.5 bg-white/50 rounded-xl hover:bg-white/90 hover:shadow-sm transition-all border border-gray-100/50 hover:border-gray-200/70 group"
                >
                  <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <IndustryIcon width={18} height={18} strokeWidth={1.5} className="text-gray-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-gray-900 text-sm truncate">{tenant.brandName}</span>
                      {tenant.isPending && <Loader2 className="w-3 h-3 animate-spin text-gray-400 flex-shrink-0" />}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {hasSubscription ? (
                        <>
                          <span className="text-xs text-gray-400">{PLAN_CONFIG[plan]?.label || plan}</span>
                          <span className="text-gray-200 text-xs leading-none">·</span>
                          <span className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${statusDotColor[status] || 'bg-gray-300'}`} />
                          <span className="text-xs text-gray-500">{statusConfig.label}</span>
                        </>
                      ) : (
                        <span className="text-xs text-gray-400">미구독</span>
                      )}
                    </div>
                  </div>
                  <NavArrowRight width={15} height={15} strokeWidth={2} className="text-gray-300 group-hover:text-gray-500 transition-colors flex-shrink-0" />
                </Link>
              );
            })}
          </div>

          {/* 새 매장 추가 버튼 */}
          <div className="px-3 pb-3">
            <button
              onClick={handleAddTenantClick}
              className="flex items-center justify-center gap-2 w-full py-2.5 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-400 hover:border-gray-300 hover:text-gray-600 transition-colors"
            >
              <Plus width={15} height={15} strokeWidth={2} />
              새 매장 추가
            </button>
          </div>
        </>
      )}

      {showAddModal && typeof document !== 'undefined' && createPortal(
        <AddTenantModal
          onClose={() => setShowAddModal(false)}
          onSuccess={handleAddSuccess}
          authParam={authParam}
        />,
        document.body
      )}

      {typeof document !== 'undefined' && createPortal(
        <PricingGuidanceModal
          isOpen={showPricingGuidance}
          onClose={() => setShowPricingGuidance(false)}
        />,
        document.body
      )}
    </div>
  );
}
