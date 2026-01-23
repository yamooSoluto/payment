// 기존 admins 컬렉션 문서에 adminId 필드 추가 마이그레이션
import * as admin from 'firebase-admin';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

// Firebase Admin 초기화
if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

async function migrateAdminIds() {
  console.log('Starting admin ID migration...');

  const snapshot = await db.collection('admins').get();

  let updated = 0;
  let skipped = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();

    // 이미 adminId가 있으면 스킵
    if (data.adminId) {
      console.log(`Skipped: ${doc.id} (already has adminId)`);
      skipped++;
      continue;
    }

    // adminId 필드 추가
    await doc.ref.update({
      adminId: doc.id,
    });

    console.log(`Updated: ${doc.id} -> adminId: ${doc.id}`);
    updated++;
  }

  console.log('\nMigration completed!');
  console.log(`Updated: ${updated}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Total: ${snapshot.docs.length}`);
}

migrateAdminIds()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
