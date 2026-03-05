'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { NavArrowLeft, Trash, EditPencil, Check, Xmark } from 'iconoir-react';
import Link from 'next/link';
import Spinner from '@/components/admin/Spinner';
import PackageFaqTab from '@/components/admin/cs-data/PackageFaqTab';
import PackageTenantsTab from '@/components/admin/cs-data/PackageTenantsTab';

// ═══════════════════════════════════════════════════════════
// 패키지 상세 페이지 (탭: FAQ 목록 | 적용 매장)
// ═══════════════════════════════════════════════════════════

type TabType = 'faq' | 'tenants';

interface FaqTemplate {
  id: string;
  questions: string[];
  answer: string;
  guide: string;
  keyDataRefs: string[];
  topic: string;
  tags: string[];
  handlerType: 'bot' | 'staff' | 'conditional';
  handler: 'bot' | 'op' | 'manager';
  rule: string;
  action_product: string | null;
  action: string | null;
}

interface AppliedTenant {
  tenantId: string;
  brandName: string;
  appliedAt: string;
  appliedBy: string;
  faqCount: number;
}

interface PackageData {
  id: string;
  name: string;
  description: string;
  isPublic: boolean;
  requiredTags: string[];
  faqTemplates: FaqTemplate[];
  appliedTenants: AppliedTenant[];
  createdAt: string | null;
  updatedAt: string | null;
}

