/**
 * 결제 관련 공통 텍스트 상수
 * 모든 결제/구독 화면에서 일관된 메시지를 표시하기 위해 사용
 */

// 환불 규정 (공통) - 배열 형태
export const REFUND_POLICY_ITEMS = [
  '새 플랜은 즉시 적용됩니다.',
  '플랜 변경 시 환불 금액이 있을 경우 영업일 기준 3~5일 내 환불됩니다.',
  '결제 실패 시 서비스 이용이 제한될 수 있습니다.',
];

// 결제 동의 라벨
export const AGREEMENT_LABEL = '결제/환불 규정에 동의합니다 (필수)';

/**
 * 결제 스케줄 텍스트 생성
 */
export function getPaymentScheduleText(options: {
  amount: number;
  fullAmount?: number;
  isChangePlan?: boolean;
  isDowngrade?: boolean;
  refundAmount?: number;
  isReserve?: boolean;
  isTrialImmediate?: boolean;
  hasBillingKey?: boolean;
  currentPeriodEnd?: string;
  nextBillingDate?: string;
  formatPrice: (price: number) => string;
}): string {
  const { amount, fullAmount, isChangePlan, isDowngrade, refundAmount, isReserve, isTrialImmediate, hasBillingKey, currentPeriodEnd, nextBillingDate, formatPrice } = options;

  // 플랜 변경 (업그레이드 또는 다운그레이드)
  if (isChangePlan && fullAmount) {
    if (isDowngrade && refundAmount) {
      return `플랜 변경 시 ${formatPrice(refundAmount)}원이 환불되며, 다음 결제일부터 매월 ${formatPrice(fullAmount)}원이 자동 결제됩니다.`;
    }
    return `지금 ${formatPrice(amount)}원이 결제되고, 다음 결제일부터 매월 ${formatPrice(fullAmount)}원이 자동 결제됩니다.`;
  }

  // Trial에서 즉시 전환 (카드 등록됨)
  if (isTrialImmediate && hasBillingKey) {
    return `지금 ${formatPrice(amount)}원이 결제되고, 매월 동일한 날짜에 ${formatPrice(amount)}원이 자동 결제됩니다.`;
  }

  // Trial에서 즉시 전환 (카드 미등록)
  if (isTrialImmediate) {
    return `카드 등록 후 ${formatPrice(amount)}원이 즉시 결제되고, 매월 동일한 날짜에 자동 결제됩니다.`;
  }

  // 예약 모드: Active 구독자
  if (isReserve && currentPeriodEnd && nextBillingDate) {
    return `${nextBillingDate}부터 매월 ${formatPrice(amount)}원이 자동으로 결제됩니다.`;
  }

  // 예약 모드: Trial 사용자
  if (isReserve && nextBillingDate) {
    return `무료체험 종료일인 ${nextBillingDate}부터 매월 ${formatPrice(amount)}원이 자동으로 결제됩니다.`;
  }

  // 일반 결제 (처음 구독)
  return `${formatPrice(amount)}원이 즉시 결제되고, 매월 동일한 날짜에 자동 결제됩니다.`;
}
