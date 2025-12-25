import { redirect } from 'next/navigation';
import { verifyToken } from '@/lib/auth';
import TenantList from '@/components/account/TenantList';

interface AccountPageProps {
  searchParams: Promise<{ token?: string; email?: string }>;
}

export default async function AccountPage({ searchParams }: AccountPageProps) {
  const params = await searchParams;
  const { token, email: emailParam } = params;

  let email: string | null = null;

  // 1. 토큰으로 인증 (포탈 SSO)
  if (token) {
    email = await verifyToken(token);
  }
  // 2. 이메일 파라미터로 접근 (Firebase Auth)
  else if (emailParam) {
    email = emailParam;
  }

  if (!email) {
    redirect('/login');
  }

  const authParam = token ? `token=${token}` : `email=${encodeURIComponent(email)}`;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">마이페이지</h1>
        <p className="text-gray-600">{email}</p>
      </div>

      {/* Content */}
      <div className="space-y-6">
        <TenantList authParam={authParam} email={email} />
      </div>
    </div>
  );
}
