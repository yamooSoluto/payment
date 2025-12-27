import { NextRequest, NextResponse } from 'next/server';
import { createCheckoutSession, setSessionCookie, getSessionIdFromRequest, updateCheckoutSession } from '@/lib/checkout-session';

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

    // 쿠키에 세션 ID 저장
    await setSessionCookie(sessionId);

    return NextResponse.json({ success: true, sessionId });
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
