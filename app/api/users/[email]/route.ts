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

    // 3. tenants 컬렉션에서 체험 중인 매장이 있는지 확인
    if (!trialApplied) {
      const trialTenantsSnapshot = await db.collection('tenants')
        .where('email', '==', decodedEmail)
        .get();

      for (const doc of trialTenantsSnapshot.docs) {
        const tenantData = doc.data();
        if (tenantData.subscription?.plan === 'trial' || tenantData.subscription?.status === 'trial') {
          trialApplied = true;
          break;
        }
      }
    }

    return NextResponse.json({
      email: userData?.email || decodedEmail,
      name: userData?.name || '',
      phone: userData?.phone || '',
      trialApplied,
    });

  } catch (error) {
    console.error('사용자 정보 조회 오류:', error);
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
