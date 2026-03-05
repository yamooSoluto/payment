import { NextRequest, NextResponse } from 'next/server';
import { getAdminFromRequest, hasPermission } from '@/lib/admin-auth';
import { initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { addAdminLog } from '@/lib/admin-log';
import { FieldValue } from 'firebase-admin/firestore';

// ═══════════════════════════════════════════════════════════
// 패키지 개별 API — GET(상세) + PATCH(수정) + DELETE(삭제)
// ═══════════════════════════════════════════════════════════

// GET: 패키지 상세 조회
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ packageId: string }> }
) {
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

    const { packageId } = await params;
    const doc = await db.collection('admin').doc('cs-data').collection('packages').doc(packageId).get();

    if (!doc.exists) {
      return NextResponse.json({ error: 'Package not found' }, { status: 404 });
    }

    const data = doc.data()!;
    return NextResponse.json({
      package: {
        id: doc.id,
        name: data.name || '',
        description: data.description || '',
        isPublic: data.isPublic || false,
        requiredTags: data.requiredTags || [],
        faqTemplates: data.faqTemplates || [],
        appliedTenants: data.appliedTenants || [],
        createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() || null,
        createdBy: data.createdBy || '',
      },
    });
  } catch (error: any) {
    console.error('[packages GET detail]', error);
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
  }
}

// PATCH: 패키지 수정
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ packageId: string }> }
) {
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

    const { packageId } = await params;
    const packagesRef = db.collection('admin').doc('cs-data').collection('packages');
    const packageDoc = await packagesRef.doc(packageId).get();

    if (!packageDoc.exists) {
      return NextResponse.json({ error: 'Package not found' }, { status: 404 });
    }

    const prevData = packageDoc.data()!;
    const body = await request.json();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updates: Record<string, any> = { updatedAt: new Date() };
    if (body.name !== undefined) updates.name = body.name.trim();
    if (body.description !== undefined) updates.description = body.description.trim();
    if (body.faqTemplates !== undefined) updates.faqTemplates = body.faqTemplates;
    if (body.isPublic !== undefined) updates.isPublic = !!body.isPublic;
    if (body.requiredTags !== undefined) updates.requiredTags = Array.isArray(body.requiredTags) ? body.requiredTags : [];

    // 규정 역참조 업데이트: faqTemplates 변경 시 keyDataRefs diff 계산
    if (body.faqTemplates !== undefined) {
      const prevRuleIds = new Set<string>();
      const newRuleIds = new Set<string>();

      (prevData.faqTemplates || []).forEach((ft: any) => {
        (ft.keyDataRefs || []).forEach((r: string) => prevRuleIds.add(r));
      });
      body.faqTemplates.forEach((ft: any) => {
        (ft.keyDataRefs || []).forEach((r: string) => newRuleIds.add(r));
      });

      const rulesRef = db.collection('admin').doc('cs-data').collection('rules');

      // 추가된 ruleId → linkedPackageIds에 packageId 추가
      for (const ruleId of newRuleIds) {
        if (!prevRuleIds.has(ruleId)) {
          try {
            await rulesRef.doc(ruleId).update({
              linkedPackageIds: FieldValue.arrayUnion(packageId),
            });
          } catch (err) {
            console.warn(`[packages PATCH] Failed to add linkedPackageId to rule ${ruleId}:`, err);
          }
        }
      }

      // 제거된 ruleId → linkedPackageIds에서 packageId 제거
      for (const ruleId of prevRuleIds) {
        if (!newRuleIds.has(ruleId)) {
          try {
            await rulesRef.doc(ruleId).update({
              linkedPackageIds: FieldValue.arrayRemove(packageId),
            });
          } catch (err) {
            console.warn(`[packages PATCH] Failed to remove linkedPackageId from rule ${ruleId}:`, err);
          }
        }
      }
    }

    await packagesRef.doc(packageId).update(updates);

    await addAdminLog(db, admin, {
      action: 'faq_update',
      details: {
        type: 'package_update',
        packageId,
        changes: Object.keys(updates).filter(k => k !== 'updatedAt'),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[packages PATCH]', error);
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
  }
}

// DELETE: 패키지 삭제
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ packageId: string }> }
) {
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

    const { packageId } = await params;
    const { searchParams } = new URL(request.url);
    const force = searchParams.get('force') === 'true';

    const packagesRef = db.collection('admin').doc('cs-data').collection('packages');
    const packageDoc = await packagesRef.doc(packageId).get();

    if (!packageDoc.exists) {
      return NextResponse.json({ error: 'Package not found' }, { status: 404 });
    }

    const data = packageDoc.data()!;
    const appliedTenants = data.appliedTenants || [];

    if (appliedTenants.length > 0 && !force) {
      return NextResponse.json({
        error: 'Package is applied to tenants',
        appliedTenantCount: appliedTenants.length,
        hint: 'Use ?force=true to delete anyway',
      }, { status: 409 });
    }

    // 규정의 linkedPackageIds에서 제거
    const allRuleIds = new Set<string>();
    (data.faqTemplates || []).forEach((ft: any) => {
      (ft.keyDataRefs || []).forEach((r: string) => allRuleIds.add(r));
    });

    const rulesRef = db.collection('admin').doc('cs-data').collection('rules');
    for (const ruleId of allRuleIds) {
      try {
        await rulesRef.doc(ruleId).update({
          linkedPackageIds: FieldValue.arrayRemove(packageId),
        });
      } catch (err) {
        console.warn(`[packages DELETE] Failed to unlink rule ${ruleId}:`, err);
      }
    }

    await packagesRef.doc(packageId).delete();

    await addAdminLog(db, admin, {
      action: 'faq_delete',
      details: {
        type: 'package_delete',
        packageId,
        name: data.name,
        force,
      },
    });

    return NextResponse.json({ deleted: true });
  } catch (error: any) {
    console.error('[packages DELETE]', error);
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
  }
}