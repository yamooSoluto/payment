import { NextRequest, NextResponse } from 'next/server';
import { getAdminFromRequest, hasPermission } from '@/lib/admin-auth';
import { initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { addAdminLog } from '@/lib/admin-log';

// ════════════════════════════════════════════════════════════
// Vector Template API
// 라이브러리 카테고리별 예상 질문 및 keyData 매핑 템플릿 관리
// ══════════════════════════════════════════════════════════════════════

interface VectorTemplate {
  id: string;
  category: string;           // 카테고리 ID (storeInfo, parking, entry 등)
  categoryName: string;       // 표시명 (매장정보, 주차, 출입 등)
  expectedQuestions: string[]; // 예상 질문 템플릿 ({{storeName}} 등 변수 포함)
  keyDataMapping: {           // 라이브러리 필드 → keyData 매핑
    field: string;            // 소스 필드명
    label: string;            // 표시명
    template: string;         // keyData 변환 템플릿
  }[];
  isActive: boolean;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

// GET: 템플릿 목록 조회
export async function GET(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);

    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // settings:read 권한 사용
    if (!hasPermission(admin, 'siteSettings:read')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const db = initializeFirebaseAdmin();
    if (!db) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
    }

    const templateSnapshot = await db.collection('vector_templates')
      .orderBy('order', 'asc')
      .get();

    const templates = templateSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate?.() || doc.data().createdAt,
      updatedAt: doc.data().updatedAt?.toDate?.() || doc.data().updatedAt,
    }));

    return NextResponse.json({ templates });
  } catch (error) {
    console.error('Get vector templates error:', error);
    return NextResponse.json(
      { error: '벡터 템플릿을 불러오는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// POST: 새 템플릿 추가
export async function POST(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);

    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(admin, 'siteSettings:write')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const db = initializeFirebaseAdmin();
    if (!db) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
    }

    const body = await request.json();
    const {
      category,
      categoryName,
      expectedQuestions,
      questions,
      keyDataMapping,
      isActive = true,
      // 새 필드들
      source,
      topic,
      itemPattern,
      facet,
      sectionId,
      // 복수 소스 지원
      keyDataSources,
      // FAQ 응답 설정
      answer,
      guide,
      faqTopic,
      tags,
      // 처리 방식 (Weaviate 연동)
      handlerType,
      handler,
      rule,
    } = body;

    // questions 또는 expectedQuestions 중 하나가 필수
    const finalQuestions = questions || expectedQuestions || [];
    if (finalQuestions.length === 0) {
      return NextResponse.json({ error: '질문을 최소 1개 이상 입력해주세요.' }, { status: 400 });
    }

    // category 자동 생성 (없는 경우)
    let finalCategory = category;
    if (!finalCategory) {
      if (source === 'storeinfo' && sectionId) {
        finalCategory = `storeinfo_${sectionId}`;
      } else if (topic && facet) {
        finalCategory = `${topic}_${facet}`;
      } else {
        // 자동 생성 불가 시 타임스탬프 기반 ID
        finalCategory = `template_${Date.now()}`;
      }
    }
    const finalCategoryName = categoryName || finalCategory;

    // 중복 체크 (finalCategory 사용)
    if (finalCategory) {
      const existingSnapshot = await db.collection('vector_templates')
        .where('category', '==', finalCategory)
        .limit(1)
        .get();

      if (!existingSnapshot.empty) {
        return NextResponse.json({ error: '이미 존재하는 카테고리입니다.' }, { status: 400 });
      }
    }

    // 최대 order 값 조회
    const maxOrderSnapshot = await db.collection('vector_templates')
      .orderBy('order', 'desc')
      .limit(1)
      .get();

    const maxOrder = maxOrderSnapshot.empty ? 0 : (maxOrderSnapshot.docs[0].data().order || 0);

    const templateData = {
      category: finalCategory,
      categoryName: finalCategoryName,
      expectedQuestions: finalQuestions,
      questions: finalQuestions,
      keyDataMapping: keyDataMapping || [],
      isActive,
      order: maxOrder + 1,
      // 새 필드들
      source: source || 'datasheet',
      topic: topic || null,
      itemPattern: itemPattern || '*',
      facet: facet || null,
      sectionId: sectionId || null,
      // 복수 소스 지원
      keyDataSources: keyDataSources || [],
      // FAQ 응답 설정
      answer: answer || null,
      guide: guide || null,
      faqTopic: faqTopic || null,
      tags: tags || [],
      // 처리 방식 (Weaviate 연동)
      // - bot: handler="bot", rule 없음
      // - staff: handler="op"|"manager", rule 없음
      // - conditional: handler 미지정, rule="조건텍스트" (LLM이 결정)
      handlerType: handlerType || 'bot',
      handler: handler || null,
      rule: rule || null,
      createdAt: new Date(),
      createdBy: admin.adminId,
      updatedAt: new Date(),
      updatedBy: admin.adminId,
    };

    const docRef = await db.collection('vector_templates').add(templateData);

    // 로그 기록 (설정 업데이트로 처리)
    await addAdminLog(db, admin, {
      action: 'settings_site_update',
      details: { type: 'vector_template_create', templateId: docRef.id, category: finalCategory },
    });

    // 브로드캐스트는 별도 버튼으로 수동 실행 (자동 실행 안함)
    // POST /api/admin/vector-templates/broadcast 사용

    return NextResponse.json({
      success: true,
      id: docRef.id,
      message: '벡터 템플릿이 추가되었습니다. 전체 테넌트에 적용하려면 "전체 적용" 버튼을 누르세요.',
    });
  } catch (error) {
    console.error('Create vector template error:', error);
    return NextResponse.json(
      { error: '벡터 템플릿을 추가하는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// PUT: 템플릿 순서 변경
export async function PUT(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);

    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(admin, 'siteSettings:write')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const db = initializeFirebaseAdmin();
    if (!db) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
    }

    const body = await request.json();
    const { orders } = body;

    if (!orders || !Array.isArray(orders)) {
      return NextResponse.json({ error: '순서 정보가 필요합니다.' }, { status: 400 });
    }

    const batch = db.batch();

    for (const { id, order } of orders) {
      const docRef = db.collection('vector_templates').doc(id);
      batch.update(docRef, { order, updatedAt: new Date() });
    }

    await batch.commit();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Reorder vector templates error:', error);
    return NextResponse.json(
      { error: '순서 변경 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}