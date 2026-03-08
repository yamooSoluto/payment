'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Spinner from '@/components/admin/Spinner';

// ═══════════════════════════════════════════════════════════
// 패키지 상세 → 통합 관리 페이지로 리다이렉트
// (기존 딥링크 호환)
// ═══════════════════════════════════════════════════════════

export default function PackageDetailPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/admin/cs-data/packages');
  }, [router]);

  return (
    <div className="flex justify-center py-20">
      <Spinner />
    </div>
  );
}
