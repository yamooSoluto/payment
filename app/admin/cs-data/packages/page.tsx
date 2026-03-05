'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Package as PackageIcon } from 'iconoir-react';
import Spinner from '@/components/admin/Spinner';

// ═══════════════════════════════════════════════════════════
// 패키지 목록 페이지
// ═══════════════════════════════════════════════════════════

interface PackageSummary {
  id: string;
  name: string;
  description: string;
  faqCount: number;
  appliedTenantCount: number;
  createdAt: string | null;
  updatedAt: string | null;
}

export default function PackagesPage() {
  const router = useRouter();
  const [packages, setPackages] = useState<PackageSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/cs-data/packages');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setPackages(data.packages || []);
    } catch (err) {
      console.error('[packages page] fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreate = async () => {
    const name = prompt('패키지 이름을 입력하세요');
    if (!name?.trim()) return;

    setCreating(true);
    try {
      const res = await fetch('/api/admin/cs-data/packages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), description: '' }),
      });
      if (!res.ok) throw new Error('Failed to create');
      const data = await res.json();
      router.push(`/admin/cs-data/packages/${data.id}`);
    } catch (err) {
      console.error('[packages page] create error:', err);
      alert('패키지 생성에 실패했습니다.');
    } finally {
      setCreating(false);
    }
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return '-';
    const d = new Date(iso);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  };

  return (
    <div className="max-w-5xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">패키지 관리</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            FAQ 템플릿을 패키지로 묶어 여러 매장에 한 번에 적용합니다.
          </p>
        </div>
        <button
          onClick={handleCreate}
          disabled={creating}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 rounded-lg transition-colors disabled:bg-gray-300"
        >
          <Plus className="w-4 h-4" />
          {creating ? '생성 중...' : '새 패키지'}
        </button>
      </div>

      {/* 목록 */}
      {loading ? (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      ) : packages.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <PackageIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">등록된 패키지가 없습니다.</p>
          <p className="text-xs mt-1">새 패키지를 만들어 FAQ 템플릿을 구성하세요.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {packages.map(pkg => (
            <button
              key={pkg.id}
              onClick={() => router.push(`/admin/cs-data/packages/${pkg.id}`)}
              className="flex items-center gap-4 p-4 bg-white rounded-xl border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all text-left w-full"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-gray-900 truncate">{pkg.name}</h3>
                </div>
                {pkg.description && (
                  <p className="text-xs text-gray-400 mt-0.5 truncate">{pkg.description}</p>
                )}
              </div>

              <div className="flex items-center gap-6 text-xs text-gray-500 shrink-0">
                <div className="text-center">
                  <div className="font-semibold text-gray-900">{pkg.faqCount}</div>
                  <div className="text-gray-400">FAQ</div>
                </div>
                <div className="text-center">
                  <div className="font-semibold text-gray-900">{pkg.appliedTenantCount}</div>
                  <div className="text-gray-400">매장</div>
                </div>
                <div className="text-right text-gray-400 w-20">
                  {formatDate(pkg.updatedAt)}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}