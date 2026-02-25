import { NextRequest, NextResponse } from 'next/server';
import { getAdminFromRequest, hasPermission } from '@/lib/admin-auth';
import { initializeFirebaseAdmin, getAdminAuth } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { addAdminLog } from '@/lib/admin-log';
import { getSubscriptionHistoryByTenantIds } from '@/lib/subscription-history';

// GET: 회원 상세 조회 (이메일 기준)
// ?include=payments  → 결제 내역 포함
// ?include=history   → 구독 내역 포함
// ?include=all       → 전부 포함
// (기본) → 회원 + 매장 + 구독 정보만 (빠른 첫 로딩)
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

    const includeParam = request.nextUrl.searchParams.get('include');
    const includePayments = includeParam === 'payments' || includeParam === 'all';
    const includeHistory = includeParam === 'history' || includeParam === 'all';

    // URL 디코딩된 이메일로 조회
    const email = decodeURIComponent(id);

    // 1단계: user + tenants 병렬 조회 (둘 다 email만 필요)
    const [userDoc, tenantsSnapshot] = await Promise.all([
      db.collection('users').doc(email).get(),
      db.collection('tenants').where('email', '==', email).get(),
    ]);

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
      deleted: userData.deleted || false,
      deletedAt: userData.deletedAt?.toDate?.()?.toISOString() || null,
      deletedBy: userData.deletedBy || null,
    };

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

    const tenantIds = tenantDataList.map(t => t.tenantId);

    // 2단계: 구독 + (결제/내역 선택적) 병렬 조회
    const parallelTasks: Promise<unknown>[] = [];

    // 구독 정보 (항상 조회)
    const subscriptionRefs = tenantDataList.map(t =>
      db.collection('subscriptions').doc(t.tenantId)
    );
    parallelTasks.push(
      subscriptionRefs.length > 0 ? db.getAll(...subscriptionRefs) : Promise.resolve([])
    );

    // trial 매장명 조회 (trialApplied인 경우만)
    parallelTasks.push(
      userData.trialApplied
        ? db.collection('subscription_history')
            .where('email', '==', email)
            .where('plan', '==', 'trial')
            .limit(10)
            .get()
            .catch(() => null)
        : Promise.resolve(null)
    );

    // 결제 내역 (include=payments 일 때만)
    if (includePayments && tenantIds.length > 0) {
      const chunkedIds = [];
      for (let i = 0; i < tenantIds.length; i += 10) {
        chunkedIds.push(tenantIds.slice(i, i + 10));
      }
      parallelTasks.push(
        Promise.all(
          chunkedIds.map(chunk =>
            db.collection('payments')
              .where('tenantId', 'in', chunk)
              .get()
              .catch(() => null)
          )
        )
      );
    } else {
      parallelTasks.push(Promise.resolve(null));
    }

    // 구독 내역 (include=history 일 때만)
    if (includeHistory && tenantIds.length > 0) {
      parallelTasks.push(getSubscriptionHistoryByTenantIds(db, tenantIds));
    } else {
      parallelTasks.push(Promise.resolve(null));
    }

    const [subscriptionDocs, trialHistoryResult, paymentsResult, historyResult] = await Promise.all(parallelTasks) as [
      FirebaseFirestore.DocumentSnapshot[],
      FirebaseFirestore.QuerySnapshot | null,
      (FirebaseFirestore.QuerySnapshot | null)[] | null,
      unknown[] | null,
    ];

    // 구독 정보 매핑
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
      pendingPlan: string | null;
    }>();

    (subscriptionDocs as FirebaseFirestore.DocumentSnapshot[]).forEach((doc) => {
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
          pendingPlan: data?.pendingPlan || null,
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
      for (const tenant of tenants) {
        const sub = tenant.subscription;
        if (sub && (sub.plan === 'trial' || sub.status === 'trial')) {
          trialBrandName = tenant.brandName;
          break;
        }
      }
      if (!trialBrandName && trialHistoryResult && !trialHistoryResult.empty) {
        const sortedDocs = trialHistoryResult.docs.sort((a, b) => {
          const aTime = a.data().changedAt?.toDate?.()?.getTime() || 0;
          const bTime = b.data().changedAt?.toDate?.()?.getTime() || 0;
          return bTime - aTime;
        });
        trialBrandName = sortedDocs[0].data().brandName || null;
      }
    }

    // 결과 조합
    const result: Record<string, unknown> = {
      member: {
        ...member,
        trialBrandName,
      },
      tenants,
    };

    // 결제 내역 (요청된 경우만)
    if (includePayments && paymentsResult) {
      let payments: Array<{ id: string; [key: string]: unknown }> = [];
      for (const snapshot of paymentsResult) {
        if (!snapshot) continue;
        const chunkPayments = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
            paidAt: data.paidAt?.toDate?.()?.toISOString() || null,
          };
        });
        payments = [...payments, ...chunkPayments];
      }

      payments.sort((a, b) => {
        const aTime = a.createdAt ? new Date(a.createdAt as string).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt as string).getTime() : 0;
        return bTime - aTime;
      });

      // 총 이용금액 계산
      const totalAmount = payments
        .filter((p) => p.status === 'done')
        .reduce((sum, p) => sum + ((p.amount as number) || 0), 0);

      result.payments = payments.slice(0, 20);
      (result.member as Record<string, unknown>).totalAmount = totalAmount;
    }

    // 구독 내역 (요청된 경우만)
    if (includeHistory && historyResult) {
      const tenantMap = new Map<string, string>();
      tenantDataList.forEach(t => {
        tenantMap.set(t.tenantId, t.brandName);
      });

      const formattedHistory = (historyResult as Array<Record<string, unknown>>).map(record => ({
        ...record,
        brandName: tenantMap.get(record.tenantId as string) || record.tenantId,
        periodStart: record.periodStart instanceof Date
          ? record.periodStart.toISOString()
          : record.periodStart,
        periodEnd: record.periodEnd instanceof Date
          ? record.periodEnd.toISOString()
          : record.periodEnd,
        billingDate: record.billingDate instanceof Date
          ? record.billingDate.toISOString()
          : record.billingDate,
        changedAt: record.changedAt instanceof Date
          ? record.changedAt.toISOString()
          : record.changedAt,
      }));

      result.subscriptionHistory = formattedHistory;
    }

    return NextResponse.json(result);
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

      // 트랜잭션 전에 기존 데이터 조회 (로그용)
      const preUserDoc = await db.collection('users').doc(oldEmail).get();
      const preUserData = preUserDoc.exists ? preUserDoc.data() : {};
      const preOldName = preUserData?.name;
      const preOldPhone = preUserData?.phone;

      await db.runTransaction(async (transaction) => {
        // 1. 기존 users 문서 읽기
        const oldUserDoc = await transaction.get(db.collection('users').doc(oldEmail));
        const oldUserData = oldUserDoc.exists ? oldUserDoc.data() : {};

        // 2. 새 users 문서 생성 (기존 데이터 복사 + 이력 추가)
        const oldName = oldUserData?.name;
        const oldPhone = oldUserData?.phone;
        const originalCreatedAt = oldUserData?.createdAt; // 가입일 보존

        // 기존 이력 배열에 추가 (set에서는 arrayUnion이 덮어쓰므로 수동 병합)
        const existingPreviousEmails = oldUserData?.previousEmails || [];
        const existingPreviousNames = oldUserData?.previousNames || [];
        const existingPreviousPhones = oldUserData?.previousPhones || [];

        transaction.set(db.collection('users').doc(normalizedNewEmail), {
          ...oldUserData,
          email: normalizedNewEmail, // 새 이메일로 명시적 업데이트
          ...(name !== undefined && { name }),
          ...(phone !== undefined && { phone }),
          ...(group !== undefined && { group }),
          // 이전 이메일 이력 (기존 배열 + 새 이메일)
          previousEmails: [...existingPreviousEmails, oldEmail],
          // 이전 이름 이력 (변경된 경우)
          ...(name !== undefined && oldName && oldName !== name && {
            previousNames: [...existingPreviousNames, oldName],
          }),
          // 이전 연락처 이력 (변경된 경우)
          ...(phone !== undefined && oldPhone && oldPhone !== phone && {
            previousPhones: [...existingPreviousPhones, oldPhone],
          }),
          // 가입일은 반드시 유지 (덮어쓰기 방지)
          createdAt: originalCreatedAt || now,
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
            email: normalizedNewEmail, // 이메일만 변경
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

      });

      // 6. users_managers의 masterEmail 업데이트 (배치)
      const managersSnapshot = await db.collection('users_managers')
        .where('masterEmail', '==', oldEmail)
        .get();

      if (!managersSnapshot.empty) {
        const managerBatch = db.batch();
        managersSnapshot.docs.forEach(doc => {
          managerBatch.update(doc.ref, {
            masterEmail: normalizedNewEmail,
            updatedAt: now,
          });
        });
        await managerBatch.commit();
      }

      // 관리자 로그 기록 (이메일 변경)
      await addAdminLog(db, admin, {
        action: 'member_update',
        email: normalizedNewEmail,
        userId: preUserData?.userId || null,
        changes: {
          email: { from: oldEmail, to: normalizedNewEmail },
          ...(name !== undefined && preOldName && preOldName !== name && {
            name: { from: preOldName, to: name },
          }),
          ...(phone !== undefined && preOldPhone && preOldPhone !== phone && {
            phone: { from: preOldPhone, to: phone },
          }),
        },
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
        updatedBy: admin.adminId,
      });
    });

    await batch.commit();

    // 관리자 로그 기록 (정보 수정)
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    if (name !== undefined && currentName !== name) {
      changes.name = { from: currentName || '', to: name };
    }
    if (phone !== undefined && currentPhone !== phone) {
      changes.phone = { from: currentPhone || '', to: phone };
    }
    if (memo !== undefined && currentUserData?.memo !== memo) {
      changes.memo = { from: currentUserData?.memo || '', to: memo };
    }
    if (group !== undefined && currentUserData?.group !== group) {
      changes.group = { from: currentUserData?.group || 'normal', to: group };
    }

    if (Object.keys(changes).length > 0) {
      const tenantData = tenantsSnapshot.docs.length > 0 ? tenantsSnapshot.docs[0].data() : null;

      await addAdminLog(db, admin, {
        action: 'member_update',
        email: oldEmail,
        userId: currentUserData?.userId || null,
        tenantId: tenantsSnapshot.docs.length > 0 ? tenantsSnapshot.docs[0].id : null,
        brandName: tenantData?.brandName || null,
        phone: phone || currentUserData?.phone || null,
        changes,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update member error:', error);
    return NextResponse.json(
      { error: '회원 정보를 수정하는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
