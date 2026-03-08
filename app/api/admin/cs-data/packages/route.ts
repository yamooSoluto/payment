import { NextRequest, NextResponse } from 'next/server';
import { getAdminFromRequest, hasPermission } from '@/lib/admin-auth';
import { initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { addAdminLog } from '@/lib/admin-log';

// ═══════════════════════════════════════════════════════════
// 패키지 관리 API — GET(목록) + POST(생성)
// Firestore: admin/cs-data/packages/{packageId}
// ═══════════════════════════════════════════════════════════

// GET: 패키지 목록 조회
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

    const full = request.nextUrl.searchParams.get('full') === 'true';
    const snapshot = await db.collection('admin').doc('cs-data').collection('packages').get();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const packages = snapshot.docs.map((doc: any) => {
      const data = doc.data();
      return {
        id: doc.id,
        name: data.name || '',
        description: data.description || '',
        isPublic: data.isPublic || false,
        provisionMode: data.provisionMode || 'manual',
        requiredTags: data.requiredTags || [],
        createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() || null,
        createdBy: data.createdBy || '',
        ...(full ? {
          faqTemplates: data.faqTemplates || [],
          appliedTenants: data.appliedTenants || [],
        } : {
          faqCount: (data.faqTemplates || []).length,
          appliedTenantCount: (data.appliedTenants || []).length,
        }),
      };
    });

    // 최신순 정렬
    packages.sort((a: any, b: any) => {
      if (!a.updatedAt || !b.updatedAt) return 0;
      return b.updatedAt.localeCompare(a.updatedAt);
    });

    return NextResponse.json({ packages });
  } catch (error: any) {
    console.error('[packages GET]', error);
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
  }
}

// POST: 패키지 생성
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
    const { name, description } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    const now = new Date();
    const packageData = {
      name: name.trim(),
      description: (description || '').trim(),
      isPublic: body.isPublic || false,
      requiredTags: Array.isArray(body.requiredTags) ? body.requiredTags : [],
      faqTemplates: [],
      appliedTenants: [],
      createdAt: now,
      updatedAt: now,
      createdBy: admin.adminId,
    };

    const docRef = await db.collection('admin').doc('cs-data').collection('packages').add(packageData);

    await addAdminLog(db, admin, {
      action: 'faq_create',
      details: {
        type: 'package_create',
        packageId: docRef.id,
        name: packageData.name,
      },
    });

    return NextResponse.json({
      id: docRef.id,
      ...packageData,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
  } catch (error: any) {
    console.error('[packages POST]', error);
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
  }
}