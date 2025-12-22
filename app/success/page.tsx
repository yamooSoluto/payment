import Link from 'next/link';
import { CheckCircle, ArrowRight } from 'lucide-react';

interface SuccessPageProps {
  searchParams: Promise<{ plan?: string }>;
}

export default async function SuccessPage({ searchParams }: SuccessPageProps) {
  const params = await searchParams;
  const { plan } = params;

  const planNames: Record<string, string> = {
    starter: 'Starter',
    pro: 'Pro',
    business: 'Business',
  };

  const planName = plan ? planNames[plan] || plan : '구독';

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle className="w-10 h-10 text-green-500" />
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-4">
          결제 완료!
        </h1>
        <p className="text-gray-600 mb-8">
          {planName} 플랜 구독이 완료되었습니다.<br />
          이제 모든 기능을 이용하실 수 있습니다.
        </p>

        <div className="bg-gray-50 rounded-lg p-6 mb-8 text-left">
          <h2 className="font-semibold text-gray-900 mb-4">다음 단계</h2>
          <ul className="space-y-3 text-sm text-gray-600">
            <li className="flex items-start gap-2">
              <span className="w-5 h-5 bg-yamoo-primary text-white rounded-full flex items-center justify-center text-xs flex-shrink-0">1</span>
              <span>포탈에서 AI 응대 설정을 완료하세요</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-5 h-5 bg-yamoo-primary text-white rounded-full flex items-center justify-center text-xs flex-shrink-0">2</span>
              <span>FAQ 데이터를 등록하여 AI를 학습시키세요</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-5 h-5 bg-yamoo-primary text-white rounded-full flex items-center justify-center text-xs flex-shrink-0">3</span>
              <span>슬랙 연동을 설정하세요</span>
            </li>
          </ul>
        </div>

        <Link
          href="https://app.yamoo.ai.kr/portal"
          className="btn-primary inline-flex items-center gap-2"
        >
          포탈로 이동하기
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}
