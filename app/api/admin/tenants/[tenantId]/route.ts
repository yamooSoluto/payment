import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminFromRequest, hasPermission } from '@/lib/admin-auth';

// Firestore Timestamp를 ISO 문자열로 변환하는 헬퍼 함수
function convertTimestamps(data: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === undefined) {
      result[key] = value;
    } else if (typeof value === 'object' && value !== null) {
      // Firestore Timestamp 체크
      if ('toDate' in value && typeof (value as { toDate: () => Date }).toDate === 'function') {
        result[key] = (value as { toDate: () => Date }).toDate().toISOString();
      } else if (Array.isArray(value)) {
        result[key] = value.map(item =>
          typeof item === 'object' && item !== null ? convertTimestamps(item as Record<string, unknown>) : item
        );
      } else {
        result[key] = convertTimestamps(value as Record<string, unknown>);
      }
    } else {
      result[key] = value;
    }
  }

  return result;
}

// GET: 매장 상세 조회 (모든 필드 반환)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> }
) {
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

    const { tenantId } = await params;

    // 테넌트 문서 조회
    const tenantDoc = await db.collection('tenants').doc(tenantId).get();

    if (!tenantDoc.exists) {
      return NextResponse.json({ error: '매장을 찾을 수 없습니다.' }, { status: 404 });
    }

    const tenantData = tenantDoc.data() || {};

    // Firestore Timestamp를 ISO 문자열로 변환
    const tenant = convertTimestamps(tenantData);

    // 구독 정보 조회
    const subscriptionDoc = await db.collection('subscriptions').doc(tenantId).get();
    let subscription = null;
    if (subscriptionDoc.exists) {
      const subData = subscriptionDoc.data() || {};
      subscription = convertTimestamps(subData);
    }

    // 결제 내역 조회 (전체) - 인덱스 없이 조회 후 정렬
    let payments: Array<{ id: string; [key: string]: unknown }> = [];
    try {
      // 인덱스 없이 tenantId로만 필터링
      const paymentsSnapshot = await db.collection('payments')
        .where('tenantId', '==', tenantId)
        .get();

      payments = paymentsSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...convertTimestamps(data),
        };
      });

      // 클라이언트 사이드에서 createdAt 내림차순 정렬
      payments.sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt as string).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt as string).getTime() : 0;
        return dateB - dateA;
      });
    } catch (paymentError) {
      console.error('Failed to fetch payments:', paymentError);
    }

    // 구독 히스토리 조회 - 인덱스 없이 조회 후 정렬
    let subscriptionHistory: Array<{ recordId: string; [key: string]: unknown }> = [];
    try {
      const historySnapshot = await db.collection('subscription_history')
        .doc(tenantId)
        .collection('records')
        .get();

      subscriptionHistory = historySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          recordId: doc.id,
          ...convertTimestamps(data),
        };
      });

      // 클라이언트 사이드에서 changedAt 내림차순 정렬
      subscriptionHistory.sort((a, b) => {
        const dateA = a.changedAt ? new Date(a.changedAt as string).getTime() : 0;
        const dateB = b.changedAt ? new Date(b.changedAt as string).getTime() : 0;
        return dateB - dateA;
      });
    } catch (historyError) {
      console.error('Failed to fetch subscription history:', historyError);
    }

    // 관리자 이름 매핑 조회
    let adminNames: Record<string, string> = {};
    try {
      const adminsSnapshot = await db.collection('admins').get();
      adminsSnapshot.docs.forEach(doc => {
        const data = doc.data();
        adminNames[doc.id] = data.name || data.loginId || doc.id;
      });
    } catch (adminError) {
      console.error('Failed to fetch admin names:', adminError);
    }

    return NextResponse.json({
      tenant: {
        id: tenantDoc.id,
        tenantId: tenantData.tenantId || tenantDoc.id,
        ...tenant,
      },
      subscription,
      payments,
      subscriptionHistory,
      adminNames,
    });
  } catch (error) {
    console.error('Get tenant detail error:', error);
    return NextResponse.json(
      { error: '매장 정보를 불러오는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// PUT: 매장 정보 수정 (동적 필드 지원)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  try {
    const admin = await getAdminFromRequest(request);

    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(admin, 'tenants:write')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const db = adminDb || initializeFirebaseAdmin();
    if (!db) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
    }

    const { tenantId } = await params;
    const body = await request.json();

    // 매장 존재 여부 확인
    const tenantDoc = await db.collection('tenants').doc(tenantId).get();
    if (!tenantDoc.exists) {
      return NextResponse.json({ error: '매장을 찾을 수 없습니다.' }, { status: 404 });
    }

    // 읽기 전용 필드 목록 (수정 불가)
    const READ_ONLY_FIELDS = [
      'tenantId', 'email', 'userId',
      'deleted', 'deletedAt', 'deletedBy', 'permanentDeleteAt',
      'createdAt', 'createdBy', 'updatedAt', 'updatedBy',
      'isManualRegistration', 'onboardingCompletedAt',
      'widgetUrl', 'naverInboundUrl', 'webhook',
      // 구독 관련 (구독 페이지에서 관리)
      'plan', 'planId', 'subscription', 'subscriptionStatus', 'orderNo', 'totalPrice'
    ];

    // 업데이트할 데이터 필터링
    const updateData: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(body)) {
      // 읽기 전용 필드 제외
      if (READ_ONLY_FIELDS.includes(key)) {
        continue;
      }

      // 날짜 문자열을 Date로 변환
      if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?/.test(value)) {
        updateData[key] = new Date(value);
      } else {
        updateData[key] = value;
      }
    }

    // 구독 필드 분리 (subscription.* 형태의 필드들)
    const subscriptionUpdateData: Record<string, unknown> = {};
    const keysToRemove: string[] = [];

    for (const [key, value] of Object.entries(body)) {
      if (key.startsWith('subscription.')) {
        const subKey = key.replace('subscription.', '');
        // 날짜 문자열을 Date로 변환
        if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?/.test(value)) {
          subscriptionUpdateData[subKey] = new Date(value);
        } else {
          subscriptionUpdateData[subKey] = value;
        }
        keysToRemove.push(key);
      }
    }

    // 구독 필드는 updateData에서 제거
    for (const key of keysToRemove) {
      delete updateData[key];
    }

    // 구독 필드 업데이트 (subscriptions 컬렉션 + tenants.subscription 필드)
    if (Object.keys(subscriptionUpdateData).length > 0) {
      subscriptionUpdateData.updatedAt = FieldValue.serverTimestamp();
      subscriptionUpdateData.updatedBy = admin.name;

      // 1. subscriptions 컬렉션 업데이트
      const subscriptionDoc = await db.collection('subscriptions').doc(tenantId).get();
      if (subscriptionDoc.exists) {
        await db.collection('subscriptions').doc(tenantId).update(subscriptionUpdateData);
      } else {
        // 구독 문서가 없으면 생성
        await db.collection('subscriptions').doc(tenantId).set({
          tenantId,
          ...subscriptionUpdateData,
          createdAt: FieldValue.serverTimestamp(),
        });
      }

      // 2. tenants 컬렉션의 subscription 필드도 함께 업데이트
      const tenantSubscriptionUpdate: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(subscriptionUpdateData)) {
        // updatedAt, updatedBy는 제외 (tenants 문서 레벨에서 별도로 관리)
        if (key !== 'updatedAt' && key !== 'updatedBy') {
          tenantSubscriptionUpdate[`subscription.${key}`] = value;
        }
      }
      if (Object.keys(tenantSubscriptionUpdate).length > 0) {
        tenantSubscriptionUpdate.updatedAt = FieldValue.serverTimestamp();
        tenantSubscriptionUpdate.updatedBy = admin.name;
        await db.collection('tenants').doc(tenantId).update(tenantSubscriptionUpdate);
      }
    }

    // 테넌트 필드 업데이트 (tenants 컬렉션)
    if (Object.keys(updateData).length > 0) {
      updateData.updatedAt = FieldValue.serverTimestamp();
      updateData.updatedBy = admin.name;
      await db.collection('tenants').doc(tenantId).update(updateData);
    }

    // brandName이 변경되면 subscriptions 컬렉션에도 업데이트
    if (body.brandName) {
      const subscriptionDoc = await db.collection('subscriptions').doc(tenantId).get();
      if (subscriptionDoc.exists) {
        await db.collection('subscriptions').doc(tenantId).update({
          brandName: body.brandName,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: '정보가 수정되었습니다.',
    });
  } catch (error) {
    console.error('Update tenant error:', error);
    return NextResponse.json(
      { error: '매장 정보를 수정하는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// 관리자: 매장 수정
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
  }

  try {
    const { tenantId } = await params;
    const body = await request.json();
    const { brandName, industry } = body;

    // 매장 존재 여부 확인
    const tenantDoc = await db.collection('tenants').doc(tenantId).get();
    if (!tenantDoc.exists) {
      return NextResponse.json({ error: '매장을 찾을 수 없습니다.' }, { status: 404 });
    }

    // 업데이트할 데이터
    const updateData: Record<string, unknown> = {
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: 'admin',
    };

    if (brandName && typeof brandName === 'string' && brandName.trim() !== '') {
      updateData.brandName = brandName.trim();
    }

    if (industry && typeof industry === 'string') {
      updateData.industry = industry;
    }

    await db.collection('tenants').doc(tenantId).update(updateData);

    // subscriptions 컬렉션에도 brandName 업데이트 (존재하는 경우)
    if (updateData.brandName) {
      const subscriptionDoc = await db.collection('subscriptions').doc(tenantId).get();
      if (subscriptionDoc.exists) {
        await db.collection('subscriptions').doc(tenantId).update({
          brandName: updateData.brandName,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: '매장 정보가 수정되었습니다.',
    });
  } catch (error) {
    console.error('Failed to update tenant:', error);
    return NextResponse.json(
      { error: '매장 수정에 실패했습니다.' },
      { status: 500 }
    );
  }
}

// 관리자: 매장 삭제 (Soft Delete)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
  }

  try {
    const { tenantId } = await params;

    // 매장 존재 여부 확인
    const tenantDoc = await db.collection('tenants').doc(tenantId).get();
    if (!tenantDoc.exists) {
      return NextResponse.json({ error: '매장을 찾을 수 없습니다.' }, { status: 404 });
    }

    const tenantData = tenantDoc.data();
    if (tenantData?.deleted) {
      return NextResponse.json({ error: '이미 삭제된 매장입니다.' }, { status: 400 });
    }

    // Soft Delete 처리
    const now = new Date();
    const permanentDeleteAt = new Date(now);
    permanentDeleteAt.setDate(permanentDeleteAt.getDate() + 90); // 90일 후 영구 삭제

    // 1. tenants 컬렉션 업데이트
    await db.collection('tenants').doc(tenantId).update({
      deleted: true,
      deletedAt: now,
      deletedBy: 'admin',
      permanentDeleteAt,
      updatedAt: FieldValue.serverTimestamp(),
      // 구독 정보도 만료 처리
      'subscription.status': 'expired',
      'subscription.canceledAt': now,
    });

    // 2. subscriptions 컬렉션 업데이트 (자동 결제 방지)
    const subscriptionDoc = await db.collection('subscriptions').doc(tenantId).get();
    if (subscriptionDoc.exists) {
      await db.collection('subscriptions').doc(tenantId).update({
        status: 'expired',
        canceledAt: now,
        cancelReason: '매장 삭제',
        // pending 플랜도 제거 (예약 결제 방지)
        pendingPlan: null,
        pendingAmount: null,
        pendingChangeAt: null,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: 'admin',
      });
    }

    // 3. 삭제 로그 기록
    await db.collection('tenant_deletions').add({
      tenantId,
      brandName: tenantData?.brandName,
      email: tenantData?.email,
      deletedAt: now,
      permanentDeleteAt,
      reason: 'admin_delete',
    });

    return NextResponse.json({
      success: true,
      message: '매장이 삭제되었습니다.',
      deletedAt: now.toISOString(),
      permanentDeleteAt: permanentDeleteAt.toISOString(),
    });
  } catch (error) {
    console.error('Failed to delete tenant:', error);
    return NextResponse.json(
      { error: '매장 삭제에 실패했습니다.' },
      { status: 500 }
    );
  }
}
