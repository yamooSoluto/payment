'use client';

import { useState, useRef, useEffect } from 'react';
import { Sofa, Plus, EditPencil, Trash, MoreHoriz } from 'iconoir-react';
import { INDUSTRY_OPTIONS, INDUSTRY_LABEL_TO_CODE } from '@/lib/constants';
import Spinner from '@/components/admin/Spinner';
import { TenantInfo, getStatusBadge, getPlanName } from './types';

interface TenantListSectionProps {
  tenants: TenantInfo[];
  memberDeleted?: boolean;
  onAddTenant: () => void;
  onEditTenant: (tenant: TenantInfo) => void;
  onDeleteTenant: (tenant: TenantInfo) => void;
  deletingTenantId: string | null;
}

export default function TenantListSection({ tenants, memberDeleted, onAddTenant, onEditTenant, onDeleteTenant, deletingTenantId }: TenantListSectionProps) {
  const [filterIndustry, setFilterIndustry] = useState<string[]>([]);
  const [filterStatus, setFilterStatus] = useState<string[]>([]);
  const [filterPlan, setFilterPlan] = useState<string[]>([]);
  const [filterOpen, setFilterOpen] = useState<string | null>(null);
  const filterRef = useRef<HTMLDivElement>(null);
  const [actionDropdown, setActionDropdown] = useState<string | null>(null);
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number } | null>(null);
  const actionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) setFilterOpen(null);
      if (actionRef.current && !actionRef.current.contains(event.target as Node)) { setActionDropdown(null); setDropdownPosition(null); }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleFilter = (type: 'industry' | 'status' | 'plan', value: string) => {
    const setter = type === 'industry' ? setFilterIndustry : type === 'status' ? setFilterStatus : setFilterPlan;
    setter(prev => prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]);
  };

  const filteredTenants = tenants.filter((tenant) => {
    if (filterIndustry.length > 0) {
      const industryCode = tenant.industry || '';
      const normalizedCode = INDUSTRY_LABEL_TO_CODE[industryCode] || industryCode;
      if (!filterIndustry.includes(normalizedCode)) return false;
    }
    const tenantStatus = tenant.deleted ? 'deleted' : (tenant.subscription?.status || 'none');
    const includeDeleted = filterStatus.includes('deleted');
    const otherFilters = filterStatus.filter(s => s !== 'deleted');
    if (tenantStatus === 'deleted') { if (!includeDeleted) return false; }
    if (otherFilters.length > 0 && tenantStatus !== 'deleted') { if (!otherFilters.includes(tenantStatus)) return false; }
    if (filterPlan.length > 0 && !filterPlan.includes(tenant.subscription?.plan || '')) return false;
    return true;
  });

  const renderStatusBadge = (status: string | null | undefined, cancelMode?: string, pendingPlan?: string | null) => {
    const badge = getStatusBadge(status, 'sm', cancelMode, pendingPlan);
    return (
      <span className={badge.style}>
        {badge.label}
        {badge.pendingIndicator && <span className="text-blue-500 ml-0.5">{badge.pendingIndicator}</span>}
      </span>
    );
  };

  return (
    <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm border border-gray-100 overflow-visible">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Sofa className="w-5 h-5 text-blue-600" />
          <h2 className="text-lg font-semibold">매장 목록</h2>
          <span className="text-sm text-gray-400">({tenants.length})</span>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap" ref={filterRef}>
          {tenants.length > 0 && (
            <>
              <div className="relative">
                <button onClick={() => setFilterOpen(filterOpen === 'industry' ? null : 'industry')} className={`px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm border rounded-lg flex items-center gap-1 whitespace-nowrap ${filterIndustry.length > 0 ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-700 hover:bg-gray-50'}`}>
                  업종 {filterIndustry.length > 0 && <span className="bg-blue-500 text-white text-xs px-1.5 rounded-full">{filterIndustry.length}</span>}
                </button>
                {filterOpen === 'industry' && (
                  <div className="absolute top-full mt-1 right-0 bg-white border border-gray-200 rounded-lg shadow-lg py-2 z-20 min-w-[160px]">
                    {INDUSTRY_OPTIONS.map((opt) => (
                      <label key={opt.value} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer">
                        <input type="checkbox" checked={filterIndustry.includes(opt.value)} onChange={() => toggleFilter('industry', opt.value)} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                        <span className="text-sm text-gray-700">{opt.label}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
              <div className="relative">
                <button onClick={() => setFilterOpen(filterOpen === 'status' ? null : 'status')} className={`px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm border rounded-lg flex items-center gap-1 whitespace-nowrap ${filterStatus.length > 0 ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-700 hover:bg-gray-50'}`}>
                  상태 {filterStatus.length > 0 && <span className="bg-blue-500 text-white text-xs px-1.5 rounded-full">{filterStatus.length}</span>}
                </button>
                {filterOpen === 'status' && (
                  <div className="absolute top-full mt-1 right-0 bg-white border border-gray-200 rounded-lg shadow-lg py-2 z-20 min-w-[120px]">
                    {[{ value: 'active', label: '구독중' }, { value: 'trial', label: '체험중' }, { value: 'canceled', label: '해지 예정' }, { value: 'expired', label: '만료' }, { value: 'deleted', label: '삭제' }, { value: 'none', label: '미구독' }].map((opt) => (
                      <label key={opt.value} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer">
                        <input type="checkbox" checked={filterStatus.includes(opt.value)} onChange={() => toggleFilter('status', opt.value)} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                        <span className="text-sm text-gray-700">{opt.label}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
              <div className="relative">
                <button onClick={() => setFilterOpen(filterOpen === 'plan' ? null : 'plan')} className={`px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm border rounded-lg flex items-center gap-1 whitespace-nowrap ${filterPlan.length > 0 ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-700 hover:bg-gray-50'}`}>
                  플랜 {filterPlan.length > 0 && <span className="bg-blue-500 text-white text-xs px-1.5 rounded-full">{filterPlan.length}</span>}
                </button>
                {filterOpen === 'plan' && (
                  <div className="absolute top-full mt-1 right-0 bg-white border border-gray-200 rounded-lg shadow-lg py-2 z-20 min-w-[120px]">
                    {[{ value: 'trial', label: 'Trial' }, { value: 'basic', label: 'Basic' }, { value: 'business', label: 'Business' }, { value: 'enterprise', label: 'Enterprise' }].map((opt) => (
                      <label key={opt.value} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer">
                        <input type="checkbox" checked={filterPlan.includes(opt.value)} onChange={() => toggleFilter('plan', opt.value)} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                        <span className="text-sm text-gray-700">{opt.label}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
          {!memberDeleted && (
            <button onClick={onAddTenant} className="flex items-center gap-1 px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors whitespace-nowrap">
              <Plus className="w-3 h-3 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">매장 추가</span>
              <span className="sm:hidden">추가</span>
            </button>
          )}
        </div>
      </div>
      {tenants.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-gray-500 mb-2">등록된 매장이 없습니다.</p>
          {!memberDeleted && <button onClick={onAddTenant} className="text-sm text-blue-600 hover:underline">새 매장 추가하기</button>}
        </div>
      ) : (
        <div className="overflow-x-auto -mx-6 px-6">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-3 py-3 text-center font-medium text-gray-600 whitespace-nowrap">No.</th>
                <th className="px-3 py-3 text-center font-medium text-gray-600 whitespace-nowrap">tenantId</th>
                <th className="px-3 py-3 text-center font-medium text-gray-600 whitespace-nowrap">매장명</th>
                <th className="px-3 py-3 text-center font-medium text-gray-600 whitespace-nowrap">업종</th>
                <th className="px-3 py-3 text-center font-medium text-gray-600 whitespace-nowrap">상태</th>
                <th className="px-3 py-3 text-center font-medium text-gray-600 whitespace-nowrap">플랜</th>
                <th className="px-3 py-3 text-center font-medium text-gray-600 whitespace-nowrap">시작일</th>
                <th className="px-3 py-3 text-center font-medium text-gray-600 whitespace-nowrap">종료일</th>
                <th className="px-3 py-3 text-center font-medium text-gray-600 whitespace-nowrap">다음 결제일</th>
                <th className="px-3 py-3 text-center font-medium text-gray-600 whitespace-nowrap">액션</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredTenants.map((tenant, index) => (
                <tr key={tenant.tenantId} className={`hover:bg-gray-50 transition-colors ${deletingTenantId === tenant.tenantId ? 'opacity-50 pointer-events-none' : ''} ${tenant.deleted ? 'bg-red-50/50' : ''}`}>
                  <td className="px-3 py-3 text-center text-gray-500 whitespace-nowrap">{index + 1}</td>
                  <td className="px-3 py-3 text-center"><span className="text-xs text-gray-500 font-mono">{tenant.tenantId}</span></td>
                  <td className="px-3 py-3 text-center font-medium text-gray-900 whitespace-nowrap">{tenant.brandName}</td>
                  <td className="px-3 py-3 text-center text-gray-600 whitespace-nowrap">{INDUSTRY_OPTIONS.find(opt => opt.value === tenant.industry)?.label || tenant.industry || '-'}</td>
                  <td className="px-3 py-3 text-center whitespace-nowrap">
                    {deletingTenantId === tenant.tenantId ? <Spinner size="sm" /> : tenant.deleted ? renderStatusBadge('deleted') : renderStatusBadge(tenant.subscription?.status, tenant.subscription?.cancelMode, tenant.subscription?.pendingPlan)}
                  </td>
                  <td className="px-3 py-3 text-center text-gray-600 whitespace-nowrap">{tenant.deleted ? <span className="text-gray-400">-</span> : getPlanName(tenant.subscription?.plan)}</td>
                  <td className="px-3 py-3 text-center text-gray-600 whitespace-nowrap">{tenant.subscription?.currentPeriodStart ? new Date(tenant.subscription.currentPeriodStart).toLocaleDateString('ko-KR') : '-'}</td>
                  <td className="px-3 py-3 text-center text-gray-600 whitespace-nowrap">{tenant.subscription?.currentPeriodEnd ? new Date(tenant.subscription.currentPeriodEnd).toLocaleDateString('ko-KR') : '-'}</td>
                  <td className="px-3 py-3 text-center text-gray-600 whitespace-nowrap">{tenant.subscription?.nextBillingDate && tenant.subscription?.status !== 'expired' && tenant.subscription?.status !== 'canceled' ? new Date(tenant.subscription.nextBillingDate).toLocaleDateString('ko-KR') : '-'}</td>
                  <td className="px-3 py-3 text-center">
                    {memberDeleted ? (
                      <span className="text-xs text-gray-400">-</span>
                    ) : (
                      <div className="relative" ref={actionDropdown === tenant.tenantId ? actionRef : undefined}>
                        <button
                          onClick={(e) => {
                            if (actionDropdown === tenant.tenantId) { setActionDropdown(null); setDropdownPosition(null); } else {
                              const rect = e.currentTarget.getBoundingClientRect();
                              setDropdownPosition({ top: rect.bottom + 4, left: rect.right - 100 });
                              setActionDropdown(tenant.tenantId);
                            }
                          }}
                          className="p-1.5 text-gray-500 hover:bg-gray-100 rounded transition-colors"
                        >
                          <MoreHoriz className="w-5 h-5" />
                        </button>
                        {actionDropdown === tenant.tenantId && dropdownPosition && (
                          <div className="fixed bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-[9999] min-w-[100px]" style={{ top: dropdownPosition.top, left: dropdownPosition.left }}>
                            {!tenant.deleted ? (
                              <>
                                <button onClick={() => { onEditTenant(tenant); setActionDropdown(null); setDropdownPosition(null); }} className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"><EditPencil className="w-4 h-4" />수정</button>
                                <button onClick={() => { onDeleteTenant(tenant); setActionDropdown(null); setDropdownPosition(null); }} className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"><Trash className="w-4 h-4" />삭제</button>
                              </>
                            ) : null}
                            {tenant.deleted && tenant.deletedAt && (
                              <div className="px-4 py-2 text-xs text-gray-500">삭제일: {new Date(tenant.deletedAt).toLocaleDateString('ko-KR')}</div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
