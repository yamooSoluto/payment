import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initializeFirebaseAdmin } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

// Timestamp를 ISO string으로 변환
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeTimestamp(val: any): string | null {
  if (!val) return null;
  if (typeof val === 'object' && val !== null) {
    if ('toDate' in val && typeof val.toDate === 'function') {
      return val.toDate().toISOString();
    }
    if ('_seconds' in val) {
      return new Date(val._seconds * 1000).toISOString();
    }
  }
  return val;
}

// 관리자: 특정 tenant의 subscription_history 조회
export async function GET(request: NextRequest) {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get('tenantId');

    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId is required' }, { status: 400 });
    }

    const historyRef = db.collection('subscription_history').doc(tenantId).collection('records');
    const snapshot = await historyRef.orderBy('changedAt', 'desc').get();

    const records = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        recordId: doc.id,
        tenantId: data.tenantId,
        email: data.email,
        plan: data.plan,
        status: data.status,
        amount: data.amount,
        periodStart: serializeTimestamp(data.periodStart),
        periodEnd: serializeTimestamp(data.periodEnd),
        billingDate: serializeTimestamp(data.billingDate),
        changeType: data.changeType,
        changedAt: serializeTimestamp(data.changedAt),
        changedBy: data.changedBy,
        previousPlan: data.previousPlan,
        previousStatus: data.previousStatus,
        note: data.note,
        createdAt: serializeTimestamp(data.createdAt),
        updatedAt: serializeTimestamp(data.updatedAt),
      };
    });

    return NextResponse.json({
      success: true,
      tenantId,
      records,
      count: records.length,
    });
  } catch (error) {
    console.error('Get subscription history error:', error);
    return NextResponse.json(
      { error: 'Failed to get subscription history' },
      { status: 500 }
    );
  }
}

// 관리자: 특정 tenant의 subscription_history 수정
export async function POST(request: NextRequest) {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { tenantId, action, recordId, updates, newRecord } = body;

    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId is required' }, { status: 400 });
    }

    const historyRef = db.collection('subscription_history').doc(tenantId).collection('records');

    // action에 따라 다른 작업 수행
    switch (action) {
      case 'update': {
        // 특정 레코드 업데이트
        if (!recordId || !updates) {
          return NextResponse.json({ error: 'recordId and updates are required for update action' }, { status: 400 });
        }

        const recordRef = historyRef.doc(recordId);
        const recordDoc = await recordRef.get();

        if (!recordDoc.exists) {
          return NextResponse.json({ error: `Record not found: ${recordId}` }, { status: 404 });
        }

        // Date 문자열을 Date 객체로 변환
        const processedUpdates = { ...updates };
        for (const key of ['periodStart', 'periodEnd', 'billingDate', 'changedAt']) {
          if (processedUpdates[key] && typeof processedUpdates[key] === 'string') {
            processedUpdates[key] = new Date(processedUpdates[key]);
          }
        }

        await recordRef.update({
          ...processedUpdates,
          updatedAt: FieldValue.serverTimestamp(),
        });

        return NextResponse.json({
          success: true,
          action: 'update',
          recordId,
          updates: processedUpdates,
        });
      }

      case 'add': {
        // 새 레코드 추가
        if (!newRecord) {
          return NextResponse.json({ error: 'newRecord is required for add action' }, { status: 400 });
        }

        // Date 문자열을 Date 객체로 변환
        const processedRecord = { ...newRecord };
        for (const key of ['periodStart', 'periodEnd', 'billingDate', 'changedAt']) {
          if (processedRecord[key] && typeof processedRecord[key] === 'string') {
            processedRecord[key] = new Date(processedRecord[key]);
          }
        }

        const docRef = await historyRef.add({
          ...processedRecord,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });

        return NextResponse.json({
          success: true,
          action: 'add',
          newRecordId: docRef.id,
          record: processedRecord,
        });
      }

      case 'delete': {
        // 특정 레코드 삭제
        if (!recordId) {
          return NextResponse.json({ error: 'recordId is required for delete action' }, { status: 400 });
        }

        const recordRef = historyRef.doc(recordId);
        const recordDoc = await recordRef.get();

        if (!recordDoc.exists) {
          return NextResponse.json({ error: `Record not found: ${recordId}` }, { status: 404 });
        }

        await recordRef.delete();

        return NextResponse.json({
          success: true,
          action: 'delete',
          recordId,
        });
      }

      case 'complete_active': {
        // active 상태인 레코드를 completed로 변경
        const activeRecords = await historyRef
          .where('status', '==', 'active')
          .get();

        if (activeRecords.empty) {
          return NextResponse.json({
            success: false,
            message: 'No active records found',
          });
        }

        const updatedRecords: string[] = [];
        for (const doc of activeRecords.docs) {
          await doc.ref.update({
            status: 'completed',
            periodEnd: updates?.periodEnd ? new Date(updates.periodEnd) : new Date(),
            updatedAt: FieldValue.serverTimestamp(),
          });
          updatedRecords.push(doc.id);
        }

        return NextResponse.json({
          success: true,
          action: 'complete_active',
          updatedRecords,
        });
      }

      default:
        return NextResponse.json({ error: 'Invalid action. Use: update, add, delete, complete_active' }, { status: 400 });
    }
  } catch (error) {
    console.error('Fix subscription history error:', error);
    return NextResponse.json(
      { error: 'Failed to fix subscription history' },
      { status: 500 }
    );
  }
}
