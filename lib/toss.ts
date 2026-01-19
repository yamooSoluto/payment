import axios from 'axios';

const TOSS_API_URL = 'https://api.tosspayments.com/v1';

// Authorization 헤더 생성
function getAuthHeader() {
  const secretKey = process.env.TOSS_SECRET_KEY;
  if (!secretKey) {
    throw new Error('TOSS_SECRET_KEY is not set');
  }
  return `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`;
}

// 빌링키 발급
export async function issueBillingKey(authKey: string, customerKey: string) {
  const response = await axios.post(
    `${TOSS_API_URL}/billing/authorizations/issue`,
    { authKey, customerKey },
    {
      headers: {
        Authorization: getAuthHeader(),
        'Content-Type': 'application/json',
      },
    }
  );
  return response.data;
}

// 빌링키로 결제
export async function payWithBillingKey(
  billingKey: string,
  customerKey: string,
  amount: number,
  orderId: string,
  orderName: string,
  customerEmail: string
) {
  const response = await axios.post(
    `${TOSS_API_URL}/billing/${billingKey}`,
    {
      customerKey,
      amount,
      orderId,
      orderName,
      customerEmail,
    },
    {
      headers: {
        Authorization: getAuthHeader(),
        'Content-Type': 'application/json',
      },
    }
  );
  return response.data;
}

// 결제 정보 조회
export async function getPayment(paymentKey: string) {
  const response = await axios.get(
    `${TOSS_API_URL}/payments/${paymentKey}`,
    {
      headers: {
        Authorization: getAuthHeader(),
      },
    }
  );
  return response.data;
}

// 결제 취소 (전액 또는 부분 취소)
export async function cancelPayment(
  paymentKey: string,
  cancelReason: string,
  cancelAmount?: number
) {
  const body: { cancelReason: string; cancelAmount?: number } = { cancelReason };

  // cancelAmount가 있으면 부분 취소, 없으면 전액 취소
  if (cancelAmount !== undefined && cancelAmount > 0) {
    body.cancelAmount = cancelAmount;
  }

  const response = await axios.post(
    `${TOSS_API_URL}/payments/${paymentKey}/cancel`,
    body,
    {
      headers: {
        Authorization: getAuthHeader(),
        'Content-Type': 'application/json',
      },
    }
  );
  return response.data;
}

// 플랜별 가격 정보 (pricing 페이지와 동일하게)
export const PLAN_PRICES: Record<string, number> = {
  trial: 0,
  basic: 39000,
  business: 99000,
};

export function getPlanAmount(plan: string): number {
  return PLAN_PRICES[plan] ?? 0;
}

// 가격 정책 타입
export type PricePolicy = 'grandfathered' | 'protected_until' | 'standard';

export const PRICE_POLICY_LABELS: Record<PricePolicy, string> = {
  grandfathered: '가격 보호 (영구)',
  protected_until: '기간 한정 가격 보호',
  standard: '일반 (최신 가격 적용)',
};

// 구독자의 실제 결제 금액 계산
export function getEffectiveAmount(
  subscription: {
    plan: string;
    amount?: number;
    baseAmount?: number;
    pricePolicy?: PricePolicy;
    priceProtectedUntil?: Date | string;
  }
): number {
  const currentPlanPrice = PLAN_PRICES[subscription.plan] ?? 0;
  // baseAmount가 있으면 사용, 없으면 PLAN_PRICES 사용
  const baseBillingAmount = subscription.baseAmount ?? currentPlanPrice;
  const subscriberAmount = subscription.amount ?? baseBillingAmount;

  // 가격 정책에 따른 결제 금액 결정
  switch (subscription.pricePolicy) {
    case 'grandfathered':
      // 영구 가격 보호: 항상 구독 시점 금액 (할인 금액 유지)
      return subscriberAmount;

    case 'protected_until':
      // 기간 한정 보호: 보호 기간 내면 구독 시점 금액, 이후 기본 가격
      if (subscription.priceProtectedUntil) {
        const protectedUntil = new Date(subscription.priceProtectedUntil);
        if (new Date() < protectedUntil) {
          return subscriberAmount;
        }
      }
      return baseBillingAmount;

    case 'standard':
    default:
      // 일반: baseAmount (정기결제 금액)
      return baseBillingAmount;
  }
}

export function getPlanName(plan: string): string {
  const names: Record<string, string> = {
    trial: 'Trial',
    basic: 'Basic',
    business: 'Business',
    enterprise: 'Enterprise',
  };
  return names[plan] || plan;
}
