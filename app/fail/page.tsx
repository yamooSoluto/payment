import Link from 'next/link';
import { XmarkCircle, NavArrowLeft, Mail } from 'iconoir-react';

interface FailPageProps {
  searchParams: Promise<{ error?: string; message?: string }>;
}

export default async function FailPage({ searchParams }: FailPageProps) {
  const params = await searchParams;
  const { error, message } = params;

  const errorMessages: Record<string, string> = {
    'USER_CANCEL': '결제가 취소되었습니다.',
    'INVALID_CARD': '유효하지 않은 카드입니다.',
    'EXCEED_MAX_DAILY_PAYMENT_COUNT': '일일 결제 횟수를 초과했습니다.',
    'EXCEED_MAX_PAYMENT_AMOUNT': '결제 한도를 초과했습니다.',
    'INVALID_STOPPED_CARD': '정지된 카드입니다.',
    'EXCEED_MAX_AUTH_COUNT': '인증 횟수를 초과했습니다.',
    'REJECT_CARD_COMPANY': '카드사에서 결제를 거부했습니다.',
  };

  const displayMessage = error
    ? errorMessages[error] || error
    : message || '결제 처리 중 오류가 발생했습니다.';

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <XmarkCircle width={40} height={40} strokeWidth={1.5} className="text-red-500" />
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-4">
          결제 실패
        </h1>
        <p className="text-gray-600 mb-8">
          {displayMessage}
        </p>

        <div className="bg-gray-50 rounded-lg p-6 mb-8 text-left">
          <h2 className="font-semibold text-gray-900 mb-3">문제가 계속되나요?</h2>
          <ul className="space-y-2 text-sm text-gray-600">
            <li>• 다른 카드로 다시 시도해보세요</li>
            <li>• 카드 한도를 확인해보세요</li>
            <li>• 카드사에 문의해보세요</li>
          </ul>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="javascript:history.back()"
            className="btn-primary inline-flex items-center justify-center gap-2"
          >
            <NavArrowLeft width={16} height={16} strokeWidth={1.5} />
            다시 시도하기
          </Link>
          <a
            href="mailto:yamoo@soluto.co.kr?subject=결제 오류 문의"
            className="btn-secondary inline-flex items-center justify-center gap-2"
          >
            <Mail className="w-4 h-4" />
            문의하기
          </a>
        </div>
      </div>
    </div>
  );
}
