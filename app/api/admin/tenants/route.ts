import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { isValidIndustry } from '@/lib/constants';

// 관리자: 매장 생성
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

    // tenantId 생성 (8자리 영숫자)
    const tenantId = generateTenantId();

    // 매장 생성
    const now = new Date();
    await db.collection('tenants').doc(tenantId).set({
      tenantId,
      email: email.trim().toLowerCase(),
      brandName: brandName.trim(),
      industry,
      createdAt: now,
      updatedAt: now,
      createdBy: 'admin',
    });

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

// 8자리 영숫자 tenantId 생성
function generateTenantId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
