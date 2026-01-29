import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin, getAdminAuth } from '@/lib/firebase-admin';
import { verifyToken, verifyBearerToken } from '@/lib/auth';

export async function DELETE(request: NextRequest) {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { token, confirmText } = body;

    let email: string | null = null;

    // 토큰으로 인증 (포탈 SSO)
    if (token) {
      email = await verifyToken(token);
    }
    // Firebase ID Token 인증
    else {
      email = await verifyBearerToken(request.headers.get('authorization'));
    }

    if (!email) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // 확인 문구 검증
    if (confirmText !== '회원탈퇴') {
      return NextResponse.json({ error: '확인 문구가 일치하지 않습니다.' }, { status: 400 });
    }

    // users 컬렉션에서 userId 조회
    const userRef = db.collection('users').doc(email);
    const userDocForUserId = await userRef.get();
    const userId = userDocForUserId.exists ? userDocForUserId.data()?.userId : null;

    // 해당 사용자의 모든 테넌트 조회 (userId 기반, 없으면 email fallback)
    let tenantsSnapshot;
    if (userId) {
      tenantsSnapshot = await db
        .collection('tenants')
        .where('userId', '==', userId)
        .get();
    } else {
      tenantsSnapshot = await db
        .collection('tenants')
        .where('email', '==', email)
        .get();
    }

    const tenantIds = tenantsSnapshot.docs.map(doc => doc.data().tenantId || doc.id);

    // 활성 구독이 있는지 확인 (subscriptions + tenants 모두 체크)
    for (const tenantId of tenantIds) {
      // 1. subscriptions 컬렉션 체크
      const subscriptionDoc = await db.collection('subscriptions').doc(tenantId).get();
      if (subscriptionDoc.exists) {
        const subscription = subscriptionDoc.data();
        if (subscription?.status === 'active' || subscription?.status === 'trial' || subscription?.status === 'canceled') {
          return NextResponse.json(
            { error: '활성 구독 또는 체험 중인 매장이 있는 경우 탈퇴할 수 없습니다.' },
            { status: 400 }
          );
        }
      }
    }

    // 2. tenants 컬렉션의 trial 상태도 체크 (subscriptions에 없는 경우)
    for (const doc of tenantsSnapshot.docs) {
      const tenantData = doc.data();
      const tenantStatus = tenantData.subscription?.status || tenantData.status;
      const tenantPlan = tenantData.subscription?.plan || tenantData.plan;

      // trial 플랜이고 체험 종료일이 아직 안 지났으면 탈퇴 불가
      if (tenantPlan === 'trial' || tenantStatus === 'trial') {
        const trialEndsAt = tenantData.trialEndsAt || tenantData.subscription?.trialEndsAt;
        let trialEndsAtDate: Date | null = null;

        if (trialEndsAt) {
          if (typeof trialEndsAt === 'object' && 'toDate' in trialEndsAt) {
            trialEndsAtDate = trialEndsAt.toDate();
          } else if (typeof trialEndsAt === 'object' && '_seconds' in trialEndsAt) {
            trialEndsAtDate = new Date(trialEndsAt._seconds * 1000);
          } else if (typeof trialEndsAt === 'string') {
            trialEndsAtDate = new Date(trialEndsAt);
          }
        }

        // 체험 종료일이 없거나 아직 안 지났으면 탈퇴 불가
        if (!trialEndsAtDate || trialEndsAtDate > new Date()) {
          return NextResponse.json(
            { error: '무료체험 중인 매장이 있는 경우 탈퇴할 수 없습니다.' },
            { status: 400 }
          );
        }
      }
    }

    // 트랜잭션으로 데이터 삭제
    const batch = db.batch();
    const now = new Date();

    // 1. 테넌트 문서에 탈퇴 표시 (완전 삭제 대신 soft delete)
    for (const doc of tenantsSnapshot.docs) {
      batch.update(doc.ref, {
        deleted: true,
        deletedAt: now,
        deletedBy: 'user',
        deletedByAdminId: null,
        deletedEmail: email,
        email: `deleted_${Date.now()}_${email}`, // 이메일 마스킹
      });
    }

    // 2. 구독 정보 삭제 표시
    for (const tenantId of tenantIds) {
      const subscriptionRef = db.collection('subscriptions').doc(tenantId);
      const subscriptionDoc = await subscriptionRef.get();
      if (subscriptionDoc.exists) {
        batch.update(subscriptionRef, {
          deleted: true,
          deletedAt: now,
          deletedBy: 'user',
          deletedByAdminId: null,
        });
      }
    }

    // 3. 카드 정보 삭제 (새 구조: tenantId가 문서 ID)
    for (const tenantId of tenantIds) {
      const cardsRef = db.collection('cards').doc(tenantId);
      const cardsDoc = await cardsRef.get();
      if (cardsDoc.exists) {
        batch.delete(cardsRef);
      }
    }

    // 4. users 컬렉션 처리 - 보관 기간 차등 적용
    // - 결제 고객: 5년 (전자상거래법)
    // - 무료체험만: 1년 (부정 이용 방지)
    // userRef, userDocForUserId는 위에서 이미 조회함
    if (userDocForUserId.exists) {
      // 결제 이력 확인 (payments 컬렉션에서 성공한 결제가 있는지)
      let hasPaidHistory = false;
      for (const tenantId of tenantIds) {
        const paymentsSnapshot = await db.collection('payments')
          .where('tenantId', '==', tenantId)
          .where('status', '==', 'DONE')
          .limit(1)
          .get();
        if (!paymentsSnapshot.empty) {
          hasPaidHistory = true;
          break;
        }
      }

      // 보관 기간 계산
      const retentionEndDate = new Date(now);
      if (hasPaidHistory) {
        retentionEndDate.setFullYear(retentionEndDate.getFullYear() + 5); // 결제 고객: 5년
      } else {
        retentionEndDate.setFullYear(retentionEndDate.getFullYear() + 1); // 무료체험만: 1년
      }

      batch.update(userRef, {
        // 탈퇴 상태 표시 (개인정보는 그대로 유지)
        deleted: true,
        deletedAt: now,
        deletedBy: 'user',
        deletedByAdminId: null,
        retentionEndDate,
        retentionReason: hasPaidHistory ? '전자상거래법_5년' : '부정이용방지_1년',
        // email, phone, name, trialApplied 모두 유지
        // - deleted 상태라 신규 가입은 가능
        // - phone으로 무료체험 이력 추적
      });
    }

    // 5. 탈퇴 로그 저장
    const deletionLogRef = db.collection('account_deletions').doc();
    const userIdForLog = userId || '';
    const userName = userDocForUserId.exists ? userDocForUserId.data()?.name || '' : '';
    const userPhone = userDocForUserId.exists ? userDocForUserId.data()?.phone || '' : '';
    const brandNames = tenantsSnapshot.docs.map(doc => doc.data().brandName || '');
    batch.set(deletionLogRef, {
      userId: userIdForLog || '',
      email,
      name: userName,
      phone: userPhone,
      tenantIds,
      brandNames,
      deletedAt: now,
      deletedBy: 'user',
      reason: 'User requested deletion',
    });

    // 6. 매장별 삭제 로그 생성 (tenant_deletions) — 기존에 개별 삭제된 매장은 스킵
    const permanentDeleteAt = new Date(now);
    permanentDeleteAt.setDate(permanentDeleteAt.getDate() + 90);
    const paymentDeleteAt = new Date(now);
    paymentDeleteAt.setFullYear(paymentDeleteAt.getFullYear() + 5);

    for (const doc of tenantsSnapshot.docs) {
      const tenantData = doc.data();
      const tenantId = tenantData.tenantId || doc.id;

      // 이미 tenant_deletions에 기록이 있는 매장은 스킵
      const existingDeletion = await db.collection('tenant_deletions')
        .where('tenantId', '==', tenantId)
        .limit(1)
        .get();
      if (!existingDeletion.empty) continue;

      // users 컬렉션에서 name, phone 조회
      let userName = tenantData.name || tenantData.ownerName || '';
      let userPhone = tenantData.phone || '';
      if (userDocForUserId.exists) {
        const uData = userDocForUserId.data();
        if (!userName) userName = uData?.name || '';
        if (!userPhone) userPhone = uData?.phone || '';
      }

      const tenantDeletionRef = db.collection('tenant_deletions').doc();
      batch.set(tenantDeletionRef, {
        tenantId,
        userId: userIdForLog || '',
        brandName: tenantData.brandName || '',
        email,
        name: userName,
        phone: userPhone,
        deletedAt: now,
        deletedBy: 'user',
        deletedByDetails: userId || email,
        permanentDeleteAt,
        paymentDeleteAt,
        reason: 'account_delete',
      });
    }

    await batch.commit();

    // Firebase Auth에서 사용자 삭제
    try {
      const auth = getAdminAuth();
      if (auth) {
        const userRecord = await auth.getUserByEmail(email);
        await auth.deleteUser(userRecord.uid);
      }
    } catch (authError: unknown) {
      if (authError && typeof authError === 'object' && 'code' in authError && authError.code !== 'auth/user-not-found') {
        console.error(`Auth delete error for ${email}:`, authError);
      }
    }

    return NextResponse.json({
      success: true,
      message: '회원 탈퇴가 완료되었습니다.',
    });

  } catch (error) {
    console.error('Account deletion failed:', error);
    return NextResponse.json(
      { error: '회원 탈퇴 처리 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
