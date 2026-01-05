import { NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { sendVerificationSMS } from '@/lib/ncp-sens';

// 인증번호 유효시간 (3분으로 변경)
const VERIFICATION_EXPIRY_MS = 3 * 60 * 1000;

// 재발송 제한 시간 (30초로 변경)
const RESEND_LIMIT_MS = 30 * 1000;

/**
 * 6자리 인증번호 생성
 */
function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * 전화번호 정규화 (하이픈 제거)
 */
function normalizePhone(phone: string): string {
  return phone.replace(/-/g, '');
}

export async function POST(request: Request) {
  try {
    const { phone, action, code, purpose } = await request.json();
    // purpose: 'signup' (회원가입), 'find-id' (아이디 찾기), 'reset-password' (비밀번호 찾기), 'change-phone' (연락처 변경)

    if (!phone) {
      return NextResponse.json(
        { error: '전화번호를 입력해주세요.' },
        { status: 400 }
      );
    }

    const normalizedPhone = normalizePhone(phone);

    // Firestore 초기화 확인
    const db = adminDb || initializeFirebaseAdmin();
    if (!db) {
      return NextResponse.json(
        { error: '서버 오류가 발생했습니다.' },
        { status: 500 }
      );
    }

    const verificationRef = db.collection('verifications').doc(normalizedPhone);

    // 인증번호 발송 요청
    if (action === 'send') {
      // 회원가입 또는 연락처 변경일 경우 중복 확인
      if (purpose === 'signup' || purpose === 'change-phone' || !purpose) {
        // 연락처 중복 확인 (이미 가입된 번호인지) - users, tenants 둘 다 체크
        const [existingUser, existingTenant] = await Promise.all([
          db.collection('users').where('phone', '==', normalizedPhone).limit(1).get(),
          db.collection('tenants').where('phone', '==', normalizedPhone).limit(1).get(),
        ]);

        if (!existingUser.empty || !existingTenant.empty) {
          return NextResponse.json(
            { error: '이미 사용 중인 연락처입니다.' },
            { status: 400 }
          );
        }
      }

      // 아이디 찾기/비밀번호 찾기일 경우 가입된 번호인지 확인
      if (purpose === 'find-id' || purpose === 'reset-password') {
        const [existingUser, existingTenant] = await Promise.all([
          db.collection('users').where('phone', '==', normalizedPhone).limit(1).get(),
          db.collection('tenants').where('phone', '==', normalizedPhone).limit(1).get(),
        ]);

        if (existingUser.empty && existingTenant.empty) {
          return NextResponse.json(
            { error: '등록되지 않은 연락처입니다.' },
            { status: 400 }
          );
        }
      }

      // 기존 인증 정보 확인 (재발송 제한)
      const existingDoc = await verificationRef.get();
      if (existingDoc.exists) {
        const data = existingDoc.data();
        const timeSinceLastSend = Date.now() - (data?.createdAt || 0);

        if (timeSinceLastSend < RESEND_LIMIT_MS) {
          const remainingSeconds = Math.ceil((RESEND_LIMIT_MS - timeSinceLastSend) / 1000);
          return NextResponse.json(
            { error: `${remainingSeconds}초 후에 다시 시도해주세요.` },
            { status: 429 }
          );
        }
      }

      // 인증번호 생성
      const verificationCode = generateVerificationCode();

      // Firestore에 저장
      await verificationRef.set({
        code: verificationCode,
        createdAt: Date.now(),
        expiresAt: Date.now() + VERIFICATION_EXPIRY_MS,
        attempts: 0,
      });

      // SMS 발송
      try {
        await sendVerificationSMS(normalizedPhone, verificationCode);
      } catch (smsError) {
        console.error('SMS 발송 실패:', smsError);
        // 개발 환경에서는 콘솔에 인증번호 출력
        if (process.env.NODE_ENV === 'development') {
          console.log(`[DEV] 인증번호: ${verificationCode}`);
          return NextResponse.json({
            success: true,
            message: '인증번호가 발송되었습니다. (개발모드)',
            devCode: verificationCode, // 개발 환경에서만 반환
          });
        }
        return NextResponse.json(
          { error: 'SMS 발송에 실패했습니다. 잠시 후 다시 시도해주세요.' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message: '인증번호가 발송되었습니다.'
      });
    }

    // 인증번호 확인 요청
    if (action === 'verify') {
      if (!code) {
        return NextResponse.json(
          { error: '인증번호를 입력해주세요.' },
          { status: 400 }
        );
      }

      const docSnap = await verificationRef.get();

      if (!docSnap.exists) {
        return NextResponse.json(
          { error: '인증번호를 먼저 요청해주세요.' },
          { status: 400 }
        );
      }

      const data = docSnap.data();

      // 만료 확인
      if (Date.now() > data?.expiresAt) {
        await verificationRef.delete();
        return NextResponse.json(
          { error: '인증번호가 만료되었습니다. 다시 요청해주세요.' },
          { status: 400 }
        );
      }

      // 시도 횟수 확인 (5회 제한)
      if ((data?.attempts || 0) >= 5) {
        await verificationRef.delete();
        return NextResponse.json(
          { error: '인증 시도 횟수를 초과했습니다. 다시 요청해주세요.' },
          { status: 400 }
        );
      }

      // 인증번호 일치 확인
      if (data?.code !== code) {
        // 시도 횟수 증가
        await verificationRef.update({
          attempts: (data?.attempts || 0) + 1,
        });
        return NextResponse.json(
          { error: '인증번호가 일치하지 않습니다.' },
          { status: 400 }
        );
      }

      // 인증 성공 - 문서 삭제
      await verificationRef.delete();

      return NextResponse.json({
        verified: true,
        message: '인증이 완료되었습니다.'
      });
    }

    // 연락처 중복 확인 요청 - users, tenants 둘 다 체크
    if (action === 'check-duplicate') {
      const [usersSnapshot, tenantsSnapshot] = await Promise.all([
        db.collection('users').where('phone', '==', normalizedPhone).limit(1).get(),
        db.collection('tenants').where('phone', '==', normalizedPhone).limit(1).get(),
      ]);

      const isDuplicate = !usersSnapshot.empty || !tenantsSnapshot.empty;
      return NextResponse.json({
        isDuplicate,
        message: isDuplicate ? '이미 가입된 연락처입니다.' : ''
      });
    }

    return NextResponse.json(
      { error: '잘못된 요청입니다.' },
      { status: 400 }
    );

  } catch (error) {
    console.error('SMS 인증 오류:', error);
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
