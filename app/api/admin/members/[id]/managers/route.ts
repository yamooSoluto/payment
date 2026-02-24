import { NextRequest, NextResponse } from 'next/server';
import { getAdminFromRequest } from '@/lib/admin-auth';
import { getManagersByMaster } from '@/lib/manager-auth';

// GET: 해당 마스터 이메일의 매니저 목록 조회
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const masterEmail = decodeURIComponent(id);

    const managers = await getManagersByMaster(masterEmail);

    return NextResponse.json(
      managers.map(m => ({
        managerId: m.managerId,
        loginId: m.loginId,
        name: m.name,
        phone: m.phone,
        active: m.active,
        tenantCount: m.tenants.length,
        tenants: m.tenants,
        createdAt: m.createdAt.toISOString(),
        updatedAt: m.updatedAt.toISOString(),
      }))
    );
  } catch (error) {
    console.error('Admin member managers fetch error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
