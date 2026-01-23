import { Firestore, FieldValue, Timestamp } from 'firebase-admin/firestore';

export interface SubscriptionHistoryRecord {
  // 연결 ID들
  tenantId: string;
  userId: string;
  email: string;
  brandName?: string | null;
  paymentId?: string | null;
  orderId?: string | null;

  // 구독 정보
  plan: string;
  status: string;
  amount: number;

  // 기간 정보
  periodStart: Date | Timestamp;
  periodEnd: Date | Timestamp | null;
  billingDate?: Date | Timestamp | null;

  // 변경 정보
  changeType: 'new' | 'upgrade' | 'downgrade' | 'renew' | 'cancel' | 'expire' | 'reactivate' | 'admin_edit';
  changedAt: Date | Timestamp;
  changedBy: 'system' | 'user' | 'admin';
  changedByAdminId?: string | null;

  // 이전 상태
  previousPlan?: string | null;
  previousStatus?: string | null;

  // 메모
  note?: string | null;
}

/**
 * 현재 활성 상태인 구독 히스토리 레코드를 completed로 변경
 * (active, trial 상태 모두 포함)
 */
export async function completeCurrentHistoryRecord(
  db: Firestore,
  tenantId: string,
  endDate: Date
): Promise<string | null> {
  const historyRef = db.collection('subscription_history').doc(tenantId).collection('records');

  // 활성 상태인 레코드 찾기 (active 또는 trial)
  // Firestore는 단일 필드에 대해 'in' 쿼리 지원
  const activeRecords = await historyRef
    .where('status', 'in', ['active', 'trial'])
    .limit(1)
    .get();

  if (activeRecords.empty) {
    return null;
  }

  const activeDoc = activeRecords.docs[0];

  // 상태를 completed로 변경하고 periodEnd 설정
  await activeDoc.ref.update({
    status: 'completed',
    periodEnd: endDate,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return activeDoc.id;
}

/**
 * 새로운 구독 히스토리 레코드 추가
 */
export async function addSubscriptionHistoryRecord(
  db: Firestore,
  record: SubscriptionHistoryRecord
): Promise<string> {
  const historyRef = db.collection('subscription_history').doc(record.tenantId).collection('records');

  const docRef = await historyRef.add({
    ...record,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return docRef.id;
}

/**
 * 구독 변경 시 히스토리 처리 (기존 레코드 완료 + 새 레코드 추가)
 */
export async function handleSubscriptionChange(
  db: Firestore,
  params: {
    tenantId: string;
    userId: string;
    email: string;
    brandName?: string | null;
    newPlan: string;
    newStatus: string;
    amount: number;
    periodStart: Date;
    periodEnd: Date | null;
    billingDate?: Date | null;
    changeType: SubscriptionHistoryRecord['changeType'];
    changedBy: SubscriptionHistoryRecord['changedBy'];
    changedByAdminId?: string | null;
    previousPlan?: string | null;
    previousStatus?: string | null;
    paymentId?: string | null;
    orderId?: string | null;
    note?: string | null;
  }
): Promise<{ completedRecordId: string | null; newRecordId: string }> {
  const now = new Date();

  // 1. 기존 active 레코드 완료 처리
  const completedRecordId = await completeCurrentHistoryRecord(db, params.tenantId, now);

  // 2. 새 레코드 추가
  const newRecordId = await addSubscriptionHistoryRecord(db, {
    tenantId: params.tenantId,
    userId: params.userId,
    email: params.email,
    brandName: params.brandName || null,
    paymentId: params.paymentId || null,
    orderId: params.orderId || null,
    plan: params.newPlan,
    status: params.newStatus,
    amount: params.amount,
    periodStart: params.periodStart,
    periodEnd: params.periodEnd,
    billingDate: params.billingDate || null,
    changeType: params.changeType,
    changedAt: now,
    changedBy: params.changedBy,
    changedByAdminId: params.changedByAdminId || null,
    previousPlan: params.previousPlan || null,
    previousStatus: params.previousStatus || null,
    note: params.note || null,
  });

  return { completedRecordId, newRecordId };
}

/**
 * 구독 히스토리 레코드 상태만 업데이트 (해지, 만료 등)
 * (active, trial 상태 모두 포함)
 */
export async function updateCurrentHistoryStatus(
  db: Firestore,
  tenantId: string,
  newStatus: string,
  additionalData?: Partial<SubscriptionHistoryRecord>
): Promise<boolean> {
  const historyRef = db.collection('subscription_history').doc(tenantId).collection('records');

  // 현재 활성 상태인 레코드 찾기 (active 또는 trial)
  const activeRecords = await historyRef
    .where('status', 'in', ['active', 'trial'])
    .limit(1)
    .get();

  if (activeRecords.empty) {
    return false;
  }

  const activeDoc = activeRecords.docs[0];

  await activeDoc.ref.update({
    status: newStatus,
    ...additionalData,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return true;
}

/**
 * 특정 tenant의 구독 히스토리 조회
 */
export async function getSubscriptionHistory(
  db: Firestore,
  tenantId: string,
  limit?: number
): Promise<SubscriptionHistoryRecord[]> {
  const historyRef = db.collection('subscription_history').doc(tenantId).collection('records');

  let query = historyRef.orderBy('changedAt', 'desc');

  if (limit) {
    query = query.limit(limit);
  }

  const snapshot = await query.get();

  return snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      ...data,
      periodStart: data.periodStart?.toDate?.() || data.periodStart,
      periodEnd: data.periodEnd?.toDate?.() || data.periodEnd,
      billingDate: data.billingDate?.toDate?.() || data.billingDate,
      changedAt: data.changedAt?.toDate?.() || data.changedAt,
    } as SubscriptionHistoryRecord;
  });
}

/**
 * userId 기준으로 모든 tenant의 구독 히스토리 조회 (어드민용)
 * Collection Group Query 사용
 * 이메일이 변경되어도 userId로 조회 가능
 */
export async function getSubscriptionHistoryByUserId(
  db: Firestore,
  userId: string,
  limit?: number
): Promise<(SubscriptionHistoryRecord & { recordId: string })[]> {
  // Collection Group Query로 모든 tenant의 records 서브컬렉션 조회
  let query = db.collectionGroup('records')
    .where('userId', '==', userId)
    .orderBy('changedAt', 'desc');

  if (limit) {
    query = query.limit(limit);
  }

  const snapshot = await query.get();

  return snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      recordId: doc.id,
      ...data,
      periodStart: data.periodStart?.toDate?.() || data.periodStart,
      periodEnd: data.periodEnd?.toDate?.() || data.periodEnd,
      billingDate: data.billingDate?.toDate?.() || data.billingDate,
      changedAt: data.changedAt?.toDate?.() || data.changedAt,
    } as SubscriptionHistoryRecord & { recordId: string };
  });
}

