import type { Metadata } from 'next'
import { cache } from 'react'
import localFont from 'next/font/local'
import './globals.css'
import LayoutWrapper from '@/components/LayoutWrapper'
import { initializeFirebaseAdmin } from '@/lib/firebase-admin'

const pretendard = localFont({
  src: '../public/fonts/PretendardVariable.woff2',
  display: 'swap',
  weight: '45 920',
  variable: '--font-pretendard',
})

// Firestore settings/site 문서를 한 요청 내에서 1회만 호출 (React cache)
const getSiteDoc = cache(async () => {
  try {
    const db = initializeFirebaseAdmin();
    if (!db) return null;
    const doc = await db.collection('settings').doc('site').get();
    return doc.exists ? doc.data() : null;
  } catch (error) {
    console.error('Failed to fetch site settings:', error);
    return null;
  }
});

// 동적 메타데이터 생성
export async function generateMetadata(): Promise<Metadata> {
  try {
    const data = await getSiteDoc();

    if (!data) {
      return getDefaultMetadata();
    }

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

// 사이트 설정 불러오기 (SSR) — getSiteDoc() 캐시 재사용
async function getSiteSettings() {
  const data = await getSiteDoc();
  if (!data) return null;

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
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const siteSettings = await getSiteSettings();

  return (
    <html lang="ko" className={pretendard.variable}>
      <body className={`${pretendard.className} min-h-screen flex flex-col`}>
        <LayoutWrapper siteSettings={siteSettings}>
          {children}
        </LayoutWrapper>
      </body>
    </html>
  )
}
