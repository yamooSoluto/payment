import { NextRequest, NextResponse } from 'next/server';
import { getAdminFromRequest, hasPermission } from '@/lib/admin-auth';
import { initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { addAdminLog } from '@/lib/admin-log';

// ═══════════════════════════════════════════════════════════
// 규정 개별 API — PATCH(수정) + DELETE(삭제)
// ═════════════════════════���═════════════════════════════════

// PATCH: 규정 수정
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ ruleId: string }> }
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

    const { ruleId } = await params;
    const body = await request.json();
    const { label, content, platform, store, syncLinkedFaqs } = body;

    const rulesRef = db.collection('admin').doc('cs-data').collection('rules');
    const ruleDoc = await rulesRef.doc(ruleId).get();
    if (!ruleDoc.exists) {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
    }

    const prevData = ruleDoc.data()!;

    // 업데이트할 필드만 수집
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updates: Record<string, any> = { updatedAt: new Date() };
    if (label !== undefined) updates.label = label;
    if (content !== undefined) updates.content = content;
    if (platform !== undefined) updates.platform = platform;
    if (store !== undefined) updates.store = store;

    await rulesRef.doc(ruleId).update(updates);

    // 참조 FAQ keyData 일괄 업데이트
    let syncedFaqs = 0;
    if (syncLinkedFaqs && content !== undefined && content !== prevData.content) {
      const linkedFaqIds: string[] = prevData.linkedFaqIds || [];
      const prevContent = prevData.content || '';

      for (const faqRef of linkedFaqIds) {
        // faqRef 형식: "tenantId/faqId"
        const [tenantId, faqId] = faqRef.split('/');
        if (!tenantId || !faqId) continue;

        try {
          const faqDocRef = db.collection('tenants').doc(tenantId).collection('faqs').doc(faqId);
          const faqDoc = await faqDocRef.get();
          if (!faqDoc.exists) continue;

          const faqData = faqDoc.data()!;
          const oldKeyData = faqData.keyData || '';
          const newKeyData = oldKeyData.replace(prevContent, content);

          if (newKeyData !== oldKeyData) {
            await faqDocRef.update({
              keyData: newKeyData,
              updatedAt: Date.now(),
              vectorStatus: 'pending',
            });
            syncedFaqs++;
          }
        } catch (err) {
          console.warn(`[rules PATCH] Failed to sync FAQ ${faqRef}:`, err);
        }
      }
    }

    // 로그
    await addAdminLog(db, admin, {
      action: 'faq_update',
      details: {
        type: 'rule_update',
        ruleId,
        syncedFaqs,
        changes: Object.keys(updates).filter(k => k !== 'updatedAt'),
      },
    });

    const updatedDoc = await rulesRef.doc(ruleId).get();
    const updatedData = updatedDoc.data()!;

    return NextResponse.json({
      rule: {
        id: ruleId,
        platform: updatedData.platform || '-',
        store: updatedData.store || ['공통'],
        label: updatedData.label,
        content: updatedData.content,
        linkedFaqIds: updatedData.linkedFaqIds || [],
        linkedPackageIds: updatedData.linkedPackageIds || [],
        createdAt: updatedData.createdAt?.toDate?.()?.toISOString() || null,
        updatedAt: updatedData.updatedAt?.toDate?.()?.toISOString() || null,
        createdBy: updatedData.createdBy || '',
      },
      syncedFaqs,
    });
  } catch (error: any) {
    console.error('[rules PATCH]', error);
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
  }
}

// DELETE: 규정 삭제
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ ruleId: string }> }
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

    const { ruleId } = await params;
    const { searchParams } = new URL(request.url);
    const force = searchParams.get('force') === 'true';

    const rulesRef = db.collection('admin').doc('cs-data').collection('rules');
    const ruleDoc = await rulesRef.doc(ruleId).get();
    if (!ruleDoc.exists) {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
    }

    const ruleData = ruleDoc.data()!;
    const linkedFaqIds: string[] = ruleData.linkedFaqIds || [];

    // 참조 중인 FAQ가 있으면 경고
    if (linkedFaqIds.length > 0 && !force) {
      return NextResponse.json({
        error: 'Rule is referenced by FAQs',
        linkedFaqCount: linkedFaqIds.length,
        linkedFaqIds,
        hint: 'Use ?force=true to delete anyway',
      }, { status: 409 });
    }

    // 강제 삭제 시 참조 FAQ의 keyDataRefs에서 제거
    let orphanedFaqs = 0;
    if (force && linkedFaqIds.length > 0) {
      for (const faqRef of linkedFaqIds) {
        const [tenantId, faqId] = faqRef.split('/');
        if (!tenantId || !faqId) continue;
        try {
          const faqDocRef = db.collection('tenants').doc(tenantId).collection('faqs').doc(faqId);
          const faqDoc = await faqDocRef.get();
          if (!faqDoc.exists) continue;
          const faqData = faqDoc.data()!;
          const refs: string[] = faqData.keyDataRefs || [];
          const filtered = refs.filter((r: string) => r !== ruleId);
          await faqDocRef.update({ keyDataRefs: filtered, updatedAt: Date.now() });
          orphanedFaqs++;
        } catch (err) {
          console.warn(`[rules DELETE] Failed to unlink FAQ ${faqRef}:`, err);
        }
      }
    }

    await rulesRef.doc(ruleId).delete();

    // 로그
    await addAdminLog(db, admin, {
      action: 'faq_delete',
      details: {
        type: 'rule_delete',
        ruleId,
        label: ruleData.label,
        orphanedFaqs,
      },
    });

    return NextResponse.json({ deleted: true, orphanedFaqs });
  } catch (error: any) {
    console.error('[rules DELETE]', error);
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
  }
}