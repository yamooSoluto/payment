import { NextResponse } from 'next/server';
import { initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { defaultTermsOfService, defaultPrivacyPolicy } from '@/lib/default-terms';

// 시행일 포맷
function formatEffectiveDate(date: Date | null): string | null {
  if (!date) return null;
  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

// GET: 공개 약관 조회 (배포된 버전 + 히스토리) - 이용약관/개인정보처리방침 별도 관리
export async function GET() {
  try {
    const db = initializeFirebaseAdmin();
    if (!db) {
      // DB 연결 실패 시 기본값 반환
      return NextResponse.json({
        termsOfService: defaultTermsOfService,
        privacyPolicy: defaultPrivacyPolicy,
        termsEffectiveDate: null,
        privacyEffectiveDate: null,
        history: [],
      });
    }

    // 이용약관 배포된 버전 조회
    const termsDoc = await db.collection('settings').doc('terms-published').get();
    let termsOfService = defaultTermsOfService;
    let termsEffectiveDate: Date | null = null;
    let termsVersion = 0;

    if (termsDoc.exists) {
      const data = termsDoc.data();
      termsOfService = data?.termsOfService || defaultTermsOfService;
      termsEffectiveDate = data?.termsEffectiveDate?.toDate?.() || data?.publishedAt?.toDate?.() || null;
      termsVersion = data?.termsVersion || data?.version || 1;
    }

    // 개인정보처리방침 배포된 버전 조회 (새 구조)
    const privacyDoc = await db.collection('settings').doc('privacy-published').get();
    let privacyPolicy = defaultPrivacyPolicy;
    let privacyEffectiveDate: Date | null = null;
    let privacyVersion = 0;

    if (privacyDoc.exists) {
      const data = privacyDoc.data();
      privacyPolicy = data?.privacyPolicy || data?.content || defaultPrivacyPolicy;
      privacyEffectiveDate = data?.privacyEffectiveDate?.toDate?.() || data?.publishedAt?.toDate?.() || null;
      privacyVersion = data?.privacyVersion || data?.version || 1;
    } else if (termsDoc.exists) {
      // 기존 구조 하위 호환: terms-published에서 privacyPolicy 가져오기
      const data = termsDoc.data();
      if (data?.privacyPolicy) {
        privacyPolicy = data.privacyPolicy;
        privacyEffectiveDate = data?.publishedAt?.toDate?.() || null;
        privacyVersion = data?.version || 1;
      }
    }

    // 이용약관 히스토리 조회
    const termsHistorySnapshot = await db
      .collection('settings')
      .doc('terms-published')
      .collection('history')
      .orderBy('publishedAt', 'desc')
      .limit(10)
      .get();

    const termsHistory = termsHistorySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        type: 'terms' as const,
        content: data.termsOfService || data.content || '',
        publishedAt: data.publishedAt?.toDate?.() || data.publishedAt,
        effectiveDate: data.termsEffectiveDate?.toDate?.() || data.publishedAt?.toDate?.() || null,
        version: data.termsVersion || data.version,
      };
    });

    // 개인정보처리방침 히스토리 조회
    const privacyHistorySnapshot = await db
      .collection('settings')
      .doc('privacy-published')
      .collection('history')
      .orderBy('publishedAt', 'desc')
      .limit(10)
      .get();

    const privacyHistory = privacyHistorySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        type: 'privacy' as const,
        content: data.privacyPolicy || data.content || '',
        publishedAt: data.publishedAt?.toDate?.() || data.publishedAt,
        effectiveDate: data.privacyEffectiveDate?.toDate?.() || data.publishedAt?.toDate?.() || null,
        version: data.privacyVersion || data.version,
      };
    });

    return NextResponse.json({
      termsOfService,
      privacyPolicy,
      termsEffectiveDate: formatEffectiveDate(termsEffectiveDate),
      privacyEffectiveDate: formatEffectiveDate(privacyEffectiveDate),
      termsVersion,
      privacyVersion,
      // 하위 호환성
      publishedAt: termsEffectiveDate || privacyEffectiveDate,
      history: [
        ...termsHistory.map(h => ({
          ...h,
          termsOfService: h.content,
          privacyPolicy: '',
        })),
      ],
      // 새 구조
      termsHistory,
      privacyHistory,
    });
  } catch (error) {
    console.error('Get public terms error:', error);
    // 오류 시에도 기본값 반환
    return NextResponse.json({
      termsOfService: defaultTermsOfService,
      privacyPolicy: defaultPrivacyPolicy,
      termsEffectiveDate: null,
      privacyEffectiveDate: null,
      history: [],
    });
  }
}
