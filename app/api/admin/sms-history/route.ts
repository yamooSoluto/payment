import { NextRequest, NextResponse } from 'next/server';
import { getAdminFromRequest, hasPermission } from '@/lib/admin-auth';
import { initializeFirebaseAdmin } from '@/lib/firebase-admin';

// GET: SMS 발송 내역 조회
export async function GET(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);

    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(admin, 'sms:read')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const db = initializeFirebaseAdmin();
    if (!db) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');

    // 전체 개수 조회
    const countSnapshot = await db.collection('smsHistory').count().get();
    const total = countSnapshot.data().count;

    // 페이지네이션된 데이터 조회
    const offset = (page - 1) * limit;
    const historySnapshot = await db.collection('smsHistory')
      .orderBy('sentAt', 'desc')
      .offset(offset)
      .limit(limit)
      .get();

    const history = historySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      sentAt: doc.data().sentAt?.toDate?.()?.toISOString() || null,
      scheduledAt: doc.data().scheduledAt?.toDate?.()?.toISOString() || null,
    }));

    return NextResponse.json({
      history,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('Get SMS history error:', error);
    return NextResponse.json(
      { error: 'SMS 발송 내역을 불러오는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
