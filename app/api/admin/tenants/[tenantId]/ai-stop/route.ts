import { NextRequest, NextResponse } from 'next/server';
import { getAdminFromRequest, hasPermission } from '@/lib/admin-auth';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

// 관리자: AI 정지 상태 토글
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
  }

  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(admin, 'tenants:write')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { tenantId } = await params;
    const body = await request.json();
    const { ai_stop } = body;

    if (typeof ai_stop !== 'boolean') {
      return NextResponse.json({ error: 'ai_stop must be a boolean' }, { status: 400 });
    }

    // 매장 존재 여부 확인
    const tenantRef = db.collection('tenants').doc(tenantId);
    const tenantDoc = await tenantRef.get();

    if (!tenantDoc.exists) {
      return NextResponse.json({ error: '매장을 찾을 수 없습니다.' }, { status: 404 });
    }

    // ai_stop 필드 업데이트
    await tenantRef.update({
      ai_stop,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: admin.adminId,
    });

    return NextResponse.json({
      success: true,
      message: ai_stop ? 'AI가 정지되었습니다.' : 'AI 정지가 해제되었습니다.',
      ai_stop,
    });
  } catch (error) {
    console.error('Failed to update AI stop status:', error);
    return NextResponse.json(
      { error: 'AI 상태 변경에 실패했습니다.' },
      { status: 500 }
    );
  }
}

// 관리자: AI 정지 상태 조회
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
  }

  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(admin, 'tenants:read')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { tenantId } = await params;

    const tenantDoc = await db.collection('tenants').doc(tenantId).get();
    if (!tenantDoc.exists) {
      return NextResponse.json({ error: '매장을 찾을 수 없습니다.' }, { status: 404 });
    }

    const data = tenantDoc.data();

    return NextResponse.json({
      success: true,
      ai_stop: data?.ai_stop === true, // 없거나 false면 false
    });
  } catch (error) {
    console.error('Failed to get AI stop status:', error);
    return NextResponse.json(
      { error: 'AI 상태 조회에 실패했습니다.' },
      { status: 500 }
    );
  }
}
