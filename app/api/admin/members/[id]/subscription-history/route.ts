import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { getSubscriptionHistoryByTenantIds } from '@/lib/subscription-history';

// 어드민: 특정 회원의 모든 매장 구독 히스토리 조회
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
  }

  try {
    const { id } = await params;
    // URL 디코딩된 이메일로 조회 (members API와 동일하게)
    const email = decodeURIComponent(id);

    // 해당 회원의 모든 tenant 조회 (email로 조회)
    const tenantsSnapshot = await db.collection('tenants')
      .where('email', '==', email)
      .get();

    // tenantId는 문서 내 tenantId 필드 또는 문서 ID (members API와 동일 로직)
    const tenantDataList = tenantsSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        tenantId: data.tenantId || doc.id,
        brandName: data.brandName || data.name || doc.id,
      };
    });

    const tenantIds = tenantDataList.map(t => t.tenantId);

    if (tenantIds.length === 0) {
      return NextResponse.json({
        success: true,
        history: [],
      });
    }

    // 해당 tenant들의 모든 구독 히스토리 조회
    const history = await getSubscriptionHistoryByTenantIds(db, tenantIds);

    // tenant 정보 매핑 (매장명 표시용)
    const tenantMap = new Map<string, string>();
    tenantDataList.forEach(t => {
      tenantMap.set(t.tenantId, t.brandName);
    });

    // 날짜를 ISO 문자열로 변환하고 매장명 추가
    const formattedHistory = history.map(record => ({
      ...record,
      brandName: tenantMap.get(record.tenantId) || record.tenantId,
      periodStart: record.periodStart instanceof Date
        ? record.periodStart.toISOString()
        : record.periodStart,
      periodEnd: record.periodEnd instanceof Date
        ? record.periodEnd.toISOString()
        : record.periodEnd,
      billingDate: record.billingDate instanceof Date
        ? record.billingDate.toISOString()
        : record.billingDate,
      changedAt: record.changedAt instanceof Date
        ? record.changedAt.toISOString()
        : record.changedAt,
    }));

    return NextResponse.json({
      success: true,
      history: formattedHistory,
    });
  } catch (error) {
    console.error('Failed to fetch subscription history:', error);
    return NextResponse.json(
      { error: 'Failed to fetch subscription history' },
      { status: 500 }
    );
  }
}
