import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { isValidIndustry, INDUSTRIES, INDUSTRY_LABEL_TO_CODE, IndustryCode } from '@/lib/constants';
import { getAdminFromRequest, hasPermission } from '@/lib/admin-auth';

// GET: 매장 목록 조회
export async function GET(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);

    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(admin, 'tenants:read')) {
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
    const industryFilter = searchParams.get('industry') || '';
    const statusFilter = searchParams.get('status') || '';
    const subscriptionStatusFilter = searchParams.get('subscriptionStatus') || '';
    const planFilter = searchParams.get('plan') || '';
    const includeDeleted = searchParams.get('includeDeleted') === 'true';

    // 1~3. 테넌트 + 구독 + 유저 정보 병렬 조회
    const [tenantsSnapshot, subscriptionsSnapshot, usersSnapshot] = await Promise.all([
      db.collection('tenants').get(),
      db.collection('subscriptions').get(),
      db.collection('users').get(),
    ]);
    const userMap = new Map<string, { name: string; phone: string }>();
    usersSnapshot.docs.forEach(doc => {
      const d = doc.data();
      userMap.set(doc.id, { name: d.name || '', phone: d.phone || '' });
    });

    const subscriptionMap = new Map<string, {
      plan: string;
      status: string;
      amount: number;
      hasBillingKey: boolean;
      pendingPlan: string | null;
    }>();

    subscriptionsSnapshot.docs.forEach(doc => {
      const data = doc.data();
      subscriptionMap.set(doc.id, {
        plan: data.plan || '',
        status: data.status || '',
        amount: data.amount || 0,
        hasBillingKey: !!data.billingKey,
        pendingPlan: data.pendingPlan || null,
      });
    });

    // 데이터 가공
    interface TenantData {
      id: string;
      tenantId: string;
      email: string;
      name: string;
      brandName: string;
      brandCode: string;
      brand: string;
      branchNo: string | null;
      phone: string;
      industry: string;
      plan: string;
      subscriptionStatus: string;
      status: string;
      deleted: boolean;
      createdAt: string | null;
      hasBillingKey: boolean;
      csTone: string;
      botName: string;
      reviewCode: string;
      pendingPlan: string | null;
    }

    let tenants: TenantData[] = tenantsSnapshot.docs
      .filter(doc => {
        const data = doc.data();
        // 삭제된 매장 필터
        if (data.deleted === true && !includeDeleted) {
          return false;
        }
        return true;
      })
      .map(doc => {
        const data = doc.data();
        const tenantId = data.tenantId || doc.id;
        const subscription = subscriptionMap.get(tenantId);

        const tenantItem = data.tenantItem || {};
        return {
          id: doc.id,
          tenantId,
          email: data.email || '',
          name: userMap.get(data.email?.toLowerCase() || '')?.name || data.name || data.ownerName || '',
          brandName: data.brandName || data.businessName || '이름 없음',
          brandCode: data.brandCode || '',
          brand: data.brand || '',
          branchNo: data.branchNo != null ? String(data.branchNo) : null,
          phone: userMap.get(data.email?.toLowerCase() || '')?.phone || data.phone || '',
          industry: data.industry || '',
          plan: subscription?.plan || '',
          subscriptionStatus: subscription?.status || 'none',
          status: data.deleted ? 'deleted' : (data.status || 'active'),
          deleted: data.deleted || false,
          createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
          hasBillingKey: subscription?.hasBillingKey || false,
          csTone: data.csTone || '',
          botName: tenantItem.BotName || tenantItem.botName || '',
          reviewCode: tenantItem.reviewCode || '',
          pendingPlan: subscription?.pendingPlan || null,
        };
      });

    // 업종 필터 (코드 또는 한글 라벨 모두 매칭)
    if (industryFilter) {
      const industries = industryFilter.split(',');
      tenants = tenants.filter(t => {
        // 코드로 직접 매칭
        if (industries.includes(t.industry)) return true;
        // 한글 라벨로 저장된 경우 코드로 변환해서 매칭
        const codeFromLabel = INDUSTRY_LABEL_TO_CODE[t.industry];
        if (codeFromLabel && industries.includes(codeFromLabel)) return true;
        // 코드로 저장된 경우 라벨로 변환해서 매칭
        const labelFromCode = INDUSTRIES[t.industry as IndustryCode];
        if (labelFromCode) {
          const labelCode = INDUSTRY_LABEL_TO_CODE[labelFromCode];
          if (labelCode && industries.includes(labelCode)) return true;
        }
        return false;
      });
    }

    // 상태 필터 (테넌트 상태: active, deleted 등)
    if (statusFilter) {
      const statuses = statusFilter.split(',');
      tenants = tenants.filter(t => statuses.includes(t.status));
    }

    // 구독상태 필터 (구독 상태: none, trialing, active, canceled, expired 등)
    if (subscriptionStatusFilter) {
      const subscriptionStatuses = subscriptionStatusFilter.split(',');
      tenants = tenants.filter(t => {
        // 삭제된 매장은 구독상태 필터에서 제외 (삭제된 매장 포함 옵션으로만 보임)
        if (t.deleted) return false;
        return subscriptionStatuses.includes(t.subscriptionStatus);
      });
    }

    // 플랜 필터
    if (planFilter) {
      const plans = planFilter.split(',');
      tenants = tenants.filter(t => {
        if (plans.includes('none') && !t.plan) return true;
        return plans.includes(t.plan);
      });
    }

    // 검색 필터
    if (search) {
      const searchLower = search.toLowerCase();
      tenants = tenants.filter(t => {
        return (
          t.email.toLowerCase().includes(searchLower) ||
          t.name.toLowerCase().includes(searchLower) ||
          t.brandName.toLowerCase().includes(searchLower) ||
          t.tenantId.toLowerCase().includes(searchLower) ||
          t.brandCode.toLowerCase().includes(searchLower) ||
          t.phone.toLowerCase().includes(searchLower)
        );
      });
    }

    // 생성순 정렬 (오래된 순)
    tenants.sort((a, b) => {
      const aTime = a.createdAt || '';
      const bTime = b.createdAt || '';
      return aTime.localeCompare(bTime);
    });

    // 페이지네이션
    const total = tenants.length;
    const totalPages = Math.ceil(total / limit);
    const startIndex = (page - 1) * limit;
    const paginatedTenants = tenants.slice(startIndex, startIndex + limit);

    return NextResponse.json({
      tenants: paginatedTenants,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    });
  } catch (error) {
    console.error('Get tenants error:', error);
    return NextResponse.json(
      { error: '매장 목록을 불러오는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// 관리자: 매장 생성 (provision API 직접 호출 — n8n 불필요)
export async function POST(request: NextRequest) {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
  }

  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!hasPermission(admin, 'tenants:write')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await request.json();
    const { email, brandName, industry } = body;

    // 필수 필드 검증
    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: '이메일을 입력해주세요.' }, { status: 400 });
    }

    if (!brandName || typeof brandName !== 'string' || brandName.trim() === '') {
      return NextResponse.json({ error: '매장명을 입력해주세요.' }, { status: 400 });
    }

    if (!industry || !isValidIndustry(industry)) {
      return NextResponse.json({ error: '유효한 업종을 선택해주세요.' }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // users 컬렉션에서 사용자 정보 조회 (name, phone)
    const userDoc = await db.collection('users').doc(normalizedEmail).get();
    const userData = userDoc.exists ? userDoc.data() : null;

    // provision API 직접 호출 (tenant + naver/widget integration 자동 생성)
    let tenantId: string | null = null;

    try {
      const provisionUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'https://yamoo.ai.kr'}/api/admin/integrations/provision`;
      const provisionRes = await fetch(provisionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.ADMIN_SYNC_TOKEN}`,
        },
        body: JSON.stringify({
          email: normalizedEmail,
          name: userData?.name || null,
          phone: userData?.phone || null,
          brandName: brandName.trim(),
          industry,
          source: 'admin_add_store',
        }),
      });

      const provisionData = await provisionRes.json();
      console.log('[admin/tenants] 프로비저닝 결과:', provisionData);

      if (!provisionRes.ok) {
        console.error('[admin/tenants] 프로비저닝 실패:', provisionData.error);
        return NextResponse.json({ error: provisionData.error || '매장 생성에 실패했습니다.' }, { status: 500 });
      }

      tenantId = provisionData.tenantId;
    } catch (error) {
      console.error('[admin/tenants] 프로비저닝 호출 오류:', error);
      return NextResponse.json({ error: '매장 생성에 실패했습니다.' }, { status: 500 });
    }

    if (!tenantId) {
      return NextResponse.json({ error: '매장 ID 생성에 실패했습니다.' }, { status: 500 });
    }

    // subscription.status를 expired로 설정 (체험/결제 전 상태)
    try {
      await db.collection('tenants').doc(tenantId).set(
        { subscription: { status: 'expired' } },
        { merge: true }
      );
    } catch (error) {
      console.error('subscription.status 설정 오류:', error);
    }

    return NextResponse.json({
      success: true,
      tenantId,
      brandName: brandName.trim(),
      industry,
      message: '매장이 생성되었습니다.',
    });
  } catch (error) {
    console.error('Failed to create tenant:', error);
    return NextResponse.json(
      { error: '매장 생성에 실패했습니다.' },
      { status: 500 }
    );
  }
}
