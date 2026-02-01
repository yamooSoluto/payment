import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';

// Vercel Cron Job - 삭제된 매장 영구 삭제 처리
// 매일 01:00 (KST) 실행
export async function GET(request: NextRequest) {
  // Vercel Cron Job Secret 검증
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = adminDb || initializeFirebaseAdmin();
  if (!db) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
  }

  const now = new Date();
  const results = {
    permanentDeleted: [] as string[],
    paymentsDeleted: [] as string[],
    usersDeleted: [] as string[],
    errors: [] as { tenantId?: string; email?: string; error: string }[],
  };

  try {
    // ========== 1. 90일 지난 매장 영구 삭제 ==========
    // tenant_deletions에서 permanentDeleteAt <= today인 항목 조회
    const permanentDeleteDocs = await db
      .collection('tenant_deletions')
      .where('permanentDeleteAt', '<=', now)
      .get();

    for (const doc of permanentDeleteDocs.docs) {
      const data = doc.data();
      const tenantId = data.tenantId;

      // 이미 영구 삭제 처리된 경우 스킵
      if (data.permanentlyDeletedAt) {
        continue;
      }

      try {
        // 1-1. tenants 컬렉션 문서 삭제
        const tenantDoc = await db.collection('tenants').doc(tenantId).get();
        if (tenantDoc.exists) {
          await db.collection('tenants').doc(tenantId).delete();
          console.log(`Permanently deleted tenant: ${tenantId}`);
        }

        // 1-2. subscriptions 컬렉션 문서 삭제
        const subscriptionDoc = await db.collection('subscriptions').doc(tenantId).get();
        if (subscriptionDoc.exists) {
          await db.collection('subscriptions').doc(tenantId).delete();
          console.log(`Permanently deleted subscription: ${tenantId}`);
        }

        // 1-3. subscription_history 서브컬렉션 삭제
        const historySnapshot = await db
          .collection('subscription_history')
          .doc(tenantId)
          .collection('records')
          .get();

        if (!historySnapshot.empty) {
          const batch = db.batch();
          historySnapshot.docs.forEach((historyDoc) => {
            batch.delete(historyDoc.ref);
          });
          await batch.commit();
          // 부모 문서도 삭제
          await db.collection('subscription_history').doc(tenantId).delete();
          console.log(`Permanently deleted subscription_history: ${tenantId}`);
        }

        // 1-4. cards 컬렉션 문서 삭제
        const cardsDoc = await db.collection('cards').doc(tenantId).get();
        if (cardsDoc.exists) {
          await db.collection('cards').doc(tenantId).delete();
          console.log(`Permanently deleted cards: ${tenantId}`);
        }

        // 1-5. tenant_deletions 문서에 영구 삭제 완료 표시
        await doc.ref.update({
          permanentlyDeletedAt: now,
        });

        results.permanentDeleted.push(tenantId);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Failed to permanently delete tenant ${tenantId}:`, error);
        results.errors.push({ tenantId, error: errorMessage });
      }
    }

    // ========== 2. 5년 지난 결제 기록 삭제 ==========
    // tenant_deletions에서 paymentDeleteAt <= today인 항목 조회
    const paymentDeleteDocs = await db
      .collection('tenant_deletions')
      .where('paymentDeleteAt', '<=', now)
      .get();

    for (const doc of paymentDeleteDocs.docs) {
      const data = doc.data();
      const tenantId = data.tenantId;

      // 이미 결제 기록 삭제 처리된 경우 스킵
      if (data.paymentsDeletedAt) {
        continue;
      }

      try {
        // 2-1. payments 컬렉션에서 해당 tenantId의 결제 기록 삭제
        const paymentsSnapshot = await db
          .collection('payments')
          .where('tenantId', '==', tenantId)
          .get();

        if (!paymentsSnapshot.empty) {
          // Firestore batch는 500개 제한이 있으므로 분할 처리
          const batchSize = 500;
          const docs = paymentsSnapshot.docs;

          for (let i = 0; i < docs.length; i += batchSize) {
            const batch = db.batch();
            const chunk = docs.slice(i, i + batchSize);
            chunk.forEach((paymentDoc) => {
              batch.delete(paymentDoc.ref);
            });
            await batch.commit();
          }

          console.log(`Deleted ${docs.length} payment records for tenant: ${tenantId}`);
        }



        // tenant_deletions 문서에 결제 기록 삭제 완료 표시
        await doc.ref.update({
          paymentsDeletedAt: now,
        });

        results.paymentsDeleted.push(tenantId);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Failed to delete payments for tenant ${tenantId}:`, error);
        results.errors.push({ tenantId, error: `payments: ${errorMessage}` });
      }
    }

    // ========== 3. 보관 기간 만료 회원 데이터 영구 삭제 ==========
    // users 컬렉션에서 deleted == true && retentionEndDate <= today인 항목 조회
    const expiredUserDocs = await db
      .collection('users')
      .where('deleted', '==', true)
      .where('retentionEndDate', '<=', now)
      .get();

    for (const userDoc of expiredUserDocs.docs) {
      const email = userDoc.id;

      try {
        // 3-1. users 문서 영구 삭제
        await userDoc.ref.delete();
        console.log(`Permanently deleted user: ${email}`);

        // 3-2. account_deletions 로그 삭제
        const accountDeletionDocs = await db
          .collection('account_deletions')
          .where('email', '==', email)
          .get();

        if (!accountDeletionDocs.empty) {
          const batch = db.batch();
          accountDeletionDocs.docs.forEach((doc) => {
            batch.delete(doc.ref);
          });
          await batch.commit();
          console.log(`Deleted ${accountDeletionDocs.docs.length} account_deletions for: ${email}`);
        }

        results.usersDeleted.push(email);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Failed to permanently delete user ${email}:`, error);
        results.errors.push({ email, error: errorMessage });
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: now.toISOString(),
      permanentDeletedCount: results.permanentDeleted.length,
      paymentsDeletedCount: results.paymentsDeleted.length,
      usersDeletedCount: results.usersDeleted.length,
      errorCount: results.errors.length,
      details: results,
    });
  } catch (error) {
    console.error('Cleanup cron job failed:', error);
    return NextResponse.json(
      { error: 'Cleanup job failed' },
      { status: 500 }
    );
  }
}
