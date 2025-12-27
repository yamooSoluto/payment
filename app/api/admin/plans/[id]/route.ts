import { NextRequest, NextResponse } from 'next/server';
import { getAdminFromRequest, hasPermission } from '@/lib/admin-auth';
import { initializeFirebaseAdmin } from '@/lib/firebase-admin';

// GET: 플랜 상세 조회
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

    if (!hasPermission(admin, 'plans:read')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const db = initializeFirebaseAdmin();
    if (!db) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
    }

    const doc = await db.collection('plans').doc(id).get();
    if (!doc.exists) {
      return NextResponse.json({ error: '플랜을 찾을 수 없습니다.' }, { status: 404 });
    }

    return NextResponse.json({
      id: doc.id,
      ...doc.data(),
      updatedAt: doc.data()?.updatedAt?.toDate?.()?.toISOString() || null,
    });
  } catch (error) {
    console.error('Get plan error:', error);
    return NextResponse.json(
      { error: '플랜 정보를 불러오는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// PUT: 플랜 수정
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

    if (!hasPermission(admin, 'plans:write')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const db = initializeFirebaseAdmin();
    if (!db) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
    }

    const body = await request.json();
    const { name, price, tagline, description, features, refundPolicy, isActive, popular, order, isNegotiable } = body;

    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
      updatedBy: admin.adminId,
    };

    if (name !== undefined) updateData.name = name;
    if (price !== undefined) updateData.price = price;
    if (tagline !== undefined) updateData.tagline = tagline;
    if (description !== undefined) updateData.description = description;
    if (features !== undefined) updateData.features = features;
    if (refundPolicy !== undefined) updateData.refundPolicy = refundPolicy;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (popular !== undefined) updateData.popular = popular;
    if (order !== undefined) updateData.order = order;
    if (isNegotiable !== undefined) updateData.isNegotiable = isNegotiable;

    await db.collection('plans').doc(id).update(updateData);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update plan error:', error);
    return NextResponse.json(
      { error: '플랜을 수정하는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// DELETE: 플랜 삭제
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await getAdminFromRequest(request);
    const { id } = await params;

    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(admin, 'plans:write')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const db = initializeFirebaseAdmin();
    if (!db) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
    }

    // 사용 중인 플랜인지 확인
    const tenantsSnapshot = await db.collection('tenants')
      .where('planId', '==', id)
      .limit(1)
      .get();

    if (!tenantsSnapshot.empty) {
      return NextResponse.json(
        { error: '이 플랜을 사용 중인 회원이 있어 삭제할 수 없습니다.' },
        { status: 400 }
      );
    }

    await db.collection('plans').doc(id).delete();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete plan error:', error);
    return NextResponse.json(
      { error: '플랜을 삭제하는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
