import { MessageSquare, Zap, Clock, Shield, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Section */}
      <section className="bg-white py-16 sm:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-6">
            CS 자동화의 새로운 기준,{' '}
            <span className="text-yamoo-dark">YAMOO</span>
          </h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto mb-8">
            AI 기반의 똑똑한 고객 상담 자동화 솔루션으로
            비즈니스의 효율성을 극대화하세요.
          </p>
          <Link href="/pricing" className="btn-primary inline-flex items-center gap-2">
            요금제 보기
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 sm:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-gray-900 text-center mb-12">
            왜 YAMOO인가요?
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="bg-white rounded-xl p-6 shadow-lg">
              <div className="w-12 h-12 bg-yamoo-primary/20 rounded-lg flex items-center justify-center mb-4">
                <MessageSquare className="w-6 h-6 text-yamoo-dark" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">스마트 응답</h3>
              <p className="text-gray-600">
                AI가 고객 문의를 분석하고 최적의 답변을 자동으로 제안합니다.
              </p>
            </div>

            <div className="bg-white rounded-xl p-6 shadow-lg">
              <div className="w-12 h-12 bg-yamoo-primary/20 rounded-lg flex items-center justify-center mb-4">
                <Zap className="w-6 h-6 text-yamoo-dark" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">빠른 처리</h3>
              <p className="text-gray-600">
                반복적인 문의는 자동으로 처리하여 응대 시간을 획기적으로 단축합니다.
              </p>
            </div>

            <div className="bg-white rounded-xl p-6 shadow-lg">
              <div className="w-12 h-12 bg-yamoo-primary/20 rounded-lg flex items-center justify-center mb-4">
                <Clock className="w-6 h-6 text-yamoo-dark" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">24시간 운영</h3>
              <p className="text-gray-600">
                언제 어디서나 고객 문의에 즉시 대응할 수 있습니다.
              </p>
            </div>

            <div className="bg-white rounded-xl p-6 shadow-lg">
              <div className="w-12 h-12 bg-yamoo-primary/20 rounded-lg flex items-center justify-center mb-4">
                <Shield className="w-6 h-6 text-yamoo-dark" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">안전한 보안</h3>
              <p className="text-gray-600">
                고객 데이터를 안전하게 보호하며, 기업 보안 정책을 준수합니다.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="bg-white py-16 sm:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-gray-900 text-center mb-12">
            이렇게 동작합니다
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-16 h-16 bg-yamoo-primary rounded-full flex items-center justify-center mx-auto mb-4 text-2xl font-bold text-gray-900">
                1
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">연동</h3>
              <p className="text-gray-600">
                기존 CS 채널과 간편하게 연동합니다. 별도의 개발 작업 없이 빠르게 시작할 수 있습니다.
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 bg-yamoo-primary rounded-full flex items-center justify-center mx-auto mb-4 text-2xl font-bold text-gray-900">
                2
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">학습</h3>
              <p className="text-gray-600">
                AI가 비즈니스에 맞는 응답 패턴을 학습합니다. 사용할수록 더 똑똑해집니다.
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 bg-yamoo-primary rounded-full flex items-center justify-center mx-auto mb-4 text-2xl font-bold text-gray-900">
                3
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">자동화</h3>
              <p className="text-gray-600">
                고객 문의를 자동으로 분류하고 적절한 응답을 제공합니다.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 sm:py-24">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            지금 시작하세요
          </h2>
          <p className="text-xl text-gray-600 mb-8">
            YAMOO와 함께 CS 업무를 혁신하세요.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/pricing" className="btn-primary inline-flex items-center justify-center gap-2">
              요금제 보기
              <ArrowRight className="w-5 h-5" />
            </Link>
            <Link href="/login" className="btn-secondary inline-flex items-center justify-center">
              로그인
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
