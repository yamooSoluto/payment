'use client';

import { useState, useEffect, useCallback } from 'react';
import Spinner from '@/components/admin/Spinner';
import PackageFaqTab, { type PackageData, type RuleOption, type SchemaData } from '@/components/admin/cs-data/PackageFaqTab';
import type { TenantOption } from '@/components/admin/cs-data/PackageTenantsTab';

const SCHEMA_API_URL = process.env.NEXT_PUBLIC_DATAPAGE_URL
  ? `${process.env.NEXT_PUBLIC_DATAPAGE_URL}/api/schema/data-types`
  : 'http://localhost:3001/api/schema/data-types';

// ═══════════════════════════════════════════════════════════
// 패키지 통합 관리 페이지
// ═══════════════════════════════════════════════════════════

export default function PackagesPage() {
  const [packages, setPackages] = useState<PackageData[]>([]);
  const [rules, setRules] = useState<RuleOption[]>([]);
  const [allTenants, setAllTenants] = useState<TenantOption[]>([]);
  const [schemaData, setSchemaData] = useState<SchemaData | null>(null);
  const [tagOptions, setTagOptions] = useState<{ platforms: string[]; services: string[]; brands: string[] }>({ platforms: [], services: [], brands: [] });
  const [loading, setLoading] = useState(true);

  // ── 데이터 로드 ──
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [pkgRes, ruleRes, tenantRes, schemaRes, settingsRes] = await Promise.all([
        fetch('/api/admin/cs-data/packages?full=true'),
        fetch('/api/admin/cs-data/rules'),
        fetch('/api/admin/tenants?limit=200&status=active'),
        fetch(SCHEMA_API_URL).catch(() => null),
        fetch('/api/admin/settings/cs-data').catch(() => null),
      ]);

      if (pkgRes.ok) {
        const data = await pkgRes.json();
        setPackages((data.packages || []).map((p: any) => ({
          id: p.id,
          name: p.name || '',
          description: p.description || '',
          isPublic: p.isPublic || false,
          provisionMode: p.provisionMode || 'manual',
          requiredTags: p.requiredTags || [],
          faqTemplates: p.faqTemplates || [],
          appliedTenants: p.appliedTenants || [],
          createdAt: p.createdAt || null,
          updatedAt: p.updatedAt || null,
        })));
      }

      if (ruleRes.ok) {
        const data = await ruleRes.json();
        setRules((data.rules || []).map((r: any) => ({
          id: r.id,
          platform: r.platform || '-',
          store: r.store || ['공통'],
          label: r.label || '',
          content: r.content || '',
        })));
      }

      let tenantBrands: string[] = [];
      if (tenantRes.ok) {
        const data = await tenantRes.json();
        const tenantList = data.tenants || [];
        setAllTenants(
          tenantList.map((t: any) => ({ tenantId: t.tenantId, brandName: t.brandName }))
        );
        // 테넌트에서 브랜드 목록 수집
        tenantBrands = [...new Set(
          tenantList.map((t: any) => t.brand).filter((b: string) => b && b.trim())
        )] as string[];
      }

      if (schemaRes?.ok) {
        const data = await schemaRes.json();
        setSchemaData(data);
      }

      if (settingsRes?.ok) {
        const data = await settingsRes.json();
        setTagOptions({
          platforms: data.platforms || [],
          services: data.services || [],
          brands: tenantBrands,
        });
      } else {
        setTagOptions(prev => ({ ...prev, brands: tenantBrands }));
      }
    } catch (err) {
      console.error('[packages page] fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── API 핸들러 ──

  const handleCreatePackage = useCallback(async (name: string): Promise<string> => {
    const res = await fetch('/api/admin/cs-data/packages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description: '' }),
    });
    if (!res.ok) throw new Error('패키지 생성 실패');
    const data = await res.json();
    return data.id;
  }, []);

  const handleUpdateTemplates = useCallback(async (packageId: string, templates: any[]) => {
    const res = await fetch(`/api/admin/cs-data/packages/${packageId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ faqTemplates: templates }),
    });
    if (!res.ok) throw new Error('FAQ 저장 실패');
  }, []);

  const handleUpdateMeta = useCallback(async (packageId: string, updates: Record<string, any>) => {
    const res = await fetch(`/api/admin/cs-data/packages/${packageId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error('업데이트 실패');
  }, []);

  const handleDeletePackage = useCallback(async (packageId: string, force?: boolean) => {
    const url = force
      ? `/api/admin/cs-data/packages/${packageId}?force=true`
      : `/api/admin/cs-data/packages/${packageId}`;
    const res = await fetch(url, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || '삭제 실패');
    }
  }, []);

  const handleApplyTenants = useCallback(async (packageId: string, tenantIds: string[]) => {
    const res = await fetch(`/api/admin/cs-data/packages/${packageId}/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantIds }),
    });
    if (!res.ok) throw new Error('적용 실패');
    const data = await res.json();
    alert(`${data.applied}개 매장에 ${data.created}개 FAQ 적용 완료`);
  }, []);

  const handleSyncTenants = useCallback(async (packageId: string, tenantIds?: string[]) => {
    if (!confirm('패키지 변경사항을 적용된 매장에 동기화하시겠습니까?')) return;
    const body = tenantIds ? { tenantIds } : {};
    const res = await fetch(`/api/admin/cs-data/packages/${packageId}/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error('동기화 실패');
    const data = await res.json();
    alert(`동기화 완료: ${data.synced}건 업데이트, ${data.created}건 생성, ${data.deleted}건 삭제, ${data.skipped}건 건너뜀`);
  }, []);

  const handleRemoveTenant = useCallback(async (packageId: string, tenantId: string, brandName: string, mode: 'delete' | 'keep' = 'delete') => {
    const res = await fetch(`/api/admin/cs-data/packages/${packageId}/remove-tenant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantId, mode }),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `매장 제거 실패 (${res.status})`);
    }
    const data = await res.json();
    const msg = mode === 'delete'
      ? `${data.processed}개 FAQ 삭제${data.skippedOverridden > 0 ? ` (${data.skippedOverridden}건 overridden 유지)` : ''}`
      : `${data.processed}개 FAQ를 manual로 전환`;
    alert(msg);
  }, []);

  // ── 렌더링 ──

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-gray-900">패키지 관리</h1>
            <p className="text-sm text-gray-500 mt-0.5">FAQ 템플릿을 패키지로 묶어 여러 매장에 한 번에 적용합니다.</p>
          </div>
        </div>
        <div className="flex justify-center py-20"><Spinner /></div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">패키지 관리</h1>
        <p className="text-sm text-gray-500 mt-0.5">FAQ 템플릿을 패키지로 묶어 여러 매장에 한 번에 적용합니다.</p>
      </div>

      <PackageFaqTab
        packages={packages}
        rules={rules}
        allTenants={allTenants}
        schemaData={schemaData}
        tagOptions={tagOptions}
        onCreatePackage={handleCreatePackage}
        onUpdateTemplates={handleUpdateTemplates}
        onUpdateMeta={handleUpdateMeta}
        onDeletePackage={handleDeletePackage}
        onApplyTenants={handleApplyTenants}
        onSyncTenants={handleSyncTenants}
        onRemoveTenant={handleRemoveTenant}
        onRefresh={fetchData}
      />
    </div>
  );
}
