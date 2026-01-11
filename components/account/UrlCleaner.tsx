'use client';

import { useEffect } from 'react';

/**
 * URL에서 민감한 파라미터(token, email)를 제거하는 컴포넌트
 * 페이지 로드 후 history.replaceState로 URL을 깨끗하게 정리
 */
export default function UrlCleaner() {
  useEffect(() => {
    // 현재 URL에서 token, email 파라미터 제거
    const url = new URL(window.location.href);
    const hasToken = url.searchParams.has('token');
    const hasEmail = url.searchParams.has('email');

    if (hasToken || hasEmail) {
      url.searchParams.delete('token');
      url.searchParams.delete('email');

      // URL 파라미터가 모두 제거되면 ? 도 제거
      const cleanUrl = url.searchParams.toString()
        ? `${url.pathname}?${url.searchParams.toString()}`
        : url.pathname;

      // 브라우저 히스토리 교체 (뒤로가기해도 토큰 안 보임)
      window.history.replaceState({}, '', cleanUrl);
    }
  }, []);

  return null;
}
