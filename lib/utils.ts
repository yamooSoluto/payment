import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, differenceInDays } from 'date-fns';
import { ko } from 'date-fns/locale';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPrice(price: number): string {
  return new Intl.NumberFormat('ko-KR').format(price);
}

export function formatDate(date: Date | string | { toDate?: () => Date } | { _seconds?: number; _nanoseconds?: number } | null | undefined): string {
  if (!date) {
    return '-';
  }

  let d: Date;

  try {
    if (typeof date === 'string') {
      d = new Date(date);
    } else if (typeof (date as { toDate?: () => Date }).toDate === 'function') {
      d = (date as { toDate: () => Date }).toDate();
    } else if (typeof (date as { _seconds?: number })._seconds === 'number') {
      // Firestore Timestamp가 직렬화된 경우
      d = new Date((date as { _seconds: number })._seconds * 1000);
    } else if (date instanceof Date) {
      d = date;
    } else {
      // 알 수 없는 형식
      return '-';
    }

    // Invalid Date 체크
    if (!d || isNaN(d.getTime())) {
      return '-';
    }

    return format(d, 'yyyy-MM-dd', { locale: ko });
  } catch {
    return '-';
  }
}

export function calculateDaysLeft(endDate: Date | string | { toDate?: () => Date }): number {
  let d: Date;

  if (typeof endDate === 'string') {
    d = new Date(endDate);
  } else if (endDate && typeof (endDate as { toDate?: () => Date }).toDate === 'function') {
    d = (endDate as { toDate: () => Date }).toDate();
  } else {
    d = endDate as Date;
  }

  return Math.max(0, differenceInDays(d, new Date()));
}

/**
 * 날짜에 1개월을 더합니다. 월말 날짜를 올바르게 처리합니다.
 * 예: 1/31 → 2/28, 3/31 → 4/30, 3/30 → 4/30
 */
export function addOneMonth(date: Date): Date {
  const result = new Date(date);
  const originalDay = result.getDate();
  result.setMonth(result.getMonth() + 1);
  if (result.getDate() !== originalDay) {
    result.setDate(0);
  }
  return result;
}

export function getStatusText(status: string): string {
  const statusMap: Record<string, string> = {
    trial: '체험 중',
    active: '구독 중',
    pending_cancel: '해지예정',
    canceled: '해지됨',
    past_due: '결제 실패',
    suspended: '이용 정지',
    expired: '만료됨',
  };
  return statusMap[status] || status;
}

export function getStatusColor(status: string): string {
  const colorMap: Record<string, string> = {
    trial: 'text-blue-600 bg-blue-100',
    active: 'text-green-600 bg-green-100',
    pending_cancel: 'text-orange-600 bg-orange-100',
    canceled: 'text-gray-600 bg-gray-100',
    past_due: 'text-red-600 bg-red-100',
    suspended: 'text-red-600 bg-red-100',
    expired: 'text-orange-600 bg-orange-100',
  };
  return colorMap[status] || 'text-gray-600 bg-gray-100';
}
