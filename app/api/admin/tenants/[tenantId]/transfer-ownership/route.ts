import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminFromRequest, hasPermission } from '@/lib/admin-auth';
import { addAdminLog } from '@/lib/admin-log';

// POST: 매장 소유자 이전
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!hasPermission(admin, 'tenants:write')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { tenantId } = await params;
    const body = await request.json();
    const { newEmail } = body;

    if (!newEmail || typeof newEmail !== 'string') {
      return NextResponse.json({ error: '이메일을 입력하세요.' }, { status: 400 });
    }

    const normalizedEmail = newEmail.toLowerCase().trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return NextResponse.json({ error: '유효하지 않은 이메일 형식입니다.' }, { status: 400 });
    }

    const db = adminDb || initializeFirebaseAdmin();
    if (!db) return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });

    // 현재 테넌트 조회
    const tenantDoc = await db.collection('tenants').doc(tenantId).get();
    if (!tenantDoc.exists) {
      return NextResponse.json({ error: '매장을 찾을 수 없습니다.' }, { status: 404 });
    }

    const tenantData = tenantDoc.data()!;
    const oldEmail = tenantData.email as string;

    if (oldEmail === normalizedEmail) {
      return NextResponse.json({ error: '현재 소유자와 동일한 이메일입니다.' }, { status: 400 });
    }

    // 새 이메일 유저 조회 (없으면 최소 문서 생성)
    const userDoc = await db.collection('users').doc(normalizedEmail).get();
    let newUserId: string;
    let userCreated = false;

    let newUserName = '';
    let newUserPhone = '';

    if (userDoc.exists) {
      const ud = userDoc.data()!;
      newUserId = ud.userId;
      newUserName = ud.name || '';
      newUserPhone = ud.phone || '';
    } else {
      newUserId = 'u_' + Math.random().toString(36).substr(2, 8);
      await db.collection('users').doc(normalizedEmail).set({
        userId: newUserId,
        email: normalizedEmail,
        name: '',
        phone: '',
        group: 'normal',
        createdAt: FieldValue.serverTimestamp(),
      });
      userCreated = true;
    }

    // 병렬 조회: subscriptions, cards
    const [subDoc, cardsDoc] = await Promise.all([
      db.collection('subscriptions').doc(tenantId).get(),
      db.collection('cards').doc(tenantId).get(),
    ]);

    // Batch: tenants + subscriptions(클리어) + cards(삭제)
    const batch = db.batch();

    // 1. tenants — email, userId, name, phone 변경
    batch.update(db.collection('tenants').doc(tenantId), {
      email: normalizedEmail,
      userId: newUserId,
      name: newUserName,
      phone: newUserPhone,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: admin.adminId,
    });

    // 2. subscriptions — email, userId 변경 + 결제 정보 클리어 (구 오너 카드 토큰 무효화)
    if (subDoc.exists) {
      batch.update(db.collection('subscriptions').doc(tenantId), {
        email: normalizedEmail,
        userId: newUserId,
        billingKey: FieldValue.delete(),
        cardInfo: FieldValue.delete(),
        cardAlias: FieldValue.delete(),
        primaryCardId: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    // 3. cards — 구 오너 카드 문서 전체 삭제
    if (cardsDoc.exists) {
      batch.delete(db.collection('cards').doc(tenantId));
    }

    await batch.commit();



    // 어드민 로그
    await addAdminLog(db, admin, {
      action: 'tenant_update',
      tenantId,
      brandName: tenantData.brandName as string || tenantId,
      email: normalizedEmail,
      changes: {
        email: { from: oldEmail, to: normalizedEmail },
        userId: { from: tenantData.userId, to: newUserId },
      },
      details: {
        note: `소유자 이전: ${oldEmail} → ${normalizedEmail}`,
        userCreated,
        cardsDeleted: cardsDoc.exists,
        subscriptionBillingCleared: subDoc.exists,
      },
    });

    return NextResponse.json({
      success: true,
      oldEmail,
      newEmail: normalizedEmail,
      newUserId,
      userCreated,
      cardsDeleted: cardsDoc.exists,
      subscriptionBillingCleared: subDoc.exists,
    });
  } catch (error) {
    console.error('Transfer ownership error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
