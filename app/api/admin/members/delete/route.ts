import { NextRequest, NextResponse } from 'next/server';
import { getAdminFromRequest, hasPermission } from '@/lib/admin-auth';
import { initializeFirebaseAdmin, getAdminAuth } from '@/lib/firebase-admin';

// POST: 회원 삭제 (Soft Delete 방식)
export async function POST(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);

    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(admin, 'members:delete')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const db = initializeFirebaseAdmin();
    const auth = getAdminAuth();

    if (!db || !auth) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
    }

    const body = await request.json();
    const { memberIds, force = false } = body;

    if (!memberIds || !Array.isArray(memberIds) || memberIds.length === 0) {
      return NextResponse.json(
        { error: '삭제할 회원을 선택해주세요.' },
        { status: 400 }
      );
    }

    let deletedCount = 0;
    const errors: { email: string; reason: string }[] = [];
    const now = new Date();

    for (const memberId of memberIds) {
      try {
        const email = decodeURIComponent(memberId);

        // 회원 정보 조회
        const userDoc = await db.collection('users').doc(email).get();
        const userData = userDoc.exists ? userDoc.data() : null;
        const userId = userData?.userId;

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

        // 활성 구독 체크 (force가 false일 때만)
        if (!force) {
          let hasActiveSubscription = false;
          let activeReason = '';

          for (const tenantId of tenantIds) {
            // subscriptions 컬렉션 체크
            const subscriptionDoc = await db.collection('subscriptions').doc(tenantId).get();
            if (subscriptionDoc.exists) {
              const subscription = subscriptionDoc.data();
              if (subscription?.status === 'active' || subscription?.status === 'trial' || subscription?.status === 'canceled') {
                hasActiveSubscription = true;
                activeReason = subscription?.status === 'trial' ? '무료체험 중' :
                               subscription?.status === 'canceled' ? '해지 예정' : '구독 중';
                break;
              }
            }
          }

          // tenants 컬렉션의 trial 상태도 체크
          if (!hasActiveSubscription) {
            for (const doc of tenantsSnapshot.docs) {
              const tenantData = doc.data();
              const tenantStatus = tenantData.subscription?.status || tenantData.status;
              const tenantPlan = tenantData.subscription?.plan || tenantData.plan;

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

                if (!trialEndsAtDate || trialEndsAtDate > new Date()) {
                  hasActiveSubscription = true;
                  activeReason = '무료체험 중';
                  break;
                }
              }
            }
          }

          if (hasActiveSubscription) {
            errors.push({ email, reason: `${activeReason}인 매장이 있어 삭제할 수 없습니다.` });
            continue;
          }
        }

        // 트랜잭션으로 데이터 처리 (Soft Delete)
        const batch = db.batch();

        // 1. Firebase Auth에서 사용자 삭제
        try {
          const userRecord = await auth.getUserByEmail(email);
          await auth.deleteUser(userRecord.uid);
        } catch (authError: unknown) {
          if (authError && typeof authError === 'object' && 'code' in authError && authError.code !== 'auth/user-not-found') {
            console.error(`Auth delete error for ${email}:`, authError);
          }
        }

        // 2. 테넌트 문서에 삭제 표시 (Soft Delete)
        for (const doc of tenantsSnapshot.docs) {
          batch.update(doc.ref, {
            deleted: true,
            deletedAt: now,
            deletedBy: 'admin',
            deletedByAdminId: admin.adminId,
            deletedEmail: email,
            email: `deleted_${Date.now()}_${email}`,
          });
        }

        // 3. 구독 정보 삭제 표시
        for (const tenantId of tenantIds) {
          const subscriptionRef = db.collection('subscriptions').doc(tenantId);
          const subscriptionDoc = await subscriptionRef.get();
          if (subscriptionDoc.exists) {
            batch.update(subscriptionRef, {
              deleted: true,
              deletedAt: now,
              deletedBy: 'admin',
              deletedByAdminId: admin.adminId,
            });
          }
        }

        // 4. 카드 정보 삭제 (Hard Delete)
        for (const tenantId of tenantIds) {
          const cardsRef = db.collection('cards').doc(tenantId);
          const cardsDoc = await cardsRef.get();
          if (cardsDoc.exists) {
            batch.delete(cardsRef);
          }
        }

        // 5. users 컬렉션 처리 - 보관 기간 차등 적용
        if (userDoc.exists) {
          // 결제 이력 확인
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

          batch.update(db.collection('users').doc(email), {
            deleted: true,
            deletedAt: now,
            deletedBy: 'admin',
            deletedByAdminId: admin.adminId,
            retentionEndDate,
            retentionReason: hasPaidHistory ? '전자상거래법_5년' : '부정이용방지_1년',
          });
        }

        // 6. 탈퇴 로그 저장 (account_deletions)
        const deletionLogRef = db.collection('account_deletions').doc();
        batch.set(deletionLogRef, {
          userId: userId || '',
          email,
          tenantIds,
          deletedAt: now,
          deletedBy: 'admin',
          adminId: admin.adminId,
          adminLoginId: admin.loginId,
          adminName: admin.name,
          reason: 'Admin requested deletion',
        });

        // 7. 관리자 로그 기록 (admin_logs)
        const adminLogRef = db.collection('admin_logs').doc();
        batch.set(adminLogRef, {
          action: 'member_delete',
          targetEmail: email,
          targetUserId: userId || null,
          deletedData: {
            name: userData?.name || '',
            phone: userData?.phone || '',
            group: userData?.group || 'normal',
          },
          adminId: admin.adminId,
          adminLoginId: admin.loginId,
          adminName: admin.name,
          createdAt: now,
        });

        await batch.commit();
        deletedCount++;
      } catch (error) {
        console.error(`Delete member error for ${memberId}:`, error);
        errors.push({ email: memberId, reason: '처리 중 오류 발생' });
      }
    }

    if (deletedCount === 0 && errors.length > 0) {
      return NextResponse.json(
        {
          error: '회원 삭제에 실패했습니다.',
          details: errors,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      deletedCount,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('Delete members error:', error);
    return NextResponse.json(
      { error: '회원 삭제 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
