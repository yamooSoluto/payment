'use client';

import { usePathname } from 'next/navigation';
import { AuthProvider } from '@/contexts/AuthContext';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import ChannelTalk from '@/components/ChannelTalk';
import ProfileCompletionModal from '@/components/modals/ProfileCompletionModal';

export default function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdminRoute = pathname?.startsWith('/admin');
  const isLoginPage = pathname === '/login';

  // Admin 페이지는 자체 레이아웃 사용
  if (isAdminRoute) {
    return <>{children}</>;
  }

  // 일반 페이지는 Header/Footer 포함
  return (
    <AuthProvider>
      <Header />
      <main className="flex-1 bg-gray-50">
        {children}
      </main>
      <Footer />
      <ChannelTalk />
      {/* 로그인 페이지 외에서 프로필 미완성 시 모달 표시 */}
      {!isLoginPage && <ProfileCompletionModal />}
    </AuthProvider>
  );
}
