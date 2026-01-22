import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { verifyToken } from '@/lib/auth';
import { FieldValue } from 'firebase-admin/firestore';

// 매장 정보 수정 (매장명만)
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
    const { token, email: emailParam, brandName } = body;

    // 인증 확인
    let email: string | null = null;
    if (token) {
      email = await verifyToken(token);
    } else if (emailParam) {
      email = emailParam;
    }

    if (!email) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // 필수 필드 검증
    if (!brandName || typeof brandName !== 'string' || brandName.trim() === '') {
      return NextResponse.json({ error: '매장명을 입력해주세요.' }, { status: 400 });
    }

    // users 컬렉션에서 userId 조회
    const userDoc = await db.collection('users').doc(email).get();
    const userId = userDoc.exists ? userDoc.data()?.userId : null;

    // 매장 존재 여부 및 소유권 확인 (userId 기반, fallback으로 email)
    const tenantDoc = await db.collection('tenants').doc(tenantId).get();
    if (!tenantDoc.exists) {
      return NextResponse.json({ error: '매장을 찾을 수 없습니다.' }, { status: 404 });
    }

    const tenantData = tenantDoc.data();
    const isOwner = userId
      ? tenantData?.userId === userId
      : tenantData?.email === email;
    if (!isOwner) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    if (tenantData?.deleted) {
      return NextResponse.json({ error: '삭제된 매장입니다.' }, { status: 400 });
    }

    // 매장명 업데이트
    await db.collection('tenants').doc(tenantId).update({
      brandName: brandName.trim(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // subscriptions 컬렉션에도 brandName 업데이트 (존재하는 경우)
    const subscriptionDoc = await db.collection('subscriptions').doc(tenantId).get();
    if (subscriptionDoc.exists) {
      await db.collection('subscriptions').doc(tenantId).update({
        brandName: brandName.trim(),
        updatedAt: FieldValue.serverTimestamp(),
      });
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

// 매장 삭제 (Soft Delete)
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
    const body = await request.json();
    const { token, email: emailParam, confirmText } = body;

    // 인증 확인
    let email: string | null = null;
    if (token) {
      email = await verifyToken(token);
    } else if (emailParam) {
      email = emailParam;
    }

    if (!email) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // 확인 문구 검증
    if (confirmText !== '매장삭제') {
      return NextResponse.json({ error: '확인 문구가 일치하지 않습니다.' }, { status: 400 });
    }

    // users 컬렉션에서 userId 조회
    const userDoc = await db.collection('users').doc(email).get();
    const userId = userDoc.exists ? userDoc.data()?.userId : null;

    // 매장 존재 여부 및 소유권 확인 (userId 기반, fallback으로 email)
    const tenantDoc = await db.collection('tenants').doc(tenantId).get();
    if (!tenantDoc.exists) {
      return NextResponse.json({ error: '매장을 찾을 수 없습니다.' }, { status: 404 });
    }

    const tenantData = tenantDoc.data();
    const isOwner = userId
      ? tenantData?.userId === userId
      : tenantData?.email === email;
    if (!isOwner) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    if (tenantData?.deleted) {
      return NextResponse.json({ error: '이미 삭제된 매장입니다.' }, { status: 400 });
    }

    // 구독 상태 확인 (활성 구독 중인 경우 삭제 불가)
    const subscriptionDoc = await db.collection('subscriptions').doc(tenantId).get();
    if (subscriptionDoc.exists) {
      const subscriptionData = subscriptionDoc.data();
      const status = subscriptionData?.status;

      // 삭제 불가능한 상태: trial, active, canceled, past_due
      if (['trial', 'active', 'canceled', 'past_due'].includes(status)) {
        const statusLabels: Record<string, string> = {
          trial: '무료체험 중',
          active: '구독 중',
          canceled: '해지 예정',
          past_due: '결제 실패',
        };
        return NextResponse.json(
          { error: `${statusLabels[status] || '구독'} 상태에서는 매장을 삭제할 수 없습니다.` },
          { status: 400 }
        );
      }
    }

    // Soft Delete 처리
    const now = new Date();
    const permanentDeleteAt = new Date(now);
    permanentDeleteAt.setDate(permanentDeleteAt.getDate() + 90); // 90일 후 영구 삭제

    await db.collection('tenants').doc(tenantId).update({
      deleted: true,
      deletedAt: now,
      deletedBy: email,
      permanentDeleteAt,
      updatedAt: FieldValue.serverTimestamp(),
    });

    // 삭제 로그 기록 (userId는 위에서 이미 조회함)
    await db.collection('tenant_deletions').add({
      tenantId,
      userId: userId || tenantData?.userId || '',
      brandName: tenantData?.brandName,
      email,
      deletedAt: now,
      permanentDeleteAt,
      reason: 'user_request',
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
