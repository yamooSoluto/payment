export interface Member {
  id: string;
  email: string;
  userId?: string | null;
  name: string;
  phone: string;
  group: string;
  createdAt: string;
  memo?: string;
  lastLoginAt?: string | null;
  lastLoginIP?: string | null;
  totalAmount?: number;
  trialApplied?: boolean;
  trialAppliedAt?: string | null;
  trialBrandName?: string | null;
  deleted?: boolean;
  deletedAt?: string | null;
  deletedBy?: string | null;
}

export interface TenantSubscription {
  plan: string;
  status: string;
  amount: number;
  nextBillingDate: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  pricePolicy: string | null;
  priceProtectedUntil: string | null;
  originalAmount: number | null;
  cancelMode?: 'scheduled' | 'immediate';
  pendingPlan?: string | null;
}

export interface TenantInfo {
  docId: string;
  tenantId: string;
  brandName: string;
  industry?: string;
  address?: string;
  createdAt: string | null;
  subscription: TenantSubscription | null;
  deleted?: boolean;
  deletedAt?: string | null;
}

export interface Payment {
  id: string;
  amount: number;
  refundedAmount?: number;
  status: string;
  planId: string;
  plan?: string;
  tenantId?: string;
  orderId?: string;
  category?: string;
  type?: string;
  transactionType?: 'charge' | 'refund';
  initiatedBy?: 'system' | 'admin' | 'user';
  adminId?: string;
  adminName?: string;
  changeGroupId?: string;
  receiptUrl?: string;
  createdAt: string;
  paidAt: string | null;
  cardInfo?: { company?: string; number?: string };
  cardCompany?: string;
  cardNumber?: string;
  originalPaymentId?: string;
  refundReason?: string;
  cancelReason?: string;
  paymentKey?: string;
  email?: string;
  [key: string]: unknown;
}

export interface SubscriptionHistoryItem {
  recordId: string;
  tenantId: string;
  brandName: string;
  email: string;
  plan: string;
  status: string;
  amount: number;
  periodStart: string;
  periodEnd: string | null;
  billingDate?: string | null;
  changeType: string;
  changedAt: string;
  changedBy: string;
  previousPlan?: string | null;
  previousStatus?: string | null;
  note?: string | null;
}

export const PRICE_POLICY_LABELS: Record<string, string> = {
  grandfathered: '가격 보호 (영구)',
  protected_until: '기간 한정 보호',
  standard: '일반',
};

export const PAYMENT_CATEGORY_LABELS: Record<string, string> = {
  subscription: '신규 구독',
  recurring: '정기 결제',
  change: '플랜 변경',
  cancel: '구독 취소',
};

export const PAYMENT_TYPE_LABELS: Record<string, string> = {
  first_payment: '첫 결제',
  trial_convert: 'Trial 전환',
  auto: '자동 결제',
  retry: '재결제',
  upgrade: '업그레이드',
  downgrade: '다운그레이드',
  immediate: '즉시 취소',
  end_of_period: '기간 만료',
  admin_manual: '관리자 수동',
  admin_refund: '관리자 환불',
};

export const TRANSACTION_TYPE_LABELS: Record<string, string> = {
  charge: '결제',
  refund: '환불',
};

export const INITIATED_BY_LABELS: Record<string, string> = {
  system: '자동',
  admin: '관리자',
  user: '회원',
};

export const CHANGE_TYPE_LABELS: Record<string, string> = {
  new: '신규',
  upgrade: '업그레이드',
  downgrade: '다운그레이드',
  renew: '갱신',
  cancel: '해지',
  expire: '만료',
  reactivate: '재활성화',
  admin_edit: '수정',
};

export const CHANGED_BY_LABELS: Record<string, string> = {
  admin: '관리자',
  system: '시스템',
  user: '회원',
};

export const getPlanName = (planId?: string) => {
  switch (planId) {
    case 'basic': return 'Basic';
    case 'business': return 'Business';
    case 'enterprise': return 'Enterprise';
    case 'trial': return 'Trial';
    default: return planId || '-';
  }
};

export const getSubStatusLabel = (status: string | undefined) => {
  switch (status) {
    case 'trial':
    case 'trialing': return '체험';
    case 'active': return '구독중';
    case 'pending_cancel': return '해지예정';
    case 'completed': return '완료';
    case 'expired': return '만료';
    case 'canceled': return '해지';
    case 'past_due': return '결제 실패';
    case 'suspended': return '이용 정지';
    default: return status || '-';
  }
};

export const getStatusBadge = (status: string | null | undefined, size: 'sm' | 'md' = 'md', cancelMode?: string, pendingPlan?: string | null) => {
  const sizeClass = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm';
  if (status === 'canceled' && cancelMode === 'immediate') {
    return { style: `${sizeClass} font-medium bg-gray-100 text-gray-400 rounded-full`, label: '미구독', pendingIndicator: null };
  }
  const pendingIndicator = pendingPlan ? `→${pendingPlan.charAt(0).toUpperCase()}` : null;
  switch (status) {
    case 'active':
      return { style: `${sizeClass} font-medium bg-green-100 text-green-700 rounded-full`, label: '구독중', pendingIndicator };
    case 'trial':
    case 'trialing':
      return { style: `${sizeClass} font-medium bg-blue-100 text-blue-700 rounded-full`, label: '체험중', pendingIndicator };
    case 'pending_cancel':
      return { style: `${sizeClass} font-medium bg-orange-100 text-orange-700 rounded-full`, label: '해지예정', pendingIndicator: null };
    case 'canceled':
      return { style: `${sizeClass} font-medium bg-orange-100 text-orange-700 rounded-full`, label: '해지 예정', pendingIndicator: null };
    case 'expired':
      return { style: `${sizeClass} font-medium bg-gray-100 text-gray-500 rounded-full`, label: '만료', pendingIndicator: null };
    case 'past_due':
      return { style: `${sizeClass} font-medium bg-red-100 text-red-700 rounded-full`, label: '결제 실패', pendingIndicator: null };
    case 'deleted':
      return { style: `${sizeClass} font-medium bg-red-100 text-red-500 rounded-full`, label: '삭제', pendingIndicator: null };
    case null:
    case undefined:
    case '':
      return { style: `${sizeClass} font-medium bg-gray-100 text-gray-400 rounded-full`, label: '미구독', pendingIndicator: null };
    default:
      return { style: `${sizeClass} font-medium bg-gray-100 text-gray-500 rounded-full`, label: status, pendingIndicator: null };
  }
};

export const getThisMonthRange = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { start, end };
};
