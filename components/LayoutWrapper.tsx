'use client';

import { usePathname } from 'next/navigation';
import { AuthProvider } from '@/contexts/AuthContext';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import ChannelTalk from '@/components/ChannelTalk';

export default function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdminRoute = pathname?.startsWith('/admin');

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
    </AuthProvider>
  );
}
