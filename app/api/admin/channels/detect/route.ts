import { NextRequest, NextResponse } from 'next/server';
import { getAdminFromRequest, hasPermission } from '@/lib/admin-auth';

/**
 * POST /api/admin/channels/detect
 * 채널톡 API로 최근 채팅을 조회해서 연결된 멀티채널(카카오/네이버 등) 키를 감지
 *
 * Body: { accessKey, secretKey }
 * Returns: { channels: [{ key: "appKakao-34871", name: "@매장명", type: "kakao" }, ...] }
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!hasPermission(admin, 'tenants:read')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { accessKey, secretKey } = await request.json();
    if (!accessKey || !secretKey) {
      return NextResponse.json({ error: 'accessKey, secretKey 필수' }, { status: 400 });
    }

    const headers = {
      'x-access-key': accessKey,
      'x-access-secret': secretKey,
      'Content-Type': 'application/json',
    };

    // 채널톡 API: 최근 채팅 조회 (opened + closed 모두)
    const detected = new Map<string, { key: string; name: string; type: string; id: string }>();

    for (const state of ['opened', 'closed']) {
      try {
        const url = new URL('https://api.channel.io/open/v5/user-chats');
        url.searchParams.set('state', state);
        url.searchParams.set('sortOrder', 'DESC');
        url.searchParams.set('limit', '50');

        const res = await fetch(url.toString(), { headers });
        if (!res.ok) {
          const errText = await res.text();
          console.error(`[channels/detect] API error (${state}):`, res.status, errText);
          if (res.status === 401 || res.status === 403) {
            return NextResponse.json({ error: 'Access Key / Secret Key 인증 실패' }, { status: 401 });
          }
          continue;
        }

        const data = await res.json();
        const chats = data.userChats || [];

        for (const chat of chats) {
          const topicKey = chat.mediumTopicKey;
          const profile = chat.mediumProfile || {};
          const mediumType = chat.mediumType;

          if (mediumType === 'app' && topicKey && !detected.has(topicKey)) {
            const mediumName = profile.mediumName || '';
            const senderName = profile.mediumSenderName || '';
            const senderId = profile.mediumSenderId || '';

            let type = 'unknown';
            if (mediumName === 'appKakao' || topicKey.startsWith('appKakao')) type = 'kakao';
            else if (mediumName === 'appNaverTalk' || topicKey.startsWith('appNaverTalk')) type = 'naver';
            else if (mediumName === 'appInstagram' || topicKey.startsWith('appInstagram')) type = 'instagram';

            detected.set(topicKey, {
              key: topicKey,
              name: senderName || `${type} #${senderId}`,
              type,
              id: senderId,
            });
          }
        }
      } catch (e) {
        console.error(`[channels/detect] fetch error (${state}):`, e);
      }
    }

    const channels = Array.from(detected.values());

    return NextResponse.json({
      success: true,
      channels,
      scanned: 'recent 50 opened + 50 closed chats',
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}