import { NextResponse } from 'next/server';
import { initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { defaultTermsOfService, defaultPrivacyPolicy } from '@/lib/default-terms';

// GET: 공개 약관 조회 (배포된 버전 + 히스토리)
export async function GET() {
  try {
    const db = initializeFirebaseAdmin();
    if (!db) {
      // DB 연결 실패 시 기본값 반환
      return NextResponse.json({
        termsOfService: defaultTermsOfService,
        privacyPolicy: defaultPrivacyPolicy,
        history: [],
      });
    }

    // 배포된 버전 조회
    const doc = await db.collection('settings').doc('terms-published').get();

    let termsOfService = defaultTermsOfService;
    let privacyPolicy = defaultPrivacyPolicy;
    let currentPublishedAt = null;

    if (doc.exists) {
      const data = doc.data();
      termsOfService = data?.termsOfService || defaultTermsOfService;
      privacyPolicy = data?.privacyPolicy || defaultPrivacyPolicy;
      currentPublishedAt = data?.publishedAt?.toDate?.() || data?.publishedAt || null;
    }

    // 과거 버전 히스토리 조회
    const historySnapshot = await db
      .collection('settings')
      .doc('terms-published')
      .collection('history')
      .orderBy('publishedAt', 'desc')
      .limit(20)
      .get();

    const history = historySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        termsOfService: data.termsOfService,
        privacyPolicy: data.privacyPolicy,
        publishedAt: data.publishedAt?.toDate?.() || data.publishedAt,
        version: data.version,
      };
    });

    return NextResponse.json({
      termsOfService,
      privacyPolicy,
      publishedAt: currentPublishedAt,
      history,
    });
  } catch (error) {
    console.error('Get public terms error:', error);
    // 오류 시에도 기본값 반환
    return NextResponse.json({
      termsOfService: defaultTermsOfService,
      privacyPolicy: defaultPrivacyPolicy,
      history: [],
    });
  }
}
