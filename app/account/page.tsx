import { redirect } from 'next/navigation';
import { getAuthFromParamsOrSession } from '@/lib/auth-session';
import TenantList from '@/components/account/TenantList';

interface AccountPageProps {
  searchParams: Promise<{ token?: string; email?: string }>;
}

export default async function AccountPage({ searchParams }: AccountPageProps) {
  const params = await searchParams;
  const { token, email: emailParam } = params;

  // URL params 또는 세션에서 인증 정보 가져오기
  const { email, shouldRedirect } = await getAuthFromParamsOrSession({
    token,
    email: emailParam,
  });

  // URL에 token/email이 있었다면 clean URL로 리다이렉트
  if (shouldRedirect && email) {
    redirect('/account');
  }

  if (!email) {
    redirect('/login');
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">마이페이지</h1>
        <p className="text-gray-600">{email}</p>
      </div>

      {/* Content */}
      <div className="space-y-6">
        <TenantList email={email} />
      </div>
    </div>
  );
}
