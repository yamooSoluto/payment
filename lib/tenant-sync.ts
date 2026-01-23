import { adminDb, initializeFirebaseAdmin } from './firebase-admin';

/**
 * tenants 컬렉션의 subscription 필드 구조
 * 최소 필드만 동기화 (상세 정보는 subscriptions 컬렉션에서 조회)
 */
export interface TenantSubscription {
  plan: string;        // 'trial' | 'basic' | 'business'
  status: string;      // 'active' | 'canceled' | 'past_due' | 'trial' | 'expired' | 'suspended'
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

    // 먼저 문서 ID로 직접 조회 시도
    const docById = await tenantsRef.doc(tenantId).get();

    let docRef;
    if (docById.exists) {
      docRef = docById.ref;
    } else {
      // 문서 ID로 찾지 못하면 tenantId 필드로 검색
      const snapshot = await tenantsRef.where('tenantId', '==', tenantId).get();
      if (snapshot.empty) {
        console.log(`[TenantSync] No tenant found for tenantId: ${tenantId}`);
        return false;
      }
      docRef = snapshot.docs[0].ref;
    }

    // 최소 필드만 동기화 (plan, status)
    // 상세 정보(startedAt, renewsAt, currentPeriod 등)는 subscriptions 컬렉션에서 조회
    const updateData: Record<string, unknown> = {};

    if (subscription.plan !== undefined) {
      updateData['subscription.plan'] = subscription.plan;
      updateData['plan'] = subscription.plan; // 최상위 plan 필드도 업데이트
    }
    if (subscription.status !== undefined) {
      updateData['subscription.status'] = subscription.status;
    }

    await docRef.update(updateData);

    console.log(`[TenantSync] Synced subscription for tenantId: ${tenantId}`);
    return true;
  } catch (error) {
    console.error('[TenantSync] Error syncing subscription:', error);
    return false;
  }
}

/**
 * 신규 구독 생성 시 tenants에 반영 (plan, status만 동기화)
 */
export async function syncNewSubscription(
  tenantId: string,
  plan: string,
  _nextBillingDate: Date // 미사용 (subscriptions에서 조회)
): Promise<boolean> {
  if (!tenantId) return false;

  return syncSubscriptionToTenant(tenantId, {
    plan,
    status: 'active',
  });
}

/**
 * 플랜 변경 시 tenants에 반영 (plan, status 동기화)
 */
export async function syncPlanChange(
  tenantId: string,
  newPlan: string,
  _renewsAt?: Date // 미사용 (subscriptions에서 조회)
): Promise<boolean> {
  if (!tenantId) return false;

  return syncSubscriptionToTenant(tenantId, {
    plan: newPlan,
    status: 'active',
  });
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
 * 예약 해지 시 tenants에 반영 (pending_cancel 상태)
 */
export async function syncSubscriptionPendingCancel(
  tenantId: string
): Promise<boolean> {
  if (!tenantId) return false;

  return syncSubscriptionToTenant(tenantId, {
    status: 'pending_cancel',
  });
}

/**
 * 구독 재활성화 시 tenants에 반영 (plan, status만 동기화)
 */
export async function syncSubscriptionReactivation(
  tenantId: string,
  plan: string,
  _renewsAt: Date // 미사용 (subscriptions에서 조회)
): Promise<boolean> {
  if (!tenantId) return false;

  return syncSubscriptionToTenant(tenantId, {
    plan,
    status: 'active',
  });
}

/**
 * 정기 결제 성공 시 tenants에 반영 (plan, status 동기화)
 */
export async function syncPaymentSuccess(
  tenantId: string,
  plan: string,
  _nextBillingDate?: Date // 미사용 (subscriptions에서 조회)
): Promise<boolean> {
  if (!tenantId) return false;

  return syncSubscriptionToTenant(tenantId, {
    plan,
    status: 'active',
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

/**
 * 구독 정지 시 tenants에 반영 (유예 기간 만료 후)
 */
export async function syncSubscriptionSuspended(
  tenantId: string
): Promise<boolean> {
  if (!tenantId) return false;

  return syncSubscriptionToTenant(tenantId, {
    status: 'suspended',
  });
}
