export type TabType = 'basic' | 'ai' | 'integrations' | 'payments' | 'subscription' | 'faq';

export interface Payment {
  id: string;
  amount: number;
  refundedAmount?: number;
  remainingAmount?: number;
  status: string;
  planId?: string;
  plan?: string;
  tenantId?: string;
  orderId?: string;
  category?: string;
  type?: string;
  transactionType?: 'charge' | 'refund';
  initiatedBy?: 'system' | 'admin' | 'user';
  adminId?: string;
  adminName?: string;
  receiptUrl?: string;
  createdAt: string;
  paidAt?: string | null;
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
  tenantId?: string;
  email?: string;
  brandName?: string;
  plan: string;
  status: string;
  amount?: number;
  periodStart?: string | null;
  periodEnd?: string | null;
  billingDate?: string | null;
  changeType: string;
  changedAt?: string | null;
  changedBy?: string;
  previousPlan?: string | null;
  previousStatus?: string | null;
  note?: string | null;
}

export type CustomFieldTab = 'basic' | 'ai' | 'integrations' | 'subscription';
export type CustomFieldType = 'string' | 'number' | 'boolean' | 'map' | 'array' | 'timestamp' | 'select';

export interface CustomFieldSchema {
  name: string;
  label: string;
  type: CustomFieldType;
  options?: string[];
  tab: CustomFieldTab;
  saveToFirestore: boolean;
  order: number;
}

// 결제 라벨
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
  downgrade_refund: '다운환불',
  cancel_refund: '해지환불',
  refund: '환불',
  subscription: '구독',
  renewal: '갱신',
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

export function getPlanName(plan: unknown): string {
  if (!plan) return '-';
  const planStr = String(plan);
  switch (planStr) {
    case 'trial': return 'Trial';
    case 'basic': return 'Basic';
    case 'business': return 'Business';
    case 'enterprise': return 'Enterprise';
    default: return planStr;
  }
}

export function getSubscriptionStatusBadge(status: unknown) {
  const statusStr = String(status || '');
  const baseClass = "px-2 py-1 text-xs font-medium rounded-full";
  const styles: Record<string, string> = {
    active: `${baseClass} bg-green-100 text-green-700`,
    trial: `${baseClass} bg-blue-100 text-blue-700`,
    trialing: `${baseClass} bg-blue-100 text-blue-700`,
    canceled: `${baseClass} bg-red-100 text-red-700`,
    pending_cancel: `${baseClass} bg-orange-100 text-orange-700`,
    past_due: `${baseClass} bg-red-100 text-red-700`,
    suspended: `${baseClass} bg-yellow-100 text-yellow-700`,
    expired: `${baseClass} bg-gray-100 text-gray-600`,
    completed: `${baseClass} bg-gray-100 text-gray-500`,
  };
  const labels: Record<string, string> = {
    active: '구독중',
    trial: '체험',
    trialing: '체험',
    canceled: '해지',
    pending_cancel: '해지예정',
    past_due: '결제 실패',
    suspended: '이용 정지',
    expired: '만료',
    completed: '완료',
  };
  const style = styles[statusStr] || `${baseClass} bg-gray-100 text-gray-600`;
  const label = labels[statusStr] || '미구독';
  return { style, label };
}
