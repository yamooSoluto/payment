import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin, getAdminAuth } from '@/lib/firebase-admin';
import { verifyToken } from '@/lib/auth';
import { PLAN_PRICES } from '@/lib/toss';
import { isN8NNotificationEnabled } from '@/lib/n8n';

// 인증 함수: Authorization 헤더 또는 body의 token 처리
async function authenticateRequest(request: NextRequest, bodyToken?: string, bodyEmail?: string): Promise<string | null> {
  const authHeader = request.headers.get('Authorization');

  // Authorization 헤더가 있으면 우선 처리
  if (authHeader) {
    // Bearer 토큰인 경우 Firebase Auth로 처리
    if (authHeader.startsWith('Bearer ')) {
      const idToken = authHeader.substring(7);
      try {
        const auth = getAdminAuth();
        if (!auth) {
          console.error('Firebase Admin Auth not initialized');
          return null;
        }
        const decodedToken = await auth.verifyIdToken(idToken);
        return decodedToken.email || null;
      } catch (error) {
        console.error('Firebase Auth token verification failed:', error);
        return null;
      }
    }
    // 그 외는 SSO 토큰으로 처리
    return await verifyToken(authHeader);
  }

  // body의 token 처리 (SSO 토큰)
  if (bodyToken) {
    return await verifyToken(bodyToken);
  }

  // body의 email 처리 (Firebase Auth - 이전 호환)
  if (bodyEmail) {
    return bodyEmail;
  }

  return null;
}

// 플랜 예약 변경 API (scheduled 모드만 처리)
// 즉시 변경(immediate)은 /api/payments/change-plan을 직접 호출
export async function POST(request: NextRequest) {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { token, email: emailParam, tenantId, newPlan, newAmount, mode } = body;

    // 인증 처리
    const email = await authenticateRequest(request, token, emailParam);

    if (!email) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId is required' }, { status: 400 });
    }

    // 플랜 유효성 검증
    if (!newPlan || PLAN_PRICES[newPlan] === undefined) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
    }

    // 모드 검증: scheduled만 허용 (immediate는 /api/payments/change-plan 사용)
    if (mode !== 'scheduled') {
      return NextResponse.json({
        error: '즉시 변경은 /api/payments/change-plan을 사용하세요.',
        hint: 'Use /api/payments/change-plan for immediate changes'
      }, { status: 400 });
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

    if (subscription?.status !== 'active') {
      return NextResponse.json({ error: 'No active subscription' }, { status: 400 });
    }

    // 예약 변경 (scheduled): 다음 결제일부터 적용
    const pendingAmount = newAmount ?? PLAN_PRICES[newPlan];

    await db.collection('subscriptions').doc(tenantId).update({
      pendingPlan: newPlan,
      pendingAmount: pendingAmount,
      pendingMode: 'scheduled',
      pendingChangeAt: subscription.nextBillingDate,
      updatedAt: new Date(),
    });

    // n8n 웹훅 호출 (플랜 변경 예약 알림)
    if (isN8NNotificationEnabled()) {
      try {
        await fetch(process.env.N8N_WEBHOOK_URL!, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event: 'plan_change_scheduled',
            tenantId,
            email,
            currentPlan: subscription.plan,
            newPlan,
            effectiveDate: subscription.nextBillingDate,
          }),
        });
      } catch (webhookError) {
        console.error('Webhook call failed:', webhookError);
      }
    }

    return NextResponse.json({
      success: true,
      message: '다음 결제일부터 새 플랜이 적용됩니다.',
    });
  } catch (error) {
    console.error('Plan change failed:', error);
    return NextResponse.json(
      { error: 'Failed to change plan' },
      { status: 500 }
    );
  }
}
