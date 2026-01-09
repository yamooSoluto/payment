import { NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';

export async function POST(request: Request) {
  try {
    const { email, name, phone } = await request.json();

    if (!email || !name || !phone) {
      return NextResponse.json(
        { error: '필수 정보가 누락되었습니다.' },
        { status: 400 }
      );
    }

    // Firestore 초기화 확인
    const db = adminDb || initializeFirebaseAdmin();
    if (!db) {
      return NextResponse.json(
        { error: '서버 오류가 발생했습니다.' },
        { status: 500 }
      );
    }

    // 이메일/연락처 중복 확인 - users, tenants 둘 다 체크
    const [existingUserEmail, existingTenantEmail, existingUserPhone, existingTenantPhone] = await Promise.all([
      db.collection('users').doc(email).get(),
      db.collection('tenants').where('email', '==', email).limit(1).get(),
      db.collection('users').where('phone', '==', phone).limit(1).get(),
      db.collection('tenants').where('phone', '==', phone).limit(1).get(),
    ]);

    // 탈퇴 회원 재가입 체크
    const isDeletedUser = existingUserEmail.exists && existingUserEmail.data()?.deleted === true;
    const isDeletedPhoneUser = !existingUserPhone.empty && existingUserPhone.docs[0].data()?.deleted === true;

    // 이메일 중복 체크 (탈퇴 회원은 재가입 허용)
    if (existingUserEmail.exists && !isDeletedUser) {
      return NextResponse.json(
        { error: '이미 가입된 이메일입니다.' },
        { status: 400 }
      );
    }

    // tenants에서 활성 계정 체크 (deleted가 아닌 경우만 차단)
    if (!existingTenantEmail.empty) {
      const activeTenant = existingTenantEmail.docs.find(doc => doc.data().deleted !== true);
      if (activeTenant) {
        return NextResponse.json(
          { error: '이미 가입된 이메일입니다.' },
          { status: 400 }
        );
      }
    }

    // 연락처 중복 체크 (탈퇴 회원은 재가입 허용)
    if (!existingUserPhone.empty && !isDeletedPhoneUser) {
      return NextResponse.json(
        { error: '이미 가입된 연락처입니다.' },
        { status: 400 }
      );
    }

    if (!existingTenantPhone.empty) {
      const activeTenantPhone = existingTenantPhone.docs.find(doc => doc.data().deleted !== true);
      if (activeTenantPhone) {
        return NextResponse.json(
          { error: '이미 가입된 연락처입니다.' },
          { status: 400 }
        );
      }
    }

    // users 컬렉션에 저장 (탈퇴 회원 재가입 시 기존 문서 업데이트)
    const now = new Date();
    const existingData = existingUserEmail.exists ? existingUserEmail.data() : null;

    await db.collection('users').doc(email).set({
      email,
      name,
      phone,
      createdAt: existingData?.createdAt || now,
      updatedAt: now,
      // 탈퇴 회원 재가입 시 trialApplied 유지 (무료체험 재신청 방지)
      ...(existingData?.trialApplied && { trialApplied: true, trialAppliedAt: existingData.trialAppliedAt }),
      // 재가입 정보 기록
      ...(existingData?.deleted && {
        reregisteredAt: now,
        previousDeletionAt: existingData.deletedAt,
      }),
      // deleted 플래그 제거 (재가입이므로)
    });

    return NextResponse.json({
      success: true,
      message: '회원가입이 완료되었습니다.'
    });

  } catch (error) {
    console.error('사용자 정보 저장 오류:', error);
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
