'use client';

import { useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Image from 'next/image';
import { preload } from 'swr';
import {
  Component,
  Group,
  UserCrown,
  Package,
  HomeSimpleDoor,
  CreditCards,
  Timer,
  StatsUpSquare,
  Mail,
  DocMagnifyingGlassIn,
  Settings,
  Xmark,
  NavArrowLeft,
  NavArrowRight,
} from 'iconoir-react';
import { useAdminAuth } from '@/contexts/AdminAuthContext';

// 사이드바 메뉴 → API URL 매핑 (호버 시 프리페치)
const prefetchMap: Record<string, string> = {
  '/admin': '/api/admin/dashboard/stats',
  '/admin/members': '/api/admin/members',
  '/admin/admins': '/api/admin/admins',
  '/admin/plans': '/api/admin/plans',
  '/admin/tenants': '/api/admin/tenants',
  '/admin/orders': '/api/admin/orders',
  '/admin/subscriptions': '/api/admin/subscriptions/list',
  '/admin/stats': '/api/admin/stats',
  '/admin/notifications': '/api/admin/notifications/sms-history',
  '/admin/faq': '/api/admin/faq',
};

const fetcher = (url: string) => fetch(url).then(res => {
  if (!res.ok) throw new Error('fetch failed');
  return res.json();
});

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

const menuItems = [
  {
    name: '대시보드',
    href: '/admin',
    icon: Component,
    permission: null,
  },
  {
    name: '회원',
    href: '/admin/members',
    icon: Group,
    permission: 'members:read',
  },
  {
    name: '관리자',
    href: '/admin/admins',
    icon: UserCrown,
    permission: 'admins:read',
    roles: ['owner', 'super'],
  },
  {
    name: '상품',
    href: '/admin/plans',
    icon: Package,
    permission: 'plans:read',
  },
  {
    name: '매장',
    href: '/admin/tenants',
    icon: HomeSimpleDoor,
    permission: 'tenants:read',
  },
  {
    name: '결제',
    href: '/admin/orders',
    icon: CreditCards,
    permission: 'orders:read',
  },
  {
    name: '구독',
    href: '/admin/subscriptions',
    icon: Timer,
    permission: 'subscriptions:read',
  },
  {
    name: '통계',
    href: '/admin/stats',
    icon: StatsUpSquare,
    permission: 'stats:read',
  },
  {
    name: '메시지',
    href: '/admin/notifications',
    icon: Mail,
    permission: 'notifications:read',
  },
  {
    name: 'FAQ',
    href: '/admin/faq',
    icon: DocMagnifyingGlassIn,
    permission: 'settings:read',
  },
  {
    name: '설정',
    href: '/admin/settings',
    icon: Settings,
    permission: 'settings:read',
  },
];

export default function Sidebar({ isOpen, onClose, collapsed, onToggleCollapse }: SidebarProps) {
  const pathname = usePathname();
  const { admin } = useAdminAuth();

  const filteredMenuItems = menuItems.filter((item) => {
    if (!item.roles) return true;
    return admin && item.roles.includes(admin.role);
  });

  const handlePrefetch = useCallback((href: string) => {
    const apiUrl = prefetchMap[href];
    if (apiUrl) {
      preload(apiUrl, fetcher);
    }
  }, []);

  return (
    <>
      {/* 모바일 오버레이 */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* 사이드바 */}
      <aside
        className={`
          fixed top-0 left-0 z-50 bg-gray-900 transform transition-all duration-200 ease-in-out
          lg:translate-x-0 lg:sticky lg:z-auto lg:top-0 lg:h-screen
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
          w-56 ${collapsed ? 'lg:w-16' : 'lg:w-56'}
        `}
        style={{ height: '100dvh' }}
      >
        {/* 로고 */}
        <div className={`flex items-center h-16 border-b border-gray-800 justify-between px-4 ${collapsed ? 'lg:justify-center lg:px-2' : ''}`}>
          <Link href="/admin" className={`flex items-center overflow-hidden gap-2 ${collapsed ? 'lg:justify-center lg:gap-0' : ''}`}>
            {/* 축소 모드 로고 - 데스크톱에서만 표시 */}
            {collapsed && (
              <div className="hidden lg:block bg-gray-700/50 rounded-lg p-1">
                <Image
                  src="/yamoo_favi2.png"
                  alt="YAMOO"
                  width={34}
                  height={34}
                />
              </div>
            )}
            {/* 전체 로고 - 모바일에서 항상 표시, 데스크톱에서는 펼침 모드일 때만 */}
            <div className={`flex items-center gap-2 ${collapsed ? 'lg:hidden' : ''}`}>
              <Image
                src="/yamoo_white_cut.png"
                alt="YAMOO"
                width={100}
                height={32}
              />
              <span className="text-xs text-blue-400 font-medium">Admin</span>
            </div>
          </Link>
          {!collapsed && (
            <button
              onClick={onClose}
              className="lg:hidden p-1 text-gray-400 hover:text-white"
            >
              <Xmark className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* 메뉴 */}
        <nav className={`p-2 space-y-1 px-4 ${collapsed ? 'lg:px-2' : ''}`}>
          {filteredMenuItems.map((item) => {
            const isActive = pathname === item.href ||
              (item.href !== '/admin' && pathname.startsWith(item.href));
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                onMouseEnter={() => handlePrefetch(item.href)}
                title={collapsed ? item.name : undefined}
                className={`
                  flex items-center gap-3 py-3 rounded-lg transition-colors px-4
                  ${collapsed ? 'lg:justify-center lg:px-2' : ''}
                  ${isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                  }
                `}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                {/* 메뉴 텍스트 - 모바일에서 항상 표시, 데스크톱에서는 펼침 모드일 때만 */}
                <span className={`font-medium ${collapsed ? 'lg:hidden' : ''}`}>{item.name}</span>
              </Link>
            );
          })}
        </nav>

        {/* 접기/펼치기 버튼 */}
        <button
          onClick={onToggleCollapse}
          className="hidden lg:flex absolute bottom-16 left-0 right-0 mx-auto w-8 h-8 items-center justify-center bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white rounded-full transition-colors"
        >
          {collapsed ? (
            <NavArrowRight className="w-4 h-4" />
          ) : (
            <NavArrowLeft className="w-4 h-4" />
          )}
        </button>

        {/* 하단 정보 */}
        <div
          className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-800"
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        >
          {/* 모바일에서 항상 표시, 데스크톱에서는 펼침 모드일 때만 */}
          <div className={`flex items-center justify-center gap-1.5 text-xs text-gray-500 ${collapsed ? 'lg:hidden' : ''}`}>
            <span>Powered by</span>
            <Image
              src="/soluto_white_cut.png"
              alt="SOLUTO"
              width={50}
              height={16}
            />
          </div>
        </div>
      </aside>
    </>
  );
}
