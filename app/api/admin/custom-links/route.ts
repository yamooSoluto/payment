import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { generateLinkId, getAllPlansIncludingHidden } from '@/lib/auth';
import { FieldValue } from 'firebase-admin/firestore';

// 커스텀 결제 링크 목록 조회
export async function GET() {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
  }

  try {
    const snapshot = await db.collection('customPaymentLinks')
      .orderBy('createdAt', 'desc')
      .get();

    const links = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        planId: data.planId,
        planName: data.planName,
        customAmount: data.customAmount,
        targetEmail: data.targetEmail,
        targetUserName: data.targetUserName,
        billingType: data.billingType || 'recurring',
        subscriptionDays: data.subscriptionDays || null,
        validFrom: data.validFrom?.toDate?.()?.toISOString() || data.validFrom,
        validUntil: data.validUntil?.toDate?.()?.toISOString() || data.validUntil,
        maxUses: data.maxUses || 0,
        currentUses: data.currentUses || 0,
        memo: data.memo,
        createdBy: data.createdBy,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt,
        status: data.status || 'active',
      };
    });

    // 모든 플랜 목록도 함께 반환 (드롭다운용)
    const plans = await getAllPlansIncludingHidden();

    return NextResponse.json({ links, plans });
  } catch (error) {
    console.error('Failed to fetch custom links:', error);
    return NextResponse.json(
      { error: 'Failed to fetch custom links' },
      { status: 500 }
    );
  }
}

// 새 커스텀 결제 링크 생성
export async function POST(request: NextRequest) {
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
      billingType = 'recurring',
      subscriptionDays,
      validFrom,
      validUntil,
      maxUses = 0,
      memo,
      createdBy = 'admin',
    } = body;

    // 필수 필드 검증
    if (!planId || !validFrom || !validUntil) {
      return NextResponse.json(
        { error: 'planId, validFrom, validUntil are required' },
        { status: 400 }
      );
    }

    // 유효기간 검증
    const fromDate = new Date(validFrom);
    const untilDate = new Date(validUntil);
    if (untilDate <= fromDate) {
      return NextResponse.json(
        { error: 'validUntil must be after validFrom' },
        { status: 400 }
      );
    }

    // 고유 링크 ID 생성
    let linkId = generateLinkId();
    let attempts = 0;
    while (attempts < 10) {
      const existing = await db.collection('customPaymentLinks').doc(linkId).get();
      if (!existing.exists) break;
      linkId = generateLinkId();
      attempts++;
    }

    const linkData = {
      planId,
      planName: planName || planId,
      customAmount: customAmount ? Number(customAmount) : null,
      targetEmail: targetEmail?.toLowerCase().trim() || null,
      targetUserName: targetUserName?.trim() || null,
      billingType: billingType === 'onetime' ? 'onetime' : 'recurring',
      subscriptionDays: billingType === 'onetime' && subscriptionDays ? Number(subscriptionDays) : null,
      validFrom: fromDate,
      validUntil: untilDate,
      maxUses: Number(maxUses) || 0,
      currentUses: 0,
      memo: memo || null,
      createdBy,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      status: 'active',
    };

    await db.collection('customPaymentLinks').doc(linkId).set(linkData);

    return NextResponse.json({
      success: true,
      link: {
        id: linkId,
        ...linkData,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Failed to create custom link:', error);
    return NextResponse.json(
      { error: 'Failed to create custom link' },
      { status: 500 }
    );
  }
}
