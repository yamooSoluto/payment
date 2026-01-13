import { NextRequest, NextResponse } from 'next/server';
import { getAdminFromRequest, hasPermission } from '@/lib/admin-auth';
import { initializeFirebaseAdmin } from '@/lib/firebase-admin';

// POST: 회원에게 그룹 지정
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
    const { memberIds, groupId } = body;

    if (!memberIds || !Array.isArray(memberIds) || memberIds.length === 0) {
      return NextResponse.json(
        { error: '회원을 선택해주세요.' },
        { status: 400 }
      );
    }

    if (!groupId) {
      return NextResponse.json(
        { error: '그룹을 선택해주세요.' },
        { status: 400 }
      );
    }

    // 그룹 존재 확인
    const groupDoc = await db.collection('memberGroups').doc(groupId).get();
    if (!groupDoc.exists) {
      return NextResponse.json(
        { error: '존재하지 않는 그룹입니다.' },
        { status: 400 }
      );
    }

    const groupName = groupDoc.data()?.name || '';
    const now = new Date();

    // 일괄 업데이트
    const batch = db.batch();
    for (const memberId of memberIds) {
      const email = decodeURIComponent(memberId);
      const userRef = db.collection('users').doc(email);
      batch.update(userRef, {
        groupId,
        groupName,
        updatedAt: now,
      });
    }

    await batch.commit();

    return NextResponse.json({
      success: true,
      updatedCount: memberIds.length,
    });
  } catch (error) {
    console.error('Assign group error:', error);
    return NextResponse.json(
      { error: '그룹 지정 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
