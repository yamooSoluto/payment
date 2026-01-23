import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { getAdminFromRequest, hasPermission } from '@/lib/admin-auth';

// GET: 삭제된 매장 히스토리 조회
export async function GET(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);

    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(admin, 'tenants:read')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const db = adminDb || initializeFirebaseAdmin();
    if (!db) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || ''; // pending, deleted, payment_deleted

    // tenant_deletions 컬렉션 조회
    const deletionsSnapshot = await db.collection('tenant_deletions').get();

    interface DeletionData {
      id: string;
      tenantId: string;
      userId: string;
      brandName: string;
      email: string;
      // 삭제 시점의 정보
      nameAtDeletion: string;
      phoneAtDeletion: string;
      // 현재 users 컬렉션의 정보
      currentName: string;
      currentPhone: string;
      deletedAt: string | null;
      deletedBy: string;
      deletedByDetails: string;
      permanentDeleteAt: string | null;
      permanentlyDeletedAt: string | null;
      paymentDeleteAt: string | null;
      paymentsDeletedAt: string | null;
      reason: string;
      status: 'pending' | 'deleted' | 'payment_deleted';
    }

    // 삭제 데이터 가공
    let deletions: DeletionData[] = deletionsSnapshot.docs.map(doc => {
      const data = doc.data();
      const now = new Date();
      const permanentDeleteAt = data.permanentDeleteAt?.toDate?.() || data.permanentDeleteAt;
      const permanentlyDeletedAt = data.permanentlyDeletedAt?.toDate?.() || data.permanentlyDeletedAt;
      const paymentsDeletedAt = data.paymentsDeletedAt?.toDate?.() || data.paymentsDeletedAt;

      // 상태 결정
      let itemStatus: 'pending' | 'deleted' | 'payment_deleted' = 'pending';
      if (paymentsDeletedAt) {
        itemStatus = 'payment_deleted';
      } else if (permanentlyDeletedAt) {
        itemStatus = 'deleted';
      }

      return {
        id: doc.id,
        tenantId: data.tenantId || '',
        userId: data.userId || '',
        brandName: data.brandName || '',
        email: data.email || '',
        nameAtDeletion: data.name || '',
        phoneAtDeletion: data.phone || '',
        currentName: '', // 나중에 users에서 조회
        currentPhone: '', // 나중에 users에서 조회
        deletedAt: data.deletedAt?.toDate?.()?.toISOString() || null,
        deletedBy: data.deletedBy || '',
        deletedByDetails: data.deletedByDetails || '',
        permanentDeleteAt: permanentDeleteAt?.toISOString?.() || (permanentDeleteAt ? new Date(permanentDeleteAt).toISOString() : null),
        permanentlyDeletedAt: permanentlyDeletedAt?.toISOString?.() || (permanentlyDeletedAt ? new Date(permanentlyDeletedAt).toISOString() : null),
        paymentDeleteAt: data.paymentDeleteAt?.toDate?.()?.toISOString() || null,
        paymentsDeletedAt: paymentsDeletedAt?.toISOString?.() || (paymentsDeletedAt ? new Date(paymentsDeletedAt).toISOString() : null),
        reason: data.reason || '',
        status: itemStatus,
      };
    });

    // userId 목록 수집하여 users 컬렉션에서 현재 정보 조회
    const userIds = [...new Set(deletions.map(d => d.userId).filter(Boolean))];
    const userMap = new Map<string, { name: string; phone: string }>();

    // userId로 users 컬렉션 조회 (문서 ID가 email이므로 쿼리 필요)
    if (userIds.length > 0) {
      // userId로 조회
      const usersSnapshot = await db.collection('users').where('userId', 'in', userIds.slice(0, 30)).get();
      usersSnapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.userId) {
          userMap.set(data.userId, {
            name: data.name || '',
            phone: data.phone || '',
          });
        }
      });

      // 30개 이상이면 추가 조회
      if (userIds.length > 30) {
        for (let i = 30; i < userIds.length; i += 30) {
          const batch = userIds.slice(i, i + 30);
          const batchSnapshot = await db.collection('users').where('userId', 'in', batch).get();
          batchSnapshot.docs.forEach(doc => {
            const data = doc.data();
            if (data.userId) {
              userMap.set(data.userId, {
                name: data.name || '',
                phone: data.phone || '',
              });
            }
          });
        }
      }
    }

    // 현재 사용자 정보 매핑
    deletions = deletions.map(d => ({
      ...d,
      currentName: userMap.get(d.userId)?.name || '',
      currentPhone: userMap.get(d.userId)?.phone || '',
    }));

    // 상태 필터
    if (status) {
      const statuses = status.split(',');
      deletions = deletions.filter(d => statuses.includes(d.status));
    }

    // 검색 필터
    if (search) {
      const searchLower = search.toLowerCase();
      deletions = deletions.filter(d => {
        return (
          d.brandName.toLowerCase().includes(searchLower) ||
          d.email.toLowerCase().includes(searchLower) ||
          d.nameAtDeletion.toLowerCase().includes(searchLower) ||
          d.currentName.toLowerCase().includes(searchLower) ||
          d.phoneAtDeletion.includes(search) ||
          d.currentPhone.includes(search) ||
          d.tenantId.toLowerCase().includes(searchLower)
        );
      });
    }

    // 삭제일 내림차순 정렬
    deletions.sort((a, b) => {
      const dateA = a.deletedAt ? new Date(a.deletedAt).getTime() : 0;
      const dateB = b.deletedAt ? new Date(b.deletedAt).getTime() : 0;
      return dateB - dateA;
    });

    // 페이지네이션
    const total = deletions.length;
    const totalPages = Math.ceil(total / limit);
    const startIndex = (page - 1) * limit;
    const paginatedDeletions = deletions.slice(startIndex, startIndex + limit);

    return NextResponse.json({
      deletions: paginatedDeletions,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    });
  } catch (error) {
    console.error('Get tenant deletions error:', error);
    return NextResponse.json(
      { error: '삭제 히스토리를 불러오는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
