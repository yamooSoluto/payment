import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { getAdminFromRequest } from '@/lib/admin-auth';

// GET: 전체 매니저 목록 조회 (검색, 페이지네이션)
export async function GET(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '30');

    const db = adminDb || initializeFirebaseAdmin();
    if (!db) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
    }

    const snapshot = await db.collection('users_managers').get();

    let managers = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        managerId: data.managerId,
        loginId: data.loginId,
        name: data.name,
        phone: data.phone || null,
        masterEmail: data.masterEmail,
        active: data.active,
        tenants: data.tenants || [],
        tenantCount: (data.tenants || []).length,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : null,
        updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : null,
      };
    });

    // 검색 필터
    if (search) {
      const q = search.toLowerCase();
      managers = managers.filter(m =>
        m.loginId.toLowerCase().includes(q) ||
        m.name.toLowerCase().includes(q) ||
        m.masterEmail.toLowerCase().includes(q) ||
        (m.phone && m.phone.includes(q))
      );
    }

    // 최신순 정렬
    managers.sort((a, b) => {
      if (!a.createdAt) return 1;
      if (!b.createdAt) return -1;
      return b.createdAt.localeCompare(a.createdAt);
    });

    const total = managers.length;
    const totalPages = Math.ceil(total / limit);
    const start = (page - 1) * limit;
    const paginated = managers.slice(start, start + limit);

    return NextResponse.json({
      managers: paginated,
      pagination: { page, limit, total, totalPages },
    });
  } catch (error) {
    console.error('Admin managers fetch error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
