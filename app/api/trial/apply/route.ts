import { NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import crypto from 'crypto';
import { verifyBearerToken } from '@/lib/auth';
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
 * 기존 tenant에 무료체험 적용 API
 * - 이미 생성된 tenant에 trial subscription을 적용
 * - n8n에 tenantId 전달 (새 tenant 생성 안 함)
 */
export async function POST(request: Request) {
  try {
    // Bearer 토큰 인증
    const authHeader = request.headers.get('authorization');
    const authenticatedEmail = await verifyBearerToken(authHeader);

    if (!authenticatedEmail) {
      return NextResponse.json(
        { error: '인증이 필요합니다.' },
        { status: 401 }
      );
    }

    const { tenantId, name, phone, brandName } = await request.json();

    // 필수 필드 검증
    if (!tenantId || !name || !phone || !brandName) {
      return NextResponse.json(
        { error: '필수 정보가 누락되었습니다.' },
        { status: 400 }
      );
    }

    // 인증된 이메일 사용
    const email = authenticatedEmail;

    // Firestore 초기화
    const db = adminDb || initializeFirebaseAdmin();

    if (!db) {
      return NextResponse.json(
        { error: '서버 오류가 발생했습니다.' },
        { status: 500 }
      );
    }

    // tenant 존재 여부 확인
    const tenantSnapshot = await db.collection('tenants').where('tenantId', '==', tenantId).limit(1).get();
    if (tenantSnapshot.empty) {
      return NextResponse.json(
        { error: '매장 정보를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    const tenantData = tenantSnapshot.docs[0].data();

    // 해당 tenant의 이메일과 인증된 이메일이 일치하는지 확인
    if (tenantData.email !== email) {
      return NextResponse.json(
        { error: '권한이 없습니다.' },
        { status: 403 }
      );
    }

    // 이미 구독 중인지 확인
    const existingSubscription = await db.collection('subscriptions').doc(tenantId).get();
    if (existingSubscription.exists) {
      const subData = existingSubscription.data();
      if (subData?.status && subData.status !== 'expired' && subData.status !== 'canceled') {
        return NextResponse.json(
          { error: '이미 구독 중입니다.' },
          { status: 400 }
        );
      }
    }

    // 무료체험 이력 확인 (phone 기준)
    // 탈퇴 회원의 해시된 번호도 확인
    // previousPhones에 포함된 경우도 확인 (연락처 변경 이력)
    const phoneHash = hashPhone(phone);
    const [existingUserPhone, existingUserPreviousPhone, existingTenantPhone, existingTrialHash] = await Promise.all([
      db.collection('users').where('phone', '==', phone).limit(1).get(),
      db.collection('users').where('previousPhones', 'array-contains', phone).where('trialApplied', '==', true).limit(1).get(),
      db.collection('tenants').where('phone', '==', phone).get(),
      db.collection('used_trial_phones').doc(phoneHash).get(),
    ]);

    // 실제 무료체험 이력이 있는지 확인
    let hasActualTrialHistory = false;
    let trialHistoryInfo: { brandName: string; periodStart: string; periodEnd: string } | null = null;

    // 탈퇴 회원의 해시된 번호 확인 (used_trial_phones)
    if (existingTrialHash.exists) {
      hasActualTrialHistory = true;
    }

    // users에서 trialApplied 확인 (현재 phone 또는 previousPhones)
    if (!hasActualTrialHistory && !existingUserPhone.empty) {
      const userData = existingUserPhone.docs[0].data();
      if (userData.trialApplied === true) {
        hasActualTrialHistory = true;
      }
    }

    // previousPhones에서 체험 이력 확인 (연락처 변경 후 재신청 방지)
    if (!hasActualTrialHistory && !existingUserPreviousPhone.empty) {
      hasActualTrialHistory = true;
    }

    // tenants에서 subscription/trial 이력 확인 (현재 tenant 제외)
    if (!hasActualTrialHistory && !existingTenantPhone.empty) {
      for (const doc of existingTenantPhone.docs) {
        const tData = doc.data();
        const tId = tData.tenantId || doc.id;

        // 현재 tenant는 제외
        if (tId === tenantId) continue;

        // subscription이 있거나 trial 관련 필드가 있는 경우
        // 단, status만 'expired'이고 plan이 없는 경우는 실제 구독 이력이 아님 (매장 추가 시 기본값)
        const hasRealSubscription = tData.subscription?.plan ||
          (tData.subscription?.status && tData.subscription.status !== 'expired') ||
          tData.trialEndsAt;
        if (hasRealSubscription) {
          hasActualTrialHistory = true;

          // 이력 정보 조회
          let periodStart: Date | null = null;
          let periodEnd: Date | null = null;

          const subDoc = await db.collection('subscriptions').doc(tId).get();
          if (subDoc.exists) {
            const subData = subDoc.data();
            periodStart = parseDate(subData?.currentPeriodStart) || parseDate(subData?.createdAt);
            periodEnd = parseDate(subData?.currentPeriodEnd) || parseDate(subData?.trialEndDate);
          }

          if (!periodStart) {
            periodStart = parseDate(tData.createdAt);
          }

          trialHistoryInfo = {
            brandName: tData.brandName || '알 수 없음',
            periodStart: formatDateKR(periodStart),
            periodEnd: formatDateKR(periodEnd),
          };
          break;
        }

        // subscriptions 컬렉션에서도 확인
        const subDoc = await db.collection('subscriptions').doc(tId).get();
        if (subDoc.exists) {
          const subData = subDoc.data();
          // 단, status만 'expired'이고 plan이 없는 경우는 실제 구독 이력이 아님
          const hasRealSubHistory = subData?.plan || (subData?.status && subData.status !== 'expired');
          if (hasRealSubHistory) {
            hasActualTrialHistory = true;

            trialHistoryInfo = {
              brandName: tData.brandName || '알 수 없음',
              periodStart: formatDateKR(parseDate(subData.currentPeriodStart) || parseDate(subData.createdAt)),
              periodEnd: formatDateKR(parseDate(subData.currentPeriodEnd) || parseDate(subData.trialEndDate)),
            };
            break;
          }
        }
      }
    }

    if (hasActualTrialHistory) {
      let errorMessage = '무료체험 이용 이력이 있어 재신청이 불가합니다.';
      if (trialHistoryInfo) {
        const periodInfo = trialHistoryInfo.periodEnd
          ? `${trialHistoryInfo.periodStart} ~ ${trialHistoryInfo.periodEnd}`
          : trialHistoryInfo.periodStart
          ? `${trialHistoryInfo.periodStart}~`
          : '';

        if (periodInfo) {
          errorMessage = `무료체험 이용 이력이 있어 재신청이 불가합니다.\n\n최근 이용: ${trialHistoryInfo.brandName}\n기간: ${periodInfo}`;
        } else {
          errorMessage = `무료체험 이용 이력이 있어 재신청이 불가합니다.\n\n최근 이용: ${trialHistoryInfo.brandName}`;
        }
      }

      return NextResponse.json(
        {
          error: errorMessage,
          trialHistory: trialHistoryInfo,
        },
        { status: 400 }
      );
    }

    // Trial subscription 생성
    const now = new Date();
    // currentPeriodEnd: 시작일 + 1개월 - 1일
    const currentPeriodEnd = new Date(now);
    currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1);
    currentPeriodEnd.setDate(currentPeriodEnd.getDate() - 1);

    // userId 조회 또는 생성
    const existingUser = await db.collection('users').doc(email).get();
    let userId = existingUser.data()?.userId;
    if (!userId) {
      userId = await generateUniqueUserId(db);
    }

    await db.collection('subscriptions').doc(tenantId).set({
      tenantId,
      userId,
      brandName,
      name,
      phone,
      email,
      plan: 'trial',
      status: 'trial',
      amount: 0,
      currentPeriodStart: now,
      currentPeriodEnd,
      nextBillingDate: null,
      // pending 필드 초기화
      pendingPlan: null,
      pendingAmount: null,
      pendingChangeAt: null,
      // 해지 관련 필드 초기화
      cancelAt: null,
      canceledAt: null,
      cancelReason: null,
      createdAt: now,
      updatedAt: now,
      updatedBy: 'user',
    });

    // tenant에도 subscription 정보 + userId 업데이트 (최소화된 필드만)
    await db.collection('tenants').doc(tenantSnapshot.docs[0].id).update({
      userId,
      plan: 'trial',
      'subscription.plan': 'trial',
      'subscription.status': 'trial',
      updatedAt: now,
      updatedBy: 'user',
    });

    // users 컬렉션 업데이트 (trialApplied 플래그 + userId)
    if (existingUser.exists) {
      const updateData: Record<string, unknown> = {
        trialApplied: true,
        trialAppliedAt: now,
        updatedAt: now,
      };
      // userId가 없었으면 추가
      if (!existingUser.data()?.userId) {
        updateData.userId = userId;
      }
      await db.collection('users').doc(email).update(updateData);
    } else {
      // users에 없으면 생성 (userId 포함)
      await db.collection('users').doc(email).set({
        userId,
        email,
        name,
        phone,
        group: 'normal', // 회원 그룹 (기본: 일반)
        trialApplied: true,
        trialAppliedAt: now,
        createdAt: now,
        updatedAt: now,
      });
    }

    console.log(`Trial applied to existing tenant: ${tenantId}, 종료일: ${currentPeriodEnd.toISOString()}`);

    return NextResponse.json({
      success: true,
      message: '무료체험이 시작되었습니다.',
      tenantId,
      currentPeriodEnd: currentPeriodEnd.toISOString(),
    });

  } catch (error) {
    console.error('무료체험 적용 오류:', error);
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' },
      { status: 500 }
    );
  }
}
