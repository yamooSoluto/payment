import type { Metadata } from 'next'
import './globals.css'
import { AuthProvider } from '@/contexts/AuthContext'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import ChannelTalk from '@/components/ChannelTalk'

export const metadata: Metadata = {
  title: 'YAMOO - 결제 및 구독 관리',
  description: 'YAMOO CS 자동화 서비스 결제 및 구독 관리',
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
        <AuthProvider>
          <Header />
          <main className="flex-1 bg-gray-50">
            {children}
          </main>
          <Footer />
          <ChannelTalk />
        </AuthProvider>
      </body>
    </html>
  )
}
