import { NextRequest, NextResponse } from 'next/server';
import { getAdminFromRequest, hasPermission } from '@/lib/admin-auth';
import { initializeFirebaseAdmin } from '@/lib/firebase-admin';

// GET: 회원 상세 조회
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

    // 회원 정보 조회
    const memberDoc = await db.collection('tenants').doc(id).get();
    if (!memberDoc.exists) {
      return NextResponse.json({ error: '회원을 찾을 수 없습니다.' }, { status: 404 });
    }

    const memberData = memberDoc.data();
    const member = {
      id: memberDoc.id,
      ...memberData,
      createdAt: memberData?.createdAt?.toDate?.()?.toISOString() || null,
      updatedAt: memberData?.updatedAt?.toDate?.()?.toISOString() || null,
      subscriptionStartDate: memberData?.subscriptionStartDate?.toDate?.()?.toISOString() || null,
      subscriptionEndDate: memberData?.subscriptionEndDate?.toDate?.()?.toISOString() || null,
      trialEndDate: memberData?.trialEndDate?.toDate?.()?.toISOString() || null,
    };

    // 결제 내역 조회
    const paymentsSnapshot = await db.collection('payments')
      .where('tenantId', '==', id)
      .orderBy('createdAt', 'desc')
      .limit(20)
      .get();

    const payments = paymentsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate?.()?.toISOString() || null,
      paidAt: doc.data().paidAt?.toDate?.()?.toISOString() || null,
    }));

    // 매장 목록 조회 (stores 컬렉션이 있는 경우)
    let stores: Array<{ id: string; [key: string]: unknown }> = [];
    try {
      const storesSnapshot = await db.collection('stores')
        .where('tenantId', '==', id)
        .get();
      stores = storesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));
    } catch {
      // stores 컬렉션이 없을 수 있음
    }

    return NextResponse.json({
      member,
      payments,
      stores,
    });
  } catch (error) {
    console.error('Get member detail error:', error);
    return NextResponse.json(
      { error: '회원 정보를 불러오는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// PUT: 회원 정보 수정
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

    const body = await request.json();
    const { businessName, ownerName, phone, memo } = body;

    await db.collection('tenants').doc(id).update({
      ...(businessName !== undefined && { businessName }),
      ...(ownerName !== undefined && { ownerName }),
      ...(phone !== undefined && { phone }),
      ...(memo !== undefined && { memo }),
      updatedAt: new Date(),
      updatedBy: admin.adminId,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update member error:', error);
    return NextResponse.json(
      { error: '회원 정보를 수정하는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
