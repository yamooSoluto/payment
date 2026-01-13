import { NextRequest, NextResponse } from 'next/server';
import { getAdminFromRequest, hasPermission } from '@/lib/admin-auth';
import { initializeFirebaseAdmin } from '@/lib/firebase-admin';

// POST: 그룹에 속한 회원들의 전화번호 조회
export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const { groupIds } = body;

    if (!groupIds || !Array.isArray(groupIds) || groupIds.length === 0) {
      return NextResponse.json(
        { error: '그룹을 선택해주세요.' },
        { status: 400 }
      );
    }

    // 선택된 그룹에 속한 회원 조회
    const usersSnapshot = await db.collection('users')
      .where('groupId', 'in', groupIds)
      .get();

    const phones = usersSnapshot.docs
      .map(doc => doc.data().phone)
      .filter((phone): phone is string => !!phone && phone.trim() !== '');

    // 중복 제거
    const uniquePhones = [...new Set(phones)];

    return NextResponse.json({
      phones: uniquePhones,
      count: uniquePhones.length,
    });
  } catch (error) {
    console.error('Get members by groups error:', error);
    return NextResponse.json(
      { error: '회원 정보를 불러오는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
