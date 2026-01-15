import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

admin.initializeApp();

const db = admin.firestore();

/**
 * userId 생성 함수 (u_ + 8자리 영숫자)
 */
function generateUserId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = 'u_';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * 고유한 userId 생성 (중복 확인)
 */
async function generateUniqueUserId(): Promise<string> {
  let userId: string;
  let exists = true;
  let attempts = 0;
  const maxAttempts = 10;

  while (exists && attempts < maxAttempts) {
    userId = generateUserId();
    const snapshot = await db.collection('users').where('userId', '==', userId).limit(1).get();
    exists = !snapshot.empty;
    attempts++;
  }

  if (exists) {
    throw new Error('Failed to generate unique userId');
  }

  return userId!;
}

/**
 * email로 userId 조회 (users 컬렉션에서 직접 조회)
 */
async function getUserIdByEmail(email: string): Promise<string | null> {
  if (!email) return null;

  const normalizedEmail = email.trim().toLowerCase();

  // users 컬렉션 문서 ID로 직접 조회
  const userDoc = await db.collection('users').doc(normalizedEmail).get();
  if (userDoc.exists && userDoc.data()?.userId) {
    return userDoc.data()!.userId;
  }

  return null;
}

/**
 * Tenant 생성/업데이트 시 userId 자동 연결
 *
 * Airtable → Firestore 동기화로 tenant가 생성될 때
 * userId가 없으면 email로 조회하여 자동 연결
 */
export const onTenantWriteAddUserId = functions
  .region('asia-northeast3') // 서울 리전
  .firestore
  .document('tenants/{tenantId}')
  .onWrite(async (change, context) => {
    const tenantId = context.params.tenantId;

    // 삭제된 경우 무시
    if (!change.after.exists) {
      return null;
    }

    const data = change.after.data();
    if (!data) return null;

    // 이미 userId가 있으면 무시
    if (data.userId) {
      return null;
    }

    // email이 없으면 무시
    const email = data.email;
    if (!email) {
      console.log(`[onTenantWrite] Tenant ${tenantId}: email 없음, 스킵`);
      return null;
    }

    console.log(`[onTenantWrite] Tenant ${tenantId}: userId 없음, 연결 시도...`);

    try {
      // email로 userId 조회
      let userId = await getUserIdByEmail(email);

      if (!userId) {
        // userId가 없으면 새로 생성
        console.log(`[onTenantWrite] Tenant ${tenantId}: userId 없음, 새로 생성`);
        userId = await generateUniqueUserId();

        // users 컬렉션에 있으면 업데이트, 없으면 생성
        const userDoc = await db.collection('users').doc(email).get();
        if (userDoc.exists) {
          await db.collection('users').doc(email).update({
            userId,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        } else {
          await db.collection('users').doc(email).set({
            userId,
            email,
            group: 'normal', // 회원 그룹 (기본: 일반)
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }

      }

      // tenant에 userId 업데이트
      await change.after.ref.update({
        userId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log(`[onTenantWrite] Tenant ${tenantId}: userId ${userId} 연결 완료`);

      // 관련 subscriptions도 업데이트
      const subDoc = await db.collection('subscriptions').doc(tenantId).get();
      if (subDoc.exists && !subDoc.data()?.userId) {
        await db.collection('subscriptions').doc(tenantId).update({
          userId,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        console.log(`[onTenantWrite] Subscription ${tenantId}: userId ${userId} 연결 완료`);
      }

      return { success: true, tenantId, userId };
    } catch (error) {
      console.error(`[onTenantWrite] Tenant ${tenantId}: 오류`, error);
      return null;
    }
  });

// Note: onSubscriptionWriteAddUserId, onPaymentCreateAddUserId는 제거됨
// - subscriptions: trial/apply, 결제 API에서 userId 포함하여 생성됨
// - payments: 결제 API에서 userId 포함하여 생성됨
// - tenants만 Airtable → Firestore 외부 동기화로 userId 없이 생성되므로 트리거 필요
