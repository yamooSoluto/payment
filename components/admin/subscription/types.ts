// 구독 관련 공통 타입 정의

export type SubscriptionStatus =
  | 'none'           // 미구독
  | 'trial'          // 무료체험
  | 'trialing'       // 무료체험 (레거시)
  | 'active'         // 구독중
  | 'pending_cancel' // 해지 예정
  | 'canceled'       // 해지됨
  | 'expired'        // 만료
  | 'past_due'       // 결제 실패
  | 'suspended';     // 일시 정지

export type PlanType = 'trial' | 'basic' | 'business' | 'enterprise';

export type SubscriptionActionType =
  | 'start'          // 구독 시작
  | 'change_plan'    // 플랜 변경
  | 'adjust_period'  // 기간 조정
  | 'cancel'         // 해지

// 구독 정보 인터페이스
export interface SubscriptionInfo {
  tenantId: string;
  plan: PlanType | null;
  status: SubscriptionStatus;
  amount: number;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  nextBillingDate: string | null;
  cancelAt?: string | null;
  pendingPlan?: PlanType | null;
  hasBillingKey?: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
}

// 매장 기본 정보
export interface TenantBasicInfo {
  tenantId: string;
  brandName: string;
  email: string;
}

// 구독 시작 요청
export interface StartSubscriptionRequest {
  plan: PlanType;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  nextBillingDate?: string | null;
  reason?: string;
}

// 플랜 변경 요청
export interface ChangePlanRequest {
  newPlan: PlanType;
  applyNow: boolean;
  reason?: string;
}

// 기간 조정 요청
export interface AdjustPeriodRequest {
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  nextBillingDate?: string | null;
  syncNextBilling?: boolean;
  reason: string;
}

// 구독 해지 요청
export interface CancelSubscriptionRequest {
  cancelMode: 'scheduled' | 'immediate';
  reason: string;
}

// 모달 Props
export interface SubscriptionActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  subscription: SubscriptionInfo | null;
  tenant: TenantBasicInfo;
  initialAction?: SubscriptionActionType;
  onSuccess: () => void;
}

// 구독 상태 카드 Props
export interface SubscriptionStatusCardProps {
  subscription: SubscriptionInfo | null;
  tenant: TenantBasicInfo;
}

// 폼 공통 Props
export interface SubscriptionFormProps {
  tenantId: string;
  subscription: SubscriptionInfo | null;
  tenant: TenantBasicInfo;
  onSuccess: () => void;
  onCancel: () => void;
}

// 플랜별 금액
export const PLAN_PRICES: Record<PlanType, number> = {
  trial: 0,
  basic: 39000,
  business: 99000,
  enterprise: 199000,
};

// 플랜명 변환
export const PLAN_LABELS: Record<PlanType, string> = {
  trial: 'Trial',
  basic: 'Basic',
  business: 'Business',
  enterprise: 'Enterprise',
};

// 상태명 변환
export const STATUS_LABELS: Record<SubscriptionStatus, string> = {
  none: '미구독',
  trial: '체험',
  trialing: '체험',
  active: '구독중',
  pending_cancel: '해지 예정',
  canceled: '해지',
  expired: '만료',
  past_due: '결제 실패',
  suspended: '일시 정지',
};

// 구독이 활성 상태인지 확인
export function isSubscriptionActive(status: SubscriptionStatus | null | undefined): boolean {
  return status === 'active' || status === 'trial' || status === 'trialing' || status === 'pending_cancel';
}

// 구독을 시작할 수 있는 상태인지 확인
export function canStartSubscription(status: SubscriptionStatus | null | undefined): boolean {
  return !status || status === 'none' || status === 'expired' || status === 'canceled';
}

// 날짜 포맷 (YYYY-MM-DD)
export function formatDateForInput(date: Date | string | null): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toISOString().split('T')[0];
}

// 날짜 계산: 시작일 + 1개월 - 1일 = 종료일
export function calculatePeriodEnd(startDate: Date | string): Date {
  const start = typeof startDate === 'string' ? new Date(startDate) : new Date(startDate);
  const end = new Date(start);
  const originalDay = end.getDate();
  end.setMonth(end.getMonth() + 1);
  if (end.getDate() !== originalDay) {
    end.setDate(0);
  }
  end.setDate(end.getDate() - 1);
  return end;
}

// 날짜 계산: 종료일 + 1일 = 결제일
export function calculateNextBillingDate(endDate: Date | string): Date {
  const end = typeof endDate === 'string' ? new Date(endDate) : new Date(endDate);
  const billing = new Date(end);
  billing.setDate(billing.getDate() + 1);
  return billing;
}
