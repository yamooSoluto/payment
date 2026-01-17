import { NextRequest, NextResponse } from 'next/server';
import { getAdminFromRequest, hasPermission } from '@/lib/admin-auth';
import { initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { defaultTermsOfService, defaultPrivacyPolicy } from '@/lib/default-terms';

// 시행일 포맷
function formatEffectiveDate(date: Date): string {
  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

// 내용에서 시행일 자동 업데이트
// "본 약관은 YYYY년 MM월 DD일부터 시행된다." 패턴 찾아서 교체
function updateEffectiveDateInContent(content: string, date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const newDateStr = `${year}년 ${month}월 ${day}일`;

  let updatedContent = content;

  // 【부칙】 섹션의 시행일 패턴 매칭 (다양한 형식 지원)
  // "본 약관은 YYYY년 MM월 DD일부터 시행된다."
  // "본 방침은 YYYY년 MM월 DD일부터 시행됩니다."
  updatedContent = updatedContent.replace(
    /(본\s*(?:약관|방침)은\s*)\d{4}년\s*\d{1,2}월\s*\d{1,2}일(부터\s*시행(?:된다|됩니다|합니다))/g,
    `$1${newDateStr}$2`
  );

  // "시행일: YYYY년 MM월 DD일" 또는 "시행일 YYYY년 MM월 DD일"
  updatedContent = updatedContent.replace(
    /(시행일\s*:?\s*)\d{4}년\s*\d{1,2}월\s*\d{1,2}일/g,
    `$1${newDateStr}`
  );

  return updatedContent;
}

// GET: 약관 조회 (draft, published - 별도 관리)
export async function GET(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);

    if (!admin) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    if (!hasPermission(admin, 'settings:read')) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }

    const db = initializeFirebaseAdmin();
    if (!db) {
      return NextResponse.json(
        { error: 'Database unavailable' },
        { status: 500 }
      );
    }

    // Draft (편집 중) 조회
    const draftDoc = await db.collection('settings').doc('terms-draft').get();
    let draft;
    if (!draftDoc.exists) {
      draft = {
        termsOfService: defaultTermsOfService,
        privacyPolicy: defaultPrivacyPolicy,
        updatedAt: null,
      };
    } else {
      const data = draftDoc.data();
      draft = {
        termsOfService: data?.termsOfService || defaultTermsOfService,
        privacyPolicy: data?.privacyPolicy || defaultPrivacyPolicy,
        updatedAt: data?.updatedAt?.toDate?.() || data?.updatedAt || null,
      };
    }

    // 이용약관 Published 조회 (별도)
    const termsPublishedDoc = await db.collection('settings').doc('terms-published').get();
    let termsPublished = null;
    if (termsPublishedDoc.exists) {
      const data = termsPublishedDoc.data();
      termsPublished = {
        content: data?.termsOfService || data?.content || '',
        publishedAt: data?.publishedAt?.toDate?.() || data?.publishedAt || null,
        publishedBy: data?.publishedBy || null,
        version: data?.termsVersion || data?.version || 1,
        effectiveDate: data?.termsEffectiveDate?.toDate?.() || data?.publishedAt?.toDate?.() || null,
      };
    }

    // 개인정보처리방침 Published 조회 (별도)
    const privacyPublishedDoc = await db.collection('settings').doc('privacy-published').get();
    let privacyPublished = null;
    if (privacyPublishedDoc.exists) {
      const data = privacyPublishedDoc.data();
      privacyPublished = {
        content: data?.privacyPolicy || data?.content || '',
        publishedAt: data?.publishedAt?.toDate?.() || data?.publishedAt || null,
        publishedBy: data?.publishedBy || null,
        version: data?.privacyVersion || data?.version || 1,
        effectiveDate: data?.privacyEffectiveDate?.toDate?.() || data?.publishedAt?.toDate?.() || null,
      };
    } else if (termsPublishedDoc.exists) {
      // 기존 통합 구조에서 개인정보처리방침 마이그레이션
      const data = termsPublishedDoc.data();
      if (data?.privacyPolicy) {
        privacyPublished = {
          content: data.privacyPolicy,
          publishedAt: data?.publishedAt?.toDate?.() || data?.publishedAt || null,
          publishedBy: data?.publishedBy || null,
          version: data?.version || 1,
          effectiveDate: data?.publishedAt?.toDate?.() || null,
        };
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
        content: data.termsOfService || data.content || '',
        publishedAt: data.publishedAt?.toDate?.() || data.publishedAt,
        publishedBy: data.publishedBy,
        version: data.termsVersion || data.version,
        effectiveDate: data.termsEffectiveDate?.toDate?.() || data.publishedAt?.toDate?.() || null,
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
        content: data.privacyPolicy || data.content || '',
        publishedAt: data.publishedAt?.toDate?.() || data.publishedAt,
        publishedBy: data.publishedBy,
        version: data.privacyVersion || data.version,
        effectiveDate: data.privacyEffectiveDate?.toDate?.() || data.publishedAt?.toDate?.() || null,
      };
    });

    return NextResponse.json({
      draft,
      termsPublished,
      privacyPublished,
      termsHistory,
      privacyHistory,
      // 하위 호환성을 위해 기존 형식도 유지
      published: termsPublished ? {
        termsOfService: termsPublished.content,
        privacyPolicy: privacyPublished?.content || '',
        publishedAt: termsPublished.publishedAt,
        publishedBy: termsPublished.publishedBy,
        version: termsPublished.version,
      } : null,
      history: termsHistory.map(h => ({
        ...h,
        termsOfService: h.content,
        privacyPolicy: '',
      })),
    });
  } catch (error) {
    console.error('Get terms error:', error);
    return NextResponse.json(
      { error: '약관을 불러오는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// PUT: 임시 저장 (draft)
export async function PUT(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);

    if (!admin) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    if (!hasPermission(admin, 'settings:write')) {
      return NextResponse.json(
        { error: '약관을 수정할 권한이 없습니다.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { termsOfService, privacyPolicy } = body;

    const db = initializeFirebaseAdmin();
    if (!db) {
      return NextResponse.json(
        { error: 'Database unavailable' },
        { status: 500 }
      );
    }

    // Draft에 저장
    await db.collection('settings').doc('terms-draft').set(
      {
        termsOfService: termsOfService || '',
        privacyPolicy: privacyPolicy || '',
        updatedAt: new Date(),
        updatedBy: admin.adminId,
      },
      { merge: true }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Save terms error:', error);
    return NextResponse.json(
      { error: '약관을 저장하는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// DELETE: 히스토리 삭제
export async function DELETE(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);

    if (!admin) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    if (!hasPermission(admin, 'settings:write')) {
      return NextResponse.json(
        { error: '약관 히스토리를 삭제할 권한이 없습니다.' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const historyId = searchParams.get('id');
    const type = searchParams.get('type') || 'terms'; // 'terms' 또는 'privacy'

    if (!historyId) {
      return NextResponse.json(
        { error: '삭제할 히스토리 ID가 필요합니다.' },
        { status: 400 }
      );
    }

    const db = initializeFirebaseAdmin();
    if (!db) {
      return NextResponse.json(
        { error: 'Database unavailable' },
        { status: 500 }
      );
    }

    // 히스토리 삭제 (타입에 따라 다른 컬렉션)
    const docName = type === 'privacy' ? 'privacy-published' : 'terms-published';
    await db
      .collection('settings')
      .doc(docName)
      .collection('history')
      .doc(historyId)
      .delete();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete terms history error:', error);
    return NextResponse.json(
      { error: '히스토리 삭제 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// POST: 배포 (draft → published, 히스토리 생성) - 이용약관/개인정보처리방침 별도 배포
export async function POST(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);

    if (!admin) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    if (!hasPermission(admin, 'settings:write')) {
      return NextResponse.json(
        { error: '약관을 배포할 권한이 없습니다.' },
        { status: 403 }
      );
    }

    const db = initializeFirebaseAdmin();
    if (!db) {
      return NextResponse.json(
        { error: 'Database unavailable' },
        { status: 500 }
      );
    }

    // URL 파라미터에서 타입 확인 (terms 또는 privacy)
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'both'; // 'terms', 'privacy', 'both'

    // 현재 draft 가져오기
    const draftDoc = await db.collection('settings').doc('terms-draft').get();
    if (!draftDoc.exists) {
      return NextResponse.json(
        { error: '저장된 약관이 없습니다. 먼저 저장해주세요.' },
        { status: 400 }
      );
    }

    const draftData = draftDoc.data();
    const now = new Date();
    const results: { terms?: number; privacy?: number } = {};

    // 이용약관 배포
    if (type === 'terms' || type === 'both') {
      const termsRef = db.collection('settings').doc('terms-published');
      const currentTerms = await termsRef.get();
      let termsVersion = 1;

      if (currentTerms.exists) {
        const currentData = currentTerms.data();
        termsVersion = (currentData?.termsVersion || currentData?.version || 0) + 1;

        // 기존 버전을 히스토리에 저장
        await termsRef.collection('history').add({
          termsOfService: currentData?.termsOfService || '',
          content: currentData?.termsOfService || '',
          publishedAt: currentData?.publishedAt || now,
          publishedBy: currentData?.publishedBy || null,
          termsVersion: currentData?.termsVersion || currentData?.version || 1,
          version: currentData?.termsVersion || currentData?.version || 1,
          termsEffectiveDate: currentData?.termsEffectiveDate || currentData?.publishedAt || now,
          archivedAt: now,
        });
      }

      // 새 버전 배포 (시행일 자동 업데이트)
      const updatedTermsContent = updateEffectiveDateInContent(draftData?.termsOfService || '', now);
      await termsRef.set({
        termsOfService: updatedTermsContent,
        publishedAt: now,
        publishedBy: admin.adminId,
        termsVersion: termsVersion,
        termsEffectiveDate: now,
        // 기존 privacy 데이터 유지 (마이그레이션용)
        ...(currentTerms.exists && currentTerms.data()?.privacyPolicy
          ? { privacyPolicy: currentTerms.data()?.privacyPolicy }
          : {}),
        version: termsVersion, // 하위 호환
      }, { merge: true });

      results.terms = termsVersion;
    }

    // 개인정보처리방침 배포
    if (type === 'privacy' || type === 'both') {
      const privacyRef = db.collection('settings').doc('privacy-published');
      const currentPrivacy = await privacyRef.get();
      let privacyVersion = 1;

      if (currentPrivacy.exists) {
        const currentData = currentPrivacy.data();
        privacyVersion = (currentData?.privacyVersion || currentData?.version || 0) + 1;

        // 기존 버전을 히스토리에 저장
        await privacyRef.collection('history').add({
          privacyPolicy: currentData?.privacyPolicy || currentData?.content || '',
          content: currentData?.privacyPolicy || currentData?.content || '',
          publishedAt: currentData?.publishedAt || now,
          publishedBy: currentData?.publishedBy || null,
          privacyVersion: currentData?.privacyVersion || currentData?.version || 1,
          version: currentData?.privacyVersion || currentData?.version || 1,
          privacyEffectiveDate: currentData?.privacyEffectiveDate || currentData?.publishedAt || now,
          archivedAt: now,
        });
      }

      // 새 버전 배포 (시행일 자동 업데이트)
      const updatedPrivacyContent = updateEffectiveDateInContent(draftData?.privacyPolicy || '', now);
      await privacyRef.set({
        privacyPolicy: updatedPrivacyContent,
        content: updatedPrivacyContent,
        publishedAt: now,
        publishedBy: admin.adminId,
        privacyVersion: privacyVersion,
        privacyEffectiveDate: now,
        version: privacyVersion, // 하위 호환
      });

      results.privacy = privacyVersion;
    }

    const message = type === 'both'
      ? `이용약관 v${results.terms}, 개인정보처리방침 v${results.privacy} 배포 완료`
      : type === 'terms'
        ? `이용약관 v${results.terms} 배포 완료`
        : `개인정보처리방침 v${results.privacy} 배포 완료`;

    return NextResponse.json({
      success: true,
      termsVersion: results.terms,
      privacyVersion: results.privacy,
      version: results.terms || results.privacy, // 하위 호환
      message,
    });
  } catch (error) {
    console.error('Publish terms error:', error);
    return NextResponse.json(
      { error: '약관을 배포하는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
