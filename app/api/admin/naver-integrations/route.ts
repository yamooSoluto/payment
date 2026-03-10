import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { getAdminFromRequest, hasPermission } from '@/lib/admin-auth';

// GET: 네이버 연동 목록 조회 (integrations 컬렉션에서 channel=naver)
export async function GET(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!hasPermission(admin, 'tenants:read')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const db = adminDb || initializeFirebaseAdmin();
    if (!db) return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });

    const snap = await db.collection('integrations')
      .where('channel', '==', 'naver')
      .get();

    const integrations = snap.docs.map(doc => {
      const d = doc.data();
      return {
        id: doc.id,
        integrationId: d.integrationId || doc.id,
        tenantId: d.tenantId || null,
        branchNo: d.branchNo || null,
        brandCode: d.brandCode || null,
        channel: d.channel,
        status: d.status || 'active',
        inboundSecret: d.inboundSecret || null,
        provider: d.provider || null,
        cw: d.cw || null,
        createdAt: d.createdAt?.toDate?.()?.toISOString() || null,
        updatedAt: d.updatedAt?.toDate?.()?.toISOString() || null,
      };
    });

    // 연결된 테넌트 정보도 함께 조회
    const tenantIds = [...new Set(integrations.map(i => i.tenantId).filter(Boolean))];
    const tenantMap: Record<string, { brandName: string; branchNo: string; naverInboundUrl: string | null }> = {};

    for (const tid of tenantIds) {
      try {
        const tdoc = await db.collection('tenants').doc(tid).get();
        if (tdoc.exists) {
          const td = tdoc.data()!;
          tenantMap[tid] = {
            brandName: td.brandName || td.name || '(이름 없음)',
            branchNo: td.branchNo || '',
            naverInboundUrl: td.naverInboundUrl || null,
          };
        }
      } catch {}
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

// POST: 네이버 연동 생성
export async function POST(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!hasPermission(admin, 'tenants:write')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const db = adminDb || initializeFirebaseAdmin();
    if (!db) return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });

    const body = await request.json();
    const { tenantId, branchNo, brandCode, inboundSecret, provider, cw } = body;

    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId 필수' }, { status: 400 });
    }

    // 중복 체크: 같은 테넌트에 네이버 연동이 이미 있는지
    const existing = await db.collection('integrations')
      .where('channel', '==', 'naver')
      .where('tenantId', '==', tenantId)
      .limit(1)
      .get();

    if (!existing.empty) {
      return NextResponse.json({ error: '이미 네이버 연동이 등록된 테넌트입니다' }, { status: 409 });
    }

    // branchNo, brandCode 자동 조회
    let resolvedBranchNo = branchNo || null;
    let resolvedBrandCode = brandCode || null;
    if (!resolvedBranchNo || !resolvedBrandCode) {
      const tdoc = await db.collection('tenants').doc(tenantId).get();
      if (tdoc.exists) {
        const td = tdoc.data()!;
        if (!resolvedBranchNo) resolvedBranchNo = td.branchNo || null;
        if (!resolvedBrandCode) resolvedBrandCode = td.brandCode || null;
      }
    }

    const integrationId = `naver_${resolvedBranchNo || tenantId}`;
    const now = new Date();

    const payload: Record<string, unknown> = {
      integrationId,
      tenantId,
      branchNo: resolvedBranchNo,
      brandCode: resolvedBrandCode,
      channel: 'naver',
      status: 'active',
      inboundSecret: inboundSecret || null,
      provider: provider ? {
        kind: 'naver',
        apiKeySecretRef: provider.apiKeySecretRef || null,
      } : null,
      cw: cw ? {
        accountId: cw.accountId || 0,
        inboxId: cw.inboxId || 0,
        type: cw.type || 'api',
        websiteTokenSecretRef: cw.websiteTokenSecretRef || null,
        hmacSecretRef: cw.hmacSecretRef || null,
        inboxIdentifierSecretRef: cw.inboxIdentifierSecretRef || null,
        botTokenSecretRef: cw.botTokenSecretRef || null,
        accessTokenSecretRef: cw.accessTokenSecretRef || null,
      } : null,
      createdAt: now,
      updatedAt: now,
      createdBy: admin.adminId,
      version: '2',
    };

    await db.collection('integrations').doc(integrationId).set(payload);

    // naverInboundUrl 자동 생성 & tenant 문서에 저장
    if (resolvedBrandCode) {
      const inboundUrl = `https://cs-api-******.cloudfunctions.net/${resolvedBrandCode}/naver/inbound`;
      await db.collection('tenants').doc(tenantId).update({
        naverInboundUrl: inboundUrl,
      });
    }

    return NextResponse.json({ success: true, integrationId });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PUT: 네이버 연동 수정
export async function PUT(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!hasPermission(admin, 'tenants:write')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const db = adminDb || initializeFirebaseAdmin();
    if (!db) return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });

    const body = await request.json();
    const { integrationId, inboundSecret, provider, cw, status } = body;

    if (!integrationId) return NextResponse.json({ error: 'integrationId 필수' }, { status: 400 });

    const docRef = db.collection('integrations').doc(integrationId);
    const existing = await docRef.get();
    if (!existing.exists) {
      return NextResponse.json({ error: '연동을 찾을 수 없습니다' }, { status: 404 });
    }

    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
      updatedBy: admin.adminId,
    };

    if (inboundSecret !== undefined) updates.inboundSecret = inboundSecret || null;
    if (status !== undefined) updates.status = status;
    if (provider !== undefined) {
      updates.provider = {
        kind: 'naver',
        apiKeySecretRef: provider?.apiKeySecretRef || null,
      };
    }
    if (cw !== undefined) {
      updates.cw = {
        accountId: cw?.accountId || 0,
        inboxId: cw?.inboxId || 0,
        type: cw?.type || 'api',
        websiteTokenSecretRef: cw?.websiteTokenSecretRef || null,
        hmacSecretRef: cw?.hmacSecretRef || null,
        inboxIdentifierSecretRef: cw?.inboxIdentifierSecretRef || null,
        botTokenSecretRef: cw?.botTokenSecretRef || null,
        accessTokenSecretRef: cw?.accessTokenSecretRef || null,
      };
    }

    await docRef.update(updates);

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE: 네이버 연동 삭제
export async function DELETE(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!hasPermission(admin, 'tenants:write')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const db = adminDb || initializeFirebaseAdmin();
    if (!db) return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });

    const { searchParams } = new URL(request.url);
    const integrationId = searchParams.get('integrationId');
    if (!integrationId) return NextResponse.json({ error: 'integrationId 필수' }, { status: 400 });

    // 연동 문서 조회 후 tenant의 naverInboundUrl도 제거
    const doc = await db.collection('integrations').doc(integrationId).get();
    if (doc.exists) {
      const tenantId = doc.data()?.tenantId;
      if (tenantId) {
        try {
          await db.collection('tenants').doc(tenantId).update({
            naverInboundUrl: null,
          });
        } catch {}
      }
    }

    await db.collection('integrations').doc(integrationId).delete();

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}