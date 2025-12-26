import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const SESSION_COOKIE_NAME = 'admin_session';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 관리자 경로 보호 (/admin/login 제외)
  if (pathname.startsWith('/admin') && !pathname.startsWith('/admin/login')) {
    const sessionToken = request.cookies.get(SESSION_COOKIE_NAME);

    // 세션 쿠키가 없으면 로그인 페이지로 리다이렉트
    if (!sessionToken) {
      const loginUrl = new URL('/admin/login', request.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  // 이미 로그인한 관리자가 로그인 페이지 접근 시 대시보드로 리다이렉트
  if (pathname === '/admin/login') {
    const sessionToken = request.cookies.get(SESSION_COOKIE_NAME);

    if (sessionToken) {
      const dashboardUrl = new URL('/admin', request.url);
      return NextResponse.redirect(dashboardUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*'],
};
