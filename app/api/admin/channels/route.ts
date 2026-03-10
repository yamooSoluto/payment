import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { getAdminFromRequest, hasPermission } from '@/lib/admin-auth';

// GET: 채널 목록 조회 (channeltalk_channels 컬렉션)
export async function GET(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!hasPermission(admin, 'tenants:read')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const db = adminDb || initializeFirebaseAdmin();
    if (!db) return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });

    const snap = await db.collection('channeltalk_channels').orderBy('createdAt', 'desc').get();
    const channels = snap.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate?.()?.toISOString() || null,
      updatedAt: doc.data().updatedAt?.toDate?.()?.toISOString() || null,
    }));

    return NextResponse.json({ channels });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST: 메인 채널 등록
export async function POST(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!hasPermission(admin, 'tenants:write')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const db = adminDb || initializeFirebaseAdmin();
    if (!db) return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });

    const body = await request.json();
    const { channelId, name, accessKey, secretKey, webhookToken, botName } = body;

    if (!channelId || !name || !accessKey || !secretKey) {
      return NextResponse.json({ error: 'channelId, name, accessKey, secretKey 필수' }, { status: 400 });
    }

    // 중복 체크
    const existing = await db.collection('channeltalk_channels').doc(String(channelId)).get();
    if (existing.exists) {
      return NextResponse.json({ error: '이미 등록된 채널 ID입니다' }, { status: 409 });
    }

    const now = new Date();
    const payload = {
      channelId: String(channelId),
      name: String(name),
      accessKey: String(accessKey),
      secretKey: String(secretKey),
      webhookToken: webhookToken ? String(webhookToken) : null,
      botName: botName ? String(botName) : 'AI Assistant',
      tenants: [],
      createdAt: now,
      updatedAt: now,
      createdBy: admin.adminId,
    };

    await db.collection('channeltalk_channels').doc(String(channelId)).set(payload);

    return NextResponse.json({ success: true, channelId: String(channelId) });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PUT: 메인 채널 수정
export async function PUT(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!hasPermission(admin, 'tenants:write')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const db = adminDb || initializeFirebaseAdmin();
    if (!db) return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });

    const body = await request.json();
    const { channelId, name, accessKey, secretKey, webhookToken, botName, tenants } = body;

    if (!channelId) return NextResponse.json({ error: 'channelId 필수' }, { status: 400 });

    const docRef = db.collection('channeltalk_channels').doc(String(channelId));
    const existing = await docRef.get();
    if (!existing.exists) {
      return NextResponse.json({ error: '채널을 찾을 수 없습니다' }, { status: 404 });
    }

    const updates: Record<string, unknown> = { updatedAt: new Date(), updatedBy: admin.adminId };
    if (name !== undefined) updates.name = String(name);
    if (accessKey !== undefined) updates.accessKey = String(accessKey);
    if (secretKey !== undefined) updates.secretKey = String(secretKey);
    if (webhookToken !== undefined) updates.webhookToken = webhookToken ? String(webhookToken) : null;
    if (botName !== undefined) updates.botName = botName ? String(botName) : null;
    if (tenants !== undefined) updates.tenants = tenants;

    await docRef.update(updates);

    // tenants 배열이 업데이트되면 → 각 tenant 문서의 channeltalk 필드도 동기화
    // 같은 tenantId가 여러 subChannelKey를 가질 수 있으므로 그룹핑
    if (Array.isArray(tenants)) {
      const channelData = existing.data()!;
      const resolvedAccessKey = accessKey ?? channelData.accessKey;
      const resolvedSecretKey = secretKey ?? channelData.secretKey;
      const resolvedBotName = botName ?? channelData.botName ?? 'AI Assistant';
      const resolvedWebhookToken = webhookToken ?? channelData.webhookToken ?? null;

      // tenantId별 subChannelKey 그룹핑
      const tenantKeysMap = new Map<string, { brandName: string; keys: string[] }>();
      for (const t of tenants) {
        if (!t.tenantId || !t.subChannelKey) continue;
        const existing = tenantKeysMap.get(t.tenantId);
        if (existing) {
          existing.keys.push(t.subChannelKey);
        } else {
          tenantKeysMap.set(t.tenantId, { brandName: t.brandName, keys: [t.subChannelKey] });
        }
      }

      const batch = db.batch();
      for (const [tid, { keys }] of tenantKeysMap) {
        const tenantRef = db.collection('tenants').doc(tid);
        batch.update(tenantRef, {
          'channeltalk.channelId': String(channelId),
          'channeltalk.accessKey': resolvedAccessKey,
          'channeltalk.secretKey': resolvedSecretKey,
          'channeltalk.botName': resolvedBotName,
          'channeltalk.webhookToken': resolvedWebhookToken,
          'channeltalk.subChannelKeys': keys,         // 배열 (신규: array-contains 쿼리용)
          'channeltalk.subChannelKey': keys[0] || null, // 레거시 호환 (단일 string)
        });
      }
      await batch.commit();
    }

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE: 메인 채널 삭제
export async function DELETE(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!hasPermission(admin, 'tenants:write')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const db = adminDb || initializeFirebaseAdmin();
    if (!db) return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });

    const { searchParams } = new URL(request.url);
    const channelId = searchParams.get('channelId');
    if (!channelId) return NextResponse.json({ error: 'channelId 필수' }, { status: 400 });

    await db.collection('channeltalk_channels').doc(channelId).delete();

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}