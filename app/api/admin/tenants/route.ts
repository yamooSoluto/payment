import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { isValidIndustry } from '@/lib/constants';

// 관리자: 매장 생성 (n8n 웹훅 사용 - 마이페이지와 동일)
export async function POST(request: NextRequest) {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { email, brandName, industry } = body;

    // 필수 필드 검증
    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: '이메일을 입력해주세요.' }, { status: 400 });
    }

    if (!brandName || typeof brandName !== 'string' || brandName.trim() === '') {
      return NextResponse.json({ error: '매장명을 입력해주세요.' }, { status: 400 });
    }

    if (!industry || !isValidIndustry(industry)) {
      return NextResponse.json({ error: '유효한 업종을 선택해주세요.' }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // users 컬렉션에서 사용자 정보 조회 (name, phone)
    const userDoc = await db.collection('users').doc(normalizedEmail).get();
    const userData = userDoc.exists ? userDoc.data() : null;

    // n8n 웹훅 호출 (마이페이지 매장 추가와 동일)
    const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL;
    let tenantId: string | null = null;

    if (!n8nWebhookUrl) {
      console.error('N8N_WEBHOOK_URL이 설정되지 않았습니다.');
      return NextResponse.json({ error: '시스템 설정 오류입니다.' }, { status: 500 });
    }

    try {
      const timestamp = new Date().toISOString();
      const n8nResponse = await fetch(n8nWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: normalizedEmail,
          name: userData?.name || null,
          phone: userData?.phone || null,
          brandName: brandName.trim(),
          industry,
          timestamp,
          createdAt: timestamp,
          isTrialSignup: false, // 매장 추가용 (체험 신청 아님)
          action: 'ADD', // Airtable automation 트리거용
          createdBy: 'admin', // 관리자가 생성했음을 표시
        }),
      });

      if (!n8nResponse.ok) {
        console.error('n8n webhook 호출 실패:', n8nResponse.status);
        return NextResponse.json({ error: '매장 생성에 실패했습니다.' }, { status: 500 });
      }

      const n8nData = await n8nResponse.json();
      console.log('관리자 매장 추가 n8n webhook 성공:', n8nData);

      if (n8nData.tenantId) {
        tenantId = n8nData.tenantId;
      }
    } catch (error) {
      console.error('n8n webhook 호출 오류:', error);
      return NextResponse.json({ error: '매장 생성에 실패했습니다.' }, { status: 500 });
    }

    if (!tenantId) {
      return NextResponse.json({ error: '매장 ID 생성에 실패했습니다.' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      tenantId,
      brandName: brandName.trim(),
      industry,
      message: '매장이 생성되었습니다.',
    });
  } catch (error) {
    console.error('Failed to create tenant:', error);
    return NextResponse.json(
      { error: '매장 생성에 실패했습니다.' },
      { status: 500 }
    );
  }
}
