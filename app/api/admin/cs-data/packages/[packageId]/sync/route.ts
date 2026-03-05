import { NextRequest, NextResponse } from 'next/server';
import { getAdminFromRequest, hasPermission } from '@/lib/admin-auth';
import { initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { addAdminLog } from '@/lib/admin-log';

// ═══════════════════════════════════════════════════════════
// 패키지 동기화 API — 적용된 매장에 변경사항 전파
// ═══════════════════════════════════════════════════════════

function substituteVars(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

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
    const requestedTenantIds: string[] | undefined = body.tenantIds;

    // 1. 패키지 로드
    const packagesRef = db.collection('admin').doc('cs-data').collection('packages');
    const packageDoc = await packagesRef.doc(packageId).get();
    if (!packageDoc.exists) {
      return NextResponse.json({ error: 'Package not found' }, { status: 404 });
    }

    const packageData = packageDoc.data()!;
    const faqTemplates: any[] = packageData.faqTemplates || [];
    const appliedTenants: any[] = packageData.appliedTenants || [];

    // 동기화 대상 테넌트 결정
    const targetTenants = requestedTenantIds
      ? appliedTenants.filter((t: any) => requestedTenantIds.includes(t.tenantId))
      : appliedTenants;

    if (targetTenants.length === 0) {
      return NextResponse.json({ error: 'No target tenants' }, { status: 400 });
    }

    // 2. 규정 조회
    const allRuleIds = new Set<string>();
    faqTemplates.forEach((ft: any) => {
      (ft.keyDataRefs || []).forEach((r: string) => allRuleIds.add(r));
    });

    const rulesMap = new Map<string, string>();
    if (allRuleIds.size > 0) {
      const rulesRef = db.collection('admin').doc('cs-data').collection('rules');
      for (const ruleId of allRuleIds) {
        try {
          const ruleDoc = await rulesRef.doc(ruleId).get();
          if (ruleDoc.exists) {
            rulesMap.set(ruleId, ruleDoc.data()!.content || '');
          }
        } catch (err) {
          console.warn(`[package sync] Failed to load rule ${ruleId}:`, err);
        }
      }
    }

    const templateIds = new Set(faqTemplates.map((ft: any) => ft.id));
    const datapageUrl = process.env.NEXT_PUBLIC_DATAPAGE_URL || 'http://localhost:3001';
    let synced = 0;
    let created = 0;
    let deleted = 0;
    let skipped = 0;

    // 3. 각 테넌트에 동기화
    for (const tenantInfo of targetTenants) {
      const { tenantId, brandName } = tenantInfo;
      const vars = { brandName };

      // 해당 테넌트의 패키지 FAQ 조회
      const faqsSnapshot = await db.collection('tenants').doc(tenantId).collection('faqs')
        .where('packageId', '==', packageId)
        .where('isActive', '!=', false)
        .get();

      const existingFaqs = new Map<string, { docId: string; data: any }>();
      faqsSnapshot.docs.forEach((doc: any) => {
        const data = doc.data();
        if (data.packageFaqId) {
          existingFaqs.set(data.packageFaqId, { docId: doc.id, data });
        }
      });

      // 3a. 기존 FAQ 업데이트 + 삭제된 템플릿 처리
      for (const [packageFaqId, existing] of existingFaqs) {
        if (!templateIds.has(packageFaqId)) {
          // 패키지에서 삭제된 템플릿 → soft delete
          if (existing.data.overridden) {
            skipped++;
            continue;
          }
          await db.collection('tenants').doc(tenantId).collection('faqs').doc(existing.docId).update({
            isActive: false,
            deletedAt: Date.now(),
            deletedBy: admin.adminId,
          });
          // Weaviate에서도 삭제
          if (existing.data.vectorUuid) {
            try {
              await fetch(`${datapageUrl}/api/vector/delete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  tenantId,
                  vectorUuid: existing.data.vectorUuid,
                }),
              });
            } catch { /* ignore */ }
          }
          deleted++;
        }
      }

      // 3b. 템플릿 순회: 업데이트 또는 신규 생성
      for (const ft of faqTemplates) {
        const existing = existingFaqs.get(ft.id);

        // keyData 조립
        const keyData: string[] = (ft.keyDataRefs || [])
          .map((ruleId: string) => {
            const content = rulesMap.get(ruleId);
            return content ? substituteVars(content, vars) : null;
          })
          .filter(Boolean) as string[];

        if (existing) {
          // 이미 존재 — overridden이면 건너뜀
          if (existing.data.overridden) {
            skipped++;
            continue;
          }

          // 업데이트
          const syncQuestions = (ft.questions || []).map((q: string) => substituteVars(q, vars));
          const syncHandler = ft.handler || 'bot';
          const syncRule = ft.rule || '';
          const syncHandlerType = syncHandler === 'bot' ? 'bot' : (syncRule.trim() ? 'conditional' : 'staff');

          const updates: Record<string, any> = {
            questions: syncQuestions,
            questionsRaw: syncQuestions,
            answer: substituteVars(ft.answer || '', vars),
            guide: substituteVars(ft.guide || '', vars),
            keyData,
            keyDataRefs: ft.keyDataRefs || [],
            topic: ft.topic || '',
            tags: ft.tags || [],
            tag_actions: ft.tags || [],
            handlerType: syncHandlerType,
            handler: syncHandler,
            rule: syncRule,
            action_product: ft.action_product || null,
            action: ft.action || null,
            vectorStatus: 'pending' as const,
            updatedAt: Date.now(),
            updatedBy: admin.adminId,
          };

          await db.collection('tenants').doc(tenantId).collection('faqs').doc(existing.docId).update(updates);

          // Weaviate 재동기화
          try {
            const syncRes = await fetch(`${datapageUrl}/api/vector/upsert`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                tenantId,
                vectorUuid: existing.data.vectorUuid,
                questions: updates.questions,
                answer: updates.answer,
                guide: updates.guide,
                keyData: keyData.join('; '),
                topic: updates.topic,
                rule: updates.rule,
                handlerType: updates.handlerType,
                handler: updates.handler,
                tags: updates.tags,
                action_product: updates.action_product,
                action: updates.action,
                imageUrls: [],
              }),
            });
            if (syncRes.ok) {
              await db.collection('tenants').doc(tenantId).collection('faqs').doc(existing.docId).update({
                vectorStatus: 'synced',
              });
            }
          } catch { /* ignore */ }

          synced++;
        } else {
          // 신규 생성 (패키지에 새로 추가된 템플릿)
          const vectorUuid = `vec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          const newQuestions = (ft.questions || []).map((q: string) => substituteVars(q, vars));
          const newHandler = ft.handler || 'bot';
          const newRule = ft.rule || '';
          const newHandlerType = newHandler === 'bot' ? 'bot' : (newRule.trim() ? 'conditional' : 'staff');

          const faqData = {
            questions: newQuestions,
            questionsRaw: newQuestions,
            answer: substituteVars(ft.answer || '', vars),
            guide: substituteVars(ft.guide || '', vars),
            keyData,
            keyDataRefs: ft.keyDataRefs || [],
            topic: ft.topic || '',
            tags: ft.tags || [],
            tag_actions: ft.tags || [],
            handlerType: newHandlerType,
            handler: newHandler,
            rule: newRule,
            action_product: ft.action_product || null,
            action: ft.action || null,
            isActive: true,
            vectorStatus: 'pending' as const,
            vectorUuid,
            source: 'package',
            packageId,
            packageFaqId: ft.id,
            overridden: false,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            createdBy: admin.adminId,
          };

          const faqRef = await db.collection('tenants').doc(tenantId).collection('faqs').add(faqData);

          try {
            const syncRes = await fetch(`${datapageUrl}/api/vector/upsert`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                tenantId,
                vectorUuid,
                questions: faqData.questions,
                answer: faqData.answer,
                guide: faqData.guide,
                keyData: keyData.join('; '),
                topic: faqData.topic,
                rule: faqData.rule,
                handlerType: faqData.handlerType,
                handler: faqData.handler,
                tags: faqData.tags,
                action_product: faqData.action_product,
                action: faqData.action,
                imageUrls: [],
              }),
            });
            if (syncRes.ok) {
              await faqRef.update({ vectorStatus: 'synced' });
            }
          } catch { /* ignore */ }

          created++;
        }
      }

      // appliedTenants의 faqCount 업데이트
      const updatedApplied = (packageData.appliedTenants || []).map((t: any) =>
        t.tenantId === tenantId ? { ...t, faqCount: faqTemplates.length } : t
      );
      await packagesRef.doc(packageId).update({
        appliedTenants: updatedApplied,
        updatedAt: new Date(),
      });
    }

    await addAdminLog(db, admin, {
      action: 'faq_update',
      details: {
        type: 'package_sync',
        packageId,
        packageName: packageData.name,
        tenantCount: targetTenants.length,
        synced,
        created,
        deleted,
        skipped,
      },
    });

    return NextResponse.json({
      success: true,
      synced,
      created,
      deleted,
      skipped,
    });
  } catch (error: any) {
    console.error('[package sync]', error);
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
  }
}