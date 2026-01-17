import { NextResponse } from 'next/server';
import { initializeFirebaseAdmin } from '@/lib/firebase-admin';

// GET: 공개 사이트 설정 조회 (인증 불필요)
export async function GET() {
  try {
    const db = initializeFirebaseAdmin();
    if (!db) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
    }

    const settingsDoc = await db.collection('settings').doc('site').get();

    if (!settingsDoc.exists) {
      // 기본값 반환
      return NextResponse.json({
        settings: {
          siteName: 'YAMOO',
          logoUrl: '',
          faviconUrl: '',
          menuItems: [
            { id: 'about', name: '소개', path: '/about', visible: true, order: 0 },
            { id: 'trial', name: '무료체험', path: '/trial', visible: true, order: 1 },
            { id: 'plan', name: '요금제', path: '/plan', visible: true, order: 2 },
            { id: 'portal', name: '포탈', path: 'https://app.yamoo.ai.kr', visible: true, order: 3 },
            { id: 'account', name: '마이페이지', path: '/account', visible: true, order: 4 },
          ],
          ogTitle: '',
          ogDescription: '',
          ogImageUrl: '',
        },
      });
    }

    const data = settingsDoc.data();

    return NextResponse.json({
      settings: {
        siteName: data?.siteName || 'YAMOO',
        logoUrl: data?.logoUrl || '',
        faviconUrl: data?.faviconUrl || '',
        menuItems: data?.menuItems || [],
        ogTitle: data?.ogTitle || '',
        ogDescription: data?.ogDescription || '',
        ogImageUrl: data?.ogImageUrl || '',
      },
    });
  } catch (error) {
    console.error('Get public settings error:', error);
    return NextResponse.json(
      { error: '설정을 불러오는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
