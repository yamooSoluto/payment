import { NextRequest, NextResponse } from 'next/server';
import { getAdminFromRequest } from '@/lib/admin-auth';
import { initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { ACTION_LABELS } from '@/lib/admin-log';

// GET: 관리자 로그 조회
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
    const actionFilter = searchParams.get('action') || '';

    // admin_logs 컬렉션 조회
    const logsSnapshot = await db.collection('admin_logs').get();

    interface LogData {
      id: string;
      action: string;
      actionLabel: string;
      adminId: string;
      adminLoginId: string;
      adminName: string;
      createdAt: string | null;
      // 회원 관련
      email?: string;
      phone?: string;
      userId?: string;
      // 이메일 변경
      oldEmail?: string;
      newEmail?: string;
      // 매장 관련
      tenantId?: string;
      brandName?: string;
      // 변경 내역
      changes?: Record<string, { from: unknown; to: unknown }>;
      details?: Record<string, unknown>;
      deletedData?: Record<string, unknown>;
      restoredData?: Record<string, unknown>;
    }

    // 로그 데이터 먼저 매핑
    const rawLogs = logsSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        action: data.action || '',
        actionLabel: ACTION_LABELS[data.action] || data.action || '알 수 없음',
        adminId: data.adminId || '',
        adminLoginId: data.adminLoginId || '',
        adminName: data.adminName || '',
        createdAt: data.createdAt?.toDate?.()?.toISOString() ||
                   data.changedAt?.toDate?.()?.toISOString() || null,
        // 회원 관련 (최상위 필드 우선)
        email: data.email || data.oldEmail || undefined,
        phone: data.phone || undefined,
        userId: data.userId || undefined,
        // 이메일 변경
        oldEmail: data.oldEmail || undefined,
        newEmail: data.newEmail || undefined,
        // 매장 관련 (최상위 필드 우선)
        tenantId: data.tenantId || undefined,
        brandName: data.brandName || undefined,
        // 변경 내역
        changes: data.changes || undefined,
        details: data.details || undefined,
        deletedData: data.deletedData || undefined,
        restoredData: data.restoredData || undefined,
      };
    });

    // userId와 tenantId 수집
    const userIds = [...new Set(rawLogs.map(log => log.userId).filter(Boolean))] as string[];
    const tenantIds = [...new Set(rawLogs.map(log => log.tenantId).filter(Boolean))] as string[];

    // users 컬렉션에서 이메일, 연락처 조회
    const usersMap: Record<string, { email?: string; phone?: string }> = {};
    if (userIds.length > 0) {
      // Firestore는 in 쿼리에 최대 30개까지만 지원하므로 청크로 나눔
      const userChunks = [];
      for (let i = 0; i < userIds.length; i += 30) {
        userChunks.push(userIds.slice(i, i + 30));
      }
      for (const chunk of userChunks) {
        const usersSnapshot = await db.collection('users').where('__name__', 'in', chunk).get();
        usersSnapshot.docs.forEach(doc => {
          const userData = doc.data();
          usersMap[doc.id] = {
            email: userData.email || undefined,
            phone: userData.phone || undefined,
          };
        });
      }
    }

    // tenants 컬렉션에서 매장명 조회
    const tenantsMap: Record<string, { brandName?: string }> = {};
    if (tenantIds.length > 0) {
      const tenantChunks = [];
      for (let i = 0; i < tenantIds.length; i += 30) {
        tenantChunks.push(tenantIds.slice(i, i + 30));
      }
      for (const chunk of tenantChunks) {
        const tenantsSnapshot = await db.collection('tenants').where('__name__', 'in', chunk).get();
        tenantsSnapshot.docs.forEach(doc => {
          const tenantData = doc.data();
          tenantsMap[doc.id] = {
            brandName: tenantData.brandName || undefined,
          };
        });
      }
    }

    // 로그에 users/tenants 정보 매핑
    // 최상위 필드 우선, 없으면 저장된 데이터(deletedData, restoredData, details), 마지막으로 컬렉션에서 조회
    let logs: LogData[] = rawLogs.map(log => {
      const userInfo = log.userId ? usersMap[log.userId] : undefined;
      const tenantInfo = log.tenantId ? tenantsMap[log.tenantId] : undefined;

      // brandName: 최상위 필드 우선, 없으면 deletedData/restoredData, 마지막으로 tenants 조회
      let brandName = log.brandName ||
                      (log.deletedData?.brandName as string) ||
                      (log.restoredData?.brandName as string) ||
                      tenantInfo?.brandName;

      // email: 최상위 필드 우선, 없으면 deletedData/restoredData/details, 마지막으로 users 조회
      let email = log.email ||
                  (log.deletedData?.email as string) ||
                  (log.restoredData?.email as string) ||
                  (log.details?.email as string) ||
                  userInfo?.email;

      // phone: 최상위 필드 우선, 없으면 details/deletedData, 마지막으로 users 조회
      let phone = log.phone ||
                  (log.details?.phone as string) ||
                  (log.deletedData?.phone as string) ||
                  userInfo?.phone;

      return {
        ...log,
        email,
        phone,
        brandName,
      };
    });

    // 액션 필터
    if (actionFilter) {
      const actionFilters = actionFilter.split(',');
      logs = logs.filter(log => actionFilters.includes(log.action));
    }

    // 검색 필터 (관리자명, 이메일, 연락처, 매장명 등)
    if (search) {
      const searchLower = search.toLowerCase();
      logs = logs.filter(log => {
        return (
          (log.adminName && log.adminName.toLowerCase().includes(searchLower)) ||
          (log.adminLoginId && log.adminLoginId.toLowerCase().includes(searchLower)) ||
          (log.email && log.email.toLowerCase().includes(searchLower)) ||
          (log.phone && log.phone.includes(search)) ||
          (log.oldEmail && log.oldEmail.toLowerCase().includes(searchLower)) ||
          (log.newEmail && log.newEmail.toLowerCase().includes(searchLower)) ||
          (log.tenantId && log.tenantId.toLowerCase().includes(searchLower)) ||
          (log.brandName && log.brandName.toLowerCase().includes(searchLower)) ||
          (log.userId && log.userId.toLowerCase().includes(searchLower))
        );
      });
    }

    // 날짜 내림차순 정렬 (최신순)
    logs.sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
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
      actionTypes: Object.entries(ACTION_LABELS).map(([key, label]) => ({
        value: key,
        label,
      })),
    });
  } catch (error) {
    console.error('Get admin logs error:', error);
    return NextResponse.json(
      { error: '관리자 로그를 불러오는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
