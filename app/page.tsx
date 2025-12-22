import Link from 'next/link';
import { ArrowRight, Zap, Shield, Clock } from 'lucide-react';

export default function HomePage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      {/* Hero Section */}
      <div className="text-center mb-16">
        <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
          YAMOO 결제 시스템
        </h1>
        <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
          CS 자동화 서비스를 위한 간편하고 안전한 결제 시스템입니다.
        </p>
        <div className="flex flex-wrap gap-4 justify-center">
          <Link
            href="/pricing"
            className="btn-primary inline-flex items-center gap-2"
          >
            요금제 보기
            <ArrowRight className="w-5 h-5" />
          </Link>
          <Link
            href="/login"
            className="btn-secondary inline-flex items-center gap-2"
          >
            로그인
          </Link>
        </div>
      </div>

      {/* Features */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="card text-center">
          <div className="w-14 h-14 bg-blue-100 rounded-xl flex items-center justify-center mx-auto mb-4">
            <Shield className="w-7 h-7 text-blue-600" />
          </div>
          <h3 className="font-semibold text-gray-900 mb-2">안전한 결제</h3>
          <p className="text-sm text-gray-600">
            토스페이먼츠를 통한 PCI-DSS 인증 결제 시스템으로 안전하게 보호됩니다.
          </p>
        </div>

        <div className="card text-center">
          <div className="w-14 h-14 bg-green-100 rounded-xl flex items-center justify-center mx-auto mb-4">
            <Clock className="w-7 h-7 text-green-600" />
          </div>
          <h3 className="font-semibold text-gray-900 mb-2">간편한 구독 관리</h3>
          <p className="text-sm text-gray-600">
            언제든지 플랜 변경, 결제 수단 변경, 구독 해지가 가능합니다.
          </p>
        </div>

        <div className="card text-center">
          <div className="w-14 h-14 bg-purple-100 rounded-xl flex items-center justify-center mx-auto mb-4">
            <Zap className="w-7 h-7 text-purple-600" />
          </div>
          <h3 className="font-semibold text-gray-900 mb-2">자동 정기결제</h3>
          <p className="text-sm text-gray-600">
            매월 자동으로 결제되어 서비스가 중단 없이 유지됩니다.
          </p>
        </div>
      </div>

    </div>
  );
}
