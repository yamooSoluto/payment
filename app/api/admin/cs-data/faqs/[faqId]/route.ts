import { NextRequest, NextResponse } from 'next/server';
import { getAdminFromRequest, hasPermission } from '@/lib/admin-auth';
import { initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { addAdminLog } from '@/lib/admin-log';

// ═══════════════════════════════════════════════════════════
// 개별 FAQ 수정/삭제 API
// tenantId는 query parameter로 수신: ?tenantId=xxx
// ═══════════════════════════════════════════════════════════

interface RouteContext {
  params: Promise<{ faqId: string }>;
}

// PATCH: FAQ 수정 + Weaviate 동기화
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const admin = await getAdminFromRequest(request);
    const { faqId } = await context.params;

    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!hasPermission(admin, 'tenants:write')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get('tenantId');
    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId query parameter is required' }, { status: 400 });
    }

    const db = initializeFirebaseAdmin();
    if (!db) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
    }

    const body = await request.json();
    const { updates } = body;

    if (!updates || typeof updates !== 'object') {
      return NextResponse.json({ error: 'updates is required' }, { status: 400 });
    }

    const faqRef = db.collection('tenants').doc(tenantId).collection('faqs').doc(faqId);
    const faqDoc = await faqRef.get();

    if (!faqDoc.exists) {
      return NextResponse.json({ error: 'FAQ not found' }, { status: 404 });
    }

    // 허용된 필드만 업데이트
    const allowedFields = [
      'questions', 'answer', 'guide', 'keyData', 'handlerType', 'handler',
      'rule', 'tags', 'topic', 'tag_actions', 'action_product', 'action', 'isActive',
    ];
    const filteredUpdates: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        filteredUpdates[field] = updates[field];
      }
    }

    filteredUpdates.updatedAt = Date.now();
    filteredUpdates.updatedBy = admin.adminId;
    filteredUpdates.vectorStatus = 'pending';

    await faqRef.update(filteredUpdates);

    // Weaviate 재동기화
    const existingData = faqDoc.data();
    if (existingData?.vectorUuid) {
      try {
        const datapageUrl = process.env.NEXT_PUBLIC_DATAPAGE_URL || 'http://localhost:3001';
        const syncPayload = {
          tenantId,
          vectorUuid: existingData.vectorUuid,
          questions: filteredUpdates.questions || existingData.questions,
          answer: filteredUpdates.answer || existingData.answer,
          guide: filteredUpdates.guide ?? existingData.guide ?? '',
          keyData: existingData.keyData || '',
          topic: filteredUpdates.topic ?? existingData.topic ?? '',
          rule: filteredUpdates.rule ?? existingData.rule ?? '',
          handlerType: filteredUpdates.handlerType || existingData.handlerType || 'bot',
          handler: filteredUpdates.handler || existingData.handler || 'bot',
          tags: filteredUpdates.tags || existingData.tags || [],
          action_product: filteredUpdates.action_product ?? existingData.action_product ?? null,
          action: filteredUpdates.action ?? existingData.action ?? null,
          imageUrls: existingData.imageUrls || [],
        };

        const syncRes = await fetch(`${datapageUrl}/api/vector/upsert`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(syncPayload),
        });

        if (syncRes.ok) {
          await faqRef.update({ vectorStatus: 'synced' });
        } else {
          console.warn(`[cs-data/faqs] Weaviate sync failed for ${faqId}`);
        }
      } catch (syncErr) {
        console.warn(`[cs-data/faqs] Weaviate sync error:`, syncErr);
      }
    }

    await addAdminLog(db, admin, {
      action: 'tenant_faq_update',
      tenantId,
      details: { faqId, updates: filteredUpdates, source: 'cs_data' },
    });

    return NextResponse.json({ success: true, message: 'FAQ가 수정되었습니다.' });

  } catch (error) {
    console.error('Update FAQ error:', error);
    return NextResponse.json(
      { error: 'FAQ 수정 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// DELETE: FAQ 삭제 (soft delete + Weaviate 벡터 삭제)
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const admin = await getAdminFromRequest(request);
    const { faqId } = await context.params;

    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!hasPermission(admin, 'tenants:write')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get('tenantId');
    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId query parameter is required' }, { status: 400 });
    }

    const db = initializeFirebaseAdmin();
    if (!db) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
    }

    const faqRef = db.collection('tenants').doc(tenantId).collection('faqs').doc(faqId);
    const faqDoc = await faqRef.get();

    if (!faqDoc.exists) {
      return NextResponse.json({ error: 'FAQ not found' }, { status: 404 });
    }

    const existingData = faqDoc.data();

    // Soft delete
    await faqRef.update({
      isActive: false,
      deletedAt: Date.now(),
      deletedBy: admin.adminId,
    });

    // Weaviate 벡터 삭제
    if (existingData?.vectorUuid) {
      try {
        const datapageUrl = process.env.NEXT_PUBLIC_DATAPAGE_URL || 'http://localhost:3001';
        await fetch(`${datapageUrl}/api/vector/delete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tenantId,
            vectorUuid: existingData.vectorUuid,
          }),
        });
      } catch (deleteErr) {
        console.warn(`[cs-data/faqs] Weaviate delete error:`, deleteErr);
      }
    }

    await addAdminLog(db, admin, {
      action: 'tenant_faq_delete',
      tenantId,
      details: { faqId, source: 'cs_data' },
    });

    return NextResponse.json({ success: true, message: 'FAQ가 삭제되었습니다.' });

  } catch (error) {
    console.error('Delete FAQ error:', error);
    return NextResponse.json(
      { error: 'FAQ 삭제 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}