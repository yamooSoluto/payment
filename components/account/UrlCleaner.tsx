'use client';

// import { useEffect } from 'react';

/**
 * URL에서 민감한 파라미터(token, email)를 제거하는 컴포넌트
 * 현재 비활성화 - router.refresh()와 충돌 문제 디버깅 중
 */
export default function UrlCleaner() {
  // 임시로 비활성화 - URL 정리가 다른 기능과 충돌하는지 테스트
  // useEffect(() => {
  //   const url = new URL(window.location.href);
  //   const hasToken = url.searchParams.has('token');
  //   const hasEmail = url.searchParams.has('email');

  //   if (hasToken || hasEmail) {
  //     url.searchParams.delete('token');
  //     url.searchParams.delete('email');
  //     const cleanUrl = url.searchParams.toString()
  //       ? `${url.pathname}?${url.searchParams.toString()}`
  //       : url.pathname;
  //     window.history.replaceState({}, '', cleanUrl);
  //   }
  // }, []);

  return null;
}