/**
 * 이메일 기준으로 모든 tenant의 구독 히스토리 조회 (어드민용)
 * Collection Group Query 사용
 * @deprecated userId 기준 조회를 권장 (getSubscriptionHistoryByUserId)
 */
export async function getSubscriptionHistoryByEmail(
  db: Firestore,
  email: string,
  limit?: number
): Promise<(SubscriptionHistoryRecord & { recordId: string })[]> {
  // Collection Group Query로 모든 tenant의 records 서브컬렉션 조회
  let query = db.collectionGroup('records')
    .where('email', '==', email)
    .orderBy('changedAt', 'desc');

  if (limit) {
    query = query.limit(limit);
  }

  const snapshot = await query.get();

  return snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      recordId: doc.id,
      ...data,
      periodStart: data.periodStart?.toDate?.() || data.periodStart,
      periodEnd: data.periodEnd?.toDate?.() || data.periodEnd,
      billingDate: data.billingDate?.toDate?.() || data.billingDate,
      changedAt: data.changedAt?.toDate?.() || data.changedAt,
    } as SubscriptionHistoryRecord & { recordId: string };
  });
}

/**
 * 여러 tenantId로 구독 히스토리 조회 (어드민용)
 */
export async function getSubscriptionHistoryByTenantIds(
  db: Firestore,
  tenantIds: string[],
  limit?: number
): Promise<(SubscriptionHistoryRecord & { recordId: string })[]> {
  if (tenantIds.length === 0) {
    return [];
  }

  const allRecords: (SubscriptionHistoryRecord & { recordId: string })[] = [];

  // 각 tenantId별로 히스토리 조회
  for (const tenantId of tenantIds) {
    const historyRef = db.collection('subscription_history').doc(tenantId).collection('records');

    let query = historyRef.orderBy('changedAt', 'desc');

    const snapshot = await query.get();

    snapshot.docs.forEach(doc => {
      const data = doc.data();
      allRecords.push({
        recordId: doc.id,
        ...data,
        periodStart: data.periodStart?.toDate?.() || data.periodStart,
        periodEnd: data.periodEnd?.toDate?.() || data.periodEnd,
        billingDate: data.billingDate?.toDate?.() || data.billingDate,
        changedAt: data.changedAt?.toDate?.() || data.changedAt,
      } as SubscriptionHistoryRecord & { recordId: string });
    });
  }

  // changedAt 기준 내림차순 정렬
  allRecords.sort((a, b) => {
    const aDate = a.changedAt instanceof Date ? a.changedAt : new Date(a.changedAt as unknown as string);
    const bDate = b.changedAt instanceof Date ? b.changedAt : new Date(b.changedAt as unknown as string);
    return bDate.getTime() - aDate.getTime();
  });

  // limit 적용
  if (limit && allRecords.length > limit) {
    return allRecords.slice(0, limit);
  }

  return allRecords;
}
