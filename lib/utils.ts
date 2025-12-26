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

export function formatDate(date: Date | string | { toDate?: () => Date }): string {
  let d: Date;

  if (typeof date === 'string') {
    d = new Date(date);
  } else if (date && typeof (date as { toDate?: () => Date }).toDate === 'function') {
    d = (date as { toDate: () => Date }).toDate();
  } else {
    d = date as Date;
  }

  return format(d, 'yyyy년 MM월 dd일', { locale: ko });
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
