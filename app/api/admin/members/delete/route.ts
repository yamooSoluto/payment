import { NextRequest, NextResponse } from 'next/server';
import { getAdminFromRequest, hasPermission } from '@/lib/admin-auth';
import { initializeFirebaseAdmin, getAdminAuth } from '@/lib/firebase-admin';

// POST: 회원 삭제
export async function POST(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);

    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(admin, 'members:delete')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const db = initializeFirebaseAdmin();
    const auth = getAdminAuth();

    if (!db || !auth) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
    }

    const body = await request.json();
    const { memberIds } = body;

    if (!memberIds || !Array.isArray(memberIds) || memberIds.length === 0) {
      return NextResponse.json(
        { error: '삭제할 회원을 선택해주세요.' },
        { status: 400 }
      );
    }

    let deletedCount = 0;
    const errors: string[] = [];

    for (const memberId of memberIds) {
      try {
        const email = decodeURIComponent(memberId);

        // 1. Firebase Auth에서 사용자 삭제
        try {
          const userRecord = await auth.getUserByEmail(email);
          await auth.deleteUser(userRecord.uid);
        } catch (authError: unknown) {
          // 사용자가 Auth에 없을 수 있음 (수동 등록 회원이 아닌 경우)
          if (authError && typeof authError === 'object' && 'code' in authError && authError.code !== 'auth/user-not-found') {
            console.error(`Auth delete error for ${email}:`, authError);
          }
        }

        // 2. users 컬렉션에서 삭제
        await db.collection('users').doc(email).delete();

        // 3. 해당 회원의 tenants도 삭제할지는 정책에 따라 결정
        // 현재는 users만 삭제하고 tenants는 유지
        // (tenants 삭제를 원하면 아래 주석 해제)
        // const tenantsSnapshot = await db.collection('tenants').where('email', '==', email).get();
        // const batch = db.batch();
        // tenantsSnapshot.docs.forEach(doc => batch.delete(doc.ref));
        // await batch.commit();

        deletedCount++;
      } catch (error) {
        console.error(`Delete member error for ${memberId}:`, error);
        errors.push(memberId);
      }
    }

    if (deletedCount === 0) {
      return NextResponse.json(
        { error: '회원 삭제에 실패했습니다.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      deletedCount,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('Delete members error:', error);
    return NextResponse.json(
      { error: '회원 삭제 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
