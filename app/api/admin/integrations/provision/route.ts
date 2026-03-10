import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { getAdminFromRequest, hasPermission } from '@/lib/admin-auth';
import crypto from 'crypto';

const CONFIG_DOC = 'admin_config/integration_defaults';

// ━━━ ULID 생성기 (N8N 코드와 동일) ━━━
const CROCK32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function encodeTime(t: number, len = 10): string {
  let str = '';
  for (let i = 0; i < len; i++) {
    str = CROCK32[t % 32] + str;
    t = Math.floor(t / 32);
  }
  return str;
}

function encodeRandom(len = 16): string {
  let str = '';
  for (let i = 0; i < len; i++) {
    const r = crypto.randomInt(0, 32);
    str += CROCK32[r];
  }
  return str;
}

function ulid(now = Date.now()): string {
  return encodeTime(now, 10) + encodeRandom(16);
}

function generateBrandCode(): string {
  return Math.random().toString(36).substring(2, 10);
}

function generateInboundSecret(): string {
  return Math.random().toString(36).substring(2, 10);
}

// ━━━ 업종 매핑 ━━━
const INDUSTRY_MAP: Record<string, string> = {
  study_cafe: '스터디카페 / 독서실',
  self_store: '무인매장 / 셀프운영 매장',
  cafe_restaurant: '카페 / 음식점',
  fitness: '피트니스 / 운동공간',
  beauty: '뷰티 / 미용',
  education: '교육 / 학원',
  rental_space: '공간대여 / 숙박',
  retail_business: '소매 / 유통 / 판매업',
  other: '기타',
};

/**
 * POST /api/admin/integrations/provision
 *
 * 두 가지 모드:
 *
 * ▶ 모드 A: 신규 테넌트 생성 + Integration 자동 프로비저닝
 *   Body: { email, brandName, industry, name?, phone?, source? }
 *   - tenantId, brandCode 자동 생성
 *   - tenant 문서 생성
 *   - naver + widget Integration 생성 (기본 CW 설정 포함)
 *   - widgetUrl, naverInboundUrl 자동 설정
 *   → N8N 대체: trial-signup, portal_add_store 모두 이 API로 처리
 *
 * ▶ 모드 B: 기존 테넌트에 Integration 추가
 *   Body: { tenantId }
 *   - 테넌트 문서 조회
 *   - 미생성 채널만 Integration 추가
 *
 * 인증: admin 토큰 또는 ADMIN_SYNC_TOKEN (내부 호출)
 */
