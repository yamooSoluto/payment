import { Firestore } from 'firebase-admin/firestore';

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
