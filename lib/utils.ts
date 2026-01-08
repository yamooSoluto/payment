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

export function getStatusText(status: string): string {
  const statusMap: Record<string, string> = {
    trial: '무료체험',
    active: '구독 중',
    canceled: '해지됨',
    past_due: '결제 실패',
    expired: '만료됨',
  };
  return statusMap[status] || status;
}

export function getStatusColor(status: string): string {
  const colorMap: Record<string, string> = {
    trial: 'text-blue-600 bg-blue-100',
    active: 'text-green-600 bg-green-100',
    canceled: 'text-gray-600 bg-gray-100',
    past_due: 'text-red-600 bg-red-100',
    expired: 'text-orange-600 bg-orange-100',
  };
  return colorMap[status] || 'text-gray-600 bg-gray-100';
}
