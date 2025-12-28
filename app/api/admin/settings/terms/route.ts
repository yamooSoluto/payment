import { NextRequest, NextResponse } from 'next/server';
import { getAdminFromRequest, hasPermission } from '@/lib/admin-auth';
import { initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { defaultTermsOfService, defaultPrivacyPolicy } from '@/lib/default-terms';

// GET: 약관 조회 (draft, published, history)
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

    // Published (배포됨) 조회
    const publishedDoc = await db.collection('settings').doc('terms-published').get();
    let published;
    if (!publishedDoc.exists) {
      published = null;
    } else {
      const data = publishedDoc.data();
      published = {
        termsOfService: data?.termsOfService || '',
        privacyPolicy: data?.privacyPolicy || '',
        publishedAt: data?.publishedAt?.toDate?.() || data?.publishedAt || null,
        publishedBy: data?.publishedBy || null,
        version: data?.version || 1,
      };
    }

    // 배포 히스토리 조회
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
        publishedBy: data.publishedBy,
        version: data.version,
      };
    });

    return NextResponse.json({
      draft,
      published,
      history,
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

    // 히스토리 삭제
    await db
      .collection('settings')
      .doc('terms-published')
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

// POST: 배포 (draft → published, 히스토리 생성)
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

    // 현재 draft 가져오기
    const draftDoc = await db.collection('settings').doc('terms-draft').get();
    if (!draftDoc.exists) {
      return NextResponse.json(
        { error: '저장된 약관이 없습니다. 먼저 저장해주세요.' },
        { status: 400 }
      );
    }

    const draftData = draftDoc.data();
    const publishedRef = db.collection('settings').doc('terms-published');

    // 현재 published 버전 확인
    const currentPublished = await publishedRef.get();
    let newVersion = 1;

    if (currentPublished.exists) {
      const currentData = currentPublished.data();
      newVersion = (currentData?.version || 0) + 1;

      // 기존 published를 히스토리에 저장
      await publishedRef.collection('history').add({
        termsOfService: currentData?.termsOfService || '',
        privacyPolicy: currentData?.privacyPolicy || '',
        publishedAt: currentData?.publishedAt || new Date(),
        publishedBy: currentData?.publishedBy || null,
        version: currentData?.version || 1,
        archivedAt: new Date(),
      });
    }

    // 새 버전 배포
    await publishedRef.set({
      termsOfService: draftData?.termsOfService || '',
      privacyPolicy: draftData?.privacyPolicy || '',
      publishedAt: new Date(),
      publishedBy: admin.adminId,
      version: newVersion,
    });

    return NextResponse.json({
      success: true,
      version: newVersion,
      message: `v${newVersion} 배포 완료`
    });
  } catch (error) {
    console.error('Publish terms error:', error);
    return NextResponse.json(
      { error: '약관을 배포하는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
