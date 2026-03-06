import { NextRequest, NextResponse } from 'next/server';
import { getAdminFromRequest, hasPermission } from '@/lib/admin-auth';
import { initializeFirebaseAdmin } from '@/lib/firebase-admin';

// ═══════════════════════════════════════════════════════════
// CS 데이터 설정 API — 플랫폼 목록 등
// Firestore: admin/cs-data (규정 subcollection의 부모 문서)
// ═══════════════════════════════════════════════════════════

const DOC_PATH = 'admin/cs-data';

// GET: 설정 조회
export async function GET(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!hasPermission(admin, 'tenants:read')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const db = initializeFirebaseAdmin();
    if (!db) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
    }

    const doc = await db.doc(DOC_PATH).get();
    const data = doc.exists ? doc.data()! : {};

    return NextResponse.json({
      platforms: data.platforms || ['스터디모아', '네이버예약'],
      services: data.services || ['좌석', '룸', '락커', '매점', '프린터'],
      customRequests: data.customRequests || [],
      ruleCategories: data.ruleCategories || [],
    });
  } catch (error: any) {
    console.error('[cs-data settings GET]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH: 설정 수정
export async function PATCH(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!hasPermission(admin, 'tenants:write')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const db = initializeFirebaseAdmin();
    if (!db) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
    }

    const body = await request.json();
    const updates: Record<string, any> = {};

    if (Array.isArray(body.platforms)) {
      updates.platforms = body.platforms.filter((p: any) => typeof p === 'string' && p.trim());
    }

    if (Array.isArray(body.services)) {
      updates.services = body.services.filter((s: any) => typeof s === 'string' && s.trim());
    }

    // 커스텀 요청 제거 (승격 또는 무시 시)
    if (Array.isArray(body.customRequests)) {
      updates.customRequests = body.customRequests;
    }

    // 규정 분류 옵션
    if (Array.isArray(body.ruleCategories)) {
      updates.ruleCategories = body.ruleCategories.filter((c: any) => typeof c === 'string' && c.trim());
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields' }, { status: 400 });
    }

    updates.updatedAt = new Date();
    await db.doc(DOC_PATH).set(updates, { merge: true });

    return NextResponse.json({ success: true, ...updates });
  } catch (error: any) {
    console.error('[cs-data settings PATCH]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}