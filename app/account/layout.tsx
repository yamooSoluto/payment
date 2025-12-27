'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

function AccountAuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  // 토큰 기반 인증(포탈 SSO)인 경우 Firebase Auth 체크 스킵
  const hasToken = searchParams.get('token');

  useEffect(() => {
    // 토큰이 있으면 포탈 SSO 인증이므로 Firebase Auth 체크 스킵
    if (hasToken) return;

    // 로딩 중이면 대기
    if (loading) return;

    // Firebase Auth 로그아웃 상태면 로그인 페이지로 리다이렉트
    if (!user) {
      router.replace('/login');
    }
  }, [user, loading, hasToken, router]);

  // 토큰 인증이면 바로 렌더링
  if (hasToken) {
    return <>{children}</>;
  }

  // Firebase Auth 로딩 중
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  // 로그아웃 상태면 아무것도 표시하지 않음 (리다이렉트 중)
  if (!user) {
    return null;
  }

  return <>{children}</>;
}

export default function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
        </div>
      }
    >
      <AccountAuthGuard>{children}</AccountAuthGuard>
    </Suspense>
  );
}
