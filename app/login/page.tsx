import { Suspense } from 'react';
import { Metadata } from 'next';
import LoginContainer from '@/components/login/LoginContainer';

export const metadata: Metadata = {
  title: '로그인 - YAMOO',
  description: 'YAMOO 계정으로 로그인하세요',
};

function LoginFormFallback() {
  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-lg p-8 animate-pulse">
          <div className="text-center mb-8">
            <div className="h-8 bg-gray-200 rounded w-32 mx-auto mb-2"></div>
            <div className="h-4 bg-gray-200 rounded w-48 mx-auto"></div>
          </div>
          <div className="space-y-4">
            <div className="h-12 bg-gray-200 rounded"></div>
            <div className="h-12 bg-gray-200 rounded"></div>
            <div className="h-12 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFormFallback />}>
      <LoginContainer />
    </Suspense>
  );
}
