import { NextRequest, NextResponse } from 'next/server';
import { getAdminFromRequest, hasPermission } from '@/lib/admin-auth';
import { initializeFirebaseAdmin } from '@/lib/firebase-admin';

// ═══════════════════════════════════════════════════════════
// 동의어 사전 API
// Firestore: admin/cs-data  →  synonymDict 필드
// ═══════════════════════════════════════════════════════════

const DOC_PATH = 'admin/cs-data';

// GET: 동의어 사전 조회
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
      dict: data.synonymDict || {},
      updatedAt: data.synonymDictUpdatedAt?.toDate?.()?.toISOString?.() || null,
    });
  } catch (error: any) {
    console.error('[synonyms GET]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH: 동의어 사전 전체 교체
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
    if (!body.dict || typeof body.dict !== 'object') {
      return NextResponse.json({ error: 'dict is required and must be an object' }, { status: 400 });
    }

    // Validate: each value must be string[]
    const cleanDict: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(body.dict)) {
      const k = String(key).trim();
      if (!k) continue;
      if (!Array.isArray(value)) continue;
      const filtered = (value as any[])
        .map((v: any) => String(v).trim())
        .filter(Boolean);
      if (filtered.length > 0) {
        cleanDict[k] = filtered;
      }
    }

    await db.doc(DOC_PATH).set({
      synonymDict: cleanDict,
      synonymDictUpdatedAt: new Date(),
    }, { merge: true });

    return NextResponse.json({ success: true, dict: cleanDict });
  } catch (error: any) {
    console.error('[synonyms PATCH]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}