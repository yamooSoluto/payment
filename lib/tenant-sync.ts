import { adminDb, initializeFirebaseAdmin } from './firebase-admin';

/**
 * tenants 컬렉션의 subscription 필드 구조
 */
export interface TenantSubscription {
  plan: string;        // 'trial' | 'basic' | 'business'
  renewsAt: Date;      // 다음 결제일
  startedAt: Date;     // 구독 시작일
  status: string;      // 'active' | 'canceled' | 'past_due' | 'trial' | 'expired'
}

/**
 * tenantId로 특정 매장의 구독 정보를 동기화
 */
export async function syncSubscriptionToTenant(
  tenantId: string,
  subscription: Partial<TenantSubscription>
): Promise<boolean> {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) {
    console.error('[TenantSync] Database not available');
    return false;
  }

  if (!tenantId) {
    console.error('[TenantSync] tenantId is required');
    return false;
  }

  try {
    const tenantsRef = db.collection('tenants');
    const snapshot = await tenantsRef.where('tenantId', '==', tenantId).get();

    if (snapshot.empty) {
      console.log(`[TenantSync] No tenant found for tenantId: ${tenantId}`);
      return false;
    }

    const updateData: Record<string, unknown> = {};

    if (subscription.plan !== undefined) {
      updateData['subscription.plan'] = subscription.plan;
    }
    if (subscription.renewsAt !== undefined) {
      updateData['subscription.renewsAt'] = subscription.renewsAt;
    }
    if (subscription.startedAt !== undefined) {
      updateData['subscription.startedAt'] = subscription.startedAt;
    }
    if (subscription.status !== undefined) {
      updateData['subscription.status'] = subscription.status;
    }

    // 첫 번째 매칭되는 문서만 업데이트 (tenantId는 고유해야 함)
    const docRef = snapshot.docs[0].ref;
    await docRef.update(updateData);

    console.log(`[TenantSync] Synced subscription for tenantId: ${tenantId}`);
    return true;
  } catch (error) {
    console.error('[TenantSync] Error syncing subscription:', error);
    return false;
  }
}

/**
 * 신규 구독 생성 시 tenants에 반영
 */
export async function syncNewSubscription(
  tenantId: string,
  plan: string,
  nextBillingDate: Date
): Promise<boolean> {
  if (!tenantId) return false;

  return syncSubscriptionToTenant(tenantId, {
    plan,
    status: 'active',
    startedAt: new Date(),
    renewsAt: nextBillingDate,
  });
}

/**
 * 플랜 변경 시 tenants에 반영
 */
export async function syncPlanChange(
  tenantId: string,
  newPlan: string,
  renewsAt?: Date
): Promise<boolean> {
  if (!tenantId) return false;

  const update: Partial<TenantSubscription> = { plan: newPlan };
  if (renewsAt) {
    update.renewsAt = renewsAt;
  }
  return syncSubscriptionToTenant(tenantId, update);
}

/**
 * 구독 취소 시 tenants에 반영
 */
export async function syncSubscriptionCancellation(
  tenantId: string
): Promise<boolean> {
  if (!tenantId) return false;

  return syncSubscriptionToTenant(tenantId, {
    status: 'canceled',
  });
}

/**
 * 구독 재활성화 시 tenants에 반영
 */
export async function syncSubscriptionReactivation(
  tenantId: string,
  plan: string,
  renewsAt: Date
): Promise<boolean> {
  if (!tenantId) return false;

  return syncSubscriptionToTenant(tenantId, {
    plan,
    status: 'active',
    renewsAt,
  });
}

/**
 * 정기 결제 성공 시 tenants에 반영
 */
export async function syncPaymentSuccess(
  tenantId: string,
  nextBillingDate: Date
): Promise<boolean> {
  if (!tenantId) return false;

  return syncSubscriptionToTenant(tenantId, {
    status: 'active',
    renewsAt: nextBillingDate,
  });
}

/**
 * 결제 실패 시 tenants에 반영
 */
export async function syncPaymentFailure(
  tenantId: string
): Promise<boolean> {
  if (!tenantId) return false;

  return syncSubscriptionToTenant(tenantId, {
    status: 'past_due',
  });
}

/**
 * Trial 만료 시 tenants에 반영
 */
export async function syncTrialExpired(
  tenantId: string
): Promise<boolean> {
  if (!tenantId) return false;

  return syncSubscriptionToTenant(tenantId, {
    status: 'expired',
  });
}

/**
 * 구독 즉시 만료 시 tenants에 반영 (즉시 취소 등)
 */
export async function syncSubscriptionExpired(
  tenantId: string
): Promise<boolean> {
  if (!tenantId) return false;

  return syncSubscriptionToTenant(tenantId, {
    status: 'expired',
  });
}
