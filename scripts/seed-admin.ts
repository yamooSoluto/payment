import * as admin from 'firebase-admin';
import * as bcrypt from 'bcryptjs';
import * as dotenv from 'dotenv';

// .env 파일 로드
dotenv.config({ path: '.env.local' });
dotenv.config();

const SALT_ROUNDS = 12;

async function seedAdmin() {
  // 환경 변수에서 초기 관리자 정보 가져오기
  const loginId = process.env.INITIAL_ADMIN_LOGIN_ID;
  const password = process.env.INITIAL_ADMIN_PASSWORD;
  const name = process.env.INITIAL_ADMIN_NAME || '관리자';

  if (!loginId || !password) {
    console.error('❌ 환경 변수를 설정해주세요:');
    console.error('   INITIAL_ADMIN_LOGIN_ID=admin');
    console.error('   INITIAL_ADMIN_PASSWORD=your-password');
    console.error('   INITIAL_ADMIN_NAME=관리자 (선택사항)');
    process.exit(1);
  }

  // Firebase Admin 초기화
  const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!serviceAccountKey) {
    console.error('❌ FIREBASE_SERVICE_ACCOUNT_KEY 환경 변수가 필요합니다.');
    process.exit(1);
  }

  try {
    const serviceAccount = JSON.parse(serviceAccountKey);

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    }

    const db = admin.firestore();

    // 이미 존재하는지 확인
    const existingAdmin = await db.collection('admins')
      .where('loginId', '==', loginId)
      .limit(1)
      .get();

    if (!existingAdmin.empty) {
      console.log('⚠️  이미 해당 아이디로 관리자가 존재합니다:', loginId);
      console.log('   기존 관리자 ID:', existingAdmin.docs[0].id);
      process.exit(0);
    }

    // 비밀번호 해싱
    const hashedPassword = bcrypt.hashSync(password, SALT_ROUNDS);

    // 관리자 생성
    const now = new Date();
    const adminRef = await db.collection('admins').add({
      loginId,
      passwordHash: hashedPassword,
      name,
      role: 'super',
      permissions: [],
      createdAt: now,
      updatedAt: now,
    });

    console.log('✅ 초기 관리자가 생성되었습니다!');
    console.log('   ID:', adminRef.id);
    console.log('   아이디:', loginId);
    console.log('   이름:', name);
    console.log('   역할: super (최고 관리자)');
    console.log('');
    console.log('🔐 /admin/login 페이지에서 로그인하세요.');

    process.exit(0);
  } catch (error) {
    console.error('❌ 관리자 생성 중 오류 발생:', error);
    process.exit(1);
  }
}

seedAdmin();
