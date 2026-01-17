import { NextRequest, NextResponse } from 'next/server';
import { getAdminFromRequest, hasPermission } from '@/lib/admin-auth';
import { initializeFirebaseAdmin } from '@/lib/firebase-admin';

// POST: 그룹/상태에 속한 회원들의 전화번호 조회
export async function POST(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);

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

    const body = await request.json();
    const { groupIds = [], statuses = [] } = body;

    if (groupIds.length === 0 && statuses.length === 0) {
      return NextResponse.json(
        { error: '회원 그룹 또는 구독 상태를 선택해주세요.' },
        { status: 400 }
      );
    }

    // 1. 회원 그룹 기준으로 이메일 수집
    let groupEmails: Set<string> | null = null;
    if (groupIds.length > 0) {
      groupEmails = new Set<string>();
      const usersSnapshot = await db.collection('users')
        .where('group', 'in', groupIds)
        .get();
      usersSnapshot.docs.forEach(doc => {
        const email = doc.id || doc.data().email;
        if (email) groupEmails!.add(email);
      });
    }

    // 2. 구독 상태 기준으로 이메일 수집
    let statusEmails: Set<string> | null = null;
    if (statuses.length > 0) {
      statusEmails = new Set<string>();

      // 미구독 처리 (subscriptions에 없거나 status가 없는 회원)
      const hasNone = statuses.includes('none');
      const otherStatuses = statuses.filter((s: string) => s !== 'none');

      // 구독 상태별 이메일 수집
      if (otherStatuses.length > 0) {
        for (const status of otherStatuses) {
          const subsSnapshot = await db.collection('subscriptions')
            .where('status', '==', status)
            .get();
          subsSnapshot.docs.forEach(doc => {
            const email = doc.data().email;
            if (email) statusEmails!.add(email);
          });
        }
      }

      // 미구독 회원 처리
      if (hasNone) {
        // 모든 users에서 subscriptions에 없는 사용자 찾기
        const allUsersSnapshot = await db.collection('users').get();
        const subscribedEmails = new Set<string>();

        const allSubsSnapshot = await db.collection('subscriptions').get();
        allSubsSnapshot.docs.forEach(doc => {
          const email = doc.data().email;
          if (email) subscribedEmails.add(email);
        });

        allUsersSnapshot.docs.forEach(doc => {
          const email = doc.id || doc.data().email;
          if (email && !subscribedEmails.has(email)) {
            statusEmails!.add(email);
          }
        });
      }
    }

    // 3. 교집합 또는 합집합 계산
    let targetEmails: Set<string>;

    if (groupEmails && statusEmails) {
      // 둘 다 선택: 교집합 (선택한 그룹 중 선택한 상태인 회원)
      targetEmails = new Set([...groupEmails].filter(email => statusEmails!.has(email)));
    } else if (groupEmails) {
      // 그룹만 선택
      targetEmails = groupEmails;
    } else if (statusEmails) {
      // 상태만 선택
      targetEmails = statusEmails;
    } else {
      targetEmails = new Set();
    }

    // 4. 이메일로 회원 정보 조회
    const members: { email: string; name: string; phone: string }[] = [];
    for (const email of targetEmails) {
      const userDoc = await db.collection('users').doc(email).get();
      if (userDoc.exists) {
        const userData = userDoc.data();
        const phone = userData?.phone;
        if (phone && phone.trim()) {
          members.push({
            email: email,
            name: userData?.name || '',
            phone: phone,
          });
        }
      }
    }

    // 중복 제거 (전화번호 기준)
    const uniquePhones = [...new Set(members.map(m => m.phone))];
    const uniqueMembers = members.filter((member, index, self) =>
      index === self.findIndex(m => m.phone === member.phone)
    );

    return NextResponse.json({
      phones: uniquePhones,
      members: uniqueMembers,
      count: uniquePhones.length,
    });
  } catch (error) {
    console.error('Get members by groups error:', error);
    return NextResponse.json(
      { error: '회원 정보를 불러오는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