export default function PackageDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const packageId = params.packageId as string;

  const tabFromUrl = searchParams.get('tab') as TabType | null;
  const initialTab: TabType = tabFromUrl === 'tenants' ? 'tenants' : 'faq';

  const [loading, setLoading] = useState(true);
  const [pkg, setPkg] = useState<PackageData | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);

  // 인라인 편집
  const [editingName, setEditingName] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const [descValue, setDescValue] = useState('');
  const [tagInput, setTagInput] = useState('');

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    const newParams = new URLSearchParams(searchParams.toString());
    newParams.set('tab', tab);
    router.replace(`?${newParams.toString()}`, { scroll: false });
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/cs-data/packages/${packageId}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setPkg(data.package);
      setNameValue(data.package.name);
      setDescValue(data.package.description);
    } catch (err) {
      console.error('[package detail] fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [packageId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // 이름/설명 저장
  const handleSaveMeta = async (field: 'name' | 'description', value: string) => {
    try {
      const res = await fetch(`/api/admin/cs-data/packages/${packageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      });
      if (!res.ok) throw new Error('Failed to update');
      setPkg(prev => prev ? { ...prev, [field]: value } : prev);
    } catch (err) {
      console.error('[package detail] update meta error:', err);
      alert('저장 실패');
    }
    if (field === 'name') setEditingName(false);
    if (field === 'description') setEditingDesc(false);
  };

  // faqTemplates 업데이트
  const handleUpdateTemplates = useCallback(async (templates: FaqTemplate[]) => {
    try {
      const res = await fetch(`/api/admin/cs-data/packages/${packageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ faqTemplates: templates }),
      });
      if (!res.ok) throw new Error('Failed to update');
      setPkg(prev => prev ? { ...prev, faqTemplates: templates } : prev);
    } catch (err) {
      console.error('[package detail] update templates error:', err);
      alert('저장 실패');
      throw err;
    }
  }, [packageId]);

  // 패키지 삭제
  const handleDelete = async () => {
    if (!pkg) return;
    const hasApplied = pkg.appliedTenants.length > 0;

    if (hasApplied) {
      const doForce = confirm(
        `이 패키지가 ${pkg.appliedTenants.length}개 매장에 적용되어 있습니다.\n강제 삭제하시겠습니까?`
      );
      if (!doForce) return;
      const res = await fetch(`/api/admin/cs-data/packages/${packageId}?force=true`, { method: 'DELETE' });
      if (!res.ok) { alert('삭제 실패'); return; }
    } else {
      if (!confirm('이 패키지를 삭제하시겠습니까?')) return;
      const res = await fetch(`/api/admin/cs-data/packages/${packageId}`, { method: 'DELETE' });
      if (!res.ok) { alert('삭제 실패'); return; }
    }

    router.push('/admin/cs-data/packages');
  };

  // requiredTags 업데이트
  const handleUpdateTags = async (newTags: string[]) => {
    try {
      const res = await fetch(`/api/admin/cs-data/packages/${packageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requiredTags: newTags }),
      });
      if (!res.ok) throw new Error('Failed');
      setPkg(prev => prev ? { ...prev, requiredTags: newTags } : prev);
    } catch { alert('태그 저장 실패'); }
  };

  const handleAddTag = () => {
    const tag = tagInput.trim().toLowerCase();
    if (!tag || !pkg) return;
    if (pkg.requiredTags.includes(tag)) { setTagInput(''); return; }
    handleUpdateTags([...pkg.requiredTags, tag]);
    setTagInput('');
  };

  const handleRemoveTag = (tag: string) => {
    if (!pkg) return;
    handleUpdateTags(pkg.requiredTags.filter(t => t !== tag));
  };

  // 적용 매장 변경 후 리프레시
  const handleTenantsChanged = useCallback(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }

  if (!pkg) {
    return (
      <div className="text-center py-20 text-gray-400">
        패키지를 찾을 수 없습니다.
      </div>
    );
  }

  const tabs = [
    { id: 'faq' as TabType, label: 'FAQ 목록', count: pkg.faqTemplates.length },
    { id: 'tenants' as TabType, label: '적용 매장', count: pkg.appliedTenants.length },
  ];

  return (
    <div className="max-w-7xl mx-auto">
      {/* 상단 네비게이션 */}
      <div className="flex items-center gap-2 mb-4">
        <Link
          href="/admin/cs-data/packages"
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <NavArrowLeft className="w-4 h-4" />
          패키지 목록
        </Link>
      </div>

      {/* 패키지 헤더 */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex-1">
          {/* 이름 */}
          {editingName ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={nameValue}
                onChange={e => setNameValue(e.target.value)}
                onKeyDown={e => {
                  if (e.nativeEvent.isComposing) return;
                  if (e.key === 'Enter') handleSaveMeta('name', nameValue);
                  if (e.key === 'Escape') { setNameValue(pkg.name); setEditingName(false); }
                }}
                className="text-xl font-bold text-gray-900 border border-blue-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
              <button onClick={() => handleSaveMeta('name', nameValue)} className="p-1 text-blue-600 hover:bg-blue-50 rounded">
                <Check className="w-4 h-4" />
              </button>
              <button onClick={() => { setNameValue(pkg.name); setEditingName(false); }} className="p-1 text-gray-400 hover:bg-gray-50 rounded">
                <Xmark className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <h1
              onClick={() => setEditingName(true)}
              className="text-xl font-bold text-gray-900 cursor-pointer hover:text-blue-600 transition-colors inline-flex items-center gap-2"
            >
              {pkg.name}
              <EditPencil className="w-3.5 h-3.5 text-gray-300" />
            </h1>
          )}

          {/* 설명 */}
          {editingDesc ? (
            <div className="flex items-center gap-2 mt-1">
              <input
                autoFocus
                value={descValue}
                onChange={e => setDescValue(e.target.value)}
                onKeyDown={e => {
                  if (e.nativeEvent.isComposing) return;
                  if (e.key === 'Enter') handleSaveMeta('description', descValue);
                  if (e.key === 'Escape') { setDescValue(pkg.description); setEditingDesc(false); }
                }}
                placeholder="설명 입력..."
                className="flex-1 max-w-md text-sm text-gray-500 border border-blue-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
              <button onClick={() => handleSaveMeta('description', descValue)} className="p-1 text-blue-600 hover:bg-blue-50 rounded">
                <Check className="w-4 h-4" />
              </button>
              <button onClick={() => { setDescValue(pkg.description); setEditingDesc(false); }} className="p-1 text-gray-400 hover:bg-gray-50 rounded">
                <Xmark className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <p
              onClick={() => setEditingDesc(true)}
              className="text-sm text-gray-500 mt-0.5 cursor-pointer hover:text-blue-500 transition-colors inline-flex items-center gap-1"
            >
              {pkg.description || '설명을 입력하세요...'}
              <EditPencil className="w-3 h-3 text-gray-300" />
            </p>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* 공개 토글 */}
          <button
            onClick={async () => {
              const next = !pkg.isPublic;
              try {
                const res = await fetch(`/api/admin/cs-data/packages/${packageId}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ isPublic: next }),
                });
                if (!res.ok) throw new Error('Failed');
                setPkg(prev => prev ? { ...prev, isPublic: next } : prev);
              } catch { alert('저장 실패'); }
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              pkg.isPublic
                ? 'bg-green-50 text-green-700 hover:bg-green-100'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${pkg.isPublic ? 'bg-green-500' : 'bg-gray-400'}`} />
            {pkg.isPublic ? '공개' : '비공개'}
          </button>

          <button
            onClick={handleDelete}
            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
            title="패키지 삭제"
          >
            <Trash className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 노출 조건 태그 */}
      <div className="mb-6 p-4 bg-gray-50 rounded-xl">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-medium text-gray-600">노출 조건 태그</span>
          <span className="text-[11px] text-gray-400">
            {pkg.requiredTags.length === 0 ? '전체 공개 (태그 없음)' : '해당 태그를 가진 매장에만 노출'}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {pkg.requiredTags.map(tag => (
            <span key={tag} className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded-lg">
              {tag}
              <button
                onClick={() => handleRemoveTag(tag)}
                className="text-blue-400 hover:text-blue-600 ml-0.5"
              >
                <Xmark className="w-3 h-3" />
              </button>
            </span>
          ))}
          <div className="inline-flex items-center">
            <input
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => {
                if (e.nativeEvent.isComposing) return;
                if (e.key === 'Enter') { e.preventDefault(); handleAddTag(); }
              }}
              placeholder="태그 추가..."
              className="w-28 px-2 py-1 text-xs bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-300"
            />
          </div>
        </div>
      </div>

      {/* 탭 바 */}
      <div className="flex border-b border-gray-100 mb-4">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? 'text-blue-600 border-b-2 border-blue-600 -mb-px'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
            <span className={`text-xs px-1.5 py-0.5 rounded-full ${
              activeTab === tab.id ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'
            }`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* 탭 콘텐츠 */}
      {activeTab === 'faq' && (
        <PackageFaqTab
          faqTemplates={pkg.faqTemplates}
          onUpdateTemplates={handleUpdateTemplates}
          appliedStores={pkg.appliedTenants.map(t => t.brandName)}
        />
      )}
      {activeTab === 'tenants' && (
        <PackageTenantsTab
          packageId={packageId}
          appliedTenants={pkg.appliedTenants}
          onChanged={handleTenantsChanged}
        />
      )}
    </div>
  );
}