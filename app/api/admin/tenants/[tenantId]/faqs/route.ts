import { NextRequest, NextResponse } from 'next/server';
import { getAdminFromRequest, hasPermission } from '@/lib/admin-auth';
import { initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { addAdminLog } from '@/lib/admin-log';

// ═══════════════════════════════════════════════════════════
// 개별 테넌트 FAQ CRUD API
// tenants/{tenantId}/faqs 서브컬렉션 관리
// ═══════════════════════════════════════════════════════════

interface RouteContext {
  params: Promise<{ tenantId: string }>;
}

// GET: 테넌트 FAQ 목록 조회
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const admin = await getAdminFromRequest(request);
    const { tenantId } = await context.params;

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

    // 테넌트 존재 확인
    const tenantDoc = await db.collection('tenants').doc(tenantId).get();
    if (!tenantDoc.exists) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    // FAQ 목록 조회
    const faqsSnapshot = await db.collection('tenants').doc(tenantId)
      .collection('faqs')
      .orderBy('createdAt', 'desc')
      .get();

    const faqs = faqsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate?.() || doc.data().createdAt,
      updatedAt: doc.data().updatedAt?.toDate?.() || doc.data().updatedAt,
    }));

    return NextResponse.json({
      success: true,
      faqs,
      count: faqs.length,
    });

  } catch (error) {
    console.error('Get tenant FAQs error:', error);
    return NextResponse.json(
      { error: 'FAQ 목록을 불러오는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// POST: 수동 벡터 동기화 트리거
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const admin = await getAdminFromRequest(request);
    const { tenantId } = await context.params;

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
    const { action, templateId } = body;

    // 테넌트 데이터 조회
    const tenantRef = db.collection('tenants').doc(tenantId);
    const tenantDoc = await tenantRef.get();

    if (!tenantDoc.exists) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    // criteriaSheet 데이터 조회
    const criteriaDoc = await tenantRef.collection('criteria').doc('sheets').get();
    const criteriaData = criteriaDoc.exists ? criteriaDoc.data() : {};

    if (action === 'sync_all' || action === 'sync_template') {
      // datapage의 syncVectorTemplates API 호출
      const datapageUrl = process.env.NEXT_PUBLIC_DATAPAGE_URL || 'http://localhost:3001';

      const syncResponse = await fetch(`${datapageUrl}/api/vector-templates/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          templateId: action === 'sync_template' ? templateId : undefined,
          criteriaSheetData: criteriaData,
        }),
      });

      if (!syncResponse.ok) {
        const errorData = await syncResponse.json();
        return NextResponse.json(
          { error: errorData.error || 'Sync failed' },
          { status: syncResponse.status }
        );
      }

      const syncResult = await syncResponse.json();

      // 관리자 로그
      await addAdminLog(db, admin, {
        action: 'tenant_faq_sync',
        tenantId,
        details: {
          syncType: action,
          ...(templateId ? { templateId } : {}),
          result: syncResult,
        },
      });

      return NextResponse.json({
        success: true,
        message: action === 'sync_all' ? '전체 동기화 완료' : '템플릿 동기화 완료',
        result: syncResult,
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

  } catch (error) {
    console.error('Tenant FAQ sync error:', error);
    return NextResponse.json(
      { error: '동기화 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// PATCH: FAQ 수정
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const admin = await getAdminFromRequest(request);
    const { tenantId } = await context.params;

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
    const { faqId, updates } = body;

    if (!faqId) {
      return NextResponse.json({ error: 'faqId is required' }, { status: 400 });
    }

    const faqRef = db.collection('tenants').doc(tenantId).collection('faqs').doc(faqId);
    const faqDoc = await faqRef.get();

    if (!faqDoc.exists) {
      return NextResponse.json({ error: 'FAQ not found' }, { status: 404 });
    }

    // 허용된 필드만 업데이트
    const allowedFields = ['questions', 'answer', 'guide', 'keyData', 'handlerType', 'handler', 'rule', 'tags', 'topic', 'tag_actions', 'isActive'];
    const filteredUpdates: Record<string, any> = {};

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        filteredUpdates[field] = updates[field];
      }
    }

    filteredUpdates.updatedAt = Date.now();
    filteredUpdates.updatedBy = admin.adminId;
    filteredUpdates.vectorStatus = 'pending';  // 재동기화 필요 표시

    await faqRef.update(filteredUpdates);

    // Weaviate 재동기화 트리거 (datapage API 호출)
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
          rule: filteredUpdates.rule ?? existingData.rule ?? '',
          handlerType: filteredUpdates.handlerType || existingData.handlerType || 'bot',
          tags: filteredUpdates.tags || existingData.tags || [],
        };

        const syncRes = await fetch(`${datapageUrl}/api/vector/upsert`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(syncPayload),
        });

        if (syncRes.ok) {
          await faqRef.update({ vectorStatus: 'synced' });
          console.log(`[admin/faqs] Weaviate sync success: ${faqId}`);
        } else {
          console.warn(`[admin/faqs] Weaviate sync failed for ${faqId}`);
        }
      } catch (syncErr) {
        console.warn(`[admin/faqs] Weaviate sync error:`, syncErr);
      }
    }

    // 관리자 로그
    await addAdminLog(db, admin, {
      action: 'tenant_faq_update',
      tenantId,
      details: { faqId, updates: filteredUpdates },
    });

    return NextResponse.json({
      success: true,
      message: 'FAQ가 수정되었습니다.',
    });

  } catch (error) {
    console.error('Update tenant FAQ error:', error);
    return NextResponse.json(
      { error: 'FAQ 수정 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// DELETE: FAQ 삭제 (soft delete)
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const admin = await getAdminFromRequest(request);
    const { tenantId } = await context.params;

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

    const { searchParams } = new URL(request.url);
    const faqId = searchParams.get('faqId');

    if (!faqId) {
      return NextResponse.json({ error: 'faqId is required' }, { status: 400 });
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

    // Weaviate에서 벡터 삭제
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
        console.log(`[admin/faqs] Weaviate delete success: ${faqId}`);
      } catch (deleteErr) {
        console.warn(`[admin/faqs] Weaviate delete error:`, deleteErr);
      }
    }

    // 관리자 로그
    await addAdminLog(db, admin, {
      action: 'tenant_faq_delete',
      tenantId,
      details: { faqId },
    });

    return NextResponse.json({
      success: true,
      message: 'FAQ가 삭제되었습니다.',
    });

  } catch (error) {
    console.error('Delete tenant FAQ error:', error);
    return NextResponse.json(
      { error: 'FAQ 삭제 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}