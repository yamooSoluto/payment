// TossPayments SDK 타입 정의
interface TossPaymentsInstance {
  requestBillingAuth: (
    method: '카드',
    params: {
      customerKey: string;
      successUrl: string;
      failUrl: string;
      customerEmail?: string;
      customerName?: string;
    }
  ) => Promise<void>;
}

declare global {
  interface Window {
    TossPayments?: (clientKey: string) => TossPaymentsInstance;
  }
}

// Subscription types
export interface Subscription {
  email: string;
  userId?: string;
  status: 'trial' | 'active' | 'canceled' | 'past_due';
  plan: 'starter' | 'pro' | 'business' | null;
  amount?: number;
  billingKey?: string;
  trialStartDate?: Date;
  trialEndDate?: Date;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  nextBillingDate?: Date;
  cardCompany?: string;
  cardNumber?: string;
  canceledAt?: Date;
  cancelReason?: string;
  retryCount?: number;
  createdAt: Date;
  updatedAt: Date;
}

// Payment types
export interface Payment {
  id?: string;
  email: string;
  orderId: string;
  paymentKey: string;
  amount: number;
  plan: string;
  status: 'done' | 'canceled' | 'failed';
  method: string;
  cardCompany?: string;
  cardNumber?: string;
  refundedAmount?: number;
  refundedAt?: Date;
  paidAt?: Date;
  createdAt: Date;
}

// SSO Token types
export interface SSOToken {
  email: string;
  used: boolean;
  purpose: 'checkout' | 'account';
  expiresAt: Date;
  createdAt: Date;
}

// Plan types
export interface Plan {
  id: string;
  name: string;
  price: string;
  priceNumber?: number;
  description: string;
  features: string[];
  popular?: boolean;
}

// API Response types
export interface APIResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// Toss Payment types
export interface TossCard {
  company: string;
  number: string;
  installmentPlanMonths: number;
  isInterestFree: boolean;
  approveNo: string;
  useCardPoint: boolean;
  cardType: string;
  ownerType: string;
  acquireStatus: string;
}

export interface TossPaymentResponse {
  paymentKey: string;
  orderId: string;
  orderName: string;
  status: string;
  requestedAt: string;
  approvedAt: string;
  card?: TossCard;
  method: string;
  totalAmount: number;
  balanceAmount: number;
  suppliedAmount: number;
  vat: number;
}
