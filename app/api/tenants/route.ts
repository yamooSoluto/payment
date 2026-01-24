import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { verifyToken } from '@/lib/auth';
import { isValidIndustry } from '@/lib/constants';

// 내 매장 목록 조회 (각 매장의 구독 상태 포함, 삭제된 매장 제외)
export async function GET(request: NextRequest) {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');
    const emailParam = searchParams.get('email');
    const skipSubscription = searchParams.get('skipSubscription') === 'true';

    let email: string | null = null;

    if (token) {
      email = await verifyToken(token);
    } else if (emailParam) {
      email = emailParam;
    }

    if (!email) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // 1. users 컬렉션에서 userId 조회
    const userDoc = await db.collection('users').doc(email).get();
    const userData = userDoc.exists ? userDoc.data() : null;
    const userId = userData?.userId;

    // 2. tenants 컬렉션에서 userId로 매장 목록 조회 (userId가 없으면 email로 fallback)
    let tenantsSnapshot;
    if (userId) {
      tenantsSnapshot = await db
        .collection('tenants')
        .where('userId', '==', userId)
        .get();
    } else {
      // userId가 없는 경우 email로 fallback (기존 데이터 호환성)
      tenantsSnapshot = await db
        .collection('tenants')
        .where('email', '==', email)
        .get();
    }

    if (tenantsSnapshot.empty) {
      return NextResponse.json({ tenants: [] });
    }

    // Timestamp를 ISO string으로 변환
    const serializeTimestamp = (val: unknown): unknown => {
      if (!val) return null;
      if (typeof val === 'object' && val !== null) {
        if ('toDate' in val && typeof (val as { toDate: () => Date }).toDate === 'function') {
          return (val as { toDate: () => Date }).toDate().toISOString();
        }
        if ('_seconds' in val) {
          return new Date((val as { _seconds: number })._seconds * 1000).toISOString();
        }
      }
      return val;
    };

    // 모든 tenant 데이터 수집 (삭제된 매장 제외)
    const tenantDataList = tenantsSnapshot.docs
      .filter((doc) => {
        const data = doc.data();
        return !data.deleted; // 삭제된 매장 제외
      })
      .map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          tenantId: data.tenantId || doc.id,
          brandName: data.brandName || '이름 없음',
          email: data.email,
          industry: data.industry || null,
          createdAt: serializeTimestamp(data.createdAt),
        };
      });

    // skipSubscription=true면 구독 정보 조회 스킵
    if (skipSubscription) {
      const tenants = tenantDataList.map((tenant) => ({
        ...tenant,
        subscription: null,
      }));
      return NextResponse.json({ tenants });
    }

    // 구독 정보 한 번에 조회 (getAll 사용으로 N+1 문제 해결)
    const subscriptionRefs = tenantDataList.map((t) =>
      db.collection('subscriptions').doc(t.tenantId)
    );
    const subscriptionDocs = await db.getAll(...subscriptionRefs);

    // 구독 정보를 Map으로 변환 (plan이 있는 경우에만)
    const subscriptionMap = new Map<string, Record<string, unknown>>();
    subscriptionDocs.forEach((doc) => {
      if (doc.exists) {
        const data = doc.data();
        // plan이 없거나 빈 값이면 구독 정보 없음으로 처리
        if (data?.plan) {
          subscriptionMap.set(doc.id, {
            plan: data.plan,
            status: data.status,
            amount: data.amount,
            nextBillingDate: serializeTimestamp(data.nextBillingDate),
            currentPeriodEnd: serializeTimestamp(data.currentPeriodEnd),
            canceledAt: serializeTimestamp(data.canceledAt),
          });
        }
      }
    });

    // 최종 결과 조합
    const tenants = tenantDataList.map((tenant) => ({
      ...tenant,
      subscription: subscriptionMap.get(tenant.tenantId) || null,
    }));

    return NextResponse.json({ tenants });
  } catch (error) {
    console.error('Failed to fetch tenants:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tenants' },
      { status: 500 }
    );
  }
}

// 새 매장 추가
export async function POST(request: NextRequest) {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { token, email: emailParam, brandName, industry } = body;

    // 인증 확인
    let email: string | null = null;
    if (token) {
      email = await verifyToken(token);
    } else if (emailParam) {
      email = emailParam;
    }

    if (!email) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // 필수 필드 검증
    if (!brandName || typeof brandName !== 'string' || brandName.trim() === '') {
      return NextResponse.json({ error: '매장명을 입력해주세요.' }, { status: 400 });
    }

    if (!industry || typeof industry !== 'string') {
      return NextResponse.json({ error: '업종을 선택해주세요.' }, { status: 400 });
    }

    if (!isValidIndustry(industry)) {
      return NextResponse.json({ error: '유효하지 않은 업종입니다.' }, { status: 400 });
    }

    // users 컬렉션에서 사용자 정보 조회 (name, phone)
    const userDoc = await db.collection('users').doc(email).get();
    const userData = userDoc.exists ? userDoc.data() : null;

    // n8n 웹훅 호출 (isTrialSignup: false로 매장만 생성)
    const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL;
    let tenantId: string | null = null;

    if (!n8nWebhookUrl) {
      console.error('N8N_WEBHOOK_URL이 설정되지 않았습니다.');
      return NextResponse.json({ error: '시스템 설정 오류입니다.' }, { status: 500 });
    }

    try {
      const timestamp = new Date().toISOString();
      const n8nResponse = await fetch(n8nWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          name: userData?.name || null,
          phone: userData?.phone || null,
          brandName: brandName.trim(),
          industry,
          timestamp,
          createdAt: timestamp,
          isTrialSignup: false, // 매장 추가용 (체험 신청 아님)
          action: 'ADD', // Airtable automation 트리거용
        }),
      });

      if (!n8nResponse.ok) {
        console.error('n8n webhook 호출 실패:', n8nResponse.status);
        return NextResponse.json({ error: '매장 생성에 실패했습니다.' }, { status: 500 });
      }

      const n8nData = await n8nResponse.json();
      console.log('매장 추가 n8n webhook 성공:', n8nData);

      if (n8nData.tenantId) {
        tenantId = n8nData.tenantId;
      }
    } catch (error) {
      console.error('n8n webhook 호출 오류:', error);
      return NextResponse.json({ error: '매장 생성에 실패했습니다.' }, { status: 500 });
    }

    if (!tenantId) {
      return NextResponse.json({ error: '매장 ID 생성에 실패했습니다.' }, { status: 500 });
    }

    // tenants 컬렉션에 userId 및 subscription.status 설정
    try {
      await db.collection('tenants').doc(tenantId).set(
        {
          userId: userData?.userId || null, // userId 설정
          subscription: { status: 'expired' },
        },
        { merge: true }
      );
    } catch (error) {
      console.error('tenants 업데이트 오류:', error);
    }

    return NextResponse.json({
      success: true,
      tenantId,
      brandName: brandName.trim(),
      industry,
      message: '매장이 추가되었습니다.',
    });
  } catch (error) {
    console.error('Failed to create tenant:', error);
    return NextResponse.json(
      { error: '매장 추가에 실패했습니다.' },
      { status: 500 }
    );
  }
}
