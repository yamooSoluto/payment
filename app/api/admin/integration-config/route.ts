import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { getAdminFromRequest, hasPermission } from '@/lib/admin-auth';
import { buildNormalizedSlackPayload } from '@/lib/slackRouting';

const CONFIG_DOC = 'admin_config/integration_defaults';

/**
 * 채널별 기본 설정 관리
 *
 * 구조:
 * {
 *   naver: {
 *     cw: { accountId, type, botTokenSecretRef, accessTokenSecretRef },
 *     provider: { kind, apiKeySecretRefPattern },
 *     inboundSecretAuto: true,  // 자동 생성 여부
 *   },
 *   widget: {
 *     cw: { accountId, type, botTokenSecretRef, accessTokenSecretRef },
 *   },
 *   channeltalk: { ... },
 * }
 */
export async function GET(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!hasPermission(admin, 'tenants:read')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const db = adminDb || initializeFirebaseAdmin();
    if (!db) return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });

    const doc = await db.doc(CONFIG_DOC).get();
    const config = doc.exists ? doc.data() : getDefaultConfig();
    if (config?.slack) config.slack = buildNormalizedSlackPayload(config.slack as Record<string, unknown>);

    return NextResponse.json({ config });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!hasPermission(admin, 'tenants:write')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const db = adminDb || initializeFirebaseAdmin();
    if (!db) return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });

    const body = await request.json();
    const { config } = body;
    if (!config) return NextResponse.json({ error: 'config 필수' }, { status: 400 });

    const normalizedConfig = {
      ...config,
      ...(config.slack ? { slack: buildNormalizedSlackPayload(config.slack as Record<string, unknown>) } : {}),
    };

    await db.doc(CONFIG_DOC).set({
      ...normalizedConfig,
      updatedAt: new Date(),
      updatedBy: admin.adminId,
    }, { merge: true });

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function getDefaultConfig() {
  return {
    naver: {
      cw: {
        accountId: 126829,
        inboxId: 72201,
        type: 'api',
        botTokenSecretRef: 'BOT_YAMOO_001',
        accessTokenSecretRef: 'CW_1ST_ACCESS_TOKEN',
        inboxIdentifierSecretRef: 'CW_API_IDENTIFIER_72201',
      },
      provider: {
        kind: 'naver',
        apiKeySecretRef: 'API_KEY_NAVER',
      },
    },
    widget: {
      cw: {
        accountId: 126829,
        inboxId: 73335,
        type: 'widget',
        botTokenSecretRef: 'BOT_YAMOO_001',
        accessTokenSecretRef: 'CW_1ST_ACCESS_TOKEN',
        websiteTokenSecretRef: 'CW_WEB_TOKEN_73335',
        hmacSecretRef: 'CW_WEB_HMAC_73335',
      },
    },
    slack: {
      botTokenSecretRef: 'SLACK_BOT_TOKEN',
      signingSecretRef: 'SLACK_SIGNING_SECRET',
      teamId: null,
      defaultChannelId: null,
      opsChannelId: null,
      errorChannelId: null,
      defaultMentions: null,
      allowedUserIds: [],
      excludeUserIds: [],
      routing: {},
    },
  };
}