export async function POST(request: NextRequest) {
  try {
    // 인증
    const authHeader = request.headers.get('authorization');
    const internalToken = process.env.ADMIN_SYNC_TOKEN;
    const isInternalCall = internalToken && authHeader === `Bearer ${internalToken}`;

    if (!isInternalCall) {
      const admin = await getAdminFromRequest(request);
      if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      if (!hasPermission(admin, 'tenants:write')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const db = adminDb || initializeFirebaseAdmin();
    if (!db) return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });

    const body = await request.json();

    // 기본 설정 가져오기
    const configDoc = await db.doc(CONFIG_DOC).get();
    const config = configDoc.exists ? configDoc.data()! : {};

    // ━━━ 모드 분기 ━━━
    const isNewTenant = !body.tenantId && body.email && body.brandName;

    let tenantId: string;
    let brandCode: string;
    let branchNo: string | null = null;

    if (isNewTenant) {
      // ─── 모드 A: 신규 테넌트 생성 ───
      const { email, name, phone, brandName, industry, source } = body;

      if (!email || !brandName || !industry) {
        return NextResponse.json({ error: 'email, brandName, industry 필수' }, { status: 400 });
      }

      tenantId = `t_${ulid()}`;
      brandCode = generateBrandCode();

      const industryCode = String(industry).trim();
      const industryLabel = INDUSTRY_MAP[industryCode] || '기타';
      const now = new Date();

      // Integration 데이터 준비
      const integrations = [
        { integrationId: `i_${ulid()}`, channel: 'naver', inboundSecret: generateInboundSecret() },
        { integrationId: `i_${ulid()}`, channel: 'widget', inboundSecret: null as string | null },
      ];

      // URL 생성
      const baseUrl = 'chat.yamoo.ai.kr';
      const widgetUrl = `${baseUrl}/chat/${brandCode}`;
      const naverInteg = integrations.find(i => i.channel === 'naver')!;
      const naverInboundUrl = `${baseUrl}/${brandCode}-${naverInteg.inboundSecret}/naver/inbound`;

      // 테넌트 문서 생성
      const tenantPayload: Record<string, unknown> = {
        tenantId,
        name: name ? String(name).trim() : null,
        email: String(email).toLowerCase().trim(),
        phone: phone ? String(phone).replace(/\D/g, '') : null,
        brandName: String(brandName).trim(),
        industry: industryCode,
        industryLabel,
        branchNo: null,
        brandCode,
        widgetUrl: `https://${widgetUrl}`,
        naverInboundUrl: `https://${naverInboundUrl}`,
        createdAt: now,
        updatedAt: now,
        source: source || 'portal_provision',
        version: '3',
        policy: {
          defaultMode: 'CONFIRM',
          confirmSticky: true,
        },
      };

      await db.collection('tenants').doc(tenantId).set(tenantPayload);

      // Integration 문서 생성
      // 네이버: Chatwoot 불필요 (direct pipeline) → cw: null, provider만 설정
      // 위젯: Chatwoot 사용 → cw 설정 포함
      const integrationResults = [];
      for (const integ of integrations) {
        const defaults = config[integ.channel];
        const isNaverChannel = integ.channel === 'naver';

        // 네이버는 cw 불필요 (Chatwoot-free direct pipeline)
        const cw: Record<string, unknown> | null = isNaverChannel ? null : {
          accountId: (defaults?.cw?.accountId) || 0,
          inboxId: (defaults?.cw?.inboxId) || 0,
          type: (defaults?.cw?.type) || (integ.channel === 'widget' ? 'widget' : 'api'),
          botTokenSecretRef: (defaults?.cw?.botTokenSecretRef) || null,
          accessTokenSecretRef: (defaults?.cw?.accessTokenSecretRef) || null,
          inboxIdentifierSecretRef: (defaults?.cw?.inboxIdentifierSecretRef) || null,
          websiteTokenSecretRef: (defaults?.cw?.websiteTokenSecretRef) || null,
          hmacSecretRef: (defaults?.cw?.hmacSecretRef) || null,
        };

        const provider = defaults?.provider ? {
          kind: defaults.provider.kind || integ.channel,
          apiKeySecretRef: defaults.provider.apiKeySecretRef || null,
          ...(isNaverChannel && defaults.provider.sendUrl ? { sendUrl: defaults.provider.sendUrl } : {}),
        } : (isNaverChannel ? { kind: 'naver', apiKeySecretRef: null } : null);

        const payload: Record<string, unknown> = {
          integrationId: integ.integrationId,
          tenantId,
          branchNo: null,
          brandCode,
          channel: integ.channel,
          status: 'active',
          inboundSecret: integ.inboundSecret,
          cw,
          provider,
          createdAt: now,
          updatedAt: now,
          version: '3',
        };

        await db.collection('integrations').doc(integ.integrationId).set(payload);
        integrationResults.push({ channel: integ.channel, integrationId: integ.integrationId, status: 'CREATED' });
      }

      return NextResponse.json({
        success: true,
        mode: 'new_tenant',
        tenantId,
        brandCode,
        widgetUrl: `https://${widgetUrl}`,
        naverInboundUrl: `https://${naverInboundUrl}`,
        integrations: integrationResults,
      });

    } else {
      // ─── 모드 B: 기존 테넌트에 Integration 추가 ───
      tenantId = body.tenantId;
      if (!tenantId) {
        return NextResponse.json({ error: 'tenantId 또는 (email + brandName + industry) 필수' }, { status: 400 });
      }

      const tenantDoc = await db.collection('tenants').doc(tenantId).get();
      if (!tenantDoc.exists) {
        return NextResponse.json({ error: '테넌트를 찾을 수 없습니다' }, { status: 404 });
      }

      const tenant = tenantDoc.data()!;
      brandCode = tenant.brandCode || generateBrandCode();
      branchNo = tenant.branchNo || null;

      const channels = body.channels || ['naver', 'widget'];
      const results: Array<{ channel: string; integrationId: string; status: string }> = [];
      const tenantUpdates: Record<string, unknown> = {};

      for (const channel of channels) {
        const defaults = config[channel];
        const isNaverChannel = channel === 'naver';
        // 네이버는 cw 없이도 생성 가능 (Chatwoot-free)
        if (!isNaverChannel && !defaults?.cw) {
          results.push({ channel, integrationId: '', status: 'SKIP_NO_DEFAULTS' });
          continue;
        }

        // 이미 존재하는지 체크
        const existing = await db.collection('integrations')
          .where('tenantId', '==', tenantId)
          .where('channel', '==', channel)
          .limit(1)
          .get();

        if (!existing.empty) {
          results.push({
            channel,
            integrationId: existing.docs[0].data().integrationId || existing.docs[0].id,
            status: 'ALREADY_EXISTS',
          });
          continue;
        }

        const inboundSecret = channel === 'naver' ? generateInboundSecret() : null;
        const integrationId = `i_${ulid()}`;

        // 네이버: cw 불필요 (Chatwoot-free direct pipeline)
        const cw: Record<string, unknown> | null = isNaverChannel ? null : {
          accountId: defaults?.cw?.accountId || 0,
          inboxId: defaults?.cw?.inboxId || 0,
          type: defaults?.cw?.type || (channel === 'widget' ? 'widget' : 'api'),
          botTokenSecretRef: defaults?.cw?.botTokenSecretRef || null,
          accessTokenSecretRef: defaults?.cw?.accessTokenSecretRef || null,
          inboxIdentifierSecretRef: defaults?.cw?.inboxIdentifierSecretRef || null,
          websiteTokenSecretRef: defaults?.cw?.websiteTokenSecretRef || null,
          hmacSecretRef: defaults?.cw?.hmacSecretRef || null,
        };

        const provider = defaults?.provider ? {
          kind: defaults.provider.kind || channel,
          apiKeySecretRef: defaults.provider.apiKeySecretRef || null,
          ...(isNaverChannel && defaults.provider.sendUrl ? { sendUrl: defaults.provider.sendUrl } : {}),
        } : (isNaverChannel ? { kind: 'naver', apiKeySecretRef: null } : null);

        const now = new Date();
        await db.collection('integrations').doc(integrationId).set({
          integrationId,
          tenantId,
          branchNo,
          brandCode,
          channel,
          status: 'active',
          inboundSecret,
          cw,
          provider,
          createdAt: now,
          updatedAt: now,
          version: '3',
        });

        results.push({ channel, integrationId, status: 'CREATED' });

        // URL 업데이트
        if (channel === 'widget' && brandCode && !tenant.widgetUrl) {
          tenantUpdates.widgetUrl = `https://chat.yamoo.ai.kr/chat/${brandCode}`;
        }
        if (channel === 'naver' && brandCode && inboundSecret && !tenant.naverInboundUrl) {
          tenantUpdates.naverInboundUrl = `https://chat.yamoo.ai.kr/${brandCode}-${inboundSecret}/naver/inbound`;
        }
      }

      if (Object.keys(tenantUpdates).length > 0) {
        await db.collection('tenants').doc(tenantId).update(tenantUpdates);
      }

      return NextResponse.json({
        success: true,
        mode: 'existing_tenant',
        tenantId,
        results,
        tenantUpdates,
      });
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    console.error('[provision]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}