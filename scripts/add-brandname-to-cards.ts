/**
 * Cards 문서에 brandName 추가 스크립트
 *
 * 실행 방법:
 * npx ts-node --project tsconfig.scripts.json scripts/add-brandname-to-cards.ts
 */

import * as admin from 'firebase-admin';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

if (!admin.apps.length) {
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!serviceAccount) {
    console.error('FIREBASE_SERVICE_ACCOUNT_KEY 환경변수가 필요합니다.');
    process.exit(1);
  }

  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(serviceAccount)),
  });
}

const db = admin.firestore();

async function addBrandNameToCards() {
  console.log('=== Cards에 brandName 추가 시작 ===\n');

  // 모든 cards 문서 조회
  const cardsSnapshot = await db.collection('cards').get();
  console.log(`cards 문서 수: ${cardsSnapshot.size}개\n`);

  let updated = 0;
  let skipped = 0;

  for (const cardDoc of cardsSnapshot.docs) {
    const tenantId = cardDoc.id;
    const cardData = cardDoc.data();

    // 이미 brandName이 있으면 스킵
    if (cardData.brandName) {
      console.log(`[${tenantId}] 이미 brandName 있음 - 스킵`);
      skipped++;
      continue;
    }

    // tenants에서 brandName 조회
    const tenantDoc = await db.collection('tenants').doc(tenantId).get();

    if (!tenantDoc.exists) {
      console.log(`[${tenantId}] tenant 문서 없음 - 스킵`);
      skipped++;
      continue;
    }

    const tenantData = tenantDoc.data();
    const brandName = tenantData?.brandName || tenantData?.name || '';

    if (!brandName) {
      console.log(`[${tenantId}] brandName 없음 - 스킵`);
      skipped++;
      continue;
    }

    // brandName 추가
    await db.collection('cards').doc(tenantId).update({
      brandName,
    });

    console.log(`[${tenantId}] ✓ brandName: "${brandName}" 추가됨`);
    updated++;
  }

  console.log(`\n=== 완료 ===`);
  console.log(`업데이트: ${updated}개`);
  console.log(`스킵: ${skipped}개`);
}

addBrandNameToCards()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('실패:', error);
    process.exit(1);
  });
