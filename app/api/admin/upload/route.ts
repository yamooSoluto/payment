import { NextRequest, NextResponse } from 'next/server';
import { getAdminFromRequest, hasPermission } from '@/lib/admin-auth';
import { getAdminStorage } from '@/lib/firebase-admin';

export async function POST(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);

    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(admin, 'settings:write')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const storage = getAdminStorage();
    if (!storage) {
      return NextResponse.json({ error: 'Storage unavailable' }, { status: 500 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const folder = formData.get('folder') as string || 'content';

    if (!file) {
      return NextResponse.json({ error: 'File is required' }, { status: 400 });
    }

    // 파일 확장자 추출
    const extension = file.name.split('.').pop()?.toLowerCase() || 'png';
    const allowedExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp'];

    if (!allowedExtensions.includes(extension)) {
      return NextResponse.json(
        { error: '지원하지 않는 파일 형식입니다. (jpg, png, gif, webp만 가능)' },
        { status: 400 }
      );
    }

    // 파일 크기 제한 (10MB)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: '파일 크기는 10MB를 초과할 수 없습니다.' },
        { status: 400 }
      );
    }

    // 고유 파일명 생성
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 8);
    const fileName = `${folder}/${timestamp}-${randomStr}.${extension}`;

    // 파일 버퍼로 변환
    const buffer = Buffer.from(await file.arrayBuffer());

    // Firebase Storage에 업로드
    const bucket = storage.bucket();
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

// DELETE: 이미지 삭제
export async function DELETE(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);

    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(admin, 'settings:write')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const storage = getAdminStorage();
    if (!storage) {
      return NextResponse.json({ error: 'Storage unavailable' }, { status: 500 });
    }

    const { url } = await request.json();

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    // URL에서 파일 경로 추출
    const bucket = storage.bucket();
    const bucketName = bucket.name;
    const prefix = `https://storage.googleapis.com/${bucketName}/`;

    if (!url.startsWith(prefix)) {
      return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
    }

    const fileName = url.replace(prefix, '');

    // 파일 삭제
    try {
      await bucket.file(fileName).delete();
    } catch (err) {
      // 파일이 이미 없어도 에러로 처리하지 않음
      console.log('File may already be deleted:', fileName);
    }

    return NextResponse.json({
      success: true,
      message: '이미지가 삭제되었습니다.',
    });
  } catch (error) {
    console.error('Delete image error:', error);
    return NextResponse.json(
      { error: '이미지 삭제 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
