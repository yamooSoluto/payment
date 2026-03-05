import { NextRequest, NextResponse } from 'next/server';
import { getAdminFromRequest, hasPermission } from '@/lib/admin-auth';
import { initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { addAdminLog } from '@/lib/admin-log';

// ═══════════════════════════════════════════════════════════
// 패키지에서 매장 제거 API
// mode: 'delete' → FAQ soft delete (overridden 제외)
// mode: 'keep'   → FAQ 유지, source를 manual로 전환
// ═══════════════════════════════════════════════════════════

export async function POST(
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
    const body = await request.json();
    const { tenantId, mode } = body;

    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId is required' }, { status: 400 });
    }
    if (!['delete', 'keep'].includes(mode)) {
      return NextResponse.json({ error: 'mode must be "delete" or "keep"' }, { status: 400 });
    }

    // 1. 패키지 로드
    const packagesRef = db.collection('admin').doc('cs-data').collection('packages');
    const packageDoc = await packagesRef.doc(packageId).get();
    if (!packageDoc.exists) {
      return NextResponse.json({ error: 'Package not found' }, { status: 404 });
    }

    const packageData = packageDoc.data()!;
    const datapageUrl = process.env.NEXT_PUBLIC_DATAPAGE_URL || 'http://localhost:3001';

    // 2. 해당 매장의 패키지 FAQ 조회
    const faqsSnapshot = await db.collection('tenants').doc(tenantId).collection('faqs')
      .where('packageId', '==', packageId)
      .where('isActive', '!=', false)
      .get();

    let processed = 0;
    let skippedOverridden = 0;

    for (const doc of faqsSnapshot.docs) {
      const faqData = doc.data();

      if (mode === 'delete') {
        // overridden은 건너뜀
        if (faqData.overridden) {
          skippedOverridden++;
          continue;
        }
        // soft delete
        await doc.ref.update({
          isActive: false,
          deletedAt: Date.now(),
          deletedBy: admin.adminId,
        });
        // Weaviate에서 삭제
        if (faqData.vectorUuid) {
          try {
            await fetch(`${datapageUrl}/api/vector/delete`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                tenantId,
                vectorUuid: faqData.vectorUuid,
              }),
            });
          } catch { /* ignore */ }
        }
      } else {
        // mode === 'keep': source를 manual로 전환
        await doc.ref.update({
          source: 'manual',
          packageId: null,
          packageFaqId: null,
          overridden: false,
          updatedAt: Date.now(),
          updatedBy: admin.adminId,
        });
      }
      processed++;
    }

    // 3. 패키지의 appliedTenants에서 제거
    const updatedApplied = (packageData.appliedTenants || []).filter(
      (t: any) => t.tenantId !== tenantId
    );
    await packagesRef.doc(packageId).update({
      appliedTenants: updatedApplied,
      updatedAt: new Date(),
    });

    await addAdminLog(db, admin, {
      action: 'faq_delete',
      details: {
        type: 'package_remove_tenant',
        packageId,
        tenantId,
        mode,
        processed,
        skippedOverridden,
      },
    });

    return NextResponse.json({
      success: true,
      mode,
      processed,
      skippedOverridden,
    });
  } catch (error: any) {
    console.error('[package remove-tenant]', error);
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
  }
}