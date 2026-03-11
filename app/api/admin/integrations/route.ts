import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { getAdminFromRequest, hasPermission } from '@/lib/admin-auth';

/**
 * GET: 전체 Integration 목록 (채널별 필터 가능)
 * Query params: ?channel=naver&status=pending
 *   pending: cw.inboxId가 0이거나 없는 연동
 */
export async function GET(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!hasPermission(admin, 'tenants:read')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const db = adminDb || initializeFirebaseAdmin();
    if (!db) return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });

    const { searchParams } = new URL(request.url);
    const channelFilter = searchParams.get('channel');
    const statusFilter = searchParams.get('status'); // 'pending' | 'configured' | all

    let query: FirebaseFirestore.Query = db.collection('integrations');
    if (channelFilter) {
      query = query.where('channel', '==', channelFilter);
    }

    const snap = await query.get();
    let integrations = snap.docs.map(doc => {
      const d = doc.data();
      return {
        id: doc.id,
        integrationId: d.integrationId || doc.id,
        tenantId: d.tenantId || null,
        branchNo: d.branchNo || null,
        brandCode: d.brandCode || null,
        channel: d.channel || null,
        status: d.status || 'active',
        inboundSecret: d.inboundSecret || null,
        provider: d.provider || null,
        cw: d.cw || null,
        createdAt: d.createdAt?.toDate?.()?.toISOString() || null,
        updatedAt: d.updatedAt?.toDate?.()?.toISOString() || null,
      };
    });

    // pending 필터: cw.inboxId 미설정
    if (statusFilter === 'pending') {
      integrations = integrations.filter(i => !i.cw?.inboxId || i.cw.inboxId === 0);
    } else if (statusFilter === 'configured') {
      integrations = integrations.filter(i => i.cw?.inboxId && i.cw.inboxId > 0);
    }

    // 테넌트 정보 일괄 조회
    const tenantIds = [...new Set(integrations.map(i => i.tenantId).filter(Boolean))];
    const tenantMap: Record<string, { brandName: string; branchNo: string; brandCode: string; hasNaverAuth: boolean; slack: Record<string, unknown> | null; addons: string[] }> = {};
    // batch get (10개씩)
    for (let i = 0; i < tenantIds.length; i += 10) {
      const batch = tenantIds.slice(i, i + 10);
      const docs = await Promise.all(batch.map(tid => db.collection('tenants').doc(tid!).get()));
      docs.forEach(doc => {
        if (doc.exists) {
          const d = doc.data()!;
          tenantMap[doc.id] = {
            brandName: d.brandName || d.name || '(이름 없음)',
            branchNo: d.branchNo || '',
            brandCode: d.brandCode || '',
            hasNaverAuth: !!d.naverAuthorization,
            slack: d.slack || null,
            addons: Array.isArray(d.addons) ? d.addons : [],
          };
        }
      });
    }

    const enriched = integrations.map(i => ({
      ...i,
      tenant: i.tenantId ? tenantMap[i.tenantId] || null : null,
    }));

    return NextResponse.json({ integrations: enriched });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PUT: Integration에 인박스 배정 (cw.* 필드 자동 채움)
 * Body: { integrationId, inboxId, overrides?: { ... } }
 *
 * inboxId를 받으면 채널 타입에 따라 secretRef 자동 유도:
 *   naver/api → cw.inboxIdentifierSecretRef = CW_API_IDENTIFIER_{inboxId}
 *   widget    → cw.websiteTokenSecretRef = CW_WEB_TOKEN_{inboxId}
 *              cw.hmacSecretRef = CW_WEB_HMAC_{inboxId}
 *
 * 기본값은 admin_config/integration_defaults에서 가져옴
 */
