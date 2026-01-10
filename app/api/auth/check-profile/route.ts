import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin, getAdminAuth } from '@/lib/firebase-admin';
import { verifyToken } from '@/lib/auth';

// 인증 함수: SSO 토큰 또는 Firebase Auth 토큰 검증
async function authenticateRequest(request: NextRequest): Promise<string | null> {
  const authHeader = request.headers.get('Authorization');

  if (!authHeader) {
    return null;
  }

  // Bearer 토큰인 경우 Firebase Auth로 처리
  if (authHeader.startsWith('Bearer ')) {
    const idToken = authHeader.substring(7);
    try {
      const auth = getAdminAuth();
      if (!auth) {
        console.error('Firebase Admin Auth not initialized');
        return null;
      }
      const decodedToken = await auth.verifyIdToken(idToken);
      return decodedToken.email || null;
    } catch (error) {
      console.error('Firebase Auth token verification failed:', error);
      return null;
    }
  }

  // 그 외는 SSO 토큰으로 처리
  const email = await verifyToken(authHeader);
  return email;
}

export async function POST(request: NextRequest) {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
  }

  try {
    // 인증 검증
    const authenticatedEmail = await authenticateRequest(request);
    if (!authenticatedEmail) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // 토큰에서 추출한 이메일 사용 (클라이언트 요청 무시)
    const email = authenticatedEmail;

    // users 컬렉션에서 사용자 조회
    const userDoc = await db.collection('users').doc(email).get();

    if (!userDoc.exists) {
      // 사용자 없음 - 프로필 완성 필요
      return NextResponse.json({ needsProfile: true });
    }

    const userData = userDoc.data();

    // 이름과 연락처가 있는지 확인
    if (!userData?.name || !userData?.phone) {
      return NextResponse.json({ needsProfile: true });
    }

    // 프로필 완성됨
    return NextResponse.json({ needsProfile: false });
  } catch (error) {
    console.error('Check profile failed:', error);
    return NextResponse.json(
      { error: 'Failed to check profile' },
      { status: 500 }
    );
  }
}
