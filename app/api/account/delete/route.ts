import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { verifyToken } from '@/lib/auth';

export async function DELETE(request: NextRequest) {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { token, email: emailParam, confirmText } = body;

    let email: string | null = null;

    // 토큰으로 인증 (포탈 SSO)
    if (token) {
      email = await verifyToken(token);
    }
    // 이메일로 직접 인증 (Firebase Auth)
    else if (emailParam) {
      email = emailParam;
    }

    if (!email) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // 확인 문구 검증
    if (confirmText !== '회원탈퇴') {
      return NextResponse.json({ error: '확인 문구가 일치하지 않습니다.' }, { status: 400 });
    }

    // 해당 사용자의 모든 테넌트 조회
    const tenantsSnapshot = await db
      .collection('tenants')
      .where('email', '==', email)
      .get();

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
        });
      }
    }

    // 3. 카드 정보 삭제
    for (const tenantId of tenantIds) {
      const cardsSnapshot = await db
        .collection('cards')
        .where('tenantId', '==', tenantId)
        .get();

      for (const cardDoc of cardsSnapshot.docs) {
        batch.delete(cardDoc.ref);
      }
    }

    // 4. 탈퇴 로그 저장
    const deletionLogRef = db.collection('account_deletions').doc();
    batch.set(deletionLogRef, {
      email,
      tenantIds,
      deletedAt: now,
      reason: 'User requested deletion',
    });

    await batch.commit();

    // n8n 웹훅 호출 (회원탈퇴 알림)
    if (process.env.N8N_WEBHOOK_URL) {
      try {
        await fetch(process.env.N8N_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event: 'account_deleted',
            email,
            tenantIds,
            deletedAt: now.toISOString(),
          }),
        });
      } catch (webhookError) {
        console.error('Webhook call failed:', webhookError);
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
