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

    // 1. email 기준 trialApplied 확인
    let trialApplied = userData?.trialApplied || false;

    // 2. phone 기준 추가 체크 (다른 email로 같은 phone 사용 케이스)
    // 같은 전화번호로 신청한 매장 정보도 가져옴
    let phoneTrialInfo: { brandName?: string; startDate?: string } | null = null;

    if (!trialApplied && userData?.phone) {
      // 현재 phone으로 trialApplied된 유저 체크
      const phoneTrialCheck = await db.collection('users')
        .where('phone', '==', userData.phone)
        .where('trialApplied', '==', true)
        .limit(1)
        .get();

      // previousPhones에 현재 phone이 포함된 유저 체크 (연락처 변경 이력)
      const previousPhoneCheck = await db.collection('users')
        .where('previousPhones', 'array-contains', userData.phone)
        .where('trialApplied', '==', true)
        .limit(1)
        .get();

      if (!phoneTrialCheck.empty || !previousPhoneCheck.empty) {
        trialApplied = true;

        // 해당 전화번호로 신청한 사용자의 이메일로 매장 정보 조회
        const matchedDoc = !phoneTrialCheck.empty ? phoneTrialCheck.docs[0] : previousPhoneCheck.docs[0];
        const phoneUserData = matchedDoc.data();
        const phoneUserEmail = phoneUserData.email;

        if (phoneUserEmail) {
          const phoneTenantsSnapshot = await db.collection('tenants')
            .where('email', '==', phoneUserEmail)
            .limit(1)
            .get();

          if (!phoneTenantsSnapshot.empty) {
            const phoneTenantData = phoneTenantsSnapshot.docs[0].data();
            const phoneTenantId = phoneTenantData.tenantId || phoneTenantsSnapshot.docs[0].id;

            // subscriptions에서 trial 정보 조회
            const phoneSubDoc = await db.collection('subscriptions').doc(phoneTenantId).get();
            if (phoneSubDoc.exists) {
              const phoneSubData = phoneSubDoc.data();
              if (phoneSubData?.plan === 'trial') {
                phoneTrialInfo = {
                  brandName: phoneTenantData.brandName,
                  startDate: phoneSubData?.currentPeriodStart?.toDate?.()?.toISOString() ||
                             phoneSubData?.startDate?.toDate?.()?.toISOString() ||
                             phoneTenantData.createdAt?.toDate?.()?.toISOString(),
                };
              }
            }

            // embedded subscription에서도 확인
            if (!phoneTrialInfo && phoneTenantData.subscription?.plan === 'trial') {
              phoneTrialInfo = {
                brandName: phoneTenantData.brandName,
                startDate: phoneTenantData.subscription?.currentPeriodStart?.toDate?.()?.toISOString() ||
                           phoneTenantData.subscription?.startDate?.toDate?.()?.toISOString() ||
                           phoneTenantData.createdAt?.toDate?.()?.toISOString(),
              };
            }
          }
        }
      }
    }

    // 3. tenants 컬렉션에서 구독 이력이 있는지 확인 (trial 또는 유료)
    // 무료체험 상세 정보 (매장명, 기간)
    let trialInfo: { brandName?: string; startDate?: string; endDate?: string } | null = null;

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
          // trial인 경우 상세 정보 저장
          if (tenantData.subscription?.plan === 'trial') {
            trialInfo = {
              brandName: tenantData.brandName,
              startDate: tenantData.subscription?.currentPeriodStart?.toDate?.()?.toISOString() ||
                         tenantData.subscription?.startDate?.toDate?.()?.toISOString() ||
                         tenantData.createdAt?.toDate?.()?.toISOString(),
              endDate: tenantData.subscription?.currentPeriodEnd?.toDate?.()?.toISOString(),
            };
          }
          break;
        }

        // subscriptions 컬렉션에서도 확인
        const subDoc = await db.collection('subscriptions').doc(tenantId).get();
        if (subDoc.exists) {
          const subData = subDoc.data();
          if (subData?.plan || subData?.status) {
            trialApplied = true;
            // trial인 경우 상세 정보 저장
            if (subData?.plan === 'trial') {
              trialInfo = {
                brandName: tenantData.brandName,
                startDate: subData?.currentPeriodStart?.toDate?.()?.toISOString() ||
                           subData?.startDate?.toDate?.()?.toISOString() ||
                           tenantData.createdAt?.toDate?.()?.toISOString(),
                endDate: subData?.currentPeriodEnd?.toDate?.()?.toISOString(),
              };
            }
            break;
          }
        }
      }
    }

    // trialApplied가 true인데 trialInfo가 없으면 (userData.trialApplied로 설정된 경우) tenants에서 다시 조회
    if (trialApplied && !trialInfo) {
      const tenantsForInfo = await db.collection('tenants')
        .where('email', '==', decodedEmail)
        .get();

      for (const doc of tenantsForInfo.docs) {
        const tenantData = doc.data();
        const tenantId = tenantData.tenantId || doc.id;

        const subDoc = await db.collection('subscriptions').doc(tenantId).get();
        if (subDoc.exists) {
          const subData = subDoc.data();
          if (subData?.plan === 'trial') {
            trialInfo = {
              brandName: tenantData.brandName,
              startDate: subData?.currentPeriodStart?.toDate?.()?.toISOString() ||
                         subData?.startDate?.toDate?.()?.toISOString() ||
                         tenantData.createdAt?.toDate?.()?.toISOString(),
              endDate: subData?.currentPeriodEnd?.toDate?.()?.toISOString(),
            };
            break;
          }
        }

        // tenant embedded subscription에서도 확인
        if (tenantData.subscription?.plan === 'trial') {
          trialInfo = {
            brandName: tenantData.brandName,
            startDate: tenantData.subscription?.currentPeriodStart?.toDate?.()?.toISOString() ||
                       tenantData.subscription?.startDate?.toDate?.()?.toISOString() ||
                       tenantData.createdAt?.toDate?.()?.toISOString(),
            endDate: tenantData.subscription?.currentPeriodEnd?.toDate?.()?.toISOString(),
          };
          break;
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
      trialInfo: trialInfo || phoneTrialInfo, // 무료체험 상세 정보 (매장명, 신청일) - email 기준 또는 phone 기준
    });

  } catch (error) {
    console.error('사용자 정보 조회 오류:', error);
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
