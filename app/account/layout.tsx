'use client';

import { Suspense, useEffect, useState, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebase';
import { signInWithCustomToken } from 'firebase/auth';

function AccountAuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [authChecked, setAuthChecked] = useState(false);
  const [ssoProcessing, setSsoProcessing] = useState(false);
  const ssoAttempted = useRef(false);

  // 토큰 기반 인증(포탈 SSO)
  const hasToken = searchParams.get('token');
  const hasSsoToken = searchParams.get('ssoToken');  // POST SSO 후 리다이렉트로 전달되는 Custom Token
  const hasIdToken = searchParams.get('idToken');  // GET 방식 (fallback)
  const hasEmail = searchParams.get('email');

  // ssoToken으로 Firebase 로그인 (POST SSO 후 리다이렉트된 경우)
  // 기존 로그인 세션이 있어도 SSO 토큰으로 새로 로그인 (다른 계정일 수 있음)
  useEffect(() => {
    if (!hasSsoToken || ssoAttempted.current) return;

    ssoAttempted.current = true;
    setSsoProcessing(true);

    const processSSO = async () => {
      try {
        // Custom Token으로 Firebase 로그인 (기존 세션 대체)
        await signInWithCustomToken(auth, hasSsoToken);
        console.log('[SSO] Login successful via ssoToken');

        // URL에서 ssoToken 파라미터 제거 (보안)
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.delete('ssoToken');
        window.history.replaceState({}, '', newUrl.toString());

        setAuthChecked(true);
      } catch (error) {
        console.error('[SSO] Error:', error);
        const currentPath = window.location.pathname;
        router.replace(`/login?redirect=${encodeURIComponent(currentPath)}&error=sso_failed`);
      } finally {
        setSsoProcessing(false);
      }
    };

    processSSO();
  }, [hasSsoToken, user, router]);

  // idToken으로 SSO 로그인 처리 (GET 방식 fallback)
  // 기존 로그인 세션이 있어도 SSO 토큰으로 새로 로그인 (다른 계정일 수 있음)
  useEffect(() => {
    if (!hasIdToken || hasSsoToken || ssoAttempted.current) return;

    ssoAttempted.current = true;
    setSsoProcessing(true);

    const processSSO = async () => {
      try {
        // SSO API 호출하여 Custom Token 발급받기
        const response = await fetch(`/api/auth/sso?idToken=${encodeURIComponent(hasIdToken)}`);
        const data = await response.json();

        if (!response.ok) {
          console.error('[SSO] API Error:', data.error);
          const currentPath = window.location.pathname;
          router.replace(`/login?redirect=${encodeURIComponent(currentPath)}&error=sso_failed`);
          return;
        }

        // Custom Token으로 Firebase 로그인
        await signInWithCustomToken(auth, data.customToken);
        console.log('[SSO] Login successful:', data.email);

        // URL에서 idToken 파라미터 제거 (보안)
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.delete('idToken');
        window.history.replaceState({}, '', newUrl.toString());

        setAuthChecked(true);
      } catch (error) {
        console.error('[SSO] Error:', error);
        const currentPath = window.location.pathname;
        router.replace(`/login?redirect=${encodeURIComponent(currentPath)}&error=sso_failed`);
      } finally {
        setSsoProcessing(false);
      }
    };

    processSSO();
  }, [hasIdToken, hasSsoToken, user, router]);

  useEffect(() => {
    // SSO 처리 중이면 대기
    if (ssoProcessing || hasSsoToken || hasIdToken) return;

    // 토큰이 있으면 포탈 SSO 인증이므로 Firebase Auth 체크 스킵
    if (hasToken) return;

    // 로딩 중이면 대기
    if (loading) return;

    // Firebase Auth 로그인 상태면 이메일 일치 여부 확인
    if (user) {
      // URL의 email 파라미터와 로그인한 사용자의 이메일이 다르면 로그인 페이지로
      if (hasEmail && user.email && user.email.toLowerCase() !== hasEmail.toLowerCase()) {
        const currentPath = window.location.pathname;
        router.replace(`/login?redirect=${encodeURIComponent(currentPath)}`);
        return;
      }
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
  }, [user, loading, hasToken, hasSsoToken, hasIdToken, hasEmail, authChecked, ssoProcessing, router]);

  // SSO 처리 중 또는 ssoToken/idToken이 있을 때 로딩 표시
  if (ssoProcessing || ((hasSsoToken || hasIdToken) && !authChecked)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-2"></div>
          <p className="text-sm text-gray-500">자동 로그인 중...</p>
        </div>
      </div>
    );
  }

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

  // 이메일 불일치면 아무것도 표시하지 않음 (리다이렉트 중)
  if (hasEmail && user.email && user.email.toLowerCase() !== hasEmail.toLowerCase()) {
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
