import { NextRequest, NextResponse } from 'next/server';
import { getAdminFromRequest, hasPermission } from '@/lib/admin-auth';
import { initializeFirebaseAdmin } from '@/lib/firebase-admin';

// GET: 회원 상세 조회 (이메일 기준)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await getAdminFromRequest(request);
    const { id } = await params;

    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(admin, 'members:read')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const db = initializeFirebaseAdmin();
    if (!db) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
    }

    // URL 디코딩된 이메일로 조회
    const email = decodeURIComponent(id);

    // 이메일로 tenants 조회
    const tenantsSnapshot = await db.collection('tenants')
      .where('email', '==', email)
      .get();

    if (tenantsSnapshot.empty) {
      return NextResponse.json({ error: '회원을 찾을 수 없습니다.' }, { status: 404 });
    }

    // 첫 번째 tenant에서 회원 기본 정보 가져오기
    const firstTenantData = tenantsSnapshot.docs[0].data();

    // 회원 기본 정보
    const member = {
      id: encodeURIComponent(email),
      email,
      name: firstTenantData.name || firstTenantData.ownerName || '',
      phone: firstTenantData.phone || '',
      createdAt: firstTenantData.createdAt?.toDate?.()?.toISOString() || null,
      memo: firstTenantData.memo || '',
    };

    // 모든 매장(tenant) 정보 수집
    const tenantDataList = tenantsSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        docId: doc.id,
        tenantId: data.tenantId || doc.id,
        brandName: data.brandName || data.businessName || '이름 없음',
        address: data.address || '',
        createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
      };
    });

    // 구독 정보 한 번에 조회
    const subscriptionRefs = tenantDataList.map(t =>
      db.collection('subscriptions').doc(t.tenantId)
    );
    const subscriptionDocs = subscriptionRefs.length > 0 ? await db.getAll(...subscriptionRefs) : [];

    const subscriptionMap = new Map<string, {
      plan: string;
      status: string;
      amount: number;
      nextBillingDate: string | null;
      currentPeriodEnd: string | null;
    }>();

    subscriptionDocs.forEach((doc) => {
      if (doc.exists) {
        const data = doc.data();
        subscriptionMap.set(doc.id, {
          plan: data?.plan || '',
          status: data?.status || '',
          amount: data?.amount || 0,
          nextBillingDate: data?.nextBillingDate?.toDate?.()?.toISOString() || null,
          currentPeriodEnd: data?.currentPeriodEnd?.toDate?.()?.toISOString() || null,
        });
      }
    });

    // 매장 목록 (구독 정보 포함)
    const tenants = tenantDataList.map(tenant => ({
      ...tenant,
      subscription: subscriptionMap.get(tenant.tenantId) || null,
    }));

    // 모든 tenantId로 결제 내역 조회
    const tenantIds = tenantDataList.map(t => t.tenantId);
    let payments: Array<{ id: string; [key: string]: unknown }> = [];

    if (tenantIds.length > 0) {
      // Firestore는 'in' 쿼리에서 최대 10개의 값만 지원
      const chunkedIds = [];
      for (let i = 0; i < tenantIds.length; i += 10) {
        chunkedIds.push(tenantIds.slice(i, i + 10));
      }

      for (const chunk of chunkedIds) {
        try {
          const paymentsSnapshot = await db.collection('payments')
            .where('tenantId', 'in', chunk)
            .get();

          const chunkPayments = paymentsSnapshot.docs.map(doc => {
            const data = doc.data();
            return {
              id: doc.id,
              ...data,
              createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
              paidAt: data.paidAt?.toDate?.()?.toISOString() || null,
            };
          });

          payments = [...payments, ...chunkPayments];
        } catch {
          // 인덱스 없을 수 있음
        }
      }

      // 결제일 기준 정렬
      payments.sort((a, b) => {
        const aTime = a.createdAt ? new Date(a.createdAt as string).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt as string).getTime() : 0;
        return bTime - aTime;
      });

      payments = payments.slice(0, 20);
    }

    return NextResponse.json({
      member,
      tenants,
      payments,
    });
  } catch (error) {
    console.error('Get member detail error:', error);
    return NextResponse.json(
      { error: '회원 정보를 불러오는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// PUT: 회원 정보 수정 (이메일 기준으로 모든 tenant 업데이트)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await getAdminFromRequest(request);
    const { id } = await params;

    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(admin, 'members:write')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const db = initializeFirebaseAdmin();
    if (!db) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
    }

    // URL 디코딩된 이메일
    const email = decodeURIComponent(id);

    const body = await request.json();
    const { name, phone, memo } = body;

    // 이메일로 모든 tenant 조회
    const tenantsSnapshot = await db.collection('tenants')
      .where('email', '==', email)
      .get();

    if (tenantsSnapshot.empty) {
      return NextResponse.json({ error: '회원을 찾을 수 없습니다.' }, { status: 404 });
    }

    // 모든 tenant 문서 업데이트
    const batch = db.batch();
    tenantsSnapshot.docs.forEach(doc => {
      batch.update(doc.ref, {
        ...(name !== undefined && { name }),
        ...(phone !== undefined && { phone }),
        ...(memo !== undefined && { memo }),
        updatedAt: new Date(),
        updatedBy: admin.adminId,
      });
    });

    await batch.commit();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update member error:', error);
    return NextResponse.json(
      { error: '회원 정보를 수정하는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
