import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { verifyToken } from '@/lib/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { isN8NNotificationEnabled } from '@/lib/n8n';

export async function POST(request: NextRequest) {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { token, email: emailParam, tenantId } = body;

    let email: string | null = null;

    if (token) {
      email = await verifyToken(token);
    } else if (emailParam) {
      email = emailParam;
    }

    if (!email) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId is required' }, { status: 400 });
    }

    // 구독 정보 조회 (tenantId로)
    const subscriptionDoc = await db.collection('subscriptions').doc(tenantId).get();
    if (!subscriptionDoc.exists) {
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
    }

    const subscription = subscriptionDoc.data();

    // 해당 사용자의 구독인지 확인
    if (subscription?.email !== email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    if (!subscription?.pendingPlan) {
      return NextResponse.json({ error: 'No pending plan change' }, { status: 400 });
    }

    // 예약된 플랜 변경 취소
    await db.collection('subscriptions').doc(tenantId).update({
      pendingPlan: FieldValue.delete(),
      pendingAmount: FieldValue.delete(),
      pendingMode: FieldValue.delete(),
      pendingChangeAt: FieldValue.delete(),
      updatedAt: new Date(),
      updatedBy: 'user',
      updatedByAdminId: null,
    });

    // n8n 웹훅 호출
    if (isN8NNotificationEnabled()) {
      try {
        await fetch(process.env.N8N_WEBHOOK_URL!, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event: 'pending_plan_canceled',
            tenantId,
            email,
            canceledPlan: subscription.pendingPlan,
            currentPlan: subscription.plan,
          }),
        });
      } catch (webhookError) {
        console.error('Webhook call failed:', webhookError);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Cancel pending plan failed:', error);
    return NextResponse.json(
      { error: 'Failed to cancel pending plan' },
      { status: 500 }
    );
  }
}
