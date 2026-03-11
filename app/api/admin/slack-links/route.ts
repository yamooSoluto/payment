import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { getAdminFromRequest, hasPermission } from '@/lib/admin-auth';

/**
 * 관리자용 Slack 사용자 연결 관리
 * GET  ?tenantId=xxx           → 해당 테넌트의 모든 연결 조회
 * POST  { tenantId, slackUserId, slackDisplayName, portalEmail, portalName }  → 연결 생성/덮어쓰기
 * DELETE { tenantId, slackUserId }  → 연결 해제
 */
export async function GET(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!hasPermission(admin, 'tenants:read')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const db = adminDb || initializeFirebaseAdmin();
    if (!db) return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });

    const tenantId = request.nextUrl.searchParams.get('tenantId');
    if (!tenantId) return NextResponse.json({ error: 'tenantId 필수' }, { status: 400 });

    const snap = await db.collection('slack_user_links')
      .where('tenantId', '==', tenantId)
      .get();

    const links: Record<string, { portalEmail: string; portalName: string | null; slackDisplayName: string | null; linkedAt: string | null }> = {};
    snap.forEach(doc => {
      const d = doc.data();
      links[d.slackUserId] = {
        portalEmail: d.portalEmail,
        portalName: d.portalName || null,
        slackDisplayName: d.slackDisplayName || null,
        linkedAt: d.linkedAt?.toDate?.()?.toISOString() || null,
      };
    });

    return NextResponse.json({ links });
  } catch (error) {
    console.error('[slack-links] GET error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!hasPermission(admin, 'tenants:write')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const db = adminDb || initializeFirebaseAdmin();
    if (!db) return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });

    const { tenantId, slackUserId, slackDisplayName, portalEmail, portalName } = await request.json();
    if (!tenantId || !slackUserId || !portalEmail) {
      return NextResponse.json({ error: 'tenantId, slackUserId, portalEmail 필수' }, { status: 400 });
    }

    const docId = `${tenantId}_${slackUserId}`;

    // 같은 portalEmail로 이미 다른 Slack 계정에 연결되어 있으면 해제
    const existing = await db.collection('slack_user_links')
      .where('tenantId', '==', tenantId)
      .where('portalEmail', '==', portalEmail)
      .get();

    const batch = db.batch();
    existing.forEach(doc => {
      if (doc.id !== docId) batch.delete(doc.ref);
    });

    batch.set(db.collection('slack_user_links').doc(docId), {
      tenantId,
      slackUserId,
      slackDisplayName: slackDisplayName || null,
      portalEmail,
      portalName: portalName || null,
      linkedAt: new Date(),
      linkedBy: admin.loginId || admin.adminId,
    });

    await batch.commit();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[slack-links] POST error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!hasPermission(admin, 'tenants:write')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const db = adminDb || initializeFirebaseAdmin();
    if (!db) return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });

    const { tenantId, slackUserId } = await request.json();
    if (!tenantId || !slackUserId) {
      return NextResponse.json({ error: 'tenantId, slackUserId 필수' }, { status: 400 });
    }

    await db.collection('slack_user_links').doc(`${tenantId}_${slackUserId}`).delete();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[slack-links] DELETE error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
