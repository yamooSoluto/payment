import { NextRequest, NextResponse } from 'next/server';
import { getAdminFromRequest, hasPermission } from '@/lib/admin-auth';
import { initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { defaultTermsOfService, defaultPrivacyPolicy } from '@/lib/default-terms';

// GET: 약관 조회
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
    console.error('Get terms error:', error);
    return NextResponse.json(
      { error: '약관을 불러오는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// PUT: 약관 저장
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

    await db.collection('settings').doc('terms').set(
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
