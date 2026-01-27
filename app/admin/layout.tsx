'use client';

import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AdminAuthProvider, useAdminAuth } from '@/contexts/AdminAuthContext';
import Sidebar from '@/components/admin/Sidebar';
import AdminHeader from '@/components/admin/AdminHeader';

function AdminLayoutContent({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { admin, loading } = useAdminAuth();
  const pathname = usePathname();
  const router = useRouter();

  // localStorage에서 사이드바 상태 복원
  useEffect(() => {
    const saved = localStorage.getItem('admin_sidebar_collapsed');
    if (saved !== null) {
      setSidebarCollapsed(JSON.parse(saved));
    }
  }, []);

  const toggleSidebarCollapse = () => {
    const newState = !sidebarCollapsed;
    setSidebarCollapsed(newState);
    localStorage.setItem('admin_sidebar_collapsed', JSON.stringify(newState));
  };

  // 로그인 페이지는 레이아웃 적용하지 않음
  const isLoginPage = pathname === '/admin/login';
  const isDashboardPage = pathname === '/admin';

  // 인증 확인
  useEffect(() => {
    if (!loading && !admin && !isLoginPage) {
      router.push('/admin/login');
    }
  }, [loading, admin, isLoginPage, router]);

  // 접속 로그 기록 (1시간마다)
  useEffect(() => {
    if (!loading && admin && !isLoginPage) {
      const storageKey = 'admin_access_logged_at';
      const lastLoggedAt = localStorage.getItem(storageKey);
      const now = Date.now();
      const oneHour = 60 * 60 * 1000;

      const shouldLog = !lastLoggedAt || (now - parseInt(lastLoggedAt, 10)) > oneHour;
      console.log('[AccessLog] Check:', { lastLoggedAt, now, shouldLog, admin: admin.name });

      if (shouldLog) {
        localStorage.setItem(storageKey, now.toString());
        fetch('/api/admin/access-log', {
          method: 'POST',
          credentials: 'include',
        })
          .then(async res => {
            if (!res.ok) {
              const text = await res.text();
              console.error('[AccessLog] Failed:', res.status, text);
            } else {
              console.log('[AccessLog] Success');
            }
          })
          .catch(err => console.error('[AccessLog] Error:', err));
      }
    }
  }, [loading, admin, isLoginPage]);

  // 로그인 페이지는 별도 레이아웃
  if (isLoginPage) {
    return <>{children}</>;
  }

  // 로딩 중
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-yamoo-accent border-t-yamoo-primary"></div>
      </div>
    );
  }

  // 미인증 상태
  if (!admin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-100 flex">
      {/* 사이드바 */}
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        collapsed={sidebarCollapsed}
        onToggleCollapse={toggleSidebarCollapse}
      />

      {/* 메인 컨텐츠 */}
      <div className="flex-1 flex flex-col min-h-screen lg:ml-0 min-w-0">
        {/* 헤더 */}
        <AdminHeader onMenuClick={() => setSidebarOpen(true)} />

        {/* 컨텐츠 영역 */}
        <main
          className={
            isDashboardPage
              ? 'flex-1 px-4 pb-4 pt-0 lg:px-6 lg:pb-6 lg:pt-0 overflow-y-auto min-w-0 max-w-full'
              : 'flex-1 p-4 lg:p-6 overflow-y-auto min-w-0 max-w-full'
          }
        >
          {children}
        </main>
      </div>
    </div>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminAuthProvider>
      <AdminLayoutContent>{children}</AdminLayoutContent>
    </AdminAuthProvider>
  );
}
