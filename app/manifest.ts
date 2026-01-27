import type { MetadataRoute } from 'next';
import { initializeFirebaseAdmin } from '@/lib/firebase-admin';

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  let webappIconUrl = '/yamoo_favi.png';

  try {
    const db = initializeFirebaseAdmin();
    if (db) {
      const settingsDoc = await db.collection('settings').doc('site').get();
      if (settingsDoc.exists) {
        const data = settingsDoc.data();
        webappIconUrl = data?.webappIconUrl || '/yamoo_favi.png';
      }
    }
  } catch (error) {
    console.error('Failed to fetch manifest settings:', error);
  }

  return {
    name: 'YAMOO',
    short_name: 'YAMOO',
    description: 'YAMOO CS 자동화 서비스',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#2563eb',
    icons: [
      {
        src: webappIconUrl,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: webappIconUrl,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
