import { NextRequest, NextResponse } from 'next/server';
import { getAdminFromRequest, hasPermission } from '@/lib/admin-auth';
import { initializeFirebaseAdmin } from '@/lib/firebase-admin';

// GET: 사이트 설정 조회
export async function GET(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);

    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(admin, 'siteSettings:read')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const db = initializeFirebaseAdmin();
    if (!db) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
    }

    const settingsDoc = await db.collection('settings').doc('site').get();

    if (!settingsDoc.exists) {
      return NextResponse.json({ settings: null });
    }

    return NextResponse.json({ settings: settingsDoc.data() });
  } catch (error) {
    console.error('Get settings error:', error);
    return NextResponse.json(
      { error: '설정을 불러오는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// PUT: 사이트 설정 저장
export async function PUT(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);

    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(admin, 'siteSettings:write')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const db = initializeFirebaseAdmin();
    if (!db) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
    }

    const body = await request.json();
    const { settings } = body;

    if (!settings) {
      return NextResponse.json({ error: 'Settings data is required' }, { status: 400 });
    }

    await db.collection('settings').doc('site').set({
      ...settings,
      updatedAt: new Date(),
      updatedBy: admin.adminId,
    }, { merge: true });

    return NextResponse.json({
      success: true,
      message: '설정이 저장되었습니다.',
    });
  } catch (error) {
    console.error('Save settings error:', error);
    return NextResponse.json(
      { error: '설정을 저장하는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
