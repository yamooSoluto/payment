export interface Plan {
  id: string;
  name: string;
  price: number;
  minPrice?: number;
  maxPrice?: number;
  tagline: string;
  description: string;
  features: string[];
  refundPolicy: string;
  isActive: boolean;
  displayMode: 'hidden' | 'coming_soon';
  popular: boolean;
  order: number;
  isNegotiable: boolean;
}

export interface CustomLink {
  id: string;
  planId: string;
  planName: string;
  customAmount?: number;
  targetEmail?: string;
  targetUserName?: string;
  billingType: 'recurring' | 'onetime';
  subscriptionDays?: number;
  validFrom: string;
  validUntil: string;
  maxUses: number;
  currentUses: number;
  memo?: string;
  createdAt: string;
  status: 'active' | 'expired' | 'disabled';
}

export interface Member {
  id: string;
  email: string;
  displayName?: string;
  name?: string;
}

export interface LinkFormData {
  planId: string;
  customAmount: string;
  targetEmail: string;
  targetUserName: string;
  billingType: 'recurring' | 'onetime';
  subscriptionDays: string;
  validFrom: string;
  validUntil: string;
  maxUses: string;
  memo: string;
}
