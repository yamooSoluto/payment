import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { getAdminFromRequest, hasPermission } from '@/lib/admin-auth';

// GET: 모든 회원의 구독 히스토리 조회 (Collection Group Query 사용)
export async function GET(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);

    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(admin, 'subscriptions:read')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const db = adminDb || initializeFirebaseAdmin();
    if (!db) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const search = searchParams.get('search') || '';
    const plan = searchParams.get('plan') || '';
    const status = searchParams.get('status') || '';
    // 복수 필터 지원 (쉼표로 구분)
    const planFilters = plan ? plan.split(',') : [];
    const statusFilters = status ? status.split(',') : [];

    // Collection Group Query로 모든 records 서브컬렉션 한 번에 조회
    // 인덱스 필요: records 컬렉션 그룹에 changedAt 내림차순
    let query = db.collectionGroup('records').orderBy('changedAt', 'desc');

    // 서버 사이드 필터링 - 단일 값인 경우만 where 절 사용
    // (복수 필터는 클라이언트 사이드에서 처리)
    if (planFilters.length === 1) {
      query = query.where('plan', '==', planFilters[0]);
    }
    if (statusFilters.length === 1) {
      query = query.where('status', '==', statusFilters[0]);
    }

    const snapshot = await query.get();

    interface RecordData {
      recordId: string;
      tenantId: string;
      email: string;
      brandName: string;
      plan: string;
      status: string;
      amount: number;
      periodStart: string | null;
      periodEnd: string | null;
      billingDate: string | null;
      changeType: string;
      changedAt: string | null;
      changedBy: string;
      previousPlan: string | null;
      previousStatus: string | null;
      note: string | null;
    }

    const allRecords: RecordData[] = snapshot.docs.map(doc => {
      const data = doc.data();
      // 부모 문서 경로에서 tenantId 추출: subscription_history/{tenantId}/records/{recordId}
      const pathParts = doc.ref.path.split('/');
      const tenantId = pathParts[1] || '';

      return {
        recordId: doc.id,
        tenantId,
        email: data.email || '',
        brandName: data.brandName || '',
        plan: data.plan || '',
        status: data.status || '',
        amount: data.amount || 0,
        periodStart: data.periodStart?.toDate?.()?.toISOString() || null,
        periodEnd: data.periodEnd?.toDate?.()?.toISOString() || null,
        billingDate: data.billingDate?.toDate?.()?.toISOString() || null,
        changeType: data.changeType || '',
        changedAt: data.changedAt?.toDate?.()?.toISOString() || null,
        changedBy: data.changedBy || '',
        previousPlan: data.previousPlan || null,
        previousStatus: data.previousStatus || null,
        note: data.note || null,
      };
    });

    // 회원 정보 조회 (이메일로 그룹핑)
    const uniqueEmails = [...new Set(allRecords.map(r => r.email).filter(Boolean))];
    const userMap = new Map<string, { name: string; phone: string }>();

    if (uniqueEmails.length > 0) {
      // 배치로 users 조회 (최대 30개씩)
      const batchSize = 30;
      for (let i = 0; i < uniqueEmails.length; i += batchSize) {
        const batch = uniqueEmails.slice(i, i + batchSize);
        const userRefs = batch.map(email => db.collection('users').doc(email));
        const userDocs = await db.getAll(...userRefs);

        userDocs.forEach((doc, index) => {
          if (doc.exists) {
            const userData = doc.data();
            userMap.set(batch[index], {
              name: userData?.name || '',
              phone: userData?.phone || '',
            });
          }
        });
      }
    }

    // 회원 정보 추가
    const recordsWithMember = allRecords.map(record => ({
      ...record,
      memberName: userMap.get(record.email)?.name || '',
      memberPhone: userMap.get(record.email)?.phone || '',
    }));

    // 클라이언트 사이드 필터링
    let filteredRecords = recordsWithMember;

    // 복수 플랜 필터 (서버에서 처리 안 된 경우)
    if (planFilters.length > 1) {
      filteredRecords = filteredRecords.filter(record =>
        planFilters.includes(record.plan)
      );
    }

    // 복수 상태 필터 (서버에서 처리 안 된 경우)
    if (statusFilters.length > 1) {
      filteredRecords = filteredRecords.filter(record =>
        statusFilters.includes(record.status)
      );
    }

    // 검색 필터 (회원명, 매장명, 이메일, 연락처)
    if (search) {
      const searchLower = search.toLowerCase();
      const searchNoHyphen = search.replace(/-/g, '');
      filteredRecords = filteredRecords.filter(record => {
        const phoneNoHyphen = (record.memberPhone || '').replace(/-/g, '');
        return (
          record.memberName.toLowerCase().includes(searchLower) ||
          record.brandName.toLowerCase().includes(searchLower) ||
          record.email.toLowerCase().includes(searchLower) ||
          phoneNoHyphen.includes(searchNoHyphen)
        );
      });
    }

    const total = filteredRecords.length;
    const totalPages = Math.ceil(total / limit);

    // 페이지네이션
    const startIndex = (page - 1) * limit;
    const paginatedRecords = filteredRecords.slice(startIndex, startIndex + limit);

    return NextResponse.json({
      success: true,
      history: paginatedRecords,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    });
  } catch (error) {
    console.error('Failed to fetch subscription history:', error);
    return NextResponse.json(
      { error: 'Failed to fetch subscription history' },
      { status: 500 }
    );
  }
}
