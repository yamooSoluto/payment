import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

// 관리자: 기존 구독 데이터를 subscription_history로 마이그레이션
// 한 번만 실행해야 함
export async function POST(request: NextRequest) {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { dryRun = true, force = false } = body; // dryRun: 실제 저장 안 함, force: 기존 레코드 삭제 후 재생성

    const results = {
      processed: 0,
      created: 0,
      skipped: 0,
      deleted: 0,
      errors: [] as string[],
    };

    // 모든 구독 조회
    const subscriptionsSnapshot = await db.collection('subscriptions').get();
    console.log(`Found ${subscriptionsSnapshot.docs.length} subscriptions to migrate`);

    for (const doc of subscriptionsSnapshot.docs) {
      const tenantId = doc.id;
      const subscription = doc.data();

      try {
        results.processed++;

        // 이미 히스토리가 있는지 확인
        const existingHistory = await db
          .collection('subscription_history')
          .doc(tenantId)
          .collection('records')
          .get();

        if (!existingHistory.empty) {
          if (force) {
            // force 옵션: 기존 레코드 삭제
            if (!dryRun) {
              const deleteBatch = db.batch();
              existingHistory.docs.forEach(doc => {
                deleteBatch.delete(doc.ref);
              });
              await deleteBatch.commit();
              console.log(`Deleted ${existingHistory.docs.length} existing records for ${tenantId}`);
            } else {
              console.log(`[DRY RUN] Would delete ${existingHistory.docs.length} existing records for ${tenantId}`);
            }
            results.deleted += existingHistory.docs.length;
          } else {
            console.log(`Skipping ${tenantId}: history already exists`);
            results.skipped++;
            continue;
          }
        }

        // 결제 내역에서 플랜 변경 히스토리 추출
        const paymentsSnapshot = await db
          .collection('payments')
          .where('tenantId', '==', tenantId)
          .get();

        const payments = paymentsSnapshot.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => {
            const aDate = (a as { paidAt?: { toDate?: () => Date }, createdAt?: { toDate?: () => Date } }).paidAt?.toDate?.() ||
                         (a as { createdAt?: { toDate?: () => Date } }).createdAt?.toDate?.() || new Date(0);
            const bDate = (b as { paidAt?: { toDate?: () => Date }, createdAt?: { toDate?: () => Date } }).paidAt?.toDate?.() ||
                         (b as { createdAt?: { toDate?: () => Date } }).createdAt?.toDate?.() || new Date(0);
            return aDate.getTime() - bDate.getTime();
          });

        // 히스토리 레코드 생성
        const historyRecords: Array<{
          tenantId: string;
          email: string;
          plan: string;
          status: string;
          amount: number;
          periodStart: Date;
          periodEnd: Date | null;
          billingDate: Date | null;
          changeType: string;
          changedAt: Date;
          changedBy: string;
          previousPlan: string | null;
          paymentId: string | null;
          orderId: string | null;
        }> = [];

        // 첫 번째 결제 (first_payment 또는 trial_convert)
        interface PaymentDoc {
          id: string;
          type?: string;
          plan?: string;
          amount?: number;
          previousPlan?: string;
          orderId?: string;
          paidAt?: { toDate?: () => Date };
          createdAt?: { toDate?: () => Date };
        }

        const firstPayment = payments.find(p =>
          (p as PaymentDoc).type === 'first_payment' || (p as PaymentDoc).type === 'trial_convert' || (p as PaymentDoc).type === 'conversion'
        ) as PaymentDoc | undefined;

        if (firstPayment) {
          const paidAt = firstPayment.paidAt?.toDate?.() || firstPayment.createdAt?.toDate?.() || new Date();
          historyRecords.push({
            tenantId,
            email: subscription.email || '',
            plan: firstPayment.plan || subscription.plan || '',
            status: 'completed',
            amount: firstPayment.amount || 0,
            periodStart: paidAt,
            periodEnd: null, // 다음 레코드에서 설정
            billingDate: paidAt,
            changeType: firstPayment.type === 'trial_convert' || firstPayment.type === 'conversion' ? 'new' : 'new',
            changedAt: paidAt,
            changedBy: 'system',
            previousPlan: firstPayment.previousPlan || 'trial',
            paymentId: firstPayment.id,
            orderId: firstPayment.orderId || null,
          });
        }

        // 플랜 변경 결제들
        const planChanges = payments.filter(p =>
          (p as PaymentDoc).type === 'upgrade' || (p as PaymentDoc).type === 'downgrade'
        ) as PaymentDoc[];

        for (const change of planChanges) {
          const paidAt = change.paidAt?.toDate?.() || change.createdAt?.toDate?.() || new Date();

          // 이전 레코드의 종료일 설정
          if (historyRecords.length > 0) {
            historyRecords[historyRecords.length - 1].periodEnd = paidAt;
          }

          historyRecords.push({
            tenantId,
            email: subscription.email || '',
            plan: change.plan || '',
            status: 'completed',
            amount: Math.abs(change.amount || 0),
            periodStart: paidAt,
            periodEnd: null,
            billingDate: paidAt,
            changeType: change.type || 'upgrade',
            changedAt: paidAt,
            changedBy: 'user',
            previousPlan: change.previousPlan || null,
            paymentId: change.id,
            orderId: change.orderId || null,
          });
        }

        // 갱신 결제들 (recurring/auto)
        const renewals = payments.filter(p =>
          (p as PaymentDoc).type === 'auto' || (p as { category?: string }).category === 'recurring'
        ) as PaymentDoc[];

        for (const renewal of renewals) {
          const paidAt = renewal.paidAt?.toDate?.() || renewal.createdAt?.toDate?.() || new Date();

          // 이전 레코드의 종료일 설정
          if (historyRecords.length > 0) {
            historyRecords[historyRecords.length - 1].periodEnd = paidAt;
          }

          historyRecords.push({
            tenantId,
            email: subscription.email || '',
            plan: renewal.plan || subscription.plan || '',
            status: 'completed',
            amount: renewal.amount || 0,
            periodStart: paidAt,
            periodEnd: null,
            billingDate: paidAt,
            changeType: 'renew',
            changedAt: paidAt,
            changedBy: 'system',
            previousPlan: null,
            paymentId: renewal.id,
            orderId: renewal.orderId || null,
          });
        }

        // 현재 구독 상태 처리
        if (historyRecords.length > 0) {
          const lastRecord = historyRecords[historyRecords.length - 1];

          // 구독이 active인 경우 마지막 레코드 상태를 active로
          if (subscription.status === 'active' || subscription.status === 'trial') {
            lastRecord.status = subscription.status;
            if (subscription.currentPeriodEnd) {
              const periodEnd = subscription.currentPeriodEnd.toDate?.() || new Date(subscription.currentPeriodEnd);
              lastRecord.periodEnd = periodEnd;
            }
          } else if (subscription.status === 'canceled' || subscription.status === 'expired') {
            // 해지/만료된 구독인 경우: 마지막 레코드를 해지/만료 상태로 변경
            lastRecord.status = subscription.status;
            lastRecord.changeType = subscription.status === 'canceled' ? 'cancel' : 'expire';

            // 마지막 레코드의 종료일 설정
            const canceledAt = subscription.canceledAt?.toDate?.() ||
                              subscription.currentPeriodEnd?.toDate?.() ||
                              new Date();
            lastRecord.periodEnd = canceledAt;
            lastRecord.changedAt = canceledAt;
          } else {
            // 그 외 상태 (pending 등)
            lastRecord.status = subscription.status || 'active';
            if (subscription.currentPeriodEnd) {
              const periodEnd = subscription.currentPeriodEnd.toDate?.() || new Date(subscription.currentPeriodEnd);
              lastRecord.periodEnd = periodEnd;
            }
          }
        } else {
          // 결제 내역이 없으면 현재 구독 상태만으로 레코드 생성
          const periodStart = subscription.currentPeriodStart?.toDate?.() ||
                             subscription.createdAt?.toDate?.() ||
                             new Date();
          const periodEnd = subscription.currentPeriodEnd?.toDate?.() || null;

          // 기본 레코드 생성
          if (subscription.status === 'canceled' || subscription.status === 'expired') {
            // 해지/만료된 구독: 하나의 레코드만 생성 (만료/해지 상태로)
            const canceledAt = subscription.canceledAt?.toDate?.() ||
                              subscription.currentPeriodEnd?.toDate?.() ||
                              new Date();

            historyRecords.push({
              tenantId,
              email: subscription.email || '',
              plan: subscription.plan || 'trial',
              status: subscription.status,
              amount: subscription.amount || 0,
              periodStart,
              periodEnd: canceledAt,
              billingDate: null,
              changeType: subscription.status === 'canceled' ? 'cancel' : 'expire',
              changedAt: canceledAt,
              changedBy: 'system',
              previousPlan: null,
              paymentId: null,
              orderId: null,
            });
          } else {
            // 그 외 상태
            historyRecords.push({
              tenantId,
              email: subscription.email || '',
              plan: subscription.plan || 'trial',
              status: subscription.status || 'active',
              amount: subscription.amount || 0,
              periodStart,
              periodEnd,
              billingDate: null,
              changeType: 'new',
              changedAt: periodStart,
              changedBy: 'system',
              previousPlan: null,
              paymentId: null,
              orderId: null,
            });
          }
        }

        // 저장 (dry run이 아닌 경우에만)
        if (!dryRun) {
          const batch = db.batch();
          const historyRef = db.collection('subscription_history').doc(tenantId).collection('records');

          for (const record of historyRecords) {
            const docRef = historyRef.doc();
            batch.set(docRef, {
              ...record,
              createdAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp(),
            });
          }

          await batch.commit();
          console.log(`Created ${historyRecords.length} history records for ${tenantId}`);
        } else {
          console.log(`[DRY RUN] Would create ${historyRecords.length} history records for ${tenantId}`);
        }

        results.created += historyRecords.length;
      } catch (error) {
        console.error(`Error processing ${tenantId}:`, error);
        results.errors.push(`${tenantId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return NextResponse.json({
      success: true,
      dryRun,
      results,
      message: dryRun
        ? 'Dry run completed. Set dryRun: false to actually migrate.'
        : 'Migration completed.',
    });
  } catch (error) {
    console.error('Migration failed:', error);
    return NextResponse.json(
      { error: 'Migration failed' },
      { status: 500 }
    );
  }
}
