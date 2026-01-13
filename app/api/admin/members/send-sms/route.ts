import { NextRequest, NextResponse } from 'next/server';
import { getAdminFromRequest, hasPermission } from '@/lib/admin-auth';
import { sendSMS, sendLMS } from '@/lib/ncp-sens';
import { initializeFirebaseAdmin } from '@/lib/firebase-admin';

// POST: SMS 발송
export async function POST(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);

    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(admin, 'members:write')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { phones, message } = body;

    if (!phones || !Array.isArray(phones) || phones.length === 0) {
      return NextResponse.json(
        { error: '수신자를 선택해주세요.' },
        { status: 400 }
      );
    }

    if (!message || !message.trim()) {
      return NextResponse.json(
        { error: '메시지를 입력해주세요.' },
        { status: 400 }
      );
    }

    // 유효한 전화번호만 필터링
    const validPhones = phones.filter((p: string) => p && p.trim());

    if (validPhones.length === 0) {
      return NextResponse.json(
        { error: '유효한 전화번호가 없습니다.' },
        { status: 400 }
      );
    }

    const trimmedMessage = message.trim();
    const isLMS = trimmedMessage.length > 90;

    // 각 전화번호로 SMS 발송
    let sentCount = 0;
    const errors: string[] = [];

    for (const phone of validPhones) {
      try {
        if (isLMS) {
          await sendLMS(phone, trimmedMessage);
        } else {
          await sendSMS(phone, trimmedMessage);
        }
        sentCount++;
      } catch (error) {
        console.error(`SMS 발송 실패 (${phone}):`, error);
        errors.push(phone);
      }
    }

    if (sentCount === 0) {
      return NextResponse.json(
        { error: 'SMS 발송에 실패했습니다.' },
        { status: 500 }
      );
    }

    // 발송 내역 저장
    const db = initializeFirebaseAdmin();
    if (db) {
      try {
        await db.collection('smsHistory').add({
          type: isLMS ? 'LMS' : 'SMS',
          message: trimmedMessage,
          recipients: validPhones,
          recipientCount: validPhones.length,
          sentCount,
          failedCount: errors.length,
          failedPhones: errors.length > 0 ? errors : null,
          sentBy: admin.adminId,
          sentByName: admin.name || admin.adminId,
          sentAt: new Date(),
        });
      } catch (logError) {
        console.error('SMS 발송 내역 저장 실패:', logError);
        // 발송은 성공했으므로 로그 실패는 무시
      }
    }

    return NextResponse.json({
      success: true,
      sentCount,
      failedCount: errors.length,
      message: errors.length > 0
        ? `${sentCount}건 발송 완료, ${errors.length}건 실패`
        : `${sentCount}건 발송 완료`,
    });
  } catch (error) {
    console.error('Send SMS error:', error);
    return NextResponse.json(
      { error: 'SMS 발송 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
