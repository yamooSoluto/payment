import { NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin, getAdminAuth } from '@/lib/firebase-admin';
import { sendAlimtalk } from '@/lib/bizm';

/**
 * 임시 비밀번호 생성 (8자리: 대소문자 + 숫자)
 */
function generateTempPassword(): string {
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  const all = uppercase + lowercase + numbers;

  let password = '';
  // 최소 1개씩 보장
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];

  // 나머지 5자리
  for (let i = 0; i < 5; i++) {
    password += all[Math.floor(Math.random() * all.length)];
  }

  // 섞기
  return password.split('').sort(() => Math.random() - 0.5).join('');
}

export async function POST(request: Request) {
  try {
    const { email, name, phone, brandName, industry } = await request.json();

    // 필수 필드 검증
    if (!email || !name || !phone || !brandName || !industry) {
      return NextResponse.json(
        { error: '필수 정보가 누락되었습니다.' },
        { status: 400 }
      );
    }

    // Firestore 초기화
    const db = adminDb || initializeFirebaseAdmin();
    const auth = getAdminAuth();

    if (!db || !auth) {
      return NextResponse.json(
        { error: '서버 오류가 발생했습니다.' },
        { status: 500 }
      );
    }

    // 연락처 중복 확인 (users, tenants 모두 체크)
    const [existingUserPhone, existingTenantPhone] = await Promise.all([
      db.collection('users').where('phone', '==', phone).limit(1).get(),
      db.collection('tenants').where('phone', '==', phone).limit(1).get(),
    ]);

    if (!existingUserPhone.empty || !existingTenantPhone.empty) {
      return NextResponse.json(
        { error: '이미 무료체험을 신청한 연락처입니다.' },
        { status: 400 }
      );
    }

    // Firebase Auth 사용자 존재 여부 확인
    let userExists = false;
    let tempPassword = '';

    try {
      await auth.getUserByEmail(email);
      userExists = true;
    } catch (error: unknown) {
      // 사용자가 없으면 에러 발생 (정상)
      if (error && typeof error === 'object' && 'code' in error && error.code === 'auth/user-not-found') {
        userExists = false;
      } else {
        throw error;
      }
    }

    // 신규 사용자: Firebase Auth 계정 생성
    if (!userExists) {
      tempPassword = generateTempPassword();

      await auth.createUser({
        email,
        password: tempPassword,
        displayName: name,
      });

      console.log(`Firebase Auth 계정 생성됨: ${email}`);
    }

    // n8n webhook 호출
    const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL;
    let tenantId: string | null = null;

    if (n8nWebhookUrl) {
      try {
        const n8nResponse = await fetch(n8nWebhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email,
            name,
            phone,
            brandName,
            industry,
            createdAt: new Date().toISOString(),
          }),
        });

        if (!n8nResponse.ok) {
          console.error('n8n webhook 호출 실패:', n8nResponse.status);
        } else {
          const n8nData = await n8nResponse.json();
          console.log('n8n webhook 호출 성공:', n8nData);
          // n8n에서 tenantId 반환 시 저장
          if (n8nData.tenantId) {
            tenantId = n8nData.tenantId;
          }
        }
      } catch (error) {
        console.error('n8n webhook 호출 오류:', error);
        // n8n 실패해도 계속 진행
      }
    } else {
      console.warn('N8N_WEBHOOK_URL이 설정되지 않았습니다.');
    }

    // users 컬렉션에 저장 (이메일이 없는 경우만)
    const existingUser = await db.collection('users').doc(email).get();
    if (!existingUser.exists) {
      const now = new Date();
      await db.collection('users').doc(email).set({
        email,
        name,
        phone,
        createdAt: now,
        updatedAt: now,
        trialApplied: true,
        trialAppliedAt: now,
      });
    } else {
      // 기존 사용자: trialApplied 플래그 업데이트
      await db.collection('users').doc(email).update({
        trialApplied: true,
        trialAppliedAt: new Date(),
        updatedAt: new Date(),
      });
    }

    // tenantId가 있으면 trial subscription 생성
    if (tenantId) {
      const now = new Date();
      const trialEndDate = new Date(now);
      trialEndDate.setDate(trialEndDate.getDate() + 30); // 30일 무료체험

      // subscription 생성 (trial 상태)
      await db.collection('subscriptions').doc(tenantId).set({
        tenantId,
        brandName,
        name,
        phone,
        email,
        plan: 'trial',
        status: 'trial',
        trialEndDate,
        currentPeriodStart: now,
        currentPeriodEnd: trialEndDate,
        createdAt: now,
        updatedAt: now,
      });

      console.log(`Trial subscription 생성됨: ${tenantId}, 종료일: ${trialEndDate.toISOString()}`);
    }

    // 알림톡/SMS 발송
    try {
      const portalUrl = 'https://app.yamoo.ai.kr';
      const useAlimtalk = process.env.USE_ALIMTALK === 'true';

      if (!userExists && tempPassword) {
        // 신규 사용자: 임시 비밀번호 포함
        const message = `[YAMOO] 무료체험 신청이 완료되었습니다.\n\n아이디: ${email}\n임시 비밀번호: ${tempPassword}\n\n포탈: ${portalUrl}\n\n위 포탈에서 ID/PW 접속 후 이용해 주세요.`;

        if (useAlimtalk) {
          const templateCode = process.env.BIZM_TRIAL_TEMPLATE_CODE || 'TRIAL_WELCOME';
          await sendAlimtalk(
            phone,
            templateCode,
            {
              name,
              email,
              password: tempPassword,
              portalUrl,
            },
            message // SMS 대체 발송
          );
          console.log('알림톡 발송 완료');
        } else {
          // 템플릿 승인 전: SMS만 발송 (NCP SENS)
          const { sendLMS } = await import('@/lib/ncp-sens');
          const smsResult = await sendLMS(phone, message, '[YAMOO] 무료체험 신청');
          console.log('NCP SMS 발송 결과:', smsResult);
          if (smsResult.statusCode !== '202') {
            console.error('NCP SMS 발송 실패:', smsResult);
          }
        }
      } else {
        // 기존 사용자: 포탈 링크만
        const message = `[YAMOO] 무료체험 신청이 완료되었습니다.\n\n아이디: ${email}\n\n포탈: ${portalUrl}\n\n위 포탈에서 ID/PW 접속 후 이용해 주세요.`;

        if (useAlimtalk) {
          const templateCode = process.env.BIZM_TRIAL_EXISTING_TEMPLATE_CODE || 'TRIAL_EXISTING';
          await sendAlimtalk(
            phone,
            templateCode,
            {
              name,
              email,
              portalUrl,
            },
            message // SMS 대체 발송
          );
          console.log('알림톡 발송 완료');
        } else {
          // 템플릿 승인 전: SMS만 발송 (NCP SENS)
          const { sendLMS } = await import('@/lib/ncp-sens');
          const smsResult = await sendLMS(phone, message, '[YAMOO] 무료체험 신청');
          console.log('NCP SMS 발송 결과:', smsResult);
          if (smsResult.statusCode !== '202') {
            console.error('NCP SMS 발송 실패:', smsResult);
          }
        }
      }
    } catch (error) {
      console.error('알림톡/SMS 발송 오류:', error);
      // 발송 실패해도 신청은 완료로 처리
    }

    return NextResponse.json({
      success: true,
      message: '무료체험 신청이 완료되었습니다.',
      userExists,
      tenantId,
    });

  } catch (error) {
    console.error('무료체험 신청 오류:', error);
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' },
      { status: 500 }
    );
  }
}
