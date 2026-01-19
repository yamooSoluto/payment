import { NextRequest, NextResponse } from 'next/server';
import { getAdminFromRequest, hasPermission } from '@/lib/admin-auth';
import { getAdminStorage } from '@/lib/firebase-admin';

export async function POST(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);

    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(admin, 'siteSettings:write')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const storage = getAdminStorage();
    if (!storage) {
      return NextResponse.json({ error: 'Storage unavailable' }, { status: 500 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const type = formData.get('type') as string;

    if (!file) {
      return NextResponse.json({ error: 'File is required' }, { status: 400 });
    }

    if (!type || !['logo', 'favicon', 'ogImage'].includes(type)) {
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
    }

    // 파일 확장자 추출
    const extension = file.name.split('.').pop()?.toLowerCase() || 'png';
    const allowedExtensions = ['jpg', 'jpeg', 'png', 'gif', 'svg', 'ico', 'webp'];

    if (!allowedExtensions.includes(extension)) {
      return NextResponse.json(
        { error: '지원하지 않는 파일 형식입니다.' },
        { status: 400 }
      );
    }

    // 파일 크기 제한 (5MB)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: '파일 크기는 5MB를 초과할 수 없습니다.' },
        { status: 400 }
      );
    }

    // 고정 파일명 사용 (덮어쓰기)
    const fileName = `site-assets/${type}.${extension}`;

    // 파일 버퍼로 변환
    const buffer = Buffer.from(await file.arrayBuffer());

    // Firebase Storage에 업로드
    const bucket = storage.bucket();

    // 기존 파일 삭제 (확장자가 다를 수 있으므로 같은 type의 모든 파일 삭제)
    try {
      const [files] = await bucket.getFiles({ prefix: `site-assets/${type}.` });
      for (const oldFile of files) {
        await oldFile.delete();
      }
    } catch {
      // 기존 파일이 없어도 무시
    }

    const fileRef = bucket.file(fileName);

    await fileRef.save(buffer, {
      metadata: {
        contentType: file.type,
        metadata: {
          uploadedBy: admin.adminId,
          uploadedAt: new Date().toISOString(),
        },
      },
    });

    // 파일을 공개로 설정
    await fileRef.makePublic();

    // 공개 URL 생성
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;

    return NextResponse.json({
      success: true,
      url: publicUrl,
      fileName,
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: '파일 업로드 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
