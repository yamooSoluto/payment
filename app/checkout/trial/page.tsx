import { redirect } from 'next/navigation';
import { getSubscription } from '@/lib/auth';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { CheckCircle, NavArrowRight } from 'iconoir-react';
import Link from 'next/link';

interface TrialPageProps {
  searchParams: Promise<{ email?: string }>;
}

export default async function TrialPage({ searchParams }: TrialPageProps) {
  const params = await searchParams;
  const { email } = params;

  if (!email) {
    redirect('/login?redirect=/pricing');
  }

  // 이미 구독 중인지 확인
  const subscription = await getSubscription(email);
  if (subscription?.status === 'active') {
    redirect(`/account?email=${encodeURIComponent(email)}`);
  }

  // Trial 구독 생성
  const db = adminDb || initializeFirebaseAdmin();
  if (db) {
    const now = new Date();
    const trialEndDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30일

    await db.collection('subscriptions').doc(email).set(
      {
        email,
        status: 'active',
        plan: 'trial',
        amount: 0,
        trialEndDate,
        currentPeriodStart: now,
        currentPeriodEnd: trialEndDate,
        createdAt: now,
        updatedAt: now,
      },
      { merge: true }
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
      <div className="bg-white rounded-xl shadow-lg p-8">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle width={40} height={40} strokeWidth={1.5} className="text-green-500" />
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-4">
          무료 체험이 시작되었습니다!
        </h1>

        <p className="text-gray-600 mb-8">
          30일간 YAMOO의 모든 기능을 무료로 체험하실 수 있습니다.
          <br />
          체험 기간이 끝나면 자동으로 종료됩니다.
        </p>

        <div className="space-y-3">
          <Link
            href="https://app.yamoo.ai.kr"
            className="btn-primary w-full inline-flex items-center justify-center gap-2"
          >
            YAMOO 시작하기
            <NavArrowRight width={20} height={20} strokeWidth={1.5} />
          </Link>

          <Link
            href={`/account?email=${encodeURIComponent(email)}`}
            className="btn-secondary w-full inline-block"
          >
            마이페이지로 이동
          </Link>
        </div>
      </div>
    </div>
  );
}
