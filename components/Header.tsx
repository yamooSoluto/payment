'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '@/contexts/AuthContext';
import { LogOut, Menu, Xmark, OpenNewWindow } from 'iconoir-react';
import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase';

interface MenuItem {
  id: string;
  name: string;
  path: string;
  visible: boolean;
  order: number;
}

interface SiteSettings {
  logoUrl: string;
  menuItems: MenuItem[];
}

export default function Header() {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [hasTenants, setHasTenants] = useState(false);
  const pathname = usePathname();
  const [siteSettings, setSiteSettings] = useState<SiteSettings | null>(null);

  // 사이트 설정 불러오기
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await fetch('/api/settings');
        if (res.ok) {
          const data = await res.json();
          setSiteSettings(data.settings);
        }
      } catch (error) {
        console.error('Failed to fetch site settings:', error);
      }
    };
    fetchSettings();
  }, []);

  // 사용자의 매장 수 확인 (페이지 이동 시마다 재확인)
  useEffect(() => {
    const fetchTenants = async () => {
      if (!user?.email) {
        setHasTenants(false);
        return;
      }

      try {
        const idToken = await user.getIdToken();
        const res = await fetch(`/api/tenants?email=${encodeURIComponent(user.email)}`, {
          headers: {
            'Authorization': `Bearer ${idToken}`,
          },
        });
        if (res.ok) {
          const data = await res.json();
          setHasTenants(data.tenants && data.tenants.length > 0);
        }
      } catch (error) {
        console.error('Failed to fetch tenants:', error);
        setHasTenants(false);
      }
    };

    fetchTenants();
  }, [user?.email, pathname]);

  const handleSignOut = async () => {
    try {
      await signOut();
      router.replace('/login');
    } catch (error) {
      console.error('로그아웃 실패:', error);
    }
  };

  const handlePortalClick = async () => {
    try {
      const currentUser = auth.currentUser;
      if (currentUser) {
        const idToken = await currentUser.getIdToken();

        const form = document.createElement('form');
        form.method = 'POST';
        form.action = 'https://app.yamoo.ai.kr/api/auth/sso';
        form.target = '_blank';

        const tokenInput = document.createElement('input');
        tokenInput.type = 'hidden';
        tokenInput.name = 'token';
        tokenInput.value = idToken;

        form.appendChild(tokenInput);
        document.body.appendChild(form);
        form.submit();
        document.body.removeChild(form);
      } else {
        window.open('https://app.yamoo.ai.kr', '_blank');
      }
    } catch (error) {
      console.error('포탈 이동 실패:', error);
      window.open('https://app.yamoo.ai.kr', '_blank');
    }
  };

  // 메뉴 렌더링 헬퍼
  const renderMenuItem = (item: MenuItem, isMobile: boolean = false) => {
    const isExternal = item.path.startsWith('http');
    const isPortal = item.id === 'portal';
    const isAccount = item.id === 'account';

    // 포탈: 로그인 + 매장이 있을 때만 표시
    if (isPortal) {
      if (!user || !hasTenants) return null;
      return (
        <button
          key={item.id}
          onClick={() => {
            handlePortalClick();
            if (isMobile) setMobileMenuOpen(false);
          }}
          className={`flex items-center gap-1 text-yamoo-dark hover:text-yamoo-primary transition-colors font-medium ${isMobile ? 'py-2 text-left' : ''}`}
        >
          {item.name}
          <OpenNewWindow width={14} height={14} strokeWidth={2} />
        </button>
      );
    }

    // 마이페이지: 로그인 시에만 표시
    if (isAccount) {
      if (!user) return null;
      const href = user?.email ? `${item.path}?email=${encodeURIComponent(user.email)}` : item.path;
      return (
        <Link
          key={item.id}
          href={href}
          className={`text-gray-600 hover:text-yamoo-dark transition-colors font-medium ${isMobile ? 'py-2' : ''}`}
          onClick={isMobile ? () => setMobileMenuOpen(false) : undefined}
        >
          {item.name}
        </Link>
      );
    }

    // 외부 링크
    if (isExternal) {
      return (
        <a
          key={item.id}
          href={item.path}
          target="_blank"
          rel="noopener noreferrer"
          className={`flex items-center gap-1 text-gray-600 hover:text-yamoo-dark transition-colors font-medium ${isMobile ? 'py-2' : ''}`}
          onClick={isMobile ? () => setMobileMenuOpen(false) : undefined}
        >
          {item.name}
          <OpenNewWindow width={14} height={14} strokeWidth={2} />
        </a>
      );
    }

    // 일반 내부 링크 (요금제의 경우 이메일 추가)
    let href = item.path;
    if (item.id === 'plan' && user?.email) {
      href = `${item.path}?email=${encodeURIComponent(user.email)}`;
    }

    return (
      <Link
        key={item.id}
        href={href}
        className={`text-gray-600 hover:text-yamoo-dark transition-colors font-medium ${isMobile ? 'py-2' : ''}`}
        onClick={isMobile ? () => setMobileMenuOpen(false) : undefined}
      >
        {item.name}
      </Link>
    );
  };

  // 정렬된 visible 메뉴만 필터
  const visibleMenuItems = (siteSettings?.menuItems || [])
    .filter(item => item.visible)
    .sort((a, b) => a.order - b.order);

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Link href="/about" className="flex items-center">
            {siteSettings?.logoUrl ? (
              <img
                src={siteSettings.logoUrl}
                alt="YAMOO"
                className="h-8 w-auto"
              />
            ) : (
              <Image
                src="/yamoo_black_1.png"
                alt="YAMOO"
                width={120}
                height={40}
                className="h-8 w-auto"
                priority
              />
            )}
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center space-x-6">
            {visibleMenuItems.map(item => renderMenuItem(item, false))}
            {!loading && (
              <>
                {user ? (
                  <div className="flex items-center gap-3 pl-3 border-l border-gray-200">
                    <span className="text-sm text-gray-500">{user.email}</span>
                    <button
                      onClick={handleSignOut}
                      className="flex items-center gap-1 text-gray-500 hover:text-red-500 transition-colors"
                    >
                      <LogOut width={16} height={16} strokeWidth={1.5} />
                    </button>
                  </div>
                ) : (
                  <Link
                    href="/login"
                    className="btn-primary py-2 px-4 text-sm"
                  >
                    로그인
                  </Link>
                )}
              </>
            )}
          </nav>

          {/* Mobile: Login + Menu button */}
          <div className="md:hidden flex items-center gap-2">
            {!loading && !user && (
              <Link
                href="/login"
                className="bg-yamoo-primary text-gray-900 text-xs font-medium py-1.5 px-3 rounded-full"
              >
                로그인
              </Link>
            )}
            <button
              className="p-2"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? (
                <Xmark width={24} height={24} strokeWidth={1.5} className="text-gray-600" />
              ) : (
                <Menu width={24} height={24} strokeWidth={1.5} className="text-gray-600" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <div className="md:hidden py-4 border-t border-gray-100">
            <div className="flex flex-col space-y-3">
              {visibleMenuItems.map(item => renderMenuItem(item, true))}
              {!loading && user && (
                <div className="pt-3 border-t border-gray-100">
                  <p className="text-sm text-gray-500 mb-2">{user.email}</p>
                  <button
                    onClick={() => {
                      handleSignOut();
                      setMobileMenuOpen(false);
                    }}
                    className="flex items-center gap-2 text-red-500"
                  >
                    <LogOut width={16} height={16} strokeWidth={1.5} />
                    로그아웃
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
