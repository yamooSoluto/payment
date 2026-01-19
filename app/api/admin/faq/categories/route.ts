import { NextRequest, NextResponse } from 'next/server';
import { getAdminFromRequest, hasPermission } from '@/lib/admin-auth';
import { initializeFirebaseAdmin } from '@/lib/firebase-admin';

// GET: 카테고리 목록 조회
export async function GET(request: NextRequest) {
    try {
        const admin = await getAdminFromRequest(request);

        if (!admin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        if (!hasPermission(admin, 'faq:read')) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const db = initializeFirebaseAdmin();
        if (!db) {
            return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
        }

        // 1. 저장된 카테고리 목록 (web_faq_categories)
        const categorySnapshot = await db.collection('web_faq_categories')
            .orderBy('order', 'asc')
            .get();

        const savedCategories = categorySnapshot.docs.map(doc => ({
            id: doc.id,
            name: doc.data().name as string,
            order: doc.data().order as number,
        }));

        // 2. 실제 사용 중인 카테고리 목록 (FAQ 문서들에서)
        const faqSnapshot = await db.collection('web_faq').get();
        const usedCategories = new Set<string>();
        faqSnapshot.docs.forEach(doc => {
            const data = doc.data();
            if (data.category) {
                usedCategories.add(data.category);
            }
        });

        // 3. 병합 (저장된 카테고리 + 사용 중이지만 저장 안 된 카테고리)
        // 저장된 카테고리에 없는 사용 중인 카테고리는 자동으로 추가해주는 것이 좋음 (마이그레이션 효과)
        const mergedCategories = [...savedCategories];
        const savedCategoryNames = new Set(savedCategories.map(c => c.name));

        // 카테고리 자동 등록 (없는 경우)
        const batch = db.batch();
        let batchCount = 0;
        let nextOrder = savedCategories.length > 0 ? Math.max(...savedCategories.map(c => c.order)) + 1 : 0;

        for (const catName of Array.from(usedCategories)) {
            if (!savedCategoryNames.has(catName)) {
                const newDocRef = db.collection('web_faq_categories').doc();
                batch.set(newDocRef, {
                    name: catName,
                    order: nextOrder++,
                    createdAt: new Date(),
                });
                batchCount++;
                mergedCategories.push({
                    id: newDocRef.id,
                    name: catName,
                    order: nextOrder - 1,
                });
            }
        }

        if (batchCount > 0) {
            await batch.commit();
        }

        // 이름 순 정렬 대신 order 순 정렬 반환
        mergedCategories.sort((a, b) => a.order - b.order);

        return NextResponse.json({ categories: mergedCategories });
    } catch (error) {
        console.error('Get categories error:', error);
        return NextResponse.json(
            { error: '카테고리 목록을 불러오는 중 오류가 발생했습니다.' },
            { status: 500 }
        );
    }
}

// POST: 카테고리 추가
export async function POST(request: NextRequest) {
    try {
        const admin = await getAdminFromRequest(request);

        if (!admin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        if (!hasPermission(admin, 'faq:write')) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const db = initializeFirebaseAdmin();
        if (!db) {
            return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
        }

        const body = await request.json();
        const { name } = body;

        if (!name) {
            return NextResponse.json({ error: '카테고리명은 필수입니다.' }, { status: 400 });
        }

        // 중복 확인
        const snapshot = await db.collection('web_faq_categories')
            .where('name', '==', name)
            .get();

        if (!snapshot.empty) {
            return NextResponse.json({ error: '이미 존재하는 카테고리입니다.' }, { status: 400 });
        }

        // 최대 order 조회
        const maxOrderSnapshot = await db.collection('web_faq_categories')
            .orderBy('order', 'desc')
            .limit(1)
            .get();

        const maxOrder = maxOrderSnapshot.empty ? -1 : (maxOrderSnapshot.docs[0].data().order || 0);

        const docRef = await db.collection('web_faq_categories').add({
            name,
            order: maxOrder + 1,
            createdAt: new Date(),
            createdBy: admin.adminId,
        });

        return NextResponse.json({
            success: true,
            category: {
                id: docRef.id,
                name,
                order: maxOrder + 1,
            },
        });
    } catch (error) {
        console.error('Create category error:', error);
        return NextResponse.json(
            { error: '카테고리 추가 중 오류가 발생했습니다.' },
            { status: 500 }
        );
    }
}

// DELETE: 카테고리 삭제
export async function DELETE(request: NextRequest) {
    try {
        const admin = await getAdminFromRequest(request);

        if (!admin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        if (!hasPermission(admin, 'faq:write')) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const db = initializeFirebaseAdmin();
        if (!db) {
            return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
        }

        const url = new URL(request.url);
        const name = url.searchParams.get('name');

        if (!name) {
            return NextResponse.json({ error: '카테고리명은 필수입니다.' }, { status: 400 });
        }

        // 1. 카테고리 문서 찾기
        const catSnapshot = await db.collection('web_faq_categories')
            .where('name', '==', name)
            .get();

        const batch = db.batch();

        // 카테고리 메타데이터 삭제
        catSnapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
        });

        // (선택) FAQ들도 삭제할 것인가? 
        // 클라이언트에서 처리하거나 여기서 처리할 수 있는데,
        // 보통은 클라이언트가 확인 후 '삭제' 요청을 보내므로, 여기서는 카테고리 메타데이터만 삭제하거나
        // 요청 파라미터에 따라 다르게 할 수 있음.
        // 하지만 현재 로직상 카테고리 삭제 시 FAQ도 함께 삭제된다는 경고 후 실행되므로, 
        // 여기서 FAQ 삭제도 수행하는 것이 안전함.

        const faqSnapshot = await db.collection('web_faq')
            .where('category', '==', name)
            .get();

        faqSnapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
        });

        await batch.commit();

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Delete category error:', error);
        return NextResponse.json(
            { error: '카테고리 삭제 중 오류가 발생했습니다.' },
            { status: 500 }
        );
    }
}

// PUT: 순서 변경 또는 이름 변경
export async function PUT(request: NextRequest) {
    // ... 이름 변경, 순서 변경 로직 구현 가능
    // 현재는 이름 변경만 구현 (순서는 클라이언트 로직이 복잡해서 일단 보류하거나 별도 API로)
    try {
        const admin = await getAdminFromRequest(request);

        if (!admin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        if (!hasPermission(admin, 'faq:write')) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const db = initializeFirebaseAdmin();
        if (!db) {
            return NextResponse.json({ error: 'Database unavailable' }, { status: 500 });
        }

        const body = await request.json();
        const { oldName, newName } = body;

        if (!oldName || !newName) {
            return NextResponse.json({ error: '이름 변경에 필요한 정보가 부족합니다.' }, { status: 400 });
        }

        const batch = db.batch();

        // 1. 카테고리 메타데이터 이름 변경
        const catSnapshot = await db.collection('web_faq_categories')
            .where('name', '==', oldName)
            .get();

        catSnapshot.docs.forEach(doc => {
            batch.update(doc.ref, { name: newName });
        });

        // 2. 해당 카테고리를 가진 FAQ들의 category 필드 변경
        const faqSnapshot = await db.collection('web_faq')
            .where('category', '==', oldName)
            .get();

        faqSnapshot.docs.forEach(doc => {
            batch.update(doc.ref, { category: newName });
        });

        await batch.commit();

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Update category error:', error);
        return NextResponse.json(
            { error: '카테고리 수정 중 오류가 발생했습니다.' },
            { status: 500 }
        );
    }
}
