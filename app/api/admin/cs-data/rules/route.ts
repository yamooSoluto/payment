import { NextRequest, NextResponse } from 'next/server';
import { getAdminFromRequest, hasPermission } from '@/lib/admin-auth';
import { initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { addAdminLog } from '@/lib/admin-log';

// ═══════════════════════════════════════════════════════════
// 규정 관리 API — GET(전체 조회) + POST(추가)
// Firestore: admin/cs-data/rules/{ruleId}
// ═══════════════════════════════════════════════════════════

// GET: 전체 규정 조회
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

    const { searchParams } = new URL(request.url);
    const platformFilter = searchParams.get('platform') || '';
    const storeFilter = searchParams.get('store') || '';
    const searchQuery = searchParams.get('search') || '';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any = db.collection('admin').doc('cs-data').collection('rules');

    if (platformFilter) {
      query = query.where('platform', '==', platformFilter);
    }

    const snapshot = await query.get();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let rules: any[] = snapshot.docs.map((doc: any) => {
      const data = doc.data();
      return {
        id: doc.id,
        platform: data.platform || '-',
        store: data.store || ['공통'],
        label: data.label || '',
        content: data.content || '',
        linkedFaqIds: data.linkedFaqIds || [],
        linkedPackageIds: data.linkedPackageIds || [],
        createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() || null,
        createdBy: data.createdBy || '',
      };
    });

    // JS 필터: 매장
    if (storeFilter) {
      rules = rules.filter((r: any) => r.store.includes(storeFilter));
    }

    // JS ���렬: 플랫폼 → 라벨
    rules.sort((a: any, b: any) => a.platform.localeCompare(b.platform) || a.label.localeCompare(b.label));

    // JS 필터: 텍스트 검색
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      rules = rules.filter((r: any) =>
        r.label.toLowerCase().includes(q) ||
        r.content.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q)
      );
    }

    return NextResponse.json({ rules, total: rules.length });
  } catch (error: any) {
    console.error('[rules GET]', error);
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
  }
}

// POST: 규정 추가
export async function POST(request: NextRequest) {
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
    const { id, platform, store, label, content } = body;

    // 유효성 검증
    if (!id || !label || !content) {
      return NextResponse.json({ error: 'id, label, content are required' }, { status: 400 });
    }
    if (!id.startsWith('rule_')) {
      return NextResponse.json({ error: 'ID must start with rule_' }, { status: 400 });
    }

    // 중복 체크
    const rulesRef = db.collection('admin').doc('cs-data').collection('rules');
    const existing = await rulesRef.doc(id).get();
    if (existing.exists) {
      return NextResponse.json({ error: `ID already exists: ${id}` }, { status: 409 });
    }

    const now = new Date();
    const ruleData = {
      platform: platform || '-',
      store: Array.isArray(store) ? store : ['공통'],
      label,
      content,
      linkedFaqIds: [],
      linkedPackageIds: [],
      createdAt: now,
      updatedAt: now,
      createdBy: admin.adminId,
    };

    await rulesRef.doc(id).set(ruleData);

    // 로그
    await addAdminLog(db, admin, {
      action: 'faq_create',
      details: {
        type: 'rule_create',
        ruleId: id,
        label,
      },
    });

    return NextResponse.json({
      rule: {
        id,
        ...ruleData,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
    });
  } catch (error: any) {
    console.error('[rules POST]', error);
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
  }
}