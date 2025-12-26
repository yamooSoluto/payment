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
      email?: string;
      plan?: string;
      isTest?: boolean;
      canceledAt: string | null;
      createdAt: string | null;
      paidAt: string | null;
      memberInfo: {
        businessName: string;
        ownerName: string;
        email: string;
      } | null;
      [key: string]: unknown;
    }

    // 이메일별 회원 정보 캐싱
    const memberInfoCache = new Map<string, { businessName: string; ownerName: string; email: string } | null>();

    let orders: OrderData[] = await Promise.all(
      snapshot.docs.map(async (doc) => {
        const data = doc.data();

        // 회원 정보 조회 (email 기반)
        let memberInfo = null;
        const email = data.email;

        if (email) {
          // 캐시 확인
          if (memberInfoCache.has(email)) {
            memberInfo = memberInfoCache.get(email) || null;
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
                // tenants에 없으면 email 정보만 표시
                memberInfo = {
                  businessName: '',
                  ownerName: '',
                  email: email,
                };
              }
              memberInfoCache.set(email, memberInfo);
            } catch {
              memberInfo = {
                businessName: '',
                ownerName: '',
                email: email,
              };
              memberInfoCache.set(email, memberInfo);
            }
          }
        }

        return {
          id: doc.id,
          ...data,
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
