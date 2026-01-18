import { NextResponse } from 'next/server';
import { initializeFirebaseAdmin } from '@/lib/firebase-admin';

// GET: 공개 FAQ 목록 조회 (visible: true인 항목만)
export async function GET() {
  try {
    const db = initializeFirebaseAdmin();
    if (!db) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
    }

    const web_faqSnapshot = await db.collection('web_faq')
      .orderBy('order', 'asc')
      .get();

    const web_faqs = web_faqSnapshot.docs
      .filter(doc => doc.data().visible === true)
      .map(doc => ({
        id: doc.id,
        question: doc.data().question,
        answer: doc.data().answer,
        category: doc.data().category,
        subcategory: doc.data().subcategory || null,
      }));

    return NextResponse.json({ web_faqs });
  } catch (error) {
    console.error('Get public FAQ error:', error);
    return NextResponse.json(
      { error: 'FAQ를 불러오는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
