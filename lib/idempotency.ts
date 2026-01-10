import { Firestore } from 'firebase-admin/firestore';

/**
 * 멱등성 키로 기존 결제 기록 조회
 * 중복 결제 방지를 위해 동일한 멱등성 키로 이미 처리된 결제가 있는지 확인
 */
export async function findExistingPayment(
  db: Firestore,
  idempotencyKey: string
): Promise<FirebaseFirestore.DocumentData | null> {
  const snapshot = await db
    .collection('payments')
    .where('idempotencyKey', '==', idempotencyKey)
    .where('status', '==', 'done')
    .limit(1)
    .get();

  if (!snapshot.empty) {
    return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
  }

  return null;
}

/**
 * 결제 진행 중 상태로 잠금 (중복 처리 방지)
 * 결제 시작 전 'pending' 상태로 기록하여 동시 요청 차단
 */
export async function lockPayment(
  db: Firestore,
  idempotencyKey: string,
  paymentData: {
    tenantId: string;
    email: string;
    plan: string;
    amount: number;
    type: string;
  }
): Promise<string> {
  const docId = `PENDING_${idempotencyKey}`;
  const paymentRef = db.collection('payments').doc(docId);

  await paymentRef.set({
    ...paymentData,
    idempotencyKey,
    status: 'pending',
    createdAt: new Date(),
  });

  return docId;
}

/**
 * 잠금 해제 (결제 실패 시)
 */
export async function unlockPayment(
  db: Firestore,
  docId: string
): Promise<void> {
  try {
    await db.collection('payments').doc(docId).delete();
  } catch {
    // 삭제 실패해도 무시 (이미 삭제됐을 수 있음)
  }
}

/**
 * 멱등성 키 생성
 * 프론트엔드용: operation_tenantId_timestamp
 * Cron용: operation_tenantId_date (일별 중복 방지)
 */
export function generateIdempotencyKey(
  operation: string,
  tenantId: string,
  timestamp?: number
): string {
  if (timestamp) {
    return `${operation}_${tenantId}_${timestamp}`;
  }
  // Cron job용: 날짜 기반
  const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
  return `${operation}_${tenantId}_${today}`;
}
