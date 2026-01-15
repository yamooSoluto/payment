import { NextRequest, NextResponse } from 'next/server';
import { getAdminFromRequest, hasPermission } from '@/lib/admin-auth';
import { initializeFirebaseAdmin } from '@/lib/firebase-admin';

// POST: 기존 모든 users를 특정 그룹으로 마이그레이션
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
    const { targetGroup } = body;

    if (!targetGroup) {
      return NextResponse.json(
        { error: '대상 그룹을 지정해주세요.' },
        { status: 400 }
      );
    }

    const now = new Date();

    // group 필드가 없는 모든 users 조회
    const usersSnapshot = await db.collection('users').get();

    let updatedCount = 0;
    let skippedCount = 0;
    const batchSize = 500;
    let batch = db.batch();
    let batchCount = 0;

    for (const doc of usersSnapshot.docs) {
      const data = doc.data();

      // 이미 group이 있으면 스킵
      if (data.group) {
        skippedCount++;
        continue;
      }

      batch.update(doc.ref, {
        group: targetGroup,
        updatedAt: now,
        updatedBy: admin.adminId,
      });

      updatedCount++;
      batchCount++;

      // Firestore batch는 500개까지만 가능
      if (batchCount >= batchSize) {
        await batch.commit();
        batch = db.batch();
        batchCount = 0;
      }
    }

    // 남은 batch 커밋
    if (batchCount > 0) {
      await batch.commit();
    }

    return NextResponse.json({
      success: true,
      updatedCount,
      skippedCount,
      message: `${updatedCount}명의 회원이 '${targetGroup}' 그룹으로 설정되었습니다. (이미 그룹이 있는 ${skippedCount}명은 스킵)`,
    });
  } catch (error) {
    console.error('Migrate user groups error:', error);
    return NextResponse.json(
      { error: '그룹 마이그레이션 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
