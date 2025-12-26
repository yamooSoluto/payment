'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '@/contexts/AuthContext';
import { LogOut, Menu, X } from 'lucide-react';
import { useState } from 'react';

export default function Header() {
  const { user, loading, signOut } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('로그아웃 실패:', error);
    }
  };

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Link href="/pricing" className="flex items-center">
            <Image
              src="/yamoo_black_1.png"
              alt="YAMOO"
              width={120}
              height={40}
              className="h-8 w-auto"
              priority
            />
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center space-x-6">
            <Link
              href="/about"
              className="text-gray-600 hover:text-yamoo-dark transition-colors font-medium"
            >
              소개
            </Link>
            <Link
              href={user ? `/pricing?email=${encodeURIComponent(user.email || '')}` : '/pricing'}
              className="text-gray-600 hover:text-yamoo-dark transition-colors font-medium"
            >
              요금제
            </Link>
            {!loading && (
              <>
                {user ? (
                  <>
                    <Link
                      href={`/account?email=${encodeURIComponent(user.email || '')}`}
                      className="text-gray-600 hover:text-yamoo-dark transition-colors font-medium"
                    >
                      마이페이지
                    </Link>
                    <div className="flex items-center gap-3 pl-3 border-l border-gray-200">
                      <span className="text-sm text-gray-500">{user.email}</span>
                      <button
                        onClick={handleSignOut}
                        className="flex items-center gap-1 text-gray-500 hover:text-red-500 transition-colors"
                      >
                        <LogOut className="w-4 h-4" />
                      </button>
                    </div>
                  </>
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
                <X className="w-6 h-6 text-gray-600" />
              ) : (
                <Menu className="w-6 h-6 text-gray-600" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <div className="md:hidden py-4 border-t border-gray-100">
            <div className="flex flex-col space-y-3">
              <Link
                href="/about"
                className="text-gray-600 hover:text-yamoo-dark transition-colors font-medium py-2"
                onClick={() => setMobileMenuOpen(false)}
              >
                소개
              </Link>
              <Link
                href={user ? `/pricing?email=${encodeURIComponent(user.email || '')}` : '/pricing'}
                className="text-gray-600 hover:text-yamoo-dark transition-colors font-medium py-2"
                onClick={() => setMobileMenuOpen(false)}
              >
                요금제
              </Link>
              {!loading && user && (
                <>
                  <Link
                    href={`/account?email=${encodeURIComponent(user.email || '')}`}
                    className="text-gray-600 hover:text-yamoo-dark transition-colors font-medium py-2"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    마이페이지
                  </Link>
                  <div className="pt-3 border-t border-gray-100">
                    <p className="text-sm text-gray-500 mb-2">{user.email}</p>
                    <button
                      onClick={() => {
                        handleSignOut();
                        setMobileMenuOpen(false);
                      }}
                      className="flex items-center gap-2 text-red-500"
                    >
                      <LogOut className="w-4 h-4" />
                      로그아웃
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
