import { NextRequest, NextResponse } from 'next/server';
import { getAdminFromRequest, hasPermission } from '@/lib/admin-auth';
import { addAdminLog } from '@/lib/admin-log';
import { initializeFirebaseAdmin } from '@/lib/firebase-admin';

// ═══════════════════════════════════════════════════════════
// Vector Template Broadcast API
// 특정 템플릿을 전체 활성 테넌트에 적용
// ═══════════════════════════════════════════════════════════

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

    const { templateId } = await request.json();

    if (!templateId) {
      return NextResponse.json({ error: 'templateId is required' }, { status: 400 });
    }

    // 템플릿 존재 확인
    const templateDoc = await db.collection('vector_templates').doc(templateId).get();
    if (!templateDoc.exists) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    const templateData = templateDoc.data();
    if (!templateData?.isActive) {
      return NextResponse.json({ error: 'Template is not active' }, { status: 400 });
    }

    // datapage broadcast API 호출
    const datapageUrl = process.env.NEXT_PUBLIC_DATAPAGE_URL || 'http://localhost:3001';
    const broadcastRes = await fetch(`${datapageUrl}/api/vector-templates/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ templateId, broadcast: true }),
    });

    const broadcastResult = await broadcastRes.json();

    // 로그 기록
    await addAdminLog(db, admin, {
      action: 'settings_site_update',
      details: {
        type: 'vector_template_broadcast',
        templateId,
        result: {
          totalTenants: broadcastResult.totalTenants,
          syncedTenants: broadcastResult.syncedTenants,
          failedTenants: broadcastResult.failedTenants,
        },
      },
    });

    console.log(`[vector-templates/broadcast] Template ${templateId} broadcasted:`, broadcastResult);

    return NextResponse.json({
      success: true,
      message: `${broadcastResult.syncedTenants}개 테넌트에 적용되었습니다.`,
      ...broadcastResult,
    });

  } catch (error: any) {
    console.error('Broadcast error:', error);
    return NextResponse.json(
      { error: '브로드캐스트 중 오류가 발생했습니다.', message: error.message },
      { status: 500 }
    );
  }
}