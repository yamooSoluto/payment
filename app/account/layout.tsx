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
  const [sessionVerified, setSessionVerified] = useState(false); // 세션 쿠키 인증 성공 여부
  const [sessionChecking, setSessionChecking] = useState(false); // 세션 검증 중
  const ssoAttempted = useRef(false);
  const tokenCleanupAttempted = useRef(false);
  const sessionCheckAttempted = useRef(false);
  const sessionCheckPending = useRef(false); // 세션 검증 시작~완료 동기 추적 (state 업데이트 지연 대응)

  // 토큰 기반 인증(포탈 SSO)
  const hasToken = searchParams.get('token');
  const hasSsoToken = searchParams.get('ssoToken');  // POST SSO 후 리다이렉트로 전달되는 Custom Token
  const hasIdToken = searchParams.get('idToken');  // GET 방식 (fallback)
  const hasEmail = searchParams.get('email');

  // URL에서 token 파라미터 제거 (보안: 세션 쿠키가 설정된 후에는 URL에 노출 불필요)
  useEffect(() => {
    if (!hasToken || tokenCleanupAttempted.current) return;
    tokenCleanupAttempted.current = true;

    // 세션 API 호출하여 쿠키 설정 후 URL에서 token 제거
    const cleanupToken = async () => {
      try {
        // 세션 쿠키 설정
        const response = await fetch('/api/auth/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: hasToken }),
        });

        if (response.ok) {
          // 세션 설정 성공 - 이제 세션 쿠키로 인증 가능
          setSessionVerified(true);

          // URL에서 token 파라미터 제거
          const newUrl = new URL(window.location.href);
          newUrl.searchParams.delete('token');
          window.history.replaceState({}, '', newUrl.toString());
          console.log('[Token cleanup] Session verified, token removed from URL');
        } else {
          // 세션 설정 실패 - token 유지
          console.error('[Token cleanup] Session creation failed, keeping token');
        }
      } catch (error) {
        console.error('[Token cleanup] Error:', error);
        // 에러 발생 시 token 유지 (안전하게)
      }
    };

    cleanupToken();
  }, [hasToken]);

  // 세션 쿠키 검증 (Firebase Auth와 병렬로 즉시 시작)
  // loading 대기 제거: Firebase Auth 복구 실패 시(구글 가입 후 토큰 revoke) 대기 시간 제거
  useEffect(() => {
    // 이미 인증 방법이 있으면 스킵
    if (hasToken || hasSsoToken || hasIdToken || user) return;
    // 이미 세션 검증 완료되었으면 스킵
    if (sessionVerified || sessionCheckAttempted.current) return;

    sessionCheckAttempted.current = true;
    sessionCheckPending.current = true;
    setSessionChecking(true);

    const verifySession = async () => {
      try {
        // 세션 쿠키로 인증 가능한지 확인 (쿠키는 자동으로 전송됨)
        const response = await fetch('/api/auth/verify-session', {
          method: 'GET',
          credentials: 'include',
        });

        if (response.ok) {
          const data = await response.json();
          if (data.valid) {
            setSessionVerified(true);
            console.log('[Session] Cookie session verified');
          }
        }
      } catch (error) {
        console.error('[Session] Verification error:', error);
      } finally {
        sessionCheckPending.current = false;
        setSessionChecking(false);
      }
    };

    verifySession();
  }, [hasToken, hasSsoToken, hasIdToken, user, sessionVerified]);

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

    // 세션 검증 중이면 대기 (ref로 동기 체크 - 같은 렌더 사이클에서 state 반영 전에도 감지)
    if (sessionChecking || sessionCheckPending.current) return;

    // 토큰이 있거나 세션 쿠키 인증 성공이면 포탈 SSO 인증이므로 Firebase Auth 체크 스킵
    if (hasToken || sessionVerified) return;

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
  }, [user, loading, hasToken, hasSsoToken, hasIdToken, hasEmail, authChecked, ssoProcessing, sessionVerified, sessionChecking, router]);

  // SSO 처리 중, 세션 검증 중, 또는 ssoToken/idToken이 있을 때 로딩 표시
  if (ssoProcessing || sessionChecking || ((hasSsoToken || hasIdToken) && !authChecked)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-yamoo-accent border-t-yamoo-primary mx-auto mb-2"></div>
          <p className="text-sm text-gray-500">자동 로그인 중...</p>
        </div>
      </div>
    );
  }

  // 토큰 인증 또는 세션 쿠키 인증이면 바로 렌더링
  if (hasToken || sessionVerified) {
    return <>{children}</>;
  }

  // Firebase Auth 로딩 중이거나 인증 체크 중
  if (loading || (hasEmail && !authChecked && !user)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-yamoo-accent border-t-yamoo-primary"></div>
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
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-yamoo-accent border-t-yamoo-primary"></div>
        </div>
      }
    >
      <AccountAuthGuard>{children}</AccountAuthGuard>
    </Suspense>
  );
}
