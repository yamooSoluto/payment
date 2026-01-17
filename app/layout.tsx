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
      icons: {
        icon: data?.faviconUrl || '/yamoo_favi.png',
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
    icons: {
      icon: '/yamoo_favi.png',
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
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
        <LayoutWrapper>
          {children}
        </LayoutWrapper>
      </body>
    </html>
  )
}
