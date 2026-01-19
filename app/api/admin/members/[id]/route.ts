import { NextRequest, NextResponse } from 'next/server';
import { getAdminFromRequest, hasPermission } from '@/lib/admin-auth';
import { initializeFirebaseAdmin, getAdminAuth } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

// GET: 회원 상세 조회 (이메일 기준)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await getAdminFromRequest(request);
    const { id } = await params;

    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(admin, 'members:read')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const db = initializeFirebaseAdmin();
    if (!db) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
    }

    // URL 디코딩된 이메일로 조회
    const email = decodeURIComponent(id);

    // users 컬렉션에서 회원 기본 정보 조회
    const userDoc = await db.collection('users').doc(email).get();

    if (!userDoc.exists) {
      return NextResponse.json({ error: '회원을 찾을 수 없습니다.' }, { status: 404 });
    }

    const userData = userDoc.data()!;

    // 회원 기본 정보 (users 컬렉션 기반)
    const member = {
      id: encodeURIComponent(email),
      email,
      userId: userData.userId || null,
      name: userData.name || '',
      phone: userData.phone || '',
      group: userData.group || 'normal',
      createdAt: userData.createdAt?.toDate?.()?.toISOString() || null,
      memo: userData.memo || '',
      lastLoginAt: userData.lastLoginAt?.toDate?.()?.toISOString() || null,
      lastLoginIP: userData.lastLoginIP || null,
      trialApplied: userData.trialApplied || false,
      trialAppliedAt: userData.trialAppliedAt?.toDate?.()?.toISOString() || null,
    };

    // 이메일로 tenants 조회 (매장 정보용)
    const tenantsSnapshot = await db.collection('tenants')
      .where('email', '==', email)
      .get();

    // 모든 매장(tenant) 정보 수집
    const tenantDataList = tenantsSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        docId: doc.id,
        tenantId: data.tenantId || doc.id,
        brandName: data.brandName || data.businessName || '이름 없음',
        industry: data.industry || '',
        address: data.address || '',
        createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
        deleted: data.deleted || false,
        deletedAt: data.deletedAt?.toDate?.()?.toISOString() || null,
      };
    });

    // 구독 정보 한 번에 조회
    const subscriptionRefs = tenantDataList.map(t =>
      db.collection('subscriptions').doc(t.tenantId)
    );
    const subscriptionDocs = subscriptionRefs.length > 0 ? await db.getAll(...subscriptionRefs) : [];

    const subscriptionMap = new Map<string, {
      plan: string;
      status: string;
      amount: number;
      nextBillingDate: string | null;
      currentPeriodStart: string | null;
      currentPeriodEnd: string | null;
      pricePolicy: string | null;
      priceProtectedUntil: string | null;
      originalAmount: number | null;
      cancelMode?: 'scheduled' | 'immediate';
    }>();

    subscriptionDocs.forEach((doc) => {
      if (doc.exists) {
        const data = doc.data();
        subscriptionMap.set(doc.id, {
          plan: data?.plan || '',
          status: data?.status || '',
          amount: data?.amount || 0,
          nextBillingDate: data?.nextBillingDate?.toDate?.()?.toISOString() || null,
          currentPeriodStart: data?.currentPeriodStart?.toDate?.()?.toISOString() || null,
          currentPeriodEnd: data?.currentPeriodEnd?.toDate?.()?.toISOString() || null,
          pricePolicy: data?.pricePolicy || null,
          priceProtectedUntil: data?.priceProtectedUntil?.toDate?.()?.toISOString() || null,
          originalAmount: data?.originalAmount || null,
          cancelMode: data?.cancelMode || undefined,
        });
      }
    });

    // 매장 목록 (구독 정보 포함)
    const tenants = tenantDataList.map(tenant => ({
      ...tenant,
      subscription: subscriptionMap.get(tenant.tenantId) || null,
    }));

    // trialApplied인 경우 trial 구독이 있었던 매장 찾기
    let trialBrandName: string | null = null;
    if (userData.trialApplied) {
      // 현재 또는 과거에 trial이었던 매장 찾기
      for (const tenant of tenants) {
        const sub = tenant.subscription;
        if (sub && (sub.plan === 'trial' || sub.status === 'trial')) {
          trialBrandName = tenant.brandName;
          break;
        }
      }
      // 현재 trial이 없으면 subscription_history에서 찾기
      if (!trialBrandName) {
        try {
          const historySnapshot = await db.collection('subscription_history')
            .where('email', '==', email)
            .where('plan', '==', 'trial')
            .limit(10)
            .get();
          if (!historySnapshot.empty) {
            // 가장 최근 것 찾기
            const sortedDocs = historySnapshot.docs.sort((a, b) => {
              const aTime = a.data().changedAt?.toDate?.()?.getTime() || 0;
              const bTime = b.data().changedAt?.toDate?.()?.getTime() || 0;
              return bTime - aTime;
            });
            trialBrandName = sortedDocs[0].data().brandName || null;
          }
        } catch (e) {
          console.error('Failed to fetch trial history:', e);
        }
      }
    }

    // 모든 tenantId로 결제 내역 조회
    const tenantIds = tenantDataList.map(t => t.tenantId);
    let payments: Array<{ id: string; [key: string]: unknown }> = [];

    if (tenantIds.length > 0) {
      // Firestore는 'in' 쿼리에서 최대 10개의 값만 지원
      const chunkedIds = [];
      for (let i = 0; i < tenantIds.length; i += 10) {
        chunkedIds.push(tenantIds.slice(i, i + 10));
      }

      for (const chunk of chunkedIds) {
        try {
          const paymentsSnapshot = await db.collection('payments')
            .where('tenantId', 'in', chunk)
            .get();

          const chunkPayments = paymentsSnapshot.docs.map(doc => {
            const data = doc.data();
            return {
              id: doc.id,
              ...data,
              createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
              paidAt: data.paidAt?.toDate?.()?.toISOString() || null,
            };
          });

          payments = [...payments, ...chunkPayments];
        } catch {
          // 인덱스 없을 수 있음
        }
      }

      // 결제일 기준 정렬
      payments.sort((a, b) => {
        const aTime = a.createdAt ? new Date(a.createdAt as string).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt as string).getTime() : 0;
        return bTime - aTime;
      });
    }

    // 총 이용금액 계산 (순매출: 완료된 결제 + 환불)
    const totalAmount = payments
      .filter((p) => p.status === 'completed' || p.status === 'done' || p.status === 'refunded')
      .reduce((sum, p) => sum + ((p.amount as number) || 0), 0);

    return NextResponse.json({
      member: {
        ...member,
        totalAmount,
        trialBrandName,
      },
      tenants,
      payments: payments.slice(0, 20), // 최근 20건만 반환
    });
  } catch (error) {
    console.error('Get member detail error:', error);
    return NextResponse.json(
      { error: '회원 정보를 불러오는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// PUT: 회원 정보 수정 (이메일 기준으로 모든 tenant 업데이트)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await getAdminFromRequest(request);
    const { id } = await params;

    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(admin, 'members:write')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const db = initializeFirebaseAdmin();
    if (!db) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
    }

    // URL 디코딩된 이메일
    const oldEmail = decodeURIComponent(id);

    const body = await request.json();
    const { name, phone, memo, newEmail, group } = body;

    // 이메일 변경 요청인 경우
    if (newEmail && newEmail !== oldEmail) {
      const normalizedNewEmail = newEmail.toLowerCase().trim();

      // 새 이메일이 이미 사용 중인지 확인
      const [existingUser, existingTenant] = await Promise.all([
        db.collection('users').doc(normalizedNewEmail).get(),
        db.collection('tenants').where('email', '==', normalizedNewEmail).limit(1).get(),
      ]);

      if (existingUser.exists || !existingTenant.empty) {
        return NextResponse.json(
          { error: '이미 사용 중인 이메일입니다.' },
          { status: 400 }
        );
      }

      // Firebase Auth 이메일 변경
      const adminAuth = getAdminAuth();
      if (!adminAuth) {
        return NextResponse.json({ error: 'Auth service unavailable' }, { status: 500 });
      }

      try {
        // 기존 이메일로 Firebase Auth 사용자 조회
        const userRecord = await adminAuth.getUserByEmail(oldEmail);
        // 이메일 업데이트
        await adminAuth.updateUser(userRecord.uid, { email: normalizedNewEmail });
      } catch (authError) {
        console.error('Firebase Auth email update error:', authError);
        return NextResponse.json(
          { error: 'Firebase Auth 이메일 변경에 실패했습니다.' },
          { status: 500 }
        );
      }

      // Firestore 업데이트 (트랜잭션)
      const now = new Date();
      await db.runTransaction(async (transaction) => {
        // 1. 기존 users 문서 읽기
        const oldUserDoc = await transaction.get(db.collection('users').doc(oldEmail));
        const oldUserData = oldUserDoc.exists ? oldUserDoc.data() : {};

        // 2. 새 users 문서 생성 (기존 데이터 복사 + 이력 추가)
        const oldName = oldUserData?.name;
        const oldPhone = oldUserData?.phone;

        transaction.set(db.collection('users').doc(normalizedNewEmail), {
          ...oldUserData,
          email: normalizedNewEmail, // 새 이메일로 명시적 업데이트
          ...(name !== undefined && { name }),
          ...(phone !== undefined && { phone }),
          ...(group !== undefined && { group }),
          // 이전 이메일 이력
          previousEmails: FieldValue.arrayUnion(oldEmail),
          // 이전 이름 이력 (변경된 경우)
          ...(name !== undefined && oldName && oldName !== name && {
            previousNames: FieldValue.arrayUnion(oldName),
          }),
          // 이전 연락처 이력 (변경된 경우)
          ...(phone !== undefined && oldPhone && oldPhone !== phone && {
            previousPhones: FieldValue.arrayUnion(oldPhone),
          }),
          emailChangedAt: now,
          updatedAt: now,
          updatedBy: admin.adminId,
        });

        // 3. 기존 users 문서 삭제
        if (oldUserDoc.exists) {
          transaction.delete(db.collection('users').doc(oldEmail));
        }

        // 4. 모든 tenant의 email 업데이트
        const tenantsSnapshot = await db.collection('tenants')
          .where('email', '==', oldEmail)
          .get();

        tenantsSnapshot.docs.forEach(doc => {
          transaction.update(doc.ref, {
            email: normalizedNewEmail,
            ...(name !== undefined && { name }),
            ...(phone !== undefined && { phone }),
            ...(memo !== undefined && { memo }),
            updatedAt: now,
            updatedBy: admin.adminId,
          });
        });

        // 5. auth_sessions 삭제 (기존 세션 무효화)
        const sessionsSnapshot = await db.collection('auth_sessions')
          .where('email', '==', oldEmail)
          .get();

        sessionsSnapshot.docs.forEach(doc => {
          transaction.delete(doc.ref);
        });

        // 6. 관리자 로그 기록
        const logRef = db.collection('admin_logs').doc();
        transaction.set(logRef, {
          action: 'email_change',
          oldEmail,
          newEmail: normalizedNewEmail,
          adminId: admin.adminId,
          adminLoginId: admin.loginId,
          adminName: admin.name,
          changedAt: now,
        });
      });

        return NextResponse.json({
        success: true,
        newEmail: normalizedNewEmail,
        message: '이메일이 변경되었습니다. 사용자는 새 이메일로 재로그인해야 합니다.',
      });
    }

    // 일반 정보 수정 (이메일 변경 없음)
    const userRef = db.collection('users').doc(oldEmail);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return NextResponse.json({ error: '회원을 찾을 수 없습니다.' }, { status: 404 });
    }

    const batch = db.batch();

    // users 컬렉션 업데이트 (기본 정보)
    const currentUserData = userDoc.data();
    const currentName = currentUserData?.name;
    const currentPhone = currentUserData?.phone;

    batch.update(userRef, {
      ...(name !== undefined && { name }),
      ...(phone !== undefined && { phone }),
      ...(memo !== undefined && { memo }),
      ...(group !== undefined && { group }),
      // 이전 이름 이력 추가 (변경된 경우만)
      ...(name !== undefined && currentName && currentName !== name && {
        previousNames: FieldValue.arrayUnion(currentName),
      }),
      // 이전 연락처 이력 추가 (변경된 경우만)
      ...(phone !== undefined && currentPhone && currentPhone !== phone && {
        previousPhones: FieldValue.arrayUnion(currentPhone),
      }),
      updatedAt: new Date(),
      updatedBy: admin.adminId,
    });

    // tenants 컬렉션도 동기화 (매장에 저장된 회원 정보)
    const tenantsSnapshot = await db.collection('tenants')
      .where('email', '==', oldEmail)
      .get();

    tenantsSnapshot.docs.forEach(doc => {
      batch.update(doc.ref, {
        ...(name !== undefined && { name }),
        ...(phone !== undefined && { phone }),
        updatedAt: new Date(),
      });
    });

    await batch.commit();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update member error:', error);
    return NextResponse.json(
      { error: '회원 정보를 수정하는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
