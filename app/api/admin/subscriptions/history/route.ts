import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { getAdminFromRequest, hasPermission } from '@/lib/admin-auth';

// GET: 모든 회원의 구독 히스토리 조회 (페이지네이션)
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

    // 1. 모든 tenant 조회
    const tenantsSnapshot = await db.collection('tenants').get();
    const tenantDataList = tenantsSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        tenantId: data.tenantId || doc.id,
        brandName: data.brandName || data.name || doc.id,
        email: data.email || '',
      };
    });

    // 2. 각 tenant의 구독 히스토리 조회
    const allRecords: Array<{
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
    }> = [];

    for (const tenant of tenantDataList) {
      const historyRef = db.collection('subscription_history').doc(tenant.tenantId).collection('records');
      // 인덱스 없이도 동작하도록 기본 쿼리만 사용
      const snapshot = await historyRef.get();

      snapshot.docs.forEach(doc => {
        const data = doc.data();
        allRecords.push({
          recordId: doc.id,
          tenantId: tenant.tenantId,
          email: data.email || tenant.email || '',
          brandName: data.brandName || tenant.brandName || '',
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
        });
      });
    }

    // changedAt 기준 내림차순 정렬
    allRecords.sort((a, b) => {
      if (!a.changedAt && !b.changedAt) return 0;
      if (!a.changedAt) return 1;
      if (!b.changedAt) return -1;
      return new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime();
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

    // 필터 적용 (plan, status, search)
    let filteredRecords = recordsWithMember;

    // 플랜 필터
    if (plan) {
      filteredRecords = filteredRecords.filter(record => record.plan === plan);
    }

    // 상태 필터
    if (status) {
      filteredRecords = filteredRecords.filter(record => record.status === status);
    }

    // 검색 필터 (회원명, 매장명, 이메일)
    if (search) {
      const searchLower = search.toLowerCase();
      filteredRecords = filteredRecords.filter(record =>
        record.memberName.toLowerCase().includes(searchLower) ||
        record.brandName.toLowerCase().includes(searchLower) ||
        record.email.toLowerCase().includes(searchLower)
      );
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
