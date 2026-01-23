import { NextRequest, NextResponse } from 'next/server';
import { getAdminFromRequest, hasPermission, hashPassword } from '@/lib/admin-auth';
import { initializeFirebaseAdmin } from '@/lib/firebase-admin';

// GET: 운영진 목록 조회
export async function GET(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);

    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(admin, 'admins:read')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const db = initializeFirebaseAdmin();
    if (!db) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
    }

    const snapshot = await db.collection('admins').orderBy('createdAt', 'desc').get();

    const admins = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        username: data.username || data.loginId || '',
        name: data.name || '',
        email: data.email || '',
        role: data.role || 'admin',
        createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
        lastLoginAt: data.lastLoginAt?.toDate?.()?.toISOString() || null,
      };
    });

    return NextResponse.json({ admins });
  } catch (error) {
    console.error('Get admins error:', error);
    return NextResponse.json(
      { error: '운영진 목록을 불러오는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// POST: 운영진 생성
export async function POST(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);

    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(admin, 'admins:write')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const db = initializeFirebaseAdmin();
    if (!db) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
    }

    const body = await request.json();
    const { username, password, name, email, role } = body;

    if (!username || !password || !name || !role) {
      return NextResponse.json(
        { error: '필수 항목을 모두 입력해주세요.' },
        { status: 400 }
      );
    }

    // 아이디 중복 확인
    const existingSnapshot = await db.collection('admins')
      .where('username', '==', username)
      .get();

    if (!existingSnapshot.empty) {
      return NextResponse.json(
        { error: '이미 사용 중인 아이디입니다.' },
        { status: 400 }
      );
    }

    // 비밀번호 해싱
    const passwordHash = await hashPassword(password);

    // 운영진 생성 (문서 ID를 먼저 생성하여 adminId로도 저장)
    const docRef = db.collection('admins').doc();
    await docRef.set({
      adminId: docRef.id,
      username,
      passwordHash,
      name,
      email: email || '',
      role,
      createdAt: new Date(),
      createdBy: admin.adminId,
    });

    return NextResponse.json({
      success: true,
      id: docRef.id,
    });
  } catch (error) {
    console.error('Create admin error:', error);
    return NextResponse.json(
      { error: '운영진을 생성하는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
