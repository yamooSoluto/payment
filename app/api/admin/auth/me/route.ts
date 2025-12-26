import { NextRequest, NextResponse } from 'next/server';
import { getAdminFromRequest } from '@/lib/admin-auth';

export async function GET(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);

    if (!admin) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    return NextResponse.json({
      admin: {
        id: admin.adminId,
        loginId: admin.loginId,
        name: admin.name,
        role: admin.role,
      },
    });
  } catch (error) {
    console.error('Get admin error:', error);
    return NextResponse.json(
      { error: '관리자 정보를 가져오는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
