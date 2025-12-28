import { NextRequest, NextResponse } from 'next/server';
import { getAdminFromRequest, hasPermission } from '@/lib/admin-auth';
import { initializeFirebaseAdmin } from '@/lib/firebase-admin';

// GET: 구독 목록 조회
export async function GET(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);

    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(admin, 'subscriptions:read')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const db = initializeFirebaseAdmin();
    if (!db) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const search = searchParams.get('search') || '';
    const planFilter = searchParams.get('plan') || '';
    const statusFilter = searchParams.get('status') || '';

    // 구독 정보 조회
    const subscriptionsSnapshot = await db.collection('subscriptions').get();

    // 테넌트 정보 조회 (브랜드명, 회원 정보 매핑용)
    const tenantsSnapshot = await db.collection('tenants').get();
    const tenantMap = new Map<string, {
      brandName: string;
      name: string;
      email: string;
      phone: string;
    }>();

    tenantsSnapshot.docs.forEach(doc => {
      const data = doc.data();
      const tenantId = data.tenantId || doc.id;
      tenantMap.set(tenantId, {
        brandName: data.brandName || data.businessName || '이름 없음',
        name: data.name || data.ownerName || '',
        email: data.email || '',
        phone: data.phone || '',
      });
    });

    // 구독 데이터 가공
    interface SubscriptionData {
      id: string;
      tenantId: string;
      email: string;
      memberName: string;
      brandName: string;
      phone: string;
      plan: string;
      status: string;
      amount: number;
      currentPeriodStart: string | null;
      currentPeriodEnd: string | null;
      nextBillingDate: string | null;
      createdAt: string | null;
      pricePolicy: string | null;
    }

    let subscriptions: SubscriptionData[] = subscriptionsSnapshot.docs.map(doc => {
      const data = doc.data();
      const tenantId = doc.id;
      const tenantInfo = tenantMap.get(tenantId);

      return {
        id: doc.id,
        tenantId,
        email: data.email || tenantInfo?.email || '',
        // subscription에 있으면 먼저 쓰고, 없으면 tenant에서 가져옴
        memberName: data.name || tenantInfo?.name || '',
        brandName: data.brandName || tenantInfo?.brandName || '(매장 정보 없음)',
        phone: data.phone || tenantInfo?.phone || '',
        plan: data.plan || '',
        status: data.status || '',
        amount: data.amount || 0,
        currentPeriodStart: data.currentPeriodStart?.toDate?.()?.toISOString() || null,
        currentPeriodEnd: data.currentPeriodEnd?.toDate?.()?.toISOString() || null,
        nextBillingDate: data.nextBillingDate?.toDate?.()?.toISOString() || null,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
        pricePolicy: data.pricePolicy || null,
      };
    });

    // 플랜 필터
    if (planFilter) {
      subscriptions = subscriptions.filter(s => s.plan === planFilter);
    }

    // 상태 필터
    if (statusFilter) {
      subscriptions = subscriptions.filter(s => s.status === statusFilter);
    }

    // 검색 필터
    if (search) {
      const searchLower = search.toLowerCase();
      subscriptions = subscriptions.filter(s => {
        return (
          s.email.toLowerCase().includes(searchLower) ||
          s.memberName.toLowerCase().includes(searchLower) ||
          s.brandName.toLowerCase().includes(searchLower) ||
          s.tenantId.toLowerCase().includes(searchLower)
        );
      });
    }

    // 최신순 정렬
    subscriptions.sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime;
    });

    // 페이지네이션
    const total = subscriptions.length;
    const totalPages = Math.ceil(total / limit);
    const startIndex = (page - 1) * limit;
    const paginatedSubscriptions = subscriptions.slice(startIndex, startIndex + limit);

    return NextResponse.json({
      subscriptions: paginatedSubscriptions,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    });
  } catch (error) {
    console.error('Get subscriptions error:', error);
    return NextResponse.json(
      { error: '구독 목록을 불러오는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// PUT: 구독 정보 수정
export async function PUT(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);

    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(admin, 'subscriptions:write')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const db = initializeFirebaseAdmin();
    if (!db) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
    }

    const body = await request.json();
    const { tenantId, plan, currentPeriodStart, currentPeriodEnd, nextBillingDate, status, brandName, name, phone } = body;

    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId is required' }, { status: 400 });
    }

    // 구독 문서 확인
    const subscriptionRef = db.collection('subscriptions').doc(tenantId);
    const subscriptionDoc = await subscriptionRef.get();

    if (!subscriptionDoc.exists) {
      return NextResponse.json({ error: '구독 정보를 찾을 수 없습니다.' }, { status: 404 });
    }

    // 업데이트할 데이터
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: Record<string, any> = {
      updatedAt: new Date(),
      updatedBy: admin.adminId,
    };

    if (plan !== undefined) {
      updateData.plan = plan;
    }

    if (status !== undefined) {
      updateData.status = status;
    }

    // 매장 정보 업데이트
    if (brandName !== undefined) {
      updateData.brandName = brandName;
    }
    if (name !== undefined) {
      updateData.name = name;
    }
    if (phone !== undefined) {
      updateData.phone = phone;
    }

    if (currentPeriodStart !== undefined) {
      updateData.currentPeriodStart = currentPeriodStart ? new Date(currentPeriodStart) : null;
    }

    if (currentPeriodEnd !== undefined) {
      updateData.currentPeriodEnd = currentPeriodEnd ? new Date(currentPeriodEnd) : null;
    }

    // nextBillingDate가 명시적으로 전달되면 사용, 아니면 currentPeriodEnd + 1일로 계산
    if (nextBillingDate !== undefined) {
      updateData.nextBillingDate = nextBillingDate ? new Date(nextBillingDate) : null;
    } else if (currentPeriodEnd !== undefined && currentPeriodEnd) {
      // 종료일이 변경되고 nextBillingDate가 없으면 종료일 + 1로 설정
      const nextDate = new Date(currentPeriodEnd);
      nextDate.setDate(nextDate.getDate() + 1);
      updateData.nextBillingDate = nextDate;
    }

    await subscriptionRef.update(updateData);

    return NextResponse.json({
      success: true,
      message: '구독 정보가 수정되었습니다.',
    });
  } catch (error) {
    console.error('Update subscription error:', error);
    return NextResponse.json(
      { error: '구독 정보를 수정하는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
