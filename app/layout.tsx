import type { Metadata } from 'next'
import './globals.css'
import LayoutWrapper from '@/components/LayoutWrapper'
import { initializeFirebaseAdmin } from '@/lib/firebase-admin'

// 동적 메타데이터 생성
export async function generateMetadata(): Promise<Metadata> {
  try {
    const db = initializeFirebaseAdmin();
    if (!db) {
      return getDefaultMetadata();
    }

    const settingsDoc = await db.collection('settings').doc('site').get();

    if (!settingsDoc.exists) {
      return getDefaultMetadata();
    }

    const data = settingsDoc.data();

    const siteName = data?.siteName || 'YAMOO';

    return {
      title: siteName,
      description: data?.ogDescription || 'YAMOO CS 자동화 서비스',
      manifest: '/manifest.webmanifest',
      themeColor: '#2563eb',
      icons: {
        icon: data?.faviconUrl || '/yamoo_favi.png',
        apple: data?.webappIconUrl || '/yamoo_favi.png',
      },
      appleWebApp: {
        capable: true,
        statusBarStyle: 'default',
        title: 'YAMOO',
      },
      openGraph: {
        title: data?.ogTitle || siteName,
        description: data?.ogDescription || 'YAMOO CS 자동화 서비스',
        images: data?.ogImageUrl ? [{ url: data.ogImageUrl }] : [],
        siteName: siteName,
        locale: 'ko_KR',
        type: 'website',
      },
      twitter: {
        card: 'summary_large_image',
        title: data?.ogTitle || 'YAMOO',
        description: data?.ogDescription || 'YAMOO CS 자동화 서비스',
        images: data?.ogImageUrl ? [data.ogImageUrl] : [],
      },
      robots: {
        index: false,
        follow: false,
        googleBot: {
          index: false,
          follow: false,
        },
      },
    };
  } catch (error) {
    console.error('Failed to fetch metadata settings:', error);
    return getDefaultMetadata();
  }
}

function getDefaultMetadata(): Metadata {
  return {
    title: 'YAMOO',
    description: 'YAMOO CS 자동화 서비스',
    manifest: '/manifest.webmanifest',
    themeColor: '#2563eb',
    icons: {
      icon: '/yamoo_favi.png',
      apple: '/yamoo_favi.png',
    },
    appleWebApp: {
      capable: true,
      statusBarStyle: 'default',
      title: 'YAMOO',
    },
    robots: {
      index: false,
      follow: false,
      googleBot: {
        index: false,
        follow: false,
      },
    },
  };
}

// 사이트 설정 불러오기 (SSR)
async function getSiteSettings() {
  try {
    const db = initializeFirebaseAdmin();
    if (!db) {
      return null;
    }

    const settingsDoc = await db.collection('settings').doc('site').get();

    if (!settingsDoc.exists) {
      return null;
    }

    const data = settingsDoc.data();
    return {
      logoUrl: data?.logoUrl || '',
      menuItems: data?.menuItems || [
        { id: 'about', name: '소개', path: '/about', visible: true, order: 0 },
        { id: 'trial', name: '무료체험', path: '/trial', visible: true, order: 1 },
        { id: 'plan', name: '요금제', path: '/plan', visible: true, order: 2 },
        { id: 'portal', name: '포탈', path: 'https://app.yamoo.ai.kr', visible: true, order: 3 },
        { id: 'account', name: '마이페이지', path: '/account', visible: true, order: 4 },
      ],
    };
  } catch (error) {
    console.error('Failed to fetch site settings:', error);
    return null;
  }
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const siteSettings = await getSiteSettings();

  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          as="style"
          crossOrigin="anonymous"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css"
        />
      </head>
      <body className="min-h-screen flex flex-col" style={{ fontFamily: 'Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif' }}>
        <LayoutWrapper siteSettings={siteSettings}>
          {children}
        </LayoutWrapper>
      </body>
    </html>
  )
}
