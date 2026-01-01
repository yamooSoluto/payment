import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getAuth, Auth } from 'firebase-admin/auth';

let app: App | null = null;
let adminDb: Firestore | null = null;
let adminAuth: Auth | null = null;

function initializeFirebaseAdmin() {
  if (adminDb) return adminDb;

  try {
    if (getApps().length === 0) {
      // 환경 변수에서 서비스 계정 정보 가져오기
      const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
        ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)
        : undefined;

      if (serviceAccount) {
        app = initializeApp({
          credential: cert(serviceAccount),
          projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        });
      } else {
        // 개발 환경에서는 기본 설정 사용
        app = initializeApp({
          projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        });
      }
    } else {
      app = getApps()[0];
    }
    adminDb = getFirestore(app!);
    adminAuth = getAuth(app!);
    return adminDb;
  } catch (error) {
    console.error('Firebase Admin initialization error:', error);
    return null;
  }
}

// Auth 초기화 함수 (필요할 때만 호출)
function getAdminAuth(): Auth | null {
  if (adminAuth) return adminAuth;
  initializeFirebaseAdmin();
  return adminAuth;
}

// 초기화 실행
initializeFirebaseAdmin();

export { adminDb, adminAuth, initializeFirebaseAdmin, getAdminAuth };
