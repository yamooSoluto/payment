import { NextResponse } from 'next/server';
import { initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { defaultTermsOfService, defaultPrivacyPolicy } from '@/lib/default-terms';

// GET: 공개 약관 조회 (인증 불필요)
export async function GET() {
  try {
    const db = initializeFirebaseAdmin();
    if (!db) {
      // DB 연결 실패 시 기본값 반환
      return NextResponse.json({
        termsOfService: defaultTermsOfService,
        privacyPolicy: defaultPrivacyPolicy,
      });
    }

    const doc = await db.collection('settings').doc('terms').get();

    if (!doc.exists) {
      // Firestore에 데이터가 없으면 기본값 반환
      return NextResponse.json({
        termsOfService: defaultTermsOfService,
        privacyPolicy: defaultPrivacyPolicy,
      });
    }

    const data = doc.data();
    return NextResponse.json({
      termsOfService: data?.termsOfService || defaultTermsOfService,
      privacyPolicy: data?.privacyPolicy || defaultPrivacyPolicy,
    });
  } catch (error) {
    console.error('Get public terms error:', error);
    // 오류 시에도 기본값 반환
    return NextResponse.json({
      termsOfService: defaultTermsOfService,
      privacyPolicy: defaultPrivacyPolicy,
    });
  }
}
