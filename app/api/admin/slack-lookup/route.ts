import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { getAdminFromRequest, hasPermission } from '@/lib/admin-auth';

/**
 * Slack 채널/멤버 조회 API
 * GET ?tenantId=xxx&type=channels|members
 * GET ?tenantId=_defaults&type=channels|members  (공용 봇 토큰 사용)
 *
 * 테넌트의 botTokenSecretRef를 통해 실제 토큰을 가져온 후
 * Slack API를 호출하여 채널/멤버 목록을 반환
 */
export async function GET(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!hasPermission(admin, 'tenants:read')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const db = adminDb || initializeFirebaseAdmin();
    if (!db) return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });

    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get('tenantId');
    const type = searchParams.get('type'); // 'channels' | 'members'

    if (!tenantId) return NextResponse.json({ error: 'tenantId 필수' }, { status: 400 });
    if (!type || !['channels', 'members'].includes(type)) {
      return NextResponse.json({ error: 'type은 channels 또는 members' }, { status: 400 });
    }

    let botTokenRef: string | null = null;

    if (tenantId === '_defaults') {
      // 기본값 설정의 공용 봇 토큰 사용
      const configDoc = await db.doc('admin_config/integration_defaults').get();
      botTokenRef = configDoc.exists ? configDoc.data()?.slack?.botTokenSecretRef : null;
    } else {
      // 테넌트별 봇 토큰
      const tenantDoc = await db.collection('tenants').doc(tenantId).get();
      if (!tenantDoc.exists) return NextResponse.json({ error: '테넌트를 찾을 수 없습니다' }, { status: 404 });
      botTokenRef = tenantDoc.data()?.slack?.botTokenSecretRef || null;

      // 테넌트에 설정 없으면 기본값 폴백
      if (!botTokenRef) {
        const configDoc = await db.doc('admin_config/integration_defaults').get();
        botTokenRef = configDoc.exists ? configDoc.data()?.slack?.botTokenSecretRef : null;
      }
    }

    if (!botTokenRef) {
      return NextResponse.json({ error: 'botTokenSecretRef가 설정되지 않았습니다' }, { status: 400 });
    }

    const botToken = process.env[botTokenRef];
    if (!botToken) {
      return NextResponse.json({
        error: `봇 토큰 환경변수를 찾을 수 없습니다 (${botTokenRef})`,
      }, { status: 400 });
    }

    if (type === 'channels') {
      return await fetchChannels(botToken);
    } else {
      return await fetchMembers(botToken);
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function fetchChannels(botToken: string) {
  const allChannels: Array<{
    id: string;
    name: string;
    purpose: string;
    memberCount: number;
    isPrivate: boolean;
  }> = [];

  let cursor: string | undefined;

  for (let page = 0; page < 3; page++) {
    const params = new URLSearchParams({
      types: 'public_channel,private_channel',
      exclude_archived: 'true',
      limit: '200',
    });
    if (cursor) params.set('cursor', cursor);

    const res = await fetch(`https://slack.com/api/conversations.list?${params}`, {
      headers: { Authorization: `Bearer ${botToken}` },
    });
    const data = await res.json();

    if (!data.ok) {
      return NextResponse.json({ error: `Slack API 오류: ${data.error}` }, { status: 400 });
    }

    for (const ch of data.channels || []) {
      allChannels.push({
        id: ch.id,
        name: ch.name,
        purpose: ch.purpose?.value?.slice(0, 80) || '',
        memberCount: ch.num_members || 0,
        isPrivate: ch.is_private || false,
      });
    }

    cursor = data.response_metadata?.next_cursor;
    if (!cursor) break;
  }

  allChannels.sort((a, b) => a.name.localeCompare(b.name));
  return NextResponse.json({ channels: allChannels });
}

async function fetchMembers(botToken: string) {
  const allMembers: Array<{
    id: string;
    name: string;
    realName: string;
    displayName: string;
    email: string | null;
    isBot: boolean;
    avatar: string | null;
  }> = [];

  let cursor: string | undefined;

  for (let page = 0; page < 3; page++) {
    const params = new URLSearchParams({ limit: '200' });
    if (cursor) params.set('cursor', cursor);

    const res = await fetch(`https://slack.com/api/users.list?${params}`, {
      headers: { Authorization: `Bearer ${botToken}` },
    });
    const data = await res.json();

    if (!data.ok) {
      return NextResponse.json({ error: `Slack API 오류: ${data.error}` }, { status: 400 });
    }

    for (const m of data.members || []) {
      if (m.deleted || m.id === 'USLACKBOT') continue;
      allMembers.push({
        id: m.id,
        name: m.name,
        realName: m.real_name || m.name,
        displayName: m.profile?.display_name || m.real_name || m.name,
        email: m.profile?.email || null,
        isBot: m.is_bot || false,
        avatar: m.profile?.image_24 || null,
      });
    }

    cursor = data.response_metadata?.next_cursor;
    if (!cursor) break;
  }

  allMembers.sort((a, b) => {
    if (a.isBot !== b.isBot) return a.isBot ? 1 : -1;
    return a.realName.localeCompare(b.realName);
  });

  return NextResponse.json({ members: allMembers });
}