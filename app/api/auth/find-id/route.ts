import { NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';

/**
 * 아이디 찾기 API
 * 이름과 전화번호로 이메일(아이디)을 조회합니다.
 */
export async function POST(request: Request) {
  try {
    const { name, phone } = await request.json();

    if (!name || !phone) {
      return NextResponse.json(
        { error: '이름과 전화번호를 입력해주세요.' },
        { status: 400 }
      );
    }

    const normalizedPhone = phone.replace(/-/g, '');

    const db = adminDb || initializeFirebaseAdmin();
    if (!db) {
      return NextResponse.json(
        { error: '서버 오류가 발생했습니다.' },
        { status: 500 }
      );
    }

    // users 컬렉션에서 이름+전화번호로 검색
    const usersSnapshot = await db
      .collection('users')
      .where('phone', '==', normalizedPhone)
      .where('name', '==', name)
      .limit(1)
      .get();

    if (!usersSnapshot.empty) {
      const userData = usersSnapshot.docs[0].data();
      const email = userData.email || usersSnapshot.docs[0].id;

      // 이메일 일부 마스킹 (예: te***@gmail.com)
      const maskedEmail = maskEmail(email);

      // 보안: 전체 이메일 노출 방지 - 마스킹된 이메일만 반환
      return NextResponse.json({
        found: true,
        maskedEmail: maskedEmail,
      });
    }

    // tenants 컬렉션에서도 검색
    const tenantsSnapshot = await db
      .collection('tenants')
      .where('phone', '==', normalizedPhone)
      .where('name', '==', name)
      .limit(1)
      .get();

    if (!tenantsSnapshot.empty) {
      const tenantData = tenantsSnapshot.docs[0].data();
      const email = tenantData.email;

      if (email) {
        const maskedEmail = maskEmail(email);
        // 보안: 전체 이메일 노출 방지 - 마스킹된 이메일만 반환
        return NextResponse.json({
          found: true,
          maskedEmail: maskedEmail,
        });
      }
    }

    return NextResponse.json({
      found: false,
      error: '일치하는 회원 정보가 없습니다.',
    });

  } catch (error) {
    console.error('아이디 찾기 오류:', error);
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

/**
 * 이메일 마스킹 함수
 * example@gmail.com -> ex***le@gmail.com
 */
function maskEmail(email: string): string {
  const [localPart, domain] = email.split('@');
  if (!domain) return email;

  if (localPart.length <= 2) {
    return `${localPart[0]}*@${domain}`;
  } else if (localPart.length <= 4) {
    return `${localPart.slice(0, 2)}***@${domain}`;
  } else {
    const visibleStart = localPart.slice(0, 2);
    const visibleEnd = localPart.slice(-2);
    return `${visibleStart}***${visibleEnd}@${domain}`;
  }
}
