import { NextRequest, NextResponse } from 'next/server';
import { getAdminFromRequest, hasPermission } from '@/lib/admin-auth';
import { initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { addAdminLog } from '@/lib/admin-log';

// ═══════════════════════════════════════════════════════════
// 패키지 적용 API — 매장에 패키지 FAQ 배포
// ═══════════════════════════════════════════════════════════

function substituteVars(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{([\w.]+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
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
    const { tenantIds } = body;

    if (!tenantIds || !Array.isArray(tenantIds) || tenantIds.length === 0) {
      return NextResponse.json({ error: 'tenantIds is required' }, { status: 400 });
    }

    // 1. 패키지 로드
    const packagesRef = db.collection('admin').doc('cs-data').collection('packages');
    const packageDoc = await packagesRef.doc(packageId).get();
    if (!packageDoc.exists) {
      return NextResponse.json({ error: 'Package not found' }, { status: 404 });
    }

    const packageData = packageDoc.data()!;
    const faqTemplates = packageData.faqTemplates || [];

    if (faqTemplates.length === 0) {
      return NextResponse.json({ error: 'Package has no FAQ templates' }, { status: 400 });
    }

    // 이미 적용된 매장 체크
    const appliedSet = new Set((packageData.appliedTenants || []).map((t: any) => t.tenantId));
    const newTenantIds = tenantIds.filter((id: string) => !appliedSet.has(id));
    if (newTenantIds.length === 0) {
      return NextResponse.json({ error: 'All tenants already have this package applied' }, { status: 400 });
    }

    // 2. keyDataRefs에 참조된 규정 일괄 조회
    const allRuleIds = new Set<string>();
    faqTemplates.forEach((ft: any) => {
      (ft.keyDataRefs || []).forEach((r: string) => allRuleIds.add(r));
    });

    const rulesMap = new Map<string, { label: string; content: string }>();
    if (allRuleIds.size > 0) {
      const rulesRef = db.collection('admin').doc('cs-data').collection('rules');
      for (const ruleId of allRuleIds) {
        try {
          const ruleDoc = await rulesRef.doc(ruleId).get();
          if (ruleDoc.exists) {
            const d = ruleDoc.data()!;
            rulesMap.set(ruleId, { label: d.label || '', content: d.content || '' });
          }
        } catch (err) {
          console.warn(`[package apply] Failed to load rule ${ruleId}:`, err);
        }
      }
    }

    // 3. 테넌트 정보 조회
    const tenantInfoMap = new Map<string, { brandName: string }>();
    for (const tenantId of newTenantIds) {
      const tenantDoc = await db.collection('tenants').doc(tenantId).get();
      if (tenantDoc.exists) {
        const data = tenantDoc.data()!;
        tenantInfoMap.set(tenantId, { brandName: data.brandName || data.name || tenantId });
      }
    }

    const datapageUrl = process.env.NEXT_PUBLIC_DATAPAGE_URL || 'http://localhost:3001';
    let totalCreated = 0;
    const newAppliedTenants: any[] = [];

    // 4. 각 테넌트에 FAQ 생성
    for (const tenantId of newTenantIds) {
      const tenantInfo = tenantInfoMap.get(tenantId);
      if (!tenantInfo) continue;

      const baseVars: Record<string, string> = { brandName: tenantInfo.brandName };
      let createdCount = 0;

      for (const ft of faqTemplates) {
        // keyData 조립: 각 rule의 label + content를 배열로
        const keyData: string[] = (ft.keyDataRefs || [])
          .map((ruleId: string) => {
            const rule = rulesMap.get(ruleId);
            if (!rule || !rule.content) return null;
            const content = substituteVars(rule.content, baseVars);
            return rule.label ? `${rule.label}: ${content}` : content;
          })
          .filter(Boolean) as string[];

        // keyDataSources resolve (datapage API) → keyData + vars
        let resolvedVars: Record<string, string> = {};
        let keyDataMatched = true; // 데이터 소스가 없으면 기본 true
        if (ft.keyDataSources && ft.keyDataSources.length > 0) {
          try {
            const resolveRes = await fetch(`${datapageUrl}/api/keydata/resolve`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ tenantId, keyDataSources: ft.keyDataSources }),
            });
            if (resolveRes.ok) {
              const resolved = await resolveRes.json();
              keyDataMatched = resolved.matched !== false;
              keyData.push(...(resolved.keyData || []));
              resolvedVars = resolved.vars || {};
            }
          } catch (err) {
            console.warn(`[package apply] keyDataSources resolve failed for tenant ${tenantId}:`, err);
          }
        }

        // 데이터 소스가 있는데 매칭 데이터가 없으면 해당 FAQ 건너뜀
        if (!keyDataMatched) {
          console.log(`[package apply] skipping FAQ "${(ft.questions || [])[0]}" for tenant ${tenantId}: no matching data`);
          continue;
        }

        const vars = { ...baseVars, ...resolvedVars };
        const vectorUuid = `vec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const questions = (ft.questions || []).map((q: string) => substituteVars(q, vars));
        const ruleText = ft.rule || '';
        const handler = ft.handler || 'bot';
        const derivedHandlerType = handler === 'bot' ? 'bot' : (ruleText.trim() ? 'conditional' : 'staff');

        const faqData = {
          questions,
          questionsRaw: questions,
          answer: substituteVars(ft.answer || '', vars),
          guide: substituteVars(ft.guide || '', vars),
          keyData,
          keyDataRefs: ft.keyDataRefs || [],
          keyDataSources: ft.keyDataSources || [],
          topic: ft.topic || '',
          tags: ft.tags || [],
          intent: (ft.tags && ft.tags[0]) || '문의',
          handlerType: derivedHandlerType,
          handler,
          rule: ruleText,
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

        // Weaviate 동기화
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
        } catch {
          console.warn(`[package apply] Weaviate sync failed for tenant ${tenantId}, faq ${ft.id}`);
        }

        createdCount++;
      }

      totalCreated += createdCount;
      newAppliedTenants.push({
        tenantId,
        brandName: tenantInfo.brandName,
        appliedAt: new Date().toISOString(),
        appliedBy: admin.adminId,
        faqCount: createdCount,
      });
    }

    // 5. 패키지의 appliedTenants 업데이트
    const updatedAppliedTenants = [...(packageData.appliedTenants || []), ...newAppliedTenants];
    await packagesRef.doc(packageId).update({
      appliedTenants: updatedAppliedTenants,
      updatedAt: new Date(),
    });

    await addAdminLog(db, admin, {
      action: 'faq_create',
      details: {
        type: 'package_apply',
        packageId,
        packageName: packageData.name,
        tenantIds: newTenantIds,
        totalCreated,
      },
    });

    return NextResponse.json({
      success: true,
      applied: newTenantIds.length,
      created: totalCreated,
    });
  } catch (error: any) {
    console.error('[package apply]', error);
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
  }
}