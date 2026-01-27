import { NextRequest, NextResponse } from 'next/server';
import { getAdminFromRequest, hasPermission } from '@/lib/admin-auth';
import { initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { addAdminLog } from '@/lib/admin-log';

// GET: FAQ 목록 조회
export async function GET(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);

    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(admin, 'faq:read')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const db = initializeFirebaseAdmin();
    if (!db) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
    }

    const faqSnapshot = await db.collection('web_faq')
      .orderBy('order', 'asc')
      .get();

    const faqs = faqSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    return NextResponse.json({ faqs });
  } catch (error) {
    console.error('Get FAQ error:', error);
    return NextResponse.json(
      { error: 'FAQ를 불러오는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// POST: FAQ 추가
export async function POST(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);

    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(admin, 'faq:write')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const db = initializeFirebaseAdmin();
    if (!db) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
    }

    const body = await request.json();
    const { question, answer, category, subcategory } = body;

    if (!question || !answer) {
      return NextResponse.json({ error: '제목과 내용은 필수입니다.' }, { status: 400 });
    }

    // 현재 최대 order 값 조회
    const maxOrderSnapshot = await db.collection('web_faq')
      .orderBy('order', 'desc')
      .limit(1)
      .get();

    const maxOrder = maxOrderSnapshot.empty ? 0 : (maxOrderSnapshot.docs[0].data().order || 0);

    const faqData: Record<string, unknown> = {
      question,
      answer,
      category: category || '일반',
      order: maxOrder + 1,
      visible: true,
      createdAt: new Date(),
      createdBy: admin.adminId,
      updatedAt: new Date(),
      updatedBy: admin.adminId,
    };

    // 하위 카테고리가 있는 경우에만 추가
    if (subcategory) {
      faqData.subcategory = subcategory;
    }

    const docRef = await db.collection('web_faq').add(faqData);

    // 관리자 로그 기록
    await addAdminLog(db, admin, {
      action: 'faq_create',
      faqId: docRef.id,
      details: {
        question,
        category: category || '일반',
      },
    });

    return NextResponse.json({
      success: true,
      id: docRef.id,
      message: 'FAQ가 추가되었습니다.',
    });
  } catch (error) {
    console.error('Create FAQ error:', error);
    return NextResponse.json(
      { error: 'FAQ를 추가하는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
