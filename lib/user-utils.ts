import { Firestore, FieldValue } from 'firebase-admin/firestore';

/**
 * 8자리 고유 userId 생성 (영문+숫자)
 * 예: u_Ab3xK9mZ
 */
export function generateUserId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = 'u_'; // prefix로 user임을 표시
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * userId 중복 확인 및 고유 userId 생성
 */
export async function generateUniqueUserId(db: Firestore): Promise<string> {
  let userId = generateUserId();
  let attempts = 0;
  const maxAttempts = 10;

  while (attempts < maxAttempts) {
    // users 컬렉션에서 userId 중복 확인
    const existingUser = await db.collection('users')
      .where('userId', '==', userId)
      .limit(1)
      .get();

    if (existingUser.empty) {
      return userId;
    }

    userId = generateUserId();
    attempts++;
  }

  // 거의 불가능하지만 10번 시도 후에도 중복이면 timestamp 추가
  return `u_${Date.now().toString(36)}`;
}

/**
 * user_emails 인덱스에 이메일 등록
 * 이메일 → userId 빠른 조회용
 */
export async function registerEmailIndex(
  db: Firestore,
  email: string,
  userId: string
): Promise<void> {
  const normalizedEmail = email.toLowerCase().trim();

  await db.collection('user_emails').doc(normalizedEmail).set({
    userId,
    email: normalizedEmail,
    createdAt: FieldValue.serverTimestamp(),
  });
}

/**
 * 이메일로 userId 조회
 */
export async function getUserIdByEmail(
  db: Firestore,
  email: string
): Promise<string | null> {
  const normalizedEmail = email.toLowerCase().trim();

  const doc = await db.collection('user_emails').doc(normalizedEmail).get();

  if (doc.exists) {
    return doc.data()?.userId || null;
  }

  return null;
}

/**
 * 이메일 인덱스 업데이트 (이메일 변경 시)
 * 기존 이메일 삭제 + 새 이메일 등록
 */
export async function updateEmailIndex(
  db: Firestore,
  oldEmail: string,
  newEmail: string,
  userId: string
): Promise<void> {
  const normalizedOld = oldEmail.toLowerCase().trim();
  const normalizedNew = newEmail.toLowerCase().trim();

  const batch = db.batch();

  // 기존 이메일 인덱스에 deleted 마킹 (이력 보존)
  batch.update(db.collection('user_emails').doc(normalizedOld), {
    deleted: true,
    deletedAt: FieldValue.serverTimestamp(),
    replacedBy: normalizedNew,
  });

  // 새 이메일 인덱스 생성
  batch.set(db.collection('user_emails').doc(normalizedNew), {
    userId,
    email: normalizedNew,
    previousEmail: normalizedOld,
    createdAt: FieldValue.serverTimestamp(),
  });

  await batch.commit();
}

/**
 * userId로 사용자 정보 조회
 */
export async function getUserById(
  db: Firestore,
  userId: string
): Promise<FirebaseFirestore.DocumentData | null> {
  const snapshot = await db.collection('users')
    .where('userId', '==', userId)
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  return {
    docId: snapshot.docs[0].id,
    ...snapshot.docs[0].data(),
  };
}
