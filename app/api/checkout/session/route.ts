import { NextRequest, NextResponse } from 'next/server';
import { createCheckoutSession, getSessionIdFromRequest, updateCheckoutSession, CHECKOUT_SESSION_COOKIE, SESSION_EXPIRY_MINUTES } from '@/lib/checkout-session';
import { initializeFirebaseAdmin, adminDb } from '@/lib/firebase-admin';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, plan, tenantId, isNewTenant, mode, refund, token } = body;

    if (!email || !plan) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // 플랜 활성화 여부 확인 (비활성 플랜은 구매 불가)
    const db = adminDb || initializeFirebaseAdmin();
    if (db) {
      const planDoc = await db.collection('plans').doc(plan).get();
      if (planDoc.exists) {
        const planData = planDoc.data();
        if (planData && planData.isActive === false) {
          return NextResponse.json(
            { error: '현재 구매할 수 없는 플랜입니다.' },
            { status: 400 }
          );
        }
      }
    }

    // 세션 생성
    const sessionId = await createCheckoutSession({
      email,
      plan,
      tenantId,
      isNewTenant,
      mode,
      refund,
      token,
    });

    // 응답 생성 후 쿠키 설정
    const response = NextResponse.json({ success: true, sessionId });
    response.cookies.set(CHECKOUT_SESSION_COOKIE, sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: SESSION_EXPIRY_MINUTES * 60,
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Failed to create checkout session:', error);
    return NextResponse.json(
      { error: 'Failed to create session' },
      { status: 500 }
    );
  }
}

// 세션 업데이트 (결제 성공 시)
export async function PATCH(request: NextRequest) {
  try {
    const sessionId = getSessionIdFromRequest(request);
    if (!sessionId) {
      return NextResponse.json(
        { error: 'No session found' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { status, orderId, tenantName } = body;

    await updateCheckoutSession(sessionId, {
      status,
      orderId,
      tenantName,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to update checkout session:', error);
    return NextResponse.json(
      { error: 'Failed to update session' },
      { status: 500 }
    );
  }
}
