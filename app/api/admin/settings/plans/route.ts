import { NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';

// GET: 플랜 표시 설정 조회
export async function GET() {
  try {
    const db = adminDb || initializeFirebaseAdmin();
    if (!db) {
      return NextResponse.json({ gridCols: 4 });
    }
    const doc = await db.collection('settings').doc('plans').get();

    if (!doc.exists) {
      // 기본값 반환
      return NextResponse.json({
        gridCols: 4,
      });
    }

    return NextResponse.json(doc.data());
  } catch (error) {
    console.error('Failed to fetch plan settings:', error);
    return NextResponse.json(
      { error: '설정을 불러오는데 실패했습니다.' },
      { status: 500 }
    );
  }
}

// PUT: 플랜 표시 설정 저장
export async function PUT(request: Request) {
  try {
    const db = adminDb || initializeFirebaseAdmin();
    if (!db) {
      return NextResponse.json(
        { error: 'Firebase 초기화 실패' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { gridCols } = body;

    if (!gridCols || gridCols < 1 || gridCols > 4) {
      return NextResponse.json(
        { error: '유효하지 않은 그리드 설정입니다.' },
        { status: 400 }
      );
    }

    await db.collection('settings').doc('plans').set(
      {
        gridCols,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to save plan settings:', error);
    return NextResponse.json(
      { error: '설정 저장에 실패했습니다.' },
      { status: 500 }
    );
  }
}
