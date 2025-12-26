import { NextRequest, NextResponse } from 'next/server';
import { getAdminFromRequest, hasPermission } from '@/lib/admin-auth';
import { initializeFirebaseAdmin } from '@/lib/firebase-admin';

// GET: 알림톡 템플릿 목록 조회
export async function GET(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);

    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(admin, 'notifications:read')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const db = initializeFirebaseAdmin();
    if (!db) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
    }

    const snapshot = await db.collection('bizm_templates').orderBy('createdAt', 'desc').get();

    const templates = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate?.()?.toISOString() || null,
      updatedAt: doc.data().updatedAt?.toDate?.()?.toISOString() || null,
    }));

    return NextResponse.json({ templates });
  } catch (error) {
    console.error('Get templates error:', error);
    return NextResponse.json(
      { error: '템플릿 목록을 불러오는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// POST: 알림톡 템플릿 생성
export async function POST(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);

    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(admin, 'notifications:write')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const db = initializeFirebaseAdmin();
    if (!db) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
    }

    const body = await request.json();
    const { code, name, content, variables, triggerEvent, isActive } = body;

    if (!code || !name) {
      return NextResponse.json(
        { error: '템플릿 코드와 이름은 필수입니다.' },
        { status: 400 }
      );
    }

    // 코드 중복 확인
    const existingSnapshot = await db.collection('bizm_templates')
      .where('code', '==', code)
      .get();

    if (!existingSnapshot.empty) {
      return NextResponse.json(
        { error: '이미 사용 중인 템플릿 코드입니다.' },
        { status: 400 }
      );
    }

    const docRef = await db.collection('bizm_templates').add({
      code,
      name,
      content: content || '',
      variables: variables || [],
      triggerEvent: triggerEvent || null,
      isActive: isActive !== false,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: admin.adminId,
    });

    return NextResponse.json({ success: true, id: docRef.id });
  } catch (error) {
    console.error('Create template error:', error);
    return NextResponse.json(
      { error: '템플릿을 생성하는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
