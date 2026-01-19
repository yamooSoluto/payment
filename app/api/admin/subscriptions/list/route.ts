import { NextRequest, NextResponse } from 'next/server';
import { getAdminFromRequest, hasPermission } from '@/lib/admin-auth';
import { initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { addSubscriptionHistoryRecord } from '@/lib/subscription-history';

// GET: 구독 목록 조회 (삭제되지 않은 모든 매장 기반, 미구독 포함)
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
    // 복수 필터 지원 (쉼표로 구분)
    const planFilter = searchParams.get('plan') || '';
    const statusFilter = searchParams.get('status') || '';
    const planFilters = planFilter ? planFilter.split(',') : [];
    const statusFilters = statusFilter ? statusFilter.split(',') : [];

    // 1. 테넌트 정보 조회 (삭제되지 않은 매장만)
    const tenantsSnapshot = await db.collection('tenants').get();

    // 2. 구독 정보 조회
    const subscriptionsSnapshot = await db.collection('subscriptions').get();
    const subscriptionMap = new Map<string, {
      plan: string;
      status: string;
      amount: number;
      currentPeriodStart: string | null;
      currentPeriodEnd: string | null;
      nextBillingDate: string | null;
      createdAt: string | null;
      pricePolicy: string | null;
      email: string;
      name: string;
      phone: string;
      brandName: string;
      hasBillingKey: boolean;
    }>();

    subscriptionsSnapshot.docs.forEach(doc => {
      const data = doc.data();
      subscriptionMap.set(doc.id, {
        plan: data.plan || '',
        status: data.status || '',
        amount: data.amount || 0,
        currentPeriodStart: data.currentPeriodStart?.toDate?.()?.toISOString() || null,
        currentPeriodEnd: data.currentPeriodEnd?.toDate?.()?.toISOString() || null,
        nextBillingDate: data.nextBillingDate?.toDate?.()?.toISOString() || null,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
        pricePolicy: data.pricePolicy || null,
        email: data.email || '',
        name: data.name || '',
        phone: data.phone || '',
        brandName: data.brandName || '',
        hasBillingKey: !!data.billingKey,
      });
    });

    // 구독 데이터 가공 (tenants 기반)
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
      hasBillingKey: boolean;
    }

    // 삭제 상태 필터 여부 확인
    const includeDeleted = statusFilters.includes('deleted');

    let subscriptions: SubscriptionData[] = tenantsSnapshot.docs
      .filter(doc => {
        const data = doc.data();
        // 삭제 필터가 있으면 삭제된 매장도 포함, 아니면 제외
        if (data.deleted === true) {
          return includeDeleted;
        }
        return true;
      })
      .map(doc => {
        const tenantData = doc.data();
        const tenantId = tenantData.tenantId || doc.id;
        const subscription = subscriptionMap.get(tenantId);

        // 삭제된 매장인 경우
        const isDeleted = tenantData.deleted === true;

        // 구독 정보가 있으면 사용, 없으면 미구독(none)
        if (subscription) {
          return {
            id: tenantId,
            tenantId,
            email: subscription.email || tenantData.email || '',
            memberName: subscription.name || tenantData.name || tenantData.ownerName || '',
            brandName: subscription.brandName || tenantData.brandName || tenantData.businessName || '이름 없음',
            phone: subscription.phone || tenantData.phone || '',
            plan: subscription.plan,
            status: isDeleted ? 'deleted' : subscription.status,
            amount: subscription.amount,
            currentPeriodStart: subscription.currentPeriodStart,
            currentPeriodEnd: subscription.currentPeriodEnd,
            nextBillingDate: subscription.nextBillingDate,
            createdAt: subscription.createdAt || tenantData.createdAt?.toDate?.()?.toISOString() || null,
            pricePolicy: subscription.pricePolicy,
            hasBillingKey: subscription.hasBillingKey,
          };
        } else {
          // 미구독 매장
          return {
            id: tenantId,
            tenantId,
            email: tenantData.email || '',
            memberName: tenantData.name || tenantData.ownerName || '',
            brandName: tenantData.brandName || tenantData.businessName || '이름 없음',
            phone: tenantData.phone || '',
            plan: '',
            status: isDeleted ? 'deleted' : 'none', // 삭제 또는 미구독
            amount: 0,
            currentPeriodStart: null,
            currentPeriodEnd: null,
            nextBillingDate: null,
            createdAt: tenantData.createdAt?.toDate?.()?.toISOString() || null,
            pricePolicy: null,
            hasBillingKey: false,
          };
        }
      });

    // 플랜 필터 (복수 지원)
    if (planFilters.length > 0) {
      subscriptions = subscriptions.filter(s => {
        // 'none'은 plan이 빈 문자열인 경우
        if (planFilters.includes('none')) {
          return planFilters.includes(s.plan) || s.plan === '';
        }
        return planFilters.includes(s.plan);
      });
    }

    // 상태 필터 (복수 지원)
    if (statusFilters.length > 0) {
      subscriptions = subscriptions.filter(s => statusFilters.includes(s.status));
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

    // 생성일 내림차순 정렬 (최신순)
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

    // 기존 구독 데이터 저장 (히스토리 기록용)
    const previousData = subscriptionDoc.data();

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

    // tenants 컬렉션에 변경사항 동기화
    const tenantUpdateData: Record<string, unknown> = {};
    if (status !== undefined) {
      tenantUpdateData['subscription.status'] = status;
      tenantUpdateData['status'] = status;
    }
    if (plan !== undefined) {
      tenantUpdateData['subscription.plan'] = plan;
      tenantUpdateData['plan'] = plan;
    }
    if (currentPeriodEnd !== undefined) {
      tenantUpdateData['subscription.renewsAt'] = currentPeriodEnd ? new Date(currentPeriodEnd) : null;
    }
    if (currentPeriodStart !== undefined) {
      tenantUpdateData['subscription.startedAt'] = currentPeriodStart ? new Date(currentPeriodStart) : null;
    }

    if (Object.keys(tenantUpdateData).length > 0) {
      try {
        await db.collection('tenants').doc(tenantId).update(tenantUpdateData);
        console.log('✅ Tenant subscription synced for admin list edit');
      } catch (syncError) {
        console.error('Failed to sync tenant subscription:', syncError);
      }
    }

    // 구독 히스토리에 수정 기록 추가
    const finalPlan = plan !== undefined ? plan : previousData?.plan || '';
    const finalStatus = status !== undefined ? status : previousData?.status || '';
    const finalPeriodStart = currentPeriodStart ? new Date(currentPeriodStart) : (previousData?.currentPeriodStart?.toDate?.() || new Date());
    const finalPeriodEnd = currentPeriodEnd ? new Date(currentPeriodEnd) : (previousData?.currentPeriodEnd?.toDate?.() || null);
    const finalBillingDate = updateData.nextBillingDate || previousData?.nextBillingDate?.toDate?.() || null;

    await addSubscriptionHistoryRecord(db, {
      tenantId,
      email: previousData?.email || '',
      brandName: brandName !== undefined ? brandName : previousData?.brandName || null,
      plan: finalPlan,
      status: finalStatus,
      amount: previousData?.amount || 0,
      periodStart: finalPeriodStart,
      periodEnd: finalPeriodEnd,
      billingDate: finalBillingDate,
      changeType: 'admin_edit',
      changedAt: new Date(),
      changedBy: 'admin',
      changedByAdminId: admin.adminId,
      previousPlan: previousData?.plan || null,
      previousStatus: previousData?.status || null,
    });

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
