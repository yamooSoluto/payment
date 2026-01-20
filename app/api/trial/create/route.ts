import { NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin, getAdminAuth } from '@/lib/firebase-admin';
import { sendAlimtalk } from '@/lib/bizm';
import crypto from 'crypto';
import { generateUniqueUserId } from '@/lib/user-utils';

// 전화번호 해시 생성 (탈퇴 회원 무료체험 이력 추적용)
function hashPhone(phone: string): string {
  return crypto.createHash('sha256').update(phone).digest('hex');
}

/**
 * 다양한 형식의 날짜를 Date 객체로 변환
 */
function parseDate(value: unknown): Date | null {
  if (!value) return null;

  // Firestore Timestamp
  if (typeof value === 'object' && value !== null && 'toDate' in value && typeof (value as { toDate: () => Date }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate();
  }

  // Date 객체
  if (value instanceof Date) {
    return value;
  }

  // ISO 문자열 또는 기타 문자열
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  // 숫자 (timestamp ms)
  if (typeof value === 'number') {
    return new Date(value);
  }

  return null;
}

/**
 * 날짜를 한국어 형식으로 포맷
 */
function formatDateKR(date: Date | null): string {
  if (!date) return '';
  return `${date.getFullYear()}. ${date.getMonth() + 1}. ${date.getDate()}.`;
}

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

    // 무료체험 이력 확인 (phone + email 기준)
    // 1. users 컬렉션에서 trialApplied가 true인 경우 (phone 또는 email 또는 previousPhones)
    // 2. tenants 컬렉션에서 subscription이 있거나 trial 이력이 있는 경우
    // 3. used_trial_phones 컬렉션에서 해시된 번호 확인 (탈퇴 회원)
    const phoneHash = hashPhone(phone);
    const [existingUserPhone, existingUserPreviousPhone, existingUserEmail, existingTenantPhone, existingTenantEmail, existingTrialHash] = await Promise.all([
      db.collection('users').where('phone', '==', phone).limit(1).get(),
      db.collection('users').where('previousPhones', 'array-contains', phone).where('trialApplied', '==', true).limit(1).get(),
      db.collection('users').doc(email).get(),
      db.collection('tenants').where('phone', '==', phone).limit(1).get(),
      db.collection('tenants').where('email', '==', email).limit(1).get(),
      db.collection('used_trial_phones').doc(phoneHash).get(),
    ]);

    // 실제 무료체험 이력이 있는지 확인
    let hasActualTrialHistory = false;
    let trialHistorySource: 'user' | 'tenant' | 'deleted' | 'email' | 'paid' | null = null;

    // 탈퇴 회원의 해시된 번호 확인 (used_trial_phones)
    if (existingTrialHash.exists) {
      hasActualTrialHistory = true;
      trialHistorySource = 'deleted';
    }

    // users에서 email 기준 trialApplied 확인 (유료 결제 이력 포함)
    if (!hasActualTrialHistory && existingUserEmail.exists) {
      const userData = existingUserEmail.data();
      if (userData?.trialApplied === true) {
        hasActualTrialHistory = true;
        // 유료 결제로 인해 trialApplied가 설정된 경우 'paid'로 구분
        trialHistorySource = userData?.paidSubscriptionAt ? 'paid' : 'email';
      }
    }

    // users에서 phone 기준 trialApplied 확인
    if (!hasActualTrialHistory && !existingUserPhone.empty) {
      const userData = existingUserPhone.docs[0].data();
      if (userData.trialApplied === true) {
        hasActualTrialHistory = true;
        trialHistorySource = 'user';
      }
    }

    // previousPhones에서 체험 이력 확인 (연락처 변경 후 재신청 방지)
    if (!hasActualTrialHistory && !existingUserPreviousPhone.empty) {
      hasActualTrialHistory = true;
      trialHistorySource = 'user';
    }

    // tenants에서 email 기준 subscription 이력 확인
    if (!hasActualTrialHistory && !existingTenantEmail.empty) {
      const tenantData = existingTenantEmail.docs[0].data();
      const tenantId = tenantData.tenantId || existingTenantEmail.docs[0].id;

      // 단, status만 'expired'이고 plan이 없는 경우는 실제 구독 이력이 아님 (매장 추가 시 기본값)
      const hasRealSubscription = tenantData.subscription?.plan ||
        (tenantData.subscription?.status && tenantData.subscription.status !== 'expired') ||
        tenantData.trialEndsAt;
      if (hasRealSubscription) {
        hasActualTrialHistory = true;
        trialHistorySource = 'tenant';
      } else {
        const subDoc = await db.collection('subscriptions').doc(tenantId).get();
        if (subDoc.exists) {
          const subData = subDoc.data();
          // 단, status만 'expired'이고 plan이 없는 경우는 실제 구독 이력이 아님
          const hasRealSubHistory = subData?.plan || (subData?.status && subData.status !== 'expired');
          if (hasRealSubHistory) {
            hasActualTrialHistory = true;
            trialHistorySource = 'tenant';
          }
        }
      }
    }

    // tenants에서 subscription/trial 이력 확인
    if (!hasActualTrialHistory && !existingTenantPhone.empty) {
      const tenantData = existingTenantPhone.docs[0].data();
      const tenantId = tenantData.tenantId || existingTenantPhone.docs[0].id;

      // subscription이 있거나 trial 관련 필드가 있는 경우
      // 단, status만 'expired'이고 plan이 없는 경우는 실제 구독 이력이 아님 (매장 추가 시 기본값)
      const hasRealSubscription2 = tenantData.subscription?.plan ||
        (tenantData.subscription?.status && tenantData.subscription.status !== 'expired') ||
        tenantData.trialEndsAt;
      if (hasRealSubscription2) {
        hasActualTrialHistory = true;
        trialHistorySource = 'tenant';
      } else {
        // subscriptions 컬렉션에서도 확인
        const subDoc = await db.collection('subscriptions').doc(tenantId).get();
        if (subDoc.exists) {
          const subData = subDoc.data();
          // 단, status만 'expired'이고 plan이 없는 경우는 실제 구독 이력이 아님
          const hasRealSubHistory = subData?.plan || (subData?.status && subData.status !== 'expired');
          if (hasRealSubHistory) {
            hasActualTrialHistory = true;
            trialHistorySource = 'tenant';
          }
        }
      }
    }

    if (hasActualTrialHistory) {
      // 이전 체험 이력 정보 조회
      let trialHistory: { brandName: string; periodStart: string; periodEnd: string } | null = null;

      try {
        // tenants에서 찾은 경우 해당 tenantId로 subscription 조회
        if (!existingTenantPhone.empty) {
          const tenantData = existingTenantPhone.docs[0].data();
          const tenantId = tenantData.tenantId || existingTenantPhone.docs[0].id;

          console.log('체험 이력 조회 - tenantData:', JSON.stringify({
            tenantId,
            brandName: tenantData.brandName,
            createdAt: tenantData.createdAt,
            subscription: tenantData.subscription,
          }));

          // subscription에서 trial 기록 조회
          const subscriptionDoc = await db.collection('subscriptions').doc(tenantId).get();

          // 날짜 후보들 (subscriptions 컬렉션, tenant 내장 subscription, tenant 자체)
          let periodStart: Date | null = null;
          let periodEnd: Date | null = null;

          if (subscriptionDoc.exists) {
            const subData = subscriptionDoc.data();
            console.log('체험 이력 조회 - subscriptionDoc:', JSON.stringify({
              currentPeriodStart: subData?.currentPeriodStart,
              currentPeriodEnd: subData?.currentPeriodEnd,
              trialEndDate: subData?.trialEndDate,
              createdAt: subData?.createdAt,
            }));
            periodStart = parseDate(subData?.currentPeriodStart) || parseDate(subData?.createdAt);
            periodEnd = parseDate(subData?.currentPeriodEnd) || parseDate(subData?.trialEndDate);
          }

          // subscriptions 컬렉션에 없거나 날짜가 없으면 tenant 내장 subscription 확인
          if (!periodStart && tenantData.subscription) {
            const embeddedSub = tenantData.subscription;
            periodStart = parseDate(embeddedSub.currentPeriodStart) || parseDate(embeddedSub.startDate) || parseDate(embeddedSub.createdAt);
            periodEnd = parseDate(embeddedSub.currentPeriodEnd) || parseDate(embeddedSub.endDate) || parseDate(embeddedSub.trialEndDate);
          }

          // 그래도 없으면 tenant의 createdAt 사용
          if (!periodStart) {
            periodStart = parseDate(tenantData.createdAt) || parseDate(tenantData.registeredAt) || parseDate(tenantData.created_at);
          }

          trialHistory = {
            brandName: tenantData.brandName || '알 수 없음',
            periodStart: formatDateKR(periodStart),
            periodEnd: formatDateKR(periodEnd),
          };
        }
        // users에서만 찾은 경우
        else if (!existingUserPhone.empty) {
          const userData = existingUserPhone.docs[0].data();
          const trialAppliedAt = parseDate(userData.trialAppliedAt);

          // 해당 이메일로 tenants 조회
          const userEmail = userData.email;
          if (userEmail) {
            const userTenantsSnapshot = await db.collection('tenants')
              .where('email', '==', userEmail)
              .limit(1)
              .get();

            if (!userTenantsSnapshot.empty) {
              const tenantData = userTenantsSnapshot.docs[0].data();
              const tenantId = tenantData.tenantId || userTenantsSnapshot.docs[0].id;

              const subscriptionDoc = await db.collection('subscriptions').doc(tenantId).get();

              let periodStart: Date | null = null;
              let periodEnd: Date | null = null;

              if (subscriptionDoc.exists) {
                const subData = subscriptionDoc.data();
                periodStart = parseDate(subData?.currentPeriodStart) || parseDate(subData?.createdAt);
                periodEnd = parseDate(subData?.currentPeriodEnd) || parseDate(subData?.trialEndDate);
              }

              // subscriptions 컬렉션에 없거나 날짜가 없으면 tenant 내장 subscription 확인
              if (!periodStart && tenantData.subscription) {
                const embeddedSub = tenantData.subscription;
                periodStart = parseDate(embeddedSub.currentPeriodStart) || parseDate(embeddedSub.startDate) || parseDate(embeddedSub.createdAt);
                periodEnd = parseDate(embeddedSub.currentPeriodEnd) || parseDate(embeddedSub.endDate) || parseDate(embeddedSub.trialEndDate);
              }

              // 그래도 없으면 tenant의 createdAt 또는 trialAppliedAt 사용
              if (!periodStart) {
                periodStart = parseDate(tenantData.createdAt) || parseDate(tenantData.registeredAt) || trialAppliedAt;
              }

              trialHistory = {
                brandName: tenantData.brandName || '알 수 없음',
                periodStart: formatDateKR(periodStart),
                periodEnd: formatDateKR(periodEnd),
              };
            }
          }
        }
      } catch (historyError) {
        console.error('체험 이력 조회 오류:', historyError);
      }

      // 상세 오류 메시지 생성
      let errorMessage = '무료체험 이용 이력이 있어 재신청이 불가합니다.';

      // 유료 결제 이력으로 인한 차단인 경우 다른 메시지
      if (trialHistorySource === 'paid') {
        errorMessage = '이미 유료 구독 이력이 있어 무료체험을 신청하실 수 없습니다.\n\n유료 결제 이후에는 무료체험이 불가능합니다.';
      } else if (trialHistory) {
        const periodInfo = trialHistory.periodEnd
          ? `${trialHistory.periodStart} ~ ${trialHistory.periodEnd}`
          : trialHistory.periodStart
          ? `${trialHistory.periodStart}~`
          : '';

        if (periodInfo) {
          errorMessage = `무료체험 이용 이력이 있어 재신청이 불가합니다.\n\n최근 이용: ${trialHistory.brandName}\n기간: ${periodInfo}`;
        } else {
          errorMessage = `무료체험 이용 이력이 있어 재신청이 불가합니다.\n\n최근 이용: ${trialHistory.brandName}`;
        }
      }

      return NextResponse.json(
        {
          error: errorMessage,
          trialHistory,
        },
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
        const timestamp = new Date().toISOString();
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
            timestamp, // n8n용
            createdAt: timestamp, // 기존 호환성용
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

    // userId 조회 또는 생성
    let userId = existingUser.data()?.userId;
    if (!userId) {
      userId = await generateUniqueUserId(db);
    }

    if (!existingUser.exists) {
      const now = new Date();
      await db.collection('users').doc(email).set({
        userId, // userId 추가
        email,
        name,
        phone,
        group: 'normal', // 회원 그룹 (기본: 일반)
        createdAt: now,
        updatedAt: now,
        trialApplied: true,
        trialAppliedAt: now,
        tempPassword: !userExists, // 신규 사용자만 임시 비밀번호 플래그 true
      });
    } else {
      // 기존 사용자: trialApplied 플래그 업데이트 + userId 없으면 추가
      const updateData: Record<string, unknown> = {
        trialApplied: true,
        trialAppliedAt: new Date(),
        updatedAt: new Date(),
      };
      if (!existingUser.data()?.userId) {
        updateData.userId = userId;
      }
      await db.collection('users').doc(email).update(updateData);
    }

    // tenantId가 있으면 trial subscription 생성
    if (tenantId) {
      const now = new Date();
      const trialEndDate = new Date(now);
      trialEndDate.setDate(trialEndDate.getDate() + 30); // 30일 무료체험

      // currentPeriodEnd는 trialEndDate와 동일
      const currentPeriodEnd = new Date(trialEndDate);

      // subscription 생성 (trial 상태, userId 포함)
      await db.collection('subscriptions').doc(tenantId).set({
        tenantId,
        userId, // userId 추가
        brandName,
        name,
        phone,
        email,
        plan: 'trial',
        status: 'trial',
        trialEndDate,
        currentPeriodStart: now,
        currentPeriodEnd,
        createdAt: now,
        updatedAt: now,
      });

      // tenants 컬렉션에 trial 구독 정보 동기화
      try {
        await db.collection('tenants').doc(tenantId).update({
          'subscription.plan': 'trial',
          'subscription.status': 'trial',
          'subscription.startedAt': now,
          'subscription.trialEndsAt': trialEndDate,
          plan: 'trial',
          status: 'trial',
          trialEndsAt: trialEndDate,
          updatedAt: now,
        });
      } catch (syncError) {
        console.error('Failed to sync tenant subscription:', syncError);
      }

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
        // 기존 사용자(로그인 상태에서 신청): 홈페이지 비밀번호 안내
        const message = `[YAMOO] 무료체험 신청이 완료되었습니다.\n\n아이디: ${email}\n\n포탈: ${portalUrl}\n\n홈페이지 비밀번호로 포탈에 로그인하실 수 있습니다.`;

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
