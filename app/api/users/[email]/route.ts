import { NextResponse, NextRequest } from 'next/server';
import { adminDb, initializeFirebaseAdmin, getAdminAuth } from '@/lib/firebase-admin';
import { verifyToken } from '@/lib/auth';

// 인증 함수: SSO 토큰 또는 Firebase Auth 토큰 검증
async function authenticateRequest(request: NextRequest): Promise<string | null> {
  const authHeader = request.headers.get('Authorization');

  if (!authHeader) {
    return null;
  }

  // Bearer 토큰인 경우 Firebase Auth로 처리
  if (authHeader.startsWith('Bearer ')) {
    const idToken = authHeader.substring(7);
    try {
      const auth = getAdminAuth();
      if (!auth) {
        console.error('Firebase Admin Auth not initialized');
        return null;
      }
      const decodedToken = await auth.verifyIdToken(idToken);
      return decodedToken.email || null;
    } catch (error) {
      console.error('Firebase Auth token verification failed:', error);
      return null;
    }
  }

  // 그 외는 SSO 토큰으로 처리
  const email = await verifyToken(authHeader);
  return email;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ email: string }> }
) {
  try {
    // 인증 검증
    const authenticatedEmail = await authenticateRequest(request);
    if (!authenticatedEmail) {
      return NextResponse.json(
        { error: '인증이 필요합니다.' },
        { status: 401 }
      );
    }

    const { email } = await params;

    if (!email) {
      return NextResponse.json(
        { error: '이메일이 필요합니다.' },
        { status: 400 }
      );
    }

    const decodedEmail = decodeURIComponent(email);

    // 본인 정보만 조회 가능
    if (decodedEmail !== authenticatedEmail) {
      return NextResponse.json(
        { error: '본인 정보만 조회할 수 있습니다.' },
        { status: 403 }
      );
    }

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

    // === 병렬 조회: phone 체크 + tenants 조회를 동시에 실행 ===
    let trialApplied = userData?.trialApplied || false;
    let trialInfo: { brandName?: string; startDate?: string; endDate?: string } | null = null;
    let phoneTrialInfo: { brandName?: string; startDate?: string } | null = null;
    let hasPaidSubscription = !!userData?.paidSubscriptionAt;

    // 1. phone 기반 체크 + email 기반 tenants 조회를 병렬 실행
    const parallelQueries: Promise<void>[] = [];

    // phone 기반 무료체험 이력 체크 (병렬)
    if (!trialApplied && userData?.phone) {
      parallelQueries.push((async () => {
        const [phoneTrialCheck, previousPhoneCheck] = await Promise.all([
          db.collection('users')
            .where('phone', '==', userData!.phone)
            .where('trialApplied', '==', true)
            .limit(1)
            .get(),
          db.collection('users')
            .where('previousPhones', 'array-contains', userData!.phone)
            .where('trialApplied', '==', true)
            .limit(1)
            .get(),
        ]);

        if (!phoneTrialCheck.empty || !previousPhoneCheck.empty) {
          trialApplied = true;

          const matchedDoc = !phoneTrialCheck.empty ? phoneTrialCheck.docs[0] : previousPhoneCheck.docs[0];
          const phoneUserEmail = matchedDoc.data().email;

          if (phoneUserEmail) {
            const phoneTenantsSnapshot = await db.collection('tenants')
              .where('email', '==', phoneUserEmail)
              .limit(1)
              .get();

            if (!phoneTenantsSnapshot.empty) {
              const phoneTenantData = phoneTenantsSnapshot.docs[0].data();
              const phoneTenantId = phoneTenantData.tenantId || phoneTenantsSnapshot.docs[0].id;

              // subscription_history에서 trial 레코드 조회
              const phoneTrialHistorySnapshot = await db
                .collection('subscription_history').doc(phoneTenantId).collection('records')
                .where('plan', '==', 'trial')
                .orderBy('changedAt', 'asc')
                .limit(1)
                .get();

              if (!phoneTrialHistorySnapshot.empty) {
                const record = phoneTrialHistorySnapshot.docs[0].data();
                phoneTrialInfo = {
                  brandName: phoneTenantData.brandName,
                  startDate: record.periodStart?.toDate?.()?.toISOString(),
                };
              }
            }
          }
        }
      })());
    }

    // 2. email 기반 tenants 1회 조회 + subscriptions 병렬 조회 (단일 루프로 통합)
    interface TenantSubPair {
      tenantData: FirebaseFirestore.DocumentData;
      subData: FirebaseFirestore.DocumentData | null;
    }
    let tenantSubPairs: TenantSubPair[] = [];

    parallelQueries.push((async () => {
      const tenantsSnapshot = await db.collection('tenants')
        .where('email', '==', decodedEmail)
        .get();

      if (tenantsSnapshot.empty) return;

      // 모든 subscriptions를 병렬로 조회
      const subResults = await Promise.all(
        tenantsSnapshot.docs.map(async (doc) => {
          const tenantData = doc.data();
          const tenantId = tenantData.tenantId || doc.id;
          const subDoc = await db.collection('subscriptions').doc(tenantId).get();
          return {
            tenantData,
            subData: subDoc.exists ? subDoc.data()! : null,
          };
        })
      );

      tenantSubPairs = subResults;
    })());

    await Promise.all(parallelQueries);

    // 3. 단일 루프: trialApplied, hasPaidSubscription 확인
    for (const { tenantData, subData } of tenantSubPairs) {
      // trialApplied 체크 — embedded subscription
      if (!trialApplied) {
        const hasRealSubscription = tenantData.subscription?.plan ||
          (tenantData.subscription?.status && tenantData.subscription.status !== 'expired');
        if (hasRealSubscription) {
          trialApplied = true;
        }
      }

      // trialApplied 체크 — subscriptions 컬렉션
      if (!trialApplied && subData) {
        const hasRealSubHistory = subData.plan || (subData.status && subData.status !== 'expired');
        if (hasRealSubHistory) {
          trialApplied = true;
        }
      }

      // hasPaidSubscription 체크
      if (!hasPaidSubscription) {
        if (subData?.plan && subData.plan !== 'trial') {
          hasPaidSubscription = true;
        } else if (tenantData.subscription?.plan && tenantData.subscription.plan !== 'trial') {
          hasPaidSubscription = true;
        }
      }
    }

    // 4. trialInfo 추출 — subscription_history에서 trial 레코드 조회
    for (const { tenantData } of tenantSubPairs) {
      if (trialInfo) break;
      const tenantId = tenantData.tenantId || tenantData.id;
      if (!tenantId) continue;

      const trialHistorySnapshot = await db
        .collection('subscription_history').doc(tenantId).collection('records')
        .where('plan', '==', 'trial')
        .orderBy('changedAt', 'asc')
        .limit(1)
        .get();

      if (!trialHistorySnapshot.empty) {
        const record = trialHistorySnapshot.docs[0].data();
        trialInfo = {
          brandName: tenantData.brandName,
          startDate: record.periodStart?.toDate?.()?.toISOString(),
          endDate: record.periodEnd?.toDate?.()?.toISOString(),
        };
      }
    }

    return NextResponse.json({
      email: userData?.email || decodedEmail,
      name: userData?.name || '',
      phone: userData?.phone || '',
      trialApplied,
      hasPaidSubscription,
      trialInfo: trialInfo || phoneTrialInfo,
    });

  } catch (error) {
    console.error('사용자 정보 조회 오류:', error);
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
