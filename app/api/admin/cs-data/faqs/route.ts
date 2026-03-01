import { NextRequest, NextResponse } from 'next/server';
import { getAdminFromRequest, hasPermission } from '@/lib/admin-auth';
import { initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { addAdminLog } from '@/lib/admin-log';

// ═══════════════════════════════════════════════════════════
// 전체 매장 FAQ 관리 API (collectionGroup 기반)
// ═══════════════════════════════════════════════════════════

// GET: 전체 매장 FAQ 조회 (커서 기반 페이지네이션)
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
    const tenantIdFilter = searchParams.get('tenantId') || '';
    const sourceFilter = searchParams.get('source') || '';
    const topicFilter = searchParams.get('topic') || '';
    const handlerFilter = searchParams.get('handler') || '';
    const searchQuery = searchParams.get('search') || '';
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200);
    const cursor = searchParams.get('cursor') || '';

    // 1. 활성 테넌트 목록 조회 (필터 드롭다운용)
    const tenantsSnapshot = await db.collection('tenants').get();
    const tenantMap = new Map<string, { name: string; branchNo: string | null }>();
    tenantsSnapshot.docs.forEach(doc => {
      const data = doc.data();
      if (data.status !== 'deleted') {
        tenantMap.set(doc.id, {
          name: data.brandName || data.name || doc.id,
          branchNo: data.branchNo != null ? String(data.branchNo) : null,
        });
      }
    });

    // 2. collectionGroup 쿼리 구성 (복합 인덱스: isActive ASC + updatedAt DESC)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any = db.collectionGroup('faqs')
      .where('isActive', '!=', false)
      .orderBy('isActive')
      .orderBy('updatedAt', 'desc');

    // 커서 기반 페이지네이션
    if (cursor) {
      const cursorDate = new Date(cursor);
      query = query.startAfter(true, cursorDate);
    }

    // Firestore에서 넉넉하게 가져오기 (JS 필터 적용 후 limit 맞춤)
    // source/topic/handler/search는 JS에서 필터
    const fetchLimit = searchQuery || sourceFilter || topicFilter || handlerFilter || tenantIdFilter
      ? limit * 4
      : limit + 1;

    const snapshot = await query.limit(fetchLimit).get();

    // 3. 결과 매핑 + 필터
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let faqs: any[] = [];

    for (const doc of snapshot.docs) {
      // ref.parent = 'faqs' subcollection, ref.parent.parent = tenant doc
      const tenantId = doc.ref.parent.parent?.id;
      if (!tenantId || !tenantMap.has(tenantId)) continue;

      const tenantInfo = tenantMap.get(tenantId)!;
      const data = doc.data();
      faqs.push({
        id: doc.id,
        tenantId,
        tenantName: tenantInfo.name,
        branchNo: tenantInfo.branchNo,
        ...data,
        createdAt: data.createdAt?.toDate?.() || data.createdAt,
        updatedAt: data.updatedAt?.toDate?.() || data.updatedAt,
        // tags fallback
        tags: (data.tags && data.tags.length > 0) ? data.tags : (data.tag_actions || []),
      });
    }

    // 4. JS 필터 적용
    if (tenantIdFilter) {
      faqs = faqs.filter(f => f.tenantId === tenantIdFilter);
    }
    if (sourceFilter) {
      faqs = faqs.filter(f => (f.source || 'manual') === sourceFilter);
    }
    if (topicFilter) {
      faqs = faqs.filter(f => f.topic === topicFilter);
    }
    if (handlerFilter) {
      if (handlerFilter === 'bot') {
        faqs = faqs.filter(f => !f.handlerType || f.handlerType === 'bot');
      } else {
        faqs = faqs.filter(f => f.handler === handlerFilter);
      }
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      faqs = faqs.filter(f =>
        f.questions?.some((question: string) => question.toLowerCase().includes(q)) ||
        f.answer?.toLowerCase().includes(q) ||
        f.topic?.toLowerCase().includes(q) ||
        f.tenantName?.toLowerCase().includes(q)
      );
    }

    // 5. limit + hasMore 계산
    const hasMore = faqs.length > limit;
    const resultFaqs = faqs.slice(0, limit);
    const lastFaq = resultFaqs[resultFaqs.length - 1];
    const nextCursor = hasMore && lastFaq?.updatedAt
      ? (lastFaq.updatedAt instanceof Date ? lastFaq.updatedAt.toISOString() : new Date(lastFaq.updatedAt).toISOString())
      : null;

    // 6. 테넌트 목록 (드롭다운용)
    const tenants = Array.from(tenantMap.entries()).map(([id, info]) => ({
      tenantId: id,
      brandName: info.name,
      branchNo: info.branchNo,
    }));

    return NextResponse.json({
      success: true,
      faqs: resultFaqs,
      hasMore,
      nextCursor,
      tenants,
    });

  } catch (error) {
    console.error('Get all FAQs error:', error);
    return NextResponse.json(
      { error: 'FAQ 목록을 불러오는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// POST: FAQ 추가 (다중 매장, skipExpander 지원)
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
    const {
      tenantIds,
      questions,
      answer,
      guide,
      topic,
      tags,
      action_product,
      action,
      handlerType,
      skipExpander,
      handler,
      rule,
    } = body;

    if (!tenantIds || !Array.isArray(tenantIds) || tenantIds.length === 0) {
      return NextResponse.json({ error: 'tenantIds is required' }, { status: 400 });
    }
    if (!questions || !Array.isArray(questions) || questions.length === 0) {
      return NextResponse.json({ error: 'questions is required' }, { status: 400 });
    }
    if (!answer) {
      return NextResponse.json({ error: 'answer is required' }, { status: 400 });
    }

    const datapageUrl = process.env.NEXT_PUBLIC_DATAPAGE_URL || 'http://localhost:3001';
    let created = 0;
    let failed = 0;

    const results = await Promise.all(
      tenantIds.map(async (tenantId: string) => {
        try {
          if (skipExpander) {
            // 직접 저장 모드: Firestore에 직접 저장 + Weaviate 동기화
            const vectorUuid = `vec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            const faqData = {
              questions,
              answer,
              guide: guide || '',
              topic: topic || '',
              tags: tags || [],
              tag_actions: tags || [],
              action_product: action_product || null,
              action: action || null,
              handlerType: rule?.trim() ? 'conditional' : (handlerType || 'bot'),
              handler: handler || (handlerType === 'staff' ? 'op' : 'bot'),
              rule: rule || '',
              isActive: true,
              vectorStatus: 'pending' as const,
              vectorUuid,
              source: 'manual',
              createdAt: Date.now(),
              updatedAt: Date.now(),
              createdBy: admin.adminId,
            };

            const faqRef = await db.collection('tenants').doc(tenantId).collection('faqs').add(faqData);

            // Weaviate 동기화
            try {
              const syncRes = await fetch(`${datapageUrl}/api/vector/upsert`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  tenantId,
                  vectorUuid,
                  questions,
                  answer,
                  guide: guide || '',
                  keyData: '',
                  topic: topic || '',
                  rule: rule || '',
                  handlerType: faqData.handlerType,
                  handler: faqData.handler,
                  tags: tags || [],
                  action_product: action_product || null,
                  action: action || null,
                  imageUrls: [],
                }),
              });
              if (syncRes.ok) {
                await faqRef.update({ vectorStatus: 'synced' });
              }
            } catch {
              // Weaviate 동기화 실패는 기록만
              console.warn(`[cs-data/faqs] Weaviate sync failed for tenant ${tenantId}`);
            }
          } else {
            // faqExpander 경유 모드: datapage API 호출
            const addFaqRes = await fetch(`${datapageUrl}/api/data/add-faq`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                tenantId,
                questions,
                answer,
                guide: guide || '',
                handlerType: handlerType || 'bot',
                topic: topic || '',
                tags: tags || [],
                action_product: action_product || null,
                action: action || null,
              }),
            });

            if (!addFaqRes.ok) {
              throw new Error(`datapage add-faq failed: ${addFaqRes.status}`);
            }
          }
          return { tenantId, success: true };
        } catch (err) {
          console.error(`FAQ creation failed for tenant ${tenantId}:`, err);
          return { tenantId, success: false };
        }
      })
    );

    created = results.filter(r => r.success).length;
    failed = results.filter(r => !r.success).length;

    // 관리자 로그
    await addAdminLog(db, admin, {
      action: 'tenant_faq_update',
      details: {
        type: 'cs_data_bulk_create',
        tenantIds,
        created,
        failed,
        skipExpander: !!skipExpander,
      },
    });

    return NextResponse.json({
      success: true,
      created,
      failed,
      message: `${created}개 매장에 FAQ 등록 완료${failed > 0 ? ` (${failed}개 실패)` : ''}`,
    });

  } catch (error) {
    console.error('Create FAQs error:', error);
    return NextResponse.json(
      { error: 'FAQ 등록 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}