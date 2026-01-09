import { NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import crypto from 'crypto';

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
    const { tenantId, email, name, phone, brandName, industry } = await request.json();

    // 필수 필드 검증
    if (!tenantId || !email || !name || !phone || !brandName) {
      return NextResponse.json(
        { error: '필수 정보가 누락되었습니다.' },
        { status: 400 }
      );
    }

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

    // 해당 tenant의 이메일과 요청 이메일이 일치하는지 확인
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
    const phoneHash = hashPhone(phone);
    const [existingUserPhone, existingTenantPhone, existingTrialHash] = await Promise.all([
      db.collection('users').where('phone', '==', phone).limit(1).get(),
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

    // users에서 trialApplied 확인
    if (!hasActualTrialHistory && !existingUserPhone.empty) {
      const userData = existingUserPhone.docs[0].data();
      if (userData.trialApplied === true) {
        hasActualTrialHistory = true;
      }
    }

    // tenants에서 subscription/trial 이력 확인 (현재 tenant 제외)
    if (!hasActualTrialHistory && !existingTenantPhone.empty) {
      for (const doc of existingTenantPhone.docs) {
        const tData = doc.data();
        const tId = tData.tenantId || doc.id;

        // 현재 tenant는 제외
        if (tId === tenantId) continue;

        // subscription이 있거나 trial 관련 필드가 있는 경우
        if (tData.subscription?.plan || tData.subscription?.status || tData.trialEndsAt) {
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

          if (!periodStart && tData.subscription) {
            periodStart = parseDate(tData.subscription.startedAt) || parseDate(tData.createdAt);
            periodEnd = parseDate(tData.subscription.trialEndsAt) || parseDate(tData.trialEndsAt);
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
          if (subData?.plan || subData?.status) {
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

    // n8n webhook 호출 (tenantId 포함하여 새 tenant 생성 방지)
    const n8nWebhookUrl = process.env.N8N_TRIAL_APPLY_WEBHOOK_URL || process.env.N8N_WEBHOOK_URL;

    if (n8nWebhookUrl) {
      try {
        const timestamp = new Date().toISOString();
        const n8nResponse = await fetch(n8nWebhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            tenantId, // 기존 tenant ID 전달
            email,
            name,
            phone,
            brandName,
            industry: industry || tenantData.industry,
            timestamp,
            action: 'apply_trial', // n8n에서 분기 처리용
          }),
        });

        if (!n8nResponse.ok) {
          console.error('n8n webhook 호출 실패:', n8nResponse.status);
        } else {
          const n8nData = await n8nResponse.json();
          console.log('n8n webhook 호출 성공:', n8nData);
        }
      } catch (error) {
        console.error('n8n webhook 호출 오류:', error);
        // n8n 실패해도 계속 진행
      }
    }

    // Trial subscription 생성
    const now = new Date();
    const trialEndDate = new Date(now);
    trialEndDate.setDate(trialEndDate.getDate() + 30); // 30일 무료체험

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

    // tenant에도 subscription 정보 업데이트
    await db.collection('tenants').doc(tenantSnapshot.docs[0].id).update({
      subscription: {
        plan: 'trial',
        status: 'trial',
        startedAt: now,
        trialEndsAt: trialEndDate,
      },
      trialEndsAt: trialEndDate,
      updatedAt: now,
    });

    // users 컬렉션 업데이트 (trialApplied 플래그)
    const existingUser = await db.collection('users').doc(email).get();
    if (existingUser.exists) {
      await db.collection('users').doc(email).update({
        trialApplied: true,
        trialAppliedAt: now,
        updatedAt: now,
      });
    } else {
      // users에 없으면 생성
      await db.collection('users').doc(email).set({
        email,
        name,
        phone,
        trialApplied: true,
        trialAppliedAt: now,
        createdAt: now,
        updatedAt: now,
      });
    }

    console.log(`Trial applied to existing tenant: ${tenantId}, 종료일: ${trialEndDate.toISOString()}`);

    return NextResponse.json({
      success: true,
      message: '무료체험이 시작되었습니다.',
      tenantId,
      trialEndDate: trialEndDate.toISOString(),
    });

  } catch (error) {
    console.error('무료체험 적용 오류:', error);
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' },
      { status: 500 }
    );
  }
}
