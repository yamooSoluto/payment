import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

// 단일 커스텀 링크 조회
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
  }

  try {
    const doc = await db.collection('customPaymentLinks').doc(id).get();

    if (!doc.exists) {
      return NextResponse.json({ error: 'Link not found' }, { status: 404 });
    }

    const data = doc.data();
    return NextResponse.json({
      link: {
        id: doc.id,
        planId: data?.planId,
        planName: data?.planName,
        customAmount: data?.customAmount,
        targetEmail: data?.targetEmail,
        targetUserName: data?.targetUserName,
        billingType: data?.billingType || 'recurring',
        subscriptionDays: data?.subscriptionDays || null,
        validFrom: data?.validFrom?.toDate?.()?.toISOString() || data?.validFrom,
        validUntil: data?.validUntil?.toDate?.()?.toISOString() || data?.validUntil,
        maxUses: data?.maxUses || 0,
        currentUses: data?.currentUses || 0,
        memo: data?.memo,
        createdBy: data?.createdBy,
        createdAt: data?.createdAt?.toDate?.()?.toISOString() || data?.createdAt,
        updatedAt: data?.updatedAt?.toDate?.()?.toISOString() || data?.updatedAt,
        status: data?.status || 'active',
      },
    });
  } catch (error) {
    console.error('Failed to fetch custom link:', error);
    return NextResponse.json(
      { error: 'Failed to fetch custom link' },
      { status: 500 }
    );
  }
}

// 커스텀 링크 수정
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const {
      planId,
      planName,
      customAmount,
      targetEmail,
      targetUserName,
      billingType,
      subscriptionDays,
      subscriptionEndDate,
      validFrom,
      validUntil,
      maxUses,
      memo,
      status,
    } = body;

    const doc = await db.collection('customPaymentLinks').doc(id).get();
    if (!doc.exists) {
      return NextResponse.json({ error: 'Link not found' }, { status: 404 });
    }

    // 유효기간 검증 (둘 다 있을 경우)
    if (validFrom && validUntil) {
      const fromDate = new Date(validFrom);
      const untilDate = new Date(validUntil);
      if (untilDate <= fromDate) {
        return NextResponse.json(
          { error: 'validUntil must be after validFrom' },
          { status: 400 }
        );
      }
    }

    const updateData: Record<string, unknown> = {
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (planId !== undefined) updateData.planId = planId;
    if (planName !== undefined) updateData.planName = planName;
    if (customAmount !== undefined) updateData.customAmount = customAmount ? Number(customAmount) : null;
    if (targetEmail !== undefined) updateData.targetEmail = targetEmail?.toLowerCase().trim() || null;
    if (targetUserName !== undefined) updateData.targetUserName = targetUserName?.trim() || null;
    if (billingType !== undefined) updateData.billingType = billingType === 'onetime' ? 'onetime' : 'recurring';
    if (subscriptionDays !== undefined) updateData.subscriptionDays = subscriptionDays ? Number(subscriptionDays) : null;
    if (subscriptionEndDate !== undefined) updateData.subscriptionEndDate = subscriptionEndDate ? new Date(subscriptionEndDate) : null;
    if (validFrom !== undefined) updateData.validFrom = new Date(validFrom);
    if (validUntil !== undefined) updateData.validUntil = new Date(validUntil);
    if (maxUses !== undefined) updateData.maxUses = Number(maxUses) || 0;
    if (memo !== undefined) updateData.memo = memo || null;
    if (status !== undefined) updateData.status = status;

    await db.collection('customPaymentLinks').doc(id).update(updateData);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to update custom link:', error);
    return NextResponse.json(
      { error: 'Failed to update custom link' },
      { status: 500 }
    );
  }
}

// 커스텀 링크 비활성화 (삭제 대신 상태 변경)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
  }

  try {
    const doc = await db.collection('customPaymentLinks').doc(id).get();
    if (!doc.exists) {
      return NextResponse.json({ error: 'Link not found' }, { status: 404 });
    }

    // 실제 삭제 대신 상태를 'disabled'로 변경
    await db.collection('customPaymentLinks').doc(id).update({
      status: 'disabled',
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete custom link:', error);
    return NextResponse.json(
      { error: 'Failed to delete custom link' },
      { status: 500 }
    );
  }
}
