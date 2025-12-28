'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Image from 'next/image';
import {
  HomeAltSlim,
  Group,
  UserCrown,
  Package,
  Cart,
  RefreshDouble,
  StatsUpSquare,
  Bell,
  Settings,
  Xmark,
  NavArrowLeft,
  NavArrowRight,
} from 'iconoir-react';
import { useAdminAuth } from '@/contexts/AdminAuthContext';

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
    icon: HomeAltSlim,
    permission: null,
  },
  {
    name: '회원',
    href: '/admin/members',
    icon: Group,
    permission: 'members:read',
  },
  {
    name: '운영진',
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
    name: '결제',
    href: '/admin/orders',
    icon: Cart,
    permission: 'orders:read',
  },
  {
    name: '구독',
    href: '/admin/subscriptions',
    icon: RefreshDouble,
    permission: 'subscriptions:read',
  },
  {
    name: '통계',
    href: '/admin/stats',
    icon: StatsUpSquare,
    permission: 'stats:read',
  },
  {
    name: '알림톡',
    href: '/admin/notifications',
    icon: Bell,
    permission: 'notifications:read',
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
          fixed top-0 left-0 z-50 h-screen bg-gray-900 transform transition-all duration-200 ease-in-out
          lg:translate-x-0 lg:sticky lg:z-auto lg:top-0
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
          ${collapsed ? 'w-16' : 'w-64'}
        `}
      >
        {/* 로고 */}
        <div className="flex items-center justify-between h-16 px-4 border-b border-gray-800">
          <Link href="/admin" className="flex items-center gap-2 overflow-hidden">
            {collapsed ? (
              <span className="text-xl font-bold text-white">Y</span>
            ) : (
              <>
                <Image
                  src="/yamoo_white_cut.png"
                  alt="YAMOO"
                  width={100}
                  height={32}
                />
                <span className="text-xs text-blue-400 font-medium">Admin</span>
              </>
            )}
          </Link>
          <button
            onClick={onClose}
            className="lg:hidden p-1 text-gray-400 hover:text-white"
          >
            <Xmark className="w-5 h-5" />
          </button>
        </div>

        {/* 메뉴 */}
        <nav className={`p-2 space-y-1 ${collapsed ? 'px-2' : 'px-4'}`}>
          {filteredMenuItems.map((item) => {
            const isActive = pathname === item.href ||
              (item.href !== '/admin' && pathname.startsWith(item.href));
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                title={collapsed ? item.name : undefined}
                className={`
                  flex items-center gap-3 py-3 rounded-lg transition-colors
                  ${collapsed ? 'justify-center px-2' : 'px-4'}
                  ${isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                  }
                `}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                {!collapsed && <span className="font-medium">{item.name}</span>}
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
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-800">
          {!collapsed && (
            <p className="text-xs text-gray-500 text-center">
              YAMOO Admin v1.0
            </p>
          )}
        </div>
      </aside>
    </>
  );
}
