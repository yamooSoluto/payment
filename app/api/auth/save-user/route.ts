import { NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin, getAdminAuth } from '@/lib/firebase-admin';
import { generateToken } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const { email, name, phone, provider, password, rememberMe } = await request.json();

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

    // Google 사용자 프로필 완성 체크 (name, phone 없으면 프로필 미완성)
    const isGoogleIncompleteProfile = existingUserEmail.exists &&
      existingUserEmail.data()?.provider === 'google' &&
      (!existingUserEmail.data()?.name || !existingUserEmail.data()?.phone);

    // 이메일 중복 체크 (탈퇴 회원, Google 프로필 미완성은 허용)
    if (existingUserEmail.exists && !isDeletedUser && !isGoogleIncompleteProfile) {
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

    // 연락처 중복 체크 (탈퇴 회원은 재가입 허용, 본인 제외)
    if (!existingUserPhone.empty && !isDeletedPhoneUser) {
      // 본인이 아닌 다른 사용자가 해당 연락처를 사용 중인지 확인
      const otherUserWithPhone = existingUserPhone.docs.find(doc => doc.id !== email);
      if (otherUserWithPhone) {
        return NextResponse.json(
          { error: '이미 가입된 연락처입니다.' },
          { status: 400 }
        );
      }
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
      provider: provider || 'email', // 로그인 제공자 저장
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

    // Google 로그인 사용자의 경우 비밀번호 설정 (포탈 로그인용)
    if (provider === 'google' && password) {
      try {
        const adminAuth = getAdminAuth();
        if (adminAuth) {
          const userRecord = await adminAuth.getUserByEmail(email);
          await adminAuth.updateUser(userRecord.uid, {
            password: password,
          });
        }
      } catch (authError) {
        console.error('비밀번호 설정 오류:', authError);
        // 비밀번호 설정 실패해도 회원가입은 성공으로 처리
        // 사용자에게 나중에 비밀번호 재설정하라고 안내 가능
      }
    }

    // 로그인 토큰 생성 (account 페이지 접근용)
    const token = generateToken(email, 'account', rememberMe);

    return NextResponse.json({
      success: true,
      message: '회원가입이 완료되었습니다.',
      token,
    });

  } catch (error) {
    console.error('사용자 정보 저장 오류:', error);
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
