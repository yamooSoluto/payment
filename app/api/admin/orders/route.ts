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

    if (!hasPermission(admin, 'payments:read')) {
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
    const search = searchParams.get('search') || '';

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
        phone?: string;
      } | null;
      [key: string]: unknown;
    }

    // 환불 기록에서 원결제 ID별 환불 금액 합계 계산
    const refundsByOriginalPayment = new Map<string, number>();
    // originalPaymentId가 없는 환불 기록은 tenantId로 그룹화 (레거시 데이터 지원)
    const refundsByTenant = new Map<string, { totalRefunded: number; refundDocIds: string[] }>();

    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      if ((data.type === 'refund' || data.transactionType === 'refund' || data.category === 'refund') && data.amount < 0) {
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

    // 1) 고유 ID 수집
    const uniqueUserIds = new Set<string>();
    const uniqueTenantIds = new Set<string>();
    const uniqueEmails = new Set<string>();

    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      if (data.userId) uniqueUserIds.add(data.userId);
      if (data.tenantId && data.tenantId !== 'new') uniqueTenantIds.add(data.tenantId);
      if (data.email) uniqueEmails.add(data.email);
    });

    // 2) 배치 조회 헬퍼 (Firestore in 쿼리 최대 30개)
    const chunkArray = <T>(arr: T[], size: number): T[][] => {
      const chunks: T[][] = [];
      for (let i = 0; i < arr.length; i += size) {
        chunks.push(arr.slice(i, i + size));
      }
      return chunks;
    };

    // 3) users, tenants, tenant_deletions, tenants(email) 병렬 배치 조회
    const userMap = new Map<string, { name: string; phone: string; email: string }>();
    const tenantMap = new Map<string, { businessName: string; ownerName: string; email: string; phone: string }>();
    const deletedTenantMap = new Map<string, { brandName: string; email: string; name: string; phone: string }>();
    const tenantByEmailMap = new Map<string, { businessName: string; ownerName: string; email: string; phone: string }>();

    const batchQueries: Promise<void>[] = [];

    // users 배치 조회
    if (uniqueUserIds.size > 0) {
      const chunks = chunkArray([...uniqueUserIds], 30);
      chunks.forEach(chunk => {
        batchQueries.push(
          db.collection('users').where('userId', 'in', chunk).get().then(snap => {
            snap.docs.forEach(doc => {
              const d = doc.data();
              userMap.set(d.userId, { name: d.name || '', phone: d.phone || '', email: d.email || doc.id });
            });
          }).catch(() => {})
        );
      });
    }

    // tenants 배치 조회 (tenantId 기준)
    if (uniqueTenantIds.size > 0) {
      const chunks = chunkArray([...uniqueTenantIds], 30);
      chunks.forEach(chunk => {
        batchQueries.push(
          db.collection('tenants').where('tenantId', 'in', chunk).get().then(snap => {
            snap.docs.forEach(doc => {
              const d = doc.data();
              tenantMap.set(d.tenantId, {
                businessName: d.brandName || d.businessName || '',
                ownerName: d.ownerName || d.name || '',
                email: d.email || '',
                phone: d.phone || '',
              });
            });
          }).catch(() => {})
        );
      });
    }

    // tenants 배치 조회 (email 기준 — tenantId 없는 결제용)
    if (uniqueEmails.size > 0) {
      const chunks = chunkArray([...uniqueEmails], 30);
      chunks.forEach(chunk => {
        batchQueries.push(
          db.collection('tenants').where('email', 'in', chunk).get().then(snap => {
            snap.docs.forEach(doc => {
              const d = doc.data();
              if (d.email) {
                tenantByEmailMap.set(d.email, {
                  businessName: d.brandName || d.businessName || '',
                  ownerName: d.ownerName || d.name || '',
                  email: d.email || '',
                  phone: d.phone || '',
                });
              }
            });
          }).catch(() => {})
        );
      });
    }

    await Promise.all(batchQueries);

    // tenants에서 못 찾은 tenantId → tenant_deletions에서 배치 조회
    const missingTenantIds = [...uniqueTenantIds].filter(id => !tenantMap.has(id));
    if (missingTenantIds.length > 0) {
      const chunks = chunkArray(missingTenantIds, 30);
      await Promise.all(chunks.map(chunk =>
        db.collection('tenant_deletions').where('tenantId', 'in', chunk).get().then(snap => {
          snap.docs.forEach(doc => {
            const d = doc.data();
            deletedTenantMap.set(d.tenantId, {
              brandName: d.brandName || '',
              email: d.email || '',
              name: d.name || '',
              phone: d.phone || '',
            });
          });
        }).catch(() => {})
      ));
    }

    // 4) 동기적으로 주문 데이터 매핑 (N+1 쿼리 제거)
    let orders: OrderData[] = snapshot.docs.map((doc) => {
      const data = doc.data();

      const tenantId = data.tenantId;
      const email = data.email;
      const userId = data.userId;

      const userInfo = userId ? userMap.get(userId) || null : null;

      let memberInfo: OrderData['memberInfo'] = null;

      // tenantId로 매장 정보 조회
      if (tenantId && tenantId !== 'new') {
        const tenant = tenantMap.get(tenantId);
        if (tenant) {
          memberInfo = {
            businessName: tenant.businessName,
            ownerName: userInfo?.name || tenant.ownerName,
            email: userInfo?.email || tenant.email || email || '',
            phone: userInfo?.phone || tenant.phone || '',
          };
        } else {
          const deleted = deletedTenantMap.get(tenantId);
          if (deleted) {
            memberInfo = {
              businessName: deleted.brandName,
              ownerName: userInfo?.name || deleted.name || '',
              email: userInfo?.email || deleted.email || email || '',
              phone: userInfo?.phone || deleted.phone || '',
            };
          }
        }
      }

      // tenantId로 못 찾았으면 email로 시도 (하위 호환성)
      if (!memberInfo && email) {
        const tenantByEmail = tenantByEmailMap.get(email);
        if (tenantByEmail) {
          memberInfo = {
            businessName: tenantByEmail.businessName,
            ownerName: userInfo?.name || tenantByEmail.ownerName,
            email: userInfo?.email || tenantByEmail.email || email,
            phone: userInfo?.phone || tenantByEmail.phone || '',
          };
        } else {
          memberInfo = {
            businessName: '',
            ownerName: userInfo?.name || '',
            email: userInfo?.email || email,
            phone: userInfo?.phone || '',
          };
        }
      }

      const amount = data.amount || 0;
      // 문서에 저장된 refundedAmount와 연결된 환불 기록 중 큰 값 사용 (동일 환불이므로 합산하면 이중 계산됨)
      const storedRefundedAmount = data.refundedAmount || 0;
      const linkedRefundAmount = refundsByOriginalPayment.get(doc.id) || 0;
      const totalRefundedAmount = Math.max(storedRefundedAmount, linkedRefundAmount);
      const remainingAmount = Math.max(0, amount - totalRefundedAmount);

      // 기존 데이터의 type 추론 (레거시 데이터 지원)
      let inferredType = data.type || null;

      // 안전한 문자열 추출
      let refundReasonText = '';
      let cancelReasonText = '';
      try {
        refundReasonText = typeof data.refundReason === 'string' ? data.refundReason : '';
        cancelReasonText = typeof data.cancelReason === 'string' ? data.cancelReason : '';
      } catch (e) {
        console.error('Error extracting reason text for doc:', doc.id, e);
      }

      // type이 'refund'이거나 없는 경우, refundReason/cancelReason으로 추론
      try {
        if (inferredType === 'refund' || (!inferredType && amount < 0)) {
          if (refundReasonText && refundReasonText.includes('다운그레이드') || refundReasonText && refundReasonText.includes('→')) {
            inferredType = 'downgrade_refund';
          } else if ((refundReasonText && refundReasonText.includes('해지')) ||
                     (cancelReasonText && cancelReasonText.includes('해지')) ||
                     (refundReasonText && refundReasonText.includes('취소')) ||
                     (typeof data.orderId === 'string' && data.orderId.includes('CANCEL_REFUND'))) {
            inferredType = 'cancel_refund';
          }
        }
      } catch (e) {
        console.error('Error inferring type for doc:', doc.id, 'data:', JSON.stringify({
          type: data.type,
          refundReason: typeof data.refundReason,
          cancelReason: typeof data.cancelReason,
          orderId: typeof data.orderId,
        }), e);
      }

      // type이 없고 양수 금액이면 구독으로 추론
      if (!inferredType && amount > 0) {
        inferredType = 'subscription';
      }

      return {
        id: doc.id,
        ...data,
        amount,
        refundedAmount: totalRefundedAmount,
        remainingAmount,
        originalPaymentId: data.originalPaymentId || null,
        type: inferredType,
        plan: data.plan || data.planId || '',
        isTest: data.isTest || false,
        memberInfo,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
        paidAt: data.paidAt?.toDate?.()?.toISOString() || null,
        canceledAt: data.canceledAt?.toDate?.()?.toISOString() || null,
        cancelReason: data.cancelReason || null,
        refundReason: data.refundReason || null,
      };
    });

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
      orders = orders.filter(o => o.status === 'done' && o.transactionType !== 'refund' && !o.canceledAt);
    } else if (type === 'cancellation') {
      orders = orders.filter(o => o.transactionType === 'refund' || o.canceledAt);
    }

    // 검색 필터 (회원명, 이메일, 연락처)
    if (search) {
      const searchLower = search.toLowerCase();
      const searchNoHyphen = search.replace(/-/g, '');
      orders = orders.filter(o => {
        const ownerName = (o.memberInfo?.ownerName || '').toLowerCase();
        const email = (o.memberInfo?.email || o.email || '').toLowerCase();
        const businessName = (o.memberInfo?.businessName || '').toLowerCase();
        const phone = (o.memberInfo?.phone || '').replace(/-/g, '');
        return ownerName.includes(searchLower) ||
               email.includes(searchLower) ||
               businessName.includes(searchLower) ||
               phone.includes(searchNoHyphen);
      });
    }

    // 페이지네이션
    const total = orders.length;
    const totalPages = Math.ceil(total / limit);
    const startIndex = (page - 1) * limit;
    const paginatedOrders = orders.slice(startIndex, startIndex + limit);

    // 통계
    const stats = {
      total: orders.length,
      completed: orders.filter(o => o.status === 'done' && o.transactionType !== 'refund').length,
      pending: orders.filter(o => o.status === 'pending').length,
      failed: orders.filter(o => o.status === 'failed').length,
      refunded: orders.filter(o => o.transactionType === 'refund').length,
      totalAmount: orders
        .filter(o => o.status === 'done' && o.transactionType !== 'refund')
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
