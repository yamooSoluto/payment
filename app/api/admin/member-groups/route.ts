import { NextRequest, NextResponse } from 'next/server';
import { getAdminFromRequest, hasPermission } from '@/lib/admin-auth';
import { initializeFirebaseAdmin } from '@/lib/firebase-admin';

// GET: 그룹 목록 조회
export async function GET(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);

    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(admin, 'members:read')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const db = initializeFirebaseAdmin();
    if (!db) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
    }

    const groupsSnapshot = await db.collection('memberGroups').orderBy('createdAt', 'desc').get();

    const groups = groupsSnapshot.docs.map(doc => ({
      id: doc.id,
      name: doc.data().name,
      createdAt: doc.data().createdAt?.toDate?.()?.toISOString() || null,
    }));

    return NextResponse.json({ groups });
  } catch (error) {
    console.error('Get member groups error:', error);
    return NextResponse.json(
      { error: '그룹 목록을 불러오는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// POST: 그룹 생성
export async function POST(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);

    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(admin, 'members:write')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const db = initializeFirebaseAdmin();
    if (!db) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
    }

    const body = await request.json();
    const { name } = body;

    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: '그룹명을 입력해주세요.' },
        { status: 400 }
      );
    }

    // 중복 그룹명 확인
    const existingGroup = await db.collection('memberGroups')
      .where('name', '==', name.trim())
      .limit(1)
      .get();

    if (!existingGroup.empty) {
      return NextResponse.json(
        { error: '이미 존재하는 그룹명입니다.' },
        { status: 400 }
      );
    }

    const now = new Date();
    const docRef = await db.collection('memberGroups').add({
      name: name.trim(),
      createdAt: now,
      createdBy: admin.adminId,
    });

    return NextResponse.json({
      success: true,
      group: {
        id: docRef.id,
        name: name.trim(),
        createdAt: now.toISOString(),
      },
    });
  } catch (error) {
    console.error('Create member group error:', error);
    return NextResponse.json(
      { error: '그룹을 생성하는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
