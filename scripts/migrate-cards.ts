/**
 * Cards 컬렉션 마이그레이션 스크립트
 *
 * 기존 구조 (개별 문서) → 새 구조 (tenantId별 단일 문서 + 배열)
 *
 * 실행 방법:
 * npx ts-node --project tsconfig.scripts.json scripts/migrate-cards.ts
 */

import * as admin from 'firebase-admin';
import * as dotenv from 'dotenv';

// .env.local 로드
dotenv.config({ path: '.env.local' });

// Firebase Admin 초기화
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

interface OldCardDocument {
  tenantId: string;
  email: string;
  billingKey: string;
  cardInfo: {
    company: string;
    number: string;
    cardType?: string;
    ownerType?: string;
  };
  alias?: string;
  isPrimary: boolean;
  createdAt: admin.firestore.Timestamp | Date;
}

async function migrateCards() {
  console.log('=== Cards 마이그레이션 시작 ===\n');

  // 1. 기존 cards 문서 조회 (tenantId 필드가 있는 문서들 = 기존 구조)
  const oldCardsSnapshot = await db.collection('cards').get();

  // tenantId별로 그룹핑
  const cardsByTenant = new Map<string, { docId: string; data: OldCardDocument }[]>();
  const newStructureDocs: string[] = []; // 이미 새 구조인 문서들

  for (const doc of oldCardsSnapshot.docs) {
    const data = doc.data();

    // 새 구조인지 확인 (cards 배열이 있으면 새 구조)
    if (data.cards && Array.isArray(data.cards)) {
      newStructureDocs.push(doc.id);
      continue;
    }

    // 기존 구조인 경우 tenantId로 그룹핑
    const tenantId = data.tenantId;
    if (!tenantId) continue;

    if (!cardsByTenant.has(tenantId)) {
      cardsByTenant.set(tenantId, []);
    }
    cardsByTenant.get(tenantId)!.push({
      docId: doc.id,
      data: data as OldCardDocument,
    });
  }

  console.log(`기존 구조 카드: ${oldCardsSnapshot.size - newStructureDocs.length}개`);
  console.log(`이미 새 구조: ${newStructureDocs.length}개`);
  console.log(`마이그레이션할 테넌트: ${cardsByTenant.size}개\n`);

  if (cardsByTenant.size === 0) {
    console.log('마이그레이션할 데이터가 없습니다.\n');
  } else {
    // 2. 테넌트별로 새 구조로 마이그레이션
    for (const [tenantId, cards] of cardsByTenant) {
      console.log(`[${tenantId}] ${cards.length}개 카드 마이그레이션...`);

      const now = new Date();
      const newCards = cards.map((card) => ({
        id: card.docId, // 기존 문서 ID를 카드 ID로 사용
        billingKey: card.data.billingKey,
        cardInfo: card.data.cardInfo,
        alias: card.data.alias || null,
        isPrimary: card.data.isPrimary || false,
        createdAt: card.data.createdAt instanceof admin.firestore.Timestamp
          ? card.data.createdAt.toDate()
          : card.data.createdAt || now,
      }));

      const firstCard = cards[0].data;

      // 새 구조로 저장
      await db.collection('cards').doc(tenantId).set({
        tenantId,
        email: firstCard.email,
        cards: newCards,
        updatedAt: now,
      });

      // 기존 문서 삭제
      const batch = db.batch();
      for (const card of cards) {
        batch.delete(db.collection('cards').doc(card.docId));
      }
      await batch.commit();

      console.log(`  ✓ 완료 (${cards.length}개 카드 → 1개 문서)\n`);
    }
  }

  // 3. card_changes 컬렉션 삭제
  console.log('=== card_changes 컬렉션 삭제 ===\n');

  const cardChangesSnapshot = await db.collection('card_changes').get();
  console.log(`card_changes 문서 수: ${cardChangesSnapshot.size}개`);

  if (cardChangesSnapshot.size > 0) {
    // 배치로 삭제 (500개씩)
    const batchSize = 500;
    const docs = cardChangesSnapshot.docs;

    for (let i = 0; i < docs.length; i += batchSize) {
      const batch = db.batch();
      const chunk = docs.slice(i, i + batchSize);

      for (const doc of chunk) {
        batch.delete(doc.ref);
      }

      await batch.commit();
      console.log(`  삭제 완료: ${Math.min(i + batchSize, docs.length)}/${docs.length}`);
    }

    console.log('  ✓ card_changes 컬렉션 삭제 완료\n');
  } else {
    console.log('  삭제할 문서가 없습니다.\n');
  }

  console.log('=== 마이그레이션 완료 ===');
}

// 실행
migrateCards()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('마이그레이션 실패:', error);
    process.exit(1);
  });
