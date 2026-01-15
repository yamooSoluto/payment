import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { generateUserId } from '@/lib/user-utils';
import { FieldValue } from 'firebase-admin/firestore';

// 기존 users에 userId 부여 및 관련 컬렉션 연결 마이그레이션
export async function POST(request: NextRequest) {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { dryRun = true, limit = 100, phase = 'all' } = body;
    // phase: 'users' | 'tenants' | 'subscriptions' | 'payments' | 'refunds' | 'subscription_history' | 'cards' | 'all'

    const results = {
      users: { total: 0, migrated: 0, skipped: 0, errors: [] as string[] },
      tenants: { total: 0, migrated: 0, skipped: 0, errors: [] as string[] },
      subscriptions: { total: 0, migrated: 0, skipped: 0, errors: [] as string[] },
      payments: { total: 0, migrated: 0, skipped: 0, errors: [] as string[] },
      refunds: { total: 0, migrated: 0, skipped: 0, errors: [] as string[] },
      subscription_history: { total: 0, migrated: 0, skipped: 0, errors: [] as string[] },
      cards: { total: 0, migrated: 0, skipped: 0, errors: [] as string[] },
    };

    // 1단계: users 컬렉션에 userId 부여
    if (phase === 'all' || phase === 'users') {
      const usersSnapshot = await db.collection('users').limit(limit).get();
      results.users.total = usersSnapshot.size;

      // 기존 userId 수집 (중복 방지용)
      const existingUserIds = new Set<string>();
      usersSnapshot.docs.forEach(doc => {
        const userId = doc.data().userId;
        if (userId) existingUserIds.add(userId);
      });

      for (const doc of usersSnapshot.docs) {
        const email = doc.id;
        const data = doc.data();

        if (data.userId) {
          results.users.skipped++;
          continue;
        }

        // 고유 userId 생성
        let userId = generateUserId();
        let attempts = 0;
        while (existingUserIds.has(userId) && attempts < 10) {
          userId = generateUserId();
          attempts++;
        }
        if (existingUserIds.has(userId)) {
          userId = `u_${Date.now().toString(36)}`;
        }
        existingUserIds.add(userId);

        if (!dryRun) {
          try {
            await doc.ref.update({
              userId,
              updatedAt: FieldValue.serverTimestamp(),
            });
            results.users.migrated++;
          } catch (error) {
            results.users.errors.push(`${email}: ${error instanceof Error ? error.message : 'Unknown'}`);
          }
        } else {
          results.users.migrated++; // dry run에서도 카운트
        }
      }
    }

    // email → userId 매핑 구축 (다른 컬렉션 마이그레이션용)
    const emailToUserIdMap = new Map<string, string>();
    const allUsersSnapshot = await db.collection('users').get();
    allUsersSnapshot.docs.forEach(doc => {
      const userId = doc.data().userId;
      if (userId) {
        emailToUserIdMap.set(doc.id, userId);
      }
    });

    // 2단계: tenants 컬렉션에 userId 연결
    if (phase === 'all' || phase === 'tenants') {
      const tenantsSnapshot = await db.collection('tenants').limit(limit).get();
      results.tenants.total = tenantsSnapshot.size;

      for (const doc of tenantsSnapshot.docs) {
        const data = doc.data();

        if (data.userId) {
          results.tenants.skipped++;
          continue;
        }

        const email = data.email;
        const userId = email ? emailToUserIdMap.get(email) : null;

        if (!userId) {
          results.tenants.errors.push(`${doc.id}: no userId found for email ${email}`);
          continue;
        }

        if (!dryRun) {
          try {
            await doc.ref.update({
              userId,
              updatedAt: FieldValue.serverTimestamp(),
            });
            results.tenants.migrated++;
          } catch (error) {
            results.tenants.errors.push(`${doc.id}: ${error instanceof Error ? error.message : 'Unknown'}`);
          }
        } else {
          results.tenants.migrated++;
        }
      }
    }

    // tenantId → userId 매핑 구축 (subscriptions, payments용)
    const tenantIdToUserIdMap = new Map<string, string>();
    const allTenantsSnapshot = await db.collection('tenants').get();
    allTenantsSnapshot.docs.forEach(doc => {
      const data = doc.data();
      const tenantId = data.tenantId || doc.id;
      const userId = data.userId || emailToUserIdMap.get(data.email);
      if (userId) {
        tenantIdToUserIdMap.set(tenantId, userId);
      }
    });

    // 3단계: subscriptions 컬렉션에 userId 연결
    if (phase === 'all' || phase === 'subscriptions') {
      const subscriptionsSnapshot = await db.collection('subscriptions').limit(limit).get();
      results.subscriptions.total = subscriptionsSnapshot.size;

      for (const doc of subscriptionsSnapshot.docs) {
        const data = doc.data();
        const tenantId = doc.id;

        if (data.userId) {
          results.subscriptions.skipped++;
          continue;
        }

        const userId = tenantIdToUserIdMap.get(tenantId);

        if (!userId) {
          results.subscriptions.errors.push(`${tenantId}: no userId found`);
          continue;
        }

        if (!dryRun) {
          try {
            await doc.ref.update({
              userId,
              updatedAt: FieldValue.serverTimestamp(),
            });
            results.subscriptions.migrated++;
          } catch (error) {
            results.subscriptions.errors.push(`${tenantId}: ${error instanceof Error ? error.message : 'Unknown'}`);
          }
        } else {
          results.subscriptions.migrated++;
        }
      }
    }

    // 4단계: payments 컬렉션에 userId 연결
    if (phase === 'all' || phase === 'payments') {
      const paymentsSnapshot = await db.collection('payments').limit(limit).get();
      results.payments.total = paymentsSnapshot.size;

      for (const doc of paymentsSnapshot.docs) {
        const data = doc.data();

        if (data.userId) {
          results.payments.skipped++;
          continue;
        }

        const tenantId = data.tenantId;
        const userId = tenantId ? tenantIdToUserIdMap.get(tenantId) : null;

        if (!userId) {
          results.payments.errors.push(`${doc.id}: no userId found for tenantId ${tenantId}`);
          continue;
        }

        if (!dryRun) {
          try {
            await doc.ref.update({
              userId,
              updatedAt: FieldValue.serverTimestamp(),
            });
            results.payments.migrated++;
          } catch (error) {
            results.payments.errors.push(`${doc.id}: ${error instanceof Error ? error.message : 'Unknown'}`);
          }
        } else {
          results.payments.migrated++;
        }
      }
    }

    // 5단계: refunds 컬렉션에 userId 연결
    if (phase === 'all' || phase === 'refunds') {
      const refundsSnapshot = await db.collection('refunds').limit(limit).get();
      results.refunds.total = refundsSnapshot.size;

      for (const doc of refundsSnapshot.docs) {
        const data = doc.data();

        if (data.userId) {
          results.refunds.skipped++;
          continue;
        }

        const tenantId = data.tenantId;
        const userId = tenantId ? tenantIdToUserIdMap.get(tenantId) : null;

        if (!userId) {
          results.refunds.errors.push(`${doc.id}: no userId found for tenantId ${tenantId}`);
          continue;
        }

        if (!dryRun) {
          try {
            await doc.ref.update({
              userId,
              updatedAt: FieldValue.serverTimestamp(),
            });
            results.refunds.migrated++;
          } catch (error) {
            results.refunds.errors.push(`${doc.id}: ${error instanceof Error ? error.message : 'Unknown'}`);
          }
        } else {
          results.refunds.migrated++;
        }
      }
    }

    // 6단계: subscription_history 컬렉션에 userId 연결
    if (phase === 'all' || phase === 'subscription_history') {
      const historySnapshot = await db.collection('subscription_history').limit(limit).get();
      results.subscription_history.total = historySnapshot.size;

      for (const doc of historySnapshot.docs) {
        const data = doc.data();

        if (data.userId) {
          results.subscription_history.skipped++;
          continue;
        }

        const tenantId = data.tenantId;
        const userId = tenantId ? tenantIdToUserIdMap.get(tenantId) : null;

        if (!userId) {
          results.subscription_history.errors.push(`${doc.id}: no userId found for tenantId ${tenantId}`);
          continue;
        }

        if (!dryRun) {
          try {
            await doc.ref.update({
              userId,
              updatedAt: FieldValue.serverTimestamp(),
            });
            results.subscription_history.migrated++;
          } catch (error) {
            results.subscription_history.errors.push(`${doc.id}: ${error instanceof Error ? error.message : 'Unknown'}`);
          }
        } else {
          results.subscription_history.migrated++;
        }
      }
    }

    // 7단계: cards 컬렉션에 userId 연결
    if (phase === 'all' || phase === 'cards') {
      const cardsSnapshot = await db.collection('cards').limit(limit).get();
      results.cards.total = cardsSnapshot.size;

      for (const doc of cardsSnapshot.docs) {
        const data = doc.data();

        if (data.userId) {
          results.cards.skipped++;
          continue;
        }

        // cards는 tenantId 또는 email로 userId 찾기
        const tenantId = data.tenantId;
        const email = data.email;
        let userId = tenantId ? tenantIdToUserIdMap.get(tenantId) : null;
        if (!userId && email) {
          userId = emailToUserIdMap.get(email) || null;
        }

        if (!userId) {
          results.cards.errors.push(`${doc.id}: no userId found`);
          continue;
        }

        if (!dryRun) {
          try {
            await doc.ref.update({
              userId,
              updatedAt: FieldValue.serverTimestamp(),
            });
            results.cards.migrated++;
          } catch (error) {
            results.cards.errors.push(`${doc.id}: ${error instanceof Error ? error.message : 'Unknown'}`);
          }
        } else {
          results.cards.migrated++;
        }
      }
    }

    return NextResponse.json({
      success: true,
      dryRun,
      phase,
      limit,
      results,
      message: dryRun
        ? '드라이런 완료. 실제 마이그레이션하려면 dryRun: false로 호출하세요.'
        : '마이그레이션 완료.',
    });
  } catch (error) {
    console.error('Migration error:', error);
    return NextResponse.json(
      { error: 'Migration failed', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}

// 마이그레이션 상태 확인
export async function GET() {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
  }

  try {
    const sampleSize = 50;

    // users 상태
    const usersSnapshot = await db.collection('users').limit(sampleSize).get();
    const usersWithId = usersSnapshot.docs.filter(d => d.data().userId).length;
    const usersTotal = (await db.collection('users').count().get()).data().count;

    // tenants 상태
    const tenantsSnapshot = await db.collection('tenants').limit(sampleSize).get();
    const tenantsWithId = tenantsSnapshot.docs.filter(d => d.data().userId).length;
    const tenantsTotal = (await db.collection('tenants').count().get()).data().count;

    // subscriptions 상태
    const subsSnapshot = await db.collection('subscriptions').limit(sampleSize).get();
    const subsWithId = subsSnapshot.docs.filter(d => d.data().userId).length;
    const subsTotal = (await db.collection('subscriptions').count().get()).data().count;

    // payments 상태
    const paymentsSnapshot = await db.collection('payments').limit(sampleSize).get();
    const paymentsWithId = paymentsSnapshot.docs.filter(d => d.data().userId).length;
    const paymentsTotal = (await db.collection('payments').count().get()).data().count;

    // refunds 상태
    const refundsSnapshot = await db.collection('refunds').limit(sampleSize).get();
    const refundsWithId = refundsSnapshot.docs.filter(d => d.data().userId).length;
    const refundsTotal = (await db.collection('refunds').count().get()).data().count;

    // subscription_history 상태
    const historySnapshot = await db.collection('subscription_history').limit(sampleSize).get();
    const historyWithId = historySnapshot.docs.filter(d => d.data().userId).length;
    const historyTotal = (await db.collection('subscription_history').count().get()).data().count;

    // cards 상태
    const cardsSnapshot = await db.collection('cards').limit(sampleSize).get();
    const cardsWithId = cardsSnapshot.docs.filter(d => d.data().userId).length;
    const cardsTotal = (await db.collection('cards').count().get()).data().count;

    return NextResponse.json({
      success: true,
      sampleSize,
      stats: {
        users: {
          total: usersTotal,
          sampleWithUserId: usersWithId,
          sampleWithoutUserId: sampleSize - usersWithId,
          estimatedNeedsMigration: Math.round(((sampleSize - usersWithId) / sampleSize) * usersTotal),
        },
        tenants: {
          total: tenantsTotal,
          sampleWithUserId: tenantsWithId,
          sampleWithoutUserId: sampleSize - tenantsWithId,
          estimatedNeedsMigration: Math.round(((sampleSize - tenantsWithId) / sampleSize) * tenantsTotal),
        },
        subscriptions: {
          total: subsTotal,
          sampleWithUserId: subsWithId,
          sampleWithoutUserId: sampleSize - subsWithId,
          estimatedNeedsMigration: Math.round(((sampleSize - subsWithId) / sampleSize) * subsTotal),
        },
        payments: {
          total: paymentsTotal,
          sampleWithUserId: paymentsWithId,
          sampleWithoutUserId: sampleSize - paymentsWithId,
          estimatedNeedsMigration: Math.round(((sampleSize - paymentsWithId) / sampleSize) * paymentsTotal),
        },
        refunds: {
          total: refundsTotal,
          sampleWithUserId: refundsWithId,
          sampleWithoutUserId: Math.min(sampleSize, refundsTotal) - refundsWithId,
          estimatedNeedsMigration: refundsTotal > 0 ? Math.round(((Math.min(sampleSize, refundsTotal) - refundsWithId) / Math.min(sampleSize, refundsTotal)) * refundsTotal) : 0,
        },
        subscription_history: {
          total: historyTotal,
          sampleWithUserId: historyWithId,
          sampleWithoutUserId: Math.min(sampleSize, historyTotal) - historyWithId,
          estimatedNeedsMigration: historyTotal > 0 ? Math.round(((Math.min(sampleSize, historyTotal) - historyWithId) / Math.min(sampleSize, historyTotal)) * historyTotal) : 0,
        },
        cards: {
          total: cardsTotal,
          sampleWithUserId: cardsWithId,
          sampleWithoutUserId: Math.min(sampleSize, cardsTotal) - cardsWithId,
          estimatedNeedsMigration: cardsTotal > 0 ? Math.round(((Math.min(sampleSize, cardsTotal) - cardsWithId) / Math.min(sampleSize, cardsTotal)) * cardsTotal) : 0,
        },
      },
    });
  } catch (error) {
    console.error('Status check error:', error);
    return NextResponse.json(
      { error: 'Status check failed' },
      { status: 500 }
    );
  }
}
