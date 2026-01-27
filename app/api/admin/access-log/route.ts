import { NextRequest, NextResponse } from 'next/server';
import { getAdminFromRequest } from '@/lib/admin-auth';
import { initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { addAdminAccessLog } from '@/lib/admin-log';

// POST: 관리자 접속 로그 기록
export async function POST(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    const userAgent = request.headers.get('user-agent') || undefined;

    console.log('[AccessLog POST] Request received:', {
      hasAdmin: !!admin,
      adminName: admin?.name,
      userAgent: userAgent?.substring(0, 50),
    });

    if (!admin) {
      console.log('[AccessLog POST] Unauthorized - no admin session');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = initializeFirebaseAdmin();
    if (!db) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
    }

    // IP 주소 가져오기
    const forwarded = request.headers.get('x-forwarded-for');
    const ip = forwarded ? forwarded.split(',')[0].trim() : request.headers.get('x-real-ip') || undefined;

    await addAdminAccessLog(db, admin, { ip, userAgent });
    console.log('[AccessLog POST] Success:', admin.name);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Add access log error:', error);
    return NextResponse.json(
      { error: '접속 로그 기록에 실패했습니다.' },
      { status: 500 }
    );
  }
}

// GET: 관리자 접속 로그 조회
export async function GET(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);

    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // owner 또는 super 권한만 접근 가능
    if (!['owner', 'super'].includes(admin.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const db = initializeFirebaseAdmin();
    if (!db) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '30');
    const search = searchParams.get('search') || '';
    const dateFrom = searchParams.get('dateFrom') || '';
    const dateTo = searchParams.get('dateTo') || '';

    // admin_access_logs 컬렉션 조회
    const logsSnapshot = await db.collection('admin_access_logs').get();

    interface AccessLogData {
      id: string;
      adminId: string;
      adminLoginId: string;
      adminName: string;
      accessedAt: string | null;
      ip?: string;
      userAgent?: string;
    }

    let logs: AccessLogData[] = logsSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        adminId: data.adminId || '',
        adminLoginId: data.adminLoginId || '',
        adminName: data.adminName || '',
        accessedAt: data.accessedAt?.toDate?.()?.toISOString() || null,
        ip: data.ip || undefined,
        userAgent: data.userAgent || undefined,
      };
    });

    // 검색 필터
    if (search) {
      const searchLower = search.toLowerCase();
      logs = logs.filter(log => {
        return (
          (log.adminName && log.adminName.toLowerCase().includes(searchLower)) ||
          (log.adminLoginId && log.adminLoginId.toLowerCase().includes(searchLower)) ||
          (log.ip && log.ip.includes(search))
        );
      });
    }

    // 날짜 필터
    if (dateFrom) {
      const fromDate = new Date(dateFrom);
      fromDate.setHours(0, 0, 0, 0);
      logs = logs.filter(log => {
        if (!log.accessedAt) return false;
        return new Date(log.accessedAt) >= fromDate;
      });
    }
    if (dateTo) {
      const toDate = new Date(dateTo);
      toDate.setHours(23, 59, 59, 999);
      logs = logs.filter(log => {
        if (!log.accessedAt) return false;
        return new Date(log.accessedAt) <= toDate;
      });
    }

    // 날짜 내림차순 정렬 (최신순)
    logs.sort((a, b) => {
      const aTime = a.accessedAt ? new Date(a.accessedAt).getTime() : 0;
      const bTime = b.accessedAt ? new Date(b.accessedAt).getTime() : 0;
      return bTime - aTime;
    });

    // 페이지네이션
    const total = logs.length;
    const totalPages = Math.ceil(total / limit);
    const startIndex = (page - 1) * limit;
    const paginatedLogs = logs.slice(startIndex, startIndex + limit);

    return NextResponse.json({
      logs: paginatedLogs,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    });
  } catch (error) {
    console.error('Get access logs error:', error);
    return NextResponse.json(
      { error: '접속 로그를 불러오는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
