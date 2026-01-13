import { NextRequest, NextResponse } from 'next/server';
import { getAdminFromRequest, hasPermission } from '@/lib/admin-auth';
import { initializeFirebaseAdmin } from '@/lib/firebase-admin';

// 기본 플랜 데이터
const DEFAULT_PLANS = [
  {
    id: 'trial',
    name: 'Trial',
    price: 0,
    tagline: '백문이 불여일견',
    description: '1개월 무료체험',
    features: [
      '1개월 무료체험',
      'AI 자동 답변',
      '업무 처리 메세지 요약 전달',
      '답변 메시지 AI 보정',
    ],
    refundPolicy: '',
    isActive: true,
    popular: false,
    order: 0,
  },
  {
    id: 'basic',
    name: 'Basic',
    price: 39000,
    tagline: 'CS 마스터 고용하기',
    description: '월 300건 이내',
    features: [
      '월 300건 이내',
      '데이터 무제한 추가',
      'AI 자동 답변',
      '업무 처리 메세지 요약 전달',
    ],
    refundPolicy: '결제일로부터 7일 이내 전액 환불 가능',
    isActive: true,
    popular: true,
    order: 1,
  },
  {
    id: 'business',
    name: 'Business',
    price: 99000,
    tagline: '풀타임 전담 비서 고용하기',
    description: '문의 건수 제한 없음',
    features: [
      'Basic 기능 모두 포함',
      '문의 건수 제한 없음',
      '답변 메시지 AI 보정',
      '미니맵 연동 및 활용',
      '예약 및 재고 연동',
    ],
    refundPolicy: '결제일로부터 7일 이내 전액 환불 가능',
    isActive: true,
    popular: false,
    order: 2,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 0, // 협의
    tagline: '비즈니스 확장의 든든한 동반자',
    description: '맞춤형 솔루션 제공',
    features: [
      'Business 기능 모두 포함',
      '데이터 초기 세팅 및 관리',
      '다지점/브랜드 지원',
      '맞춤형 자동화 컨설팅',
      '데이터 리포트 & 통계',
    ],
    refundPolicy: '별도 협의',
    isActive: true,
    popular: false,
    order: 3,
  },
];

// GET: 플랜 목록 조회
export async function GET(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);

    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(admin, 'plans:read')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const db = initializeFirebaseAdmin();
    if (!db) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
    }

    let snapshot = await db.collection('plans').orderBy('order', 'asc').get();

    // 플랜이 없으면 기본 플랜 자동 생성
    if (snapshot.empty) {
      const now = new Date();
      const batch = db.batch();

      for (const plan of DEFAULT_PLANS) {
        const docRef = db.collection('plans').doc(plan.id);
        batch.set(docRef, {
          ...plan,
          createdAt: now,
          updatedAt: now,
          createdBy: 'system',
        });
      }

      await batch.commit();

      // 다시 조회
      snapshot = await db.collection('plans').orderBy('order', 'asc').get();
    }

    const plans = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      updatedAt: doc.data().updatedAt?.toDate?.()?.toISOString() || null,
    }));

    return NextResponse.json({ plans });
  } catch (error) {
    console.error('Get plans error:', error);
    return NextResponse.json(
      { error: '플랜 목록을 불러오는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// POST: 플랜 생성
export async function POST(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);

    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(admin, 'plans:write')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const db = initializeFirebaseAdmin();
    if (!db) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
    }

    const body = await request.json();
    const { id, name, price, minPrice, maxPrice, tagline, description, features, refundPolicy, isActive, popular, order, isNegotiable } = body;

    if (!id || !name) {
      return NextResponse.json(
        { error: '플랜 ID와 이름은 필수입니다.' },
        { status: 400 }
      );
    }

    // ID 중복 확인
    const existingDoc = await db.collection('plans').doc(id).get();
    if (existingDoc.exists) {
      return NextResponse.json(
        { error: '이미 존재하는 플랜 ID입니다.' },
        { status: 400 }
      );
    }

    await db.collection('plans').doc(id).set({
      name,
      price: price || 0,
      minPrice: minPrice || 0,
      maxPrice: maxPrice || 0,
      tagline: tagline || '',
      description: description || '',
      features: features || [],
      refundPolicy: refundPolicy || '',
      isActive: isActive !== false,
      popular: popular || false,
      order: order || 0,
      isNegotiable: isNegotiable || false,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: admin.adminId,
    });

    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error('Create plan error:', error);
    return NextResponse.json(
      { error: '플랜을 생성하는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