export async function PUT(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!hasPermission(admin, 'tenants:write')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const db = adminDb || initializeFirebaseAdmin();
    if (!db) return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });

    const body = await request.json();
    const { integrationId, inboxId, overrides } = body;

    if (!integrationId) return NextResponse.json({ error: 'integrationId 필수' }, { status: 400 });
    if (!inboxId || inboxId <= 0) return NextResponse.json({ error: 'inboxId 필수 (양수)' }, { status: 400 });

    const docRef = db.collection('integrations').doc(integrationId);
    const existing = await docRef.get();
    if (!existing.exists) {
      return NextResponse.json({ error: '연동을 찾을 수 없습니다' }, { status: 404 });
    }

    const intgData = existing.data()!;
    const channel = intgData.channel || '';
    const existingCw = intgData.cw || {};

    // 기본 설정 가져오기
    const configDoc = await db.doc('admin_config/integration_defaults').get();
    const defaults = configDoc.exists
      ? configDoc.data()?.[channel] || {}
      : {};
    const defaultCw = defaults.cw || {};

    // 채널 타입에 따라 secretRef 자동 유도
    const cwType = channel === 'widget' ? 'widget' : 'api';
    const derivedRefs: Record<string, string | null> = {
      inboxIdentifierSecretRef: null,
      websiteTokenSecretRef: null,
      hmacSecretRef: null,
    };
    if (cwType === 'api') {
      derivedRefs.inboxIdentifierSecretRef = `CW_API_IDENTIFIER_${inboxId}`;
    } else if (cwType === 'widget') {
      derivedRefs.websiteTokenSecretRef = `CW_WEB_TOKEN_${inboxId}`;
      derivedRefs.hmacSecretRef = `CW_WEB_HMAC_${inboxId}`;
    }

    // 우선순위: overrides > 기존 커스텀 값 > defaults > 자동유도
    const pick = (key: string) =>
      overrides?.cw?.[key] ?? existingCw[key] ?? defaultCw[key] ?? derivedRefs[key] ?? null;

    const finalCw: Record<string, unknown> = {
      accountId: overrides?.cw?.accountId ?? existingCw.accountId ?? defaultCw.accountId ?? 0,
      inboxId: Number(inboxId),
      type: cwType,
      botTokenSecretRef: pick('botTokenSecretRef'),
      accessTokenSecretRef: pick('accessTokenSecretRef'),
      inboxIdentifierSecretRef: pick('inboxIdentifierSecretRef'),
      websiteTokenSecretRef: pick('websiteTokenSecretRef'),
      hmacSecretRef: pick('hmacSecretRef'),
    };

    const updates: Record<string, unknown> = {
      cw: finalCw,
      updatedAt: new Date(),
      updatedBy: admin.adminId,
    };

    // provider: overrides > 기존 값 > defaults
    const existingProvider = intgData.provider || {};
    if (overrides?.provider || existingProvider.apiKeySecretRef || defaults.provider) {
      updates.provider = {
        kind: overrides?.provider?.kind || existingProvider.kind || defaults.provider?.kind || channel,
        apiKeySecretRef: overrides?.provider?.apiKeySecretRef ?? existingProvider.apiKeySecretRef ?? defaults.provider?.apiKeySecretRef ?? null,
        ...(channel === 'naver' && (overrides?.provider?.sendUrl || existingProvider.sendUrl || defaults.provider?.sendUrl)
          ? { sendUrl: overrides?.provider?.sendUrl ?? existingProvider.sendUrl ?? defaults.provider?.sendUrl }
          : {}),
      };
    }

    if (overrides?.inboundSecret !== undefined) {
      updates.inboundSecret = overrides.inboundSecret;
    }
    if (overrides?.status !== undefined) {
      updates.status = overrides.status;
    }

    await docRef.update(updates);

    // widget인 경우 tenant의 widgetUrl 업데이트
    const tenantId = intgData.tenantId;
    const brandCode = intgData.brandCode;
    if (tenantId && brandCode) {
      const tenantUpdates: Record<string, unknown> = {};
      if (channel === 'widget') {
        tenantUpdates.widgetUrl = `https://chat.yamoo.ai.kr/chat/${brandCode}`;
      }
      if (channel === 'naver' && intgData.inboundSecret) {
        tenantUpdates.naverInboundUrl = `https://chat.yamoo.ai.kr/${brandCode}-${intgData.inboundSecret}/naver/inbound`;
      }
      if (Object.keys(tenantUpdates).length > 0) {
        await db.collection('tenants').doc(tenantId).update(tenantUpdates);
      }
    }

    return NextResponse.json({ success: true, cw: derivedCw });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PATCH: 테넌트 설정 업데이트
 * Body: { tenantId, slack?: { ... }, toggleAddon?: string }
 *   - slack: slack 설정 머지 업데이트
 *   - toggleAddon: addons 배열에서 토글 (있으면 제거, 없으면 추가)
 */
export async function PATCH(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!hasPermission(admin, 'tenants:write')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const db = adminDb || initializeFirebaseAdmin();
    if (!db) return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });

    const body = await request.json();
    const { tenantId, slack, toggleAddon } = body;

    if (!tenantId) return NextResponse.json({ error: 'tenantId 필수' }, { status: 400 });
    if (!slack && !toggleAddon) return NextResponse.json({ error: 'slack 또는 toggleAddon 필수' }, { status: 400 });

    const tenantRef = db.collection('tenants').doc(tenantId);
    const existing = await tenantRef.get();
    if (!existing.exists) return NextResponse.json({ error: '테넌트를 찾을 수 없습니다' }, { status: 404 });

    const updates: Record<string, unknown> = { updatedAt: new Date() };

    // slack 설정 업데이트
    if (slack && typeof slack === 'object') {
      const currentSlack = existing.data()?.slack || {};
      const merged = { ...currentSlack, ...slack };
      for (const [k, v] of Object.entries(merged)) {
        if (v === '') merged[k] = null;
      }
      updates.slack = merged;
    }

    // addon 토글
    let newAddons: string[] | undefined;
    if (toggleAddon) {
      const currentAddons: string[] = Array.isArray(existing.data()?.addons) ? existing.data()!.addons : [];
      if (currentAddons.includes(toggleAddon)) {
        newAddons = currentAddons.filter(a => a !== toggleAddon);
      } else {
        newAddons = [...currentAddons, toggleAddon];
      }
      updates.addons = newAddons;
    }

    await tenantRef.update(updates);

    return NextResponse.json({
      success: true,
      ...(updates.slack ? { slack: updates.slack } : {}),
      ...(newAddons !== undefined ? { addons: newAddons } : {}),
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}