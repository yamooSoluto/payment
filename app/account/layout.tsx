'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

function AccountAuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [authChecked, setAuthChecked] = useState(false);

  // 토큰 기반 인증(포탈 SSO)인 경우에만 Firebase Auth 체크 스킵
  // email 파라미터만으로는 스킵하지 않음 (보안상 위험)
  const hasToken = searchParams.get('token');
  const hasEmail = searchParams.get('email');

  useEffect(() => {
    // 토큰이 있으면 포탈 SSO 인증이므로 Firebase Auth 체크 스킵
    if (hasToken) return;

    // 로딩 중이면 대기
    if (loading) return;

    // Firebase Auth 로그인 상태면 OK
    if (user) {
      setAuthChecked(true);
      return;
    }

    // 로그아웃 상태인데 email 파라미터가 있으면 잠시 대기 (로그인 직후 리다이렉트 상황)
    // Firebase Auth 상태 복구에 시간이 걸릴 수 있음
    if (hasEmail && !authChecked) {
      const timer = setTimeout(() => {
        setAuthChecked(true);
      }, 500);
      return () => clearTimeout(timer);
    }

    // 확실히 로그아웃 상태면 로그인 페이지로 리다이렉트 (현재 URL 유지)
    if (authChecked || !hasEmail) {
      const currentUrl = window.location.pathname + window.location.search;
      router.replace(`/login?redirect=${encodeURIComponent(currentUrl)}`);
    }
  }, [user, loading, hasToken, hasEmail, authChecked, router]);

  // 토큰 인증이면 바로 렌더링
  if (hasToken) {
    return <>{children}</>;
  }

  // Firebase Auth 로딩 중이거나 인증 체크 중
  if (loading || (hasEmail && !authChecked && !user)) {
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
