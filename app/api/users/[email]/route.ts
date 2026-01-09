import { NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ email: string }> }
) {
  try {
    const { email } = await params;

    if (!email) {
      return NextResponse.json(
        { error: '이메일이 필요합니다.' },
        { status: 400 }
      );
    }

    const decodedEmail = decodeURIComponent(email);

    const db = adminDb || initializeFirebaseAdmin();
    if (!db) {
      return NextResponse.json(
        { error: '서버 오류가 발생했습니다.' },
        { status: 500 }
      );
    }

    const userDoc = await db.collection('users').doc(decodedEmail).get();
    let userData = userDoc.exists ? userDoc.data() : null;

    // users 컬렉션에 없으면 tenants 컬렉션에서 찾기
    if (!userData) {
      const tenantsSnapshot = await db.collection('tenants')
        .where('email', '==', decodedEmail)
        .limit(1)
        .get();

      if (!tenantsSnapshot.empty) {
        const tenantData = tenantsSnapshot.docs[0].data();
        userData = {
          email: tenantData.email,
          name: tenantData.ownerName || tenantData.name || '',
          phone: tenantData.phone || '',
        };
      }
    }

    // users에도 tenants에도 없으면 email만 반환
    if (!userData) {
      return NextResponse.json({
        email: decodedEmail,
        name: '',
        phone: '',
        trialApplied: false,
      });
    }

    // 1. email 기준 trialApplied 확인
    let trialApplied = userData?.trialApplied || false;

    // 2. phone 기준 추가 체크 (다른 email로 같은 phone 사용 케이스)
    if (!trialApplied && userData?.phone) {
      const phoneTrialCheck = await db.collection('users')
        .where('phone', '==', userData.phone)
        .where('trialApplied', '==', true)
        .limit(1)
        .get();

      if (!phoneTrialCheck.empty) {
        trialApplied = true;
      }
    }

    // 3. tenants 컬렉션에서 구독 이력이 있는지 확인 (trial 또는 유료)
    if (!trialApplied) {
      const tenantsSnapshot = await db.collection('tenants')
        .where('email', '==', decodedEmail)
        .get();

      for (const doc of tenantsSnapshot.docs) {
        const tenantData = doc.data();
        const tenantId = tenantData.tenantId || doc.id;

        // tenant에 subscription 정보가 있는 경우
        if (tenantData.subscription?.plan || tenantData.subscription?.status) {
          trialApplied = true;
          break;
        }

        // subscriptions 컬렉션에서도 확인
        const subDoc = await db.collection('subscriptions').doc(tenantId).get();
        if (subDoc.exists) {
          const subData = subDoc.data();
          if (subData?.plan || subData?.status) {
            trialApplied = true;
            break;
          }
        }
      }
    }

    // 유료 구독 이력 확인
    let hasPaidSubscription = !!userData?.paidSubscriptionAt;

    // paidSubscriptionAt가 없어도 subscriptions에서 유료 플랜(trial 제외) 이력 확인
    if (!hasPaidSubscription) {
      const tenantsForPaid = await db.collection('tenants')
        .where('email', '==', decodedEmail)
        .get();

      for (const doc of tenantsForPaid.docs) {
        const tenantData = doc.data();
        const tenantId = tenantData.tenantId || doc.id;

        // subscriptions 컬렉션에서 유료 플랜 확인
        const subDoc = await db.collection('subscriptions').doc(tenantId).get();
        if (subDoc.exists) {
          const subData = subDoc.data();
          // trial이 아닌 플랜이 있으면 유료 구독 이력
          if (subData?.plan && subData.plan !== 'trial') {
            hasPaidSubscription = true;
            break;
          }
        }

        // tenant의 embedded subscription에서도 확인
        if (!hasPaidSubscription && tenantData.subscription?.plan && tenantData.subscription.plan !== 'trial') {
          hasPaidSubscription = true;
          break;
        }
      }
    }

    return NextResponse.json({
      email: userData?.email || decodedEmail,
      name: userData?.name || '',
      phone: userData?.phone || '',
      trialApplied,
      hasPaidSubscription,
    });

  } catch (error) {
    console.error('사용자 정보 조회 오류:', error);
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
