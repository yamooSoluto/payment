/**
 * 환불 금액 계산 유틸리티 (pro-rata 일할 계산)
 *
 * 사용처:
 * - app/api/subscriptions/cancel/route.ts (사용자 즉시 해지)
 * - app/api/admin/subscriptions/[tenantId]/cancel/route.ts (관리자 즉시 해지)
 */
export function calculateRefundAmount(
  currentAmount: number,
  currentPeriodStart: Date,
  nextBillingDate: Date
): number {
  const startDateOnly = new Date(currentPeriodStart);
  startDateOnly.setHours(0, 0, 0, 0);
  const nextDateOnly = new Date(nextBillingDate);
  nextDateOnly.setHours(0, 0, 0, 0);

  // 총 기간 일수
  const totalDaysInPeriod = Math.round(
    (nextDateOnly.getTime() - startDateOnly.getTime()) / (1000 * 60 * 60 * 24)
  );

  // 사용 일수 (오늘 포함)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const usedDays =
    Math.round((today.getTime() - startDateOnly.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  // 남은 일수
  const daysLeft = Math.max(0, totalDaysInPeriod - usedDays);

  // 0 나누기 방지
  if (totalDaysInPeriod <= 0) {
    return 0;
  }

  // 환불 금액: 남은 일수 비율로 계산
  return Math.round((currentAmount / totalDaysInPeriod) * daysLeft);
}
