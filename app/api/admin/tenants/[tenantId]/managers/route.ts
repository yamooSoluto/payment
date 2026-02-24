import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { getAdminFromRequest } from '@/lib/admin-auth';

// GET: 해당 tenantId에 접근 권한이 있는 매니저 목록 조회
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { tenantId } = await params;

    const db = adminDb || initializeFirebaseAdmin();
    if (!db) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
    }

    // users_managers 컬렉션에서 tenants 배열에 해당 tenantId가 포함된 매니저 조회
    const snapshot = await db.collection('users_managers')
      .where('tenants', 'array-contains', { tenantId } as never)
      .get();

    // array-contains는 객체 equality 비교가 완벽하지 않으므로 수동 필터링도 병행
    // Firestore의 array-contains는 객체의 경우 정확히 일치해야 해서 tenantId만으로 필터링
    // 대신 masterEmail 기준 전체 조회 후 tenantId로 필터링
    const allSnapshot = await db.collection('users_managers').get();

    const managers = allSnapshot.docs
      .map(doc => {
        const data = doc.data();
        return {
          managerId: data.managerId,
          loginId: data.loginId,
          name: data.name,
          phone: data.phone,
          masterEmail: data.masterEmail,
          active: data.active,
          tenantAccess: (data.tenants || []).find(
            (t: { tenantId: string }) => t.tenantId === tenantId
          ) || null,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : null,
          updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : null,
        };
      })
      .filter(m => m.tenantAccess !== null);

    return NextResponse.json(managers);
  } catch (error) {
    console.error('Admin tenant managers fetch error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
