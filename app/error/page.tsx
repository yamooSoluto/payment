import Link from 'next/link';
import { AlertTriangle, Home, Mail } from 'lucide-react';

interface ErrorPageProps {
  searchParams: Promise<{ message?: string }>;
}

export default async function ErrorPage({ searchParams }: ErrorPageProps) {
  const params = await searchParams;
  const { message } = params;

  const errorMessages: Record<string, { title: string; description: string }> = {
    'invalid_access': {
      title: '잘못된 접근입니다',
      description: '유효한 토큰이 필요합니다. 포탈에서 다시 접근해주세요.',
    },
    'token_expired': {
      title: '세션이 만료되었습니다',
      description: '보안을 위해 토큰이 만료되었습니다. 포탈에서 다시 접근해주세요.',
    },
    'invalid_token': {
      title: '유효하지 않은 토큰입니다',
      description: '토큰이 유효하지 않습니다. 포탈에서 다시 접근해주세요.',
    },
    'invalid_plan': {
      title: '유효하지 않은 플랜입니다',
      description: '선택한 플랜이 존재하지 않습니다. 요금제 페이지에서 다시 선택해주세요.',
    },
    'payment_failed': {
      title: '결제에 실패했습니다',
      description: '결제 처리 중 오류가 발생했습니다. 다시 시도해주세요.',
    },
  };

  const errorInfo = message
    ? errorMessages[message] || { title: '오류가 발생했습니다', description: message }
    : { title: '알 수 없는 오류', description: '예상치 못한 오류가 발생했습니다.' };

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="w-20 h-20 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <AlertTriangle className="w-10 h-10 text-yellow-500" />
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-4">
          {errorInfo.title}
        </h1>
        <p className="text-gray-600 mb-8">
          {errorInfo.description}
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="https://app.yamoo.ai.kr/mypage"
            className="btn-primary inline-flex items-center justify-center gap-2"
          >
            <Home className="w-4 h-4" />
            포탈로 돌아가기
          </Link>
          <a
            href="mailto:yamoo@soluto.co.kr?subject=오류 문의"
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
