import { NextRequest, NextResponse } from 'next/server';
import { getAdminFromRequest, hasPermission } from '@/lib/admin-auth';
import { initializeFirebaseAdmin } from '@/lib/firebase-admin';

// GET: 주문 내역 조회
export async function GET(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);

    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(admin, 'orders:read')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const db = initializeFirebaseAdmin();
    if (!db) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const status = searchParams.get('status') || ''; // completed, pending, failed, refunded
    const type = searchParams.get('type') || ''; // subscription, cancellation
    const startDate = searchParams.get('startDate') || '';
    const endDate = searchParams.get('endDate') || '';

    // 결제 내역 조회
    let query = db.collection('payments').orderBy('createdAt', 'desc');

    // 상태 필터
    if (status) {
      query = db.collection('payments')
        .where('status', '==', status)
        .orderBy('createdAt', 'desc');
    }

    const snapshot = await query.get();

    interface OrderData {
      id: string;
      status?: string;
      amount?: number;
      refundedAmount?: number;
      remainingAmount?: number;
      email?: string;
      plan?: string;
      isTest?: boolean;
      canceledAt: string | null;
      createdAt: string | null;
      paidAt: string | null;
      originalPaymentId?: string;
      type?: string;
      memberInfo: {
        businessName: string;
        ownerName: string;
        email: string;
      } | null;
      [key: string]: unknown;
    }

    // 환불 기록에서 원결제 ID별 환불 금액 합계 계산
    const refundsByOriginalPayment = new Map<string, number>();
    // originalPaymentId가 없는 환불 기록은 tenantId로 그룹화 (레거시 데이터 지원)
    const refundsByTenant = new Map<string, { totalRefunded: number; refundDocIds: string[] }>();

    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      if (data.type === 'refund' && data.amount < 0) {
        const refundAmount = Math.abs(data.amount || 0);

        if (data.originalPaymentId) {
          // originalPaymentId가 있으면 해당 결제에 직접 연결
          const currentRefund = refundsByOriginalPayment.get(data.originalPaymentId) || 0;
          refundsByOriginalPayment.set(data.originalPaymentId, currentRefund + refundAmount);
        } else if (data.tenantId) {
          // originalPaymentId가 없으면 tenantId로 그룹화 (레거시)
          const existing = refundsByTenant.get(data.tenantId) || { totalRefunded: 0, refundDocIds: [] };
          existing.totalRefunded += refundAmount;
          existing.refundDocIds.push(doc.id);
          refundsByTenant.set(data.tenantId, existing);
        }
      }
    });

    // tenantId별 최신 양수 결제 찾기 (레거시 환불 매칭용)
    const latestPositivePaymentByTenant = new Map<string, { docId: string; createdAt: Date }>();
    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      if (data.tenantId && data.type !== 'refund' && (data.amount || 0) > 0) {
        const createdAt = data.createdAt?.toDate?.() || new Date(0);
        const existing = latestPositivePaymentByTenant.get(data.tenantId);
        if (!existing || createdAt > existing.createdAt) {
          latestPositivePaymentByTenant.set(data.tenantId, { docId: doc.id, createdAt });
        }
      }
    });

    // 레거시 환불을 최신 결제에 매칭
    refundsByTenant.forEach((refundData, tenantId) => {
      const latestPayment = latestPositivePaymentByTenant.get(tenantId);
      if (latestPayment) {
        const currentRefund = refundsByOriginalPayment.get(latestPayment.docId) || 0;
        refundsByOriginalPayment.set(latestPayment.docId, currentRefund + refundData.totalRefunded);
      }
    });

    // tenantId별 매장 정보 캐싱
    const tenantInfoCache = new Map<string, { businessName: string; ownerName: string; email: string } | null>();

    let orders: OrderData[] = await Promise.all(
      snapshot.docs.map(async (doc) => {
        const data = doc.data();

        // 회원 정보 조회 (tenantId 기반 우선, 없으면 email 기반)
        let memberInfo: { businessName: string; ownerName: string; email: string } | null = null;
        const tenantId = data.tenantId;
        const email = data.email;

        // tenantId로 조회 시도
        if (tenantId && tenantId !== 'new') {
          // 캐시 확인
          if (tenantInfoCache.has(tenantId)) {
            memberInfo = tenantInfoCache.get(tenantId) || null;
          } else {
            try {
              // tenantId 필드로 매장 조회
              const tenantSnapshot = await db.collection('tenants')
                .where('tenantId', '==', tenantId)
                .limit(1)
                .get();

              if (!tenantSnapshot.empty) {
                const tenantData = tenantSnapshot.docs[0].data();
                memberInfo = {
                  businessName: tenantData?.brandName || tenantData?.businessName || '',
                  ownerName: tenantData?.ownerName || tenantData?.name || '',
                  email: tenantData?.email || email || '',
                };
              }
              tenantInfoCache.set(tenantId, memberInfo);
            } catch {
              // 조회 실패 시 캐시에 null 저장
              tenantInfoCache.set(tenantId, null);
            }
          }
        }

        // tenantId로 못 찾았으면 email로 시도 (하위 호환성)
        if (!memberInfo && email) {
          const emailCacheKey = `email:${email}`;
          if (tenantInfoCache.has(emailCacheKey)) {
            memberInfo = tenantInfoCache.get(emailCacheKey) || null;
          } else {
            try {
              const memberSnapshot = await db.collection('tenants')
                .where('email', '==', email)
                .limit(1)
                .get();

              if (!memberSnapshot.empty) {
                const memberData = memberSnapshot.docs[0].data();
                memberInfo = {
                  businessName: memberData?.brandName || memberData?.businessName || '',
                  ownerName: memberData?.ownerName || memberData?.name || '',
                  email: memberData?.email || email,
                };
              } else {
                memberInfo = {
                  businessName: '',
                  ownerName: '',
                  email: email,
                };
              }
              tenantInfoCache.set(emailCacheKey, memberInfo);
            } catch {
              memberInfo = {
                businessName: '',
                ownerName: '',
                email: email,
              };
              tenantInfoCache.set(emailCacheKey, memberInfo);
            }
          }
        }

        const amount = data.amount || 0;
        // 문서에 저장된 refundedAmount + 연결된 환불 기록의 환불 금액 합산
        const storedRefundedAmount = data.refundedAmount || 0;
        const linkedRefundAmount = refundsByOriginalPayment.get(doc.id) || 0;
        const totalRefundedAmount = storedRefundedAmount + linkedRefundAmount;
        const remainingAmount = Math.max(0, amount - totalRefundedAmount);

        return {
          id: doc.id,
          ...data,
          amount,
          refundedAmount: totalRefundedAmount,
          remainingAmount,
          originalPaymentId: data.originalPaymentId || null,
          type: data.type || null,
          plan: data.plan || data.planId || '',
          isTest: data.isTest || false,
          memberInfo,
          createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
          paidAt: data.paidAt?.toDate?.()?.toISOString() || null,
          canceledAt: data.canceledAt?.toDate?.()?.toISOString() || null,
        };
      })
    );

    // 날짜 필터 (클라이언트 사이드)
    if (startDate) {
      const start = new Date(startDate);
      orders = orders.filter(o => o.createdAt && new Date(o.createdAt) >= start);
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      orders = orders.filter(o => o.createdAt && new Date(o.createdAt) <= end);
    }

    // 타입 필터
    if (type === 'subscription') {
      orders = orders.filter(o => o.status === 'completed' && !o.canceledAt);
    } else if (type === 'cancellation') {
      orders = orders.filter(o => o.status === 'refunded' || o.canceledAt);
    }

    // 페이지네이션
    const total = orders.length;
    const totalPages = Math.ceil(total / limit);
    const startIndex = (page - 1) * limit;
    const paginatedOrders = orders.slice(startIndex, startIndex + limit);

    // 통계
    const stats = {
      total: orders.length,
      completed: orders.filter(o => o.status === 'completed').length,
      pending: orders.filter(o => o.status === 'pending').length,
      failed: orders.filter(o => o.status === 'failed').length,
      refunded: orders.filter(o => o.status === 'refunded').length,
      totalAmount: orders
        .filter(o => o.status === 'completed')
        .reduce((sum, o) => sum + (o.amount || 0), 0),
    };

    return NextResponse.json({
      orders: paginatedOrders,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
      stats,
    });
  } catch (error) {
    console.error('Get orders error:', error);
    return NextResponse.json(
      { error: '주문 내역을 불러오는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
