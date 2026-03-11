import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { getAdminFromRequest } from '@/lib/admin-auth';

/**
 * Slack 연동 신청 조회/상태 변경
 * GET ?tenantId=xxx  → 특정 테넌트 신청 조회
 * GET               → 전체 pending 신청 목록
 * PATCH             → 상태 변경 { tenantId, status }
 */
export async function GET(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const db = adminDb || initializeFirebaseAdmin();
    if (!db) return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });

    const tenantId = request.nextUrl.searchParams.get('tenantId');

    if (tenantId) {
      const doc = await db.collection('slack_requests').doc(tenantId).get();
      return NextResponse.json({ request: doc.exists ? doc.data() : null });
    }

    // 전체 신청 목록 (pending/processing만)
    const snap = await db.collection('slack_requests')
      .where('status', 'in', ['pending', 'processing'])
      .orderBy('requestedAt', 'desc')
      .get();

    const requests = snap.docs.map(doc => ({
      tenantId: doc.id,
      ...doc.data(),
      requestedAt: doc.data().requestedAt?.toDate?.()?.toISOString() || null,
    }));

    return NextResponse.json({ requests });
  } catch (error) {
    console.error('[slack-requests] GET error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const db = adminDb || initializeFirebaseAdmin();
    if (!db) return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });

    const { tenantId, status } = await request.json();

    if (!tenantId || !['pending', 'processing', 'done'].includes(status)) {
      return NextResponse.json({ error: 'tenantId and valid status required' }, { status: 400 });
    }

    await db.collection('slack_requests').doc(tenantId).update({
      status,
      updatedAt: new Date(),
      updatedBy: admin.loginId || admin.adminId,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[slack-requests] PATCH error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
