import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { AuthProvider } from '@/contexts/AuthContext'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import ChannelTalk from '@/components/ChannelTalk'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'YAMOO - 결제 및 구독 관리',
  description: 'YAMOO CS 자동화 서비스 결제 및 구독 관리',
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
      <body className={`${inter.className} min-h-screen flex flex-col`}>
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
