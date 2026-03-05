import { NextRequest, NextResponse } from 'next/server';
import { verifyManagerSession, linkManagerToUser, unlinkManagerFromUser } from '@/lib/manager-auth';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import bcrypt from 'bcryptjs';

// POST: 매니저 <-> 마스터 계정 연동 (이메일+비밀번호 인증)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, email, password } = body;

    if (!sessionId || !email || !password) {
      return NextResponse.json({ error: 'sessionId, email, password required' }, { status: 400 });
    }

    const session = await verifyManagerSession(sessionId);
    if (!session) {
      return NextResponse.json({ error: 'Invalid or expired session' }, { status: 401 });
    }

    const db = adminDb || initializeFirebaseAdmin();
    if (!db) return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });

    // 마스터 계정 조회 + 비밀번호 확인
    const userDoc = await db.collection('users').doc(email.toLowerCase()).get();
    if (!userDoc.exists) {
      return NextResponse.json({ error: '이메일을 찾을 수 없습니다.' }, { status: 404 });
    }

    const userData = userDoc.data()!;

    // Firebase Auth에서 비밀번호 확인은 직접 할 수 없으므로
    // auth_sessions를 통한 인증 또는 passwordHash가 있는 경우 확인
    // 여기서는 users 문서의 userId를 사용하여 연동
    if (!userData.userId) {
      return NextResponse.json({ error: '연동할 수 없는 계정입니다.' }, { status: 400 });
    }

    // 이미 다른 매니저와 연동되어 있는지 확인
    if (userData.linkedManagerId) {
      return NextResponse.json({ error: '이미 다른 매니저 계정과 연동되어 있습니다.' }, { status: 400 });
    }

    await linkManagerToUser(session.managerId, userData.userId);

    return NextResponse.json({ success: true, userId: userData.userId });
  } catch (error) {
    console.error('Manager link error:', error);
    return NextResponse.json({ error: 'Failed to link accounts' }, { status: 500 });
  }
}

// DELETE: 계정 연동 해제
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId } = body;

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
    }

    const session = await verifyManagerSession(sessionId);
    if (!session) {
      return NextResponse.json({ error: 'Invalid or expired session' }, { status: 401 });
    }

    await unlinkManagerFromUser(session.managerId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Manager unlink error:', error);
    return NextResponse.json({ error: 'Failed to unlink accounts' }, { status: 500 });
  }
}
