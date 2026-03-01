'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, Xmark, NavArrowDown } from 'iconoir-react';

// ═══════════════════════════════════════════════════════════
// 타입
// ═══════════════════════════════════════════════════════════

export interface FaqFilters {
  tenantId: string | null;
  source: string | null;
  topic: string | null;
  handler: string | null;
  search: string;
}

interface TenantOption {
  tenantId: string;
  brandName: string;
  branchNo?: string | null;
}

interface CsFaqFiltersProps {
  filters: FaqFilters;
  onFiltersChange: (filters: FaqFilters) => void;
  tenants: TenantOption[];
}

// ═══════════════════════════════════════════════════════════
// 상수
// ═══════════════════════════════════════════════════════════

const SOURCE_OPTIONS = [
  { value: '', label: '전체 소스' },
  { value: 'manual', label: '✏️ 수동' },
  { value: 'template', label: '📋 템플릿' },
  { value: 'library', label: '📚 라이브러리' },
];

const TOPIC_OPTIONS = [
  { value: '', label: '전체 topic' },
  { value: '매장/운영', label: '매장/운영' },
  { value: '공간/환경', label: '공간/환경' },
  { value: '좌석/룸', label: '좌석/룸' },
  { value: '시설/비품', label: '시설/비품' },
  { value: '상품/서비스', label: '상품/서비스' },
  { value: '정책/규정', label: '정책/규정' },
  { value: '결제/환불', label: '결제/환불' },
  { value: '문제/해결', label: '문제/해결' },
  { value: '혜택/이벤트', label: '혜택/이벤트' },
  { value: '기타', label: '기타' },
];

const HANDLER_OPTIONS = [
  { value: '', label: '전체 handler' },
  { value: 'bot', label: 'AI 답변' },
  { value: 'op', label: '운영' },
  { value: 'manager', label: '현장' },
];

// ═══════════════════════════════════════════════════════════
// 컴포넌트
// ═══════════════════════════════════════════════════════════

export default function CsFaqFilters({ filters, onFiltersChange, tenants }: CsFaqFiltersProps) {
  const [searchInput, setSearchInput] = useState(filters.search);
  const [tenantSearch, setTenantSearch] = useState('');
  const [tenantDropdownOpen, setTenantDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout>();

  // 검색 디바운스
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (searchInput !== filters.search) {
        onFiltersChange({ ...filters, search: searchInput });
      }
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [searchInput]);

  // 드롭다운 외부 클릭 닫기
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setTenantDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const update = (key: keyof FaqFilters, value: string | null) => {
    onFiltersChange({ ...filters, [key]: value || null });
  };

  const selectedTenantName = filters.tenantId
    ? tenants.find(t => t.tenantId === filters.tenantId)?.brandName || filters.tenantId
    : '전체 매장';

  const filteredTenants = tenantSearch
    ? tenants.filter(t => t.brandName.toLowerCase().includes(tenantSearch.toLowerCase()))
    : tenants;

  const hasActiveFilters = filters.tenantId || filters.source || filters.topic || filters.handler || filters.search;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* 매장 필터 (검색 가능 드롭다운) */}
      <div ref={dropdownRef} className="relative">
        <button
          onClick={() => setTenantDropdownOpen(!tenantDropdownOpen)}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-lg transition-colors ${
            filters.tenantId
              ? 'border-blue-300 bg-blue-50 text-blue-700'
              : 'border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          {selectedTenantName}
          <NavArrowDown className="w-3.5 h-3.5" />
        </button>
        {tenantDropdownOpen && (
          <div className="absolute top-full mt-1 left-0 w-56 bg-white border border-gray-200 rounded-lg shadow-lg z-20">
            <div className="p-2 border-b border-gray-100">
              <input
                type="text"
                value={tenantSearch}
                onChange={(e) => setTenantSearch(e.target.value)}
                placeholder="매장 검색..."
                className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded outline-none focus:ring-1 focus:ring-gray-400"
                autoFocus
              />
            </div>
            <div className="max-h-48 overflow-y-auto py-1">
              <button
                onClick={() => { update('tenantId', null); setTenantDropdownOpen(false); setTenantSearch(''); }}
                className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 ${!filters.tenantId ? 'font-medium text-blue-600' : 'text-gray-600'}`}
              >
                전체 매장
              </button>
              {filteredTenants.map(t => (
                <button
                  key={t.tenantId}
                  onClick={() => { update('tenantId', t.tenantId); setTenantDropdownOpen(false); setTenantSearch(''); }}
                  className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 ${filters.tenantId === t.tenantId ? 'font-medium text-blue-600' : 'text-gray-600'}`}
                >
                  {t.brandName}
                </button>
              ))}
              {filteredTenants.length === 0 && (
                <p className="px-3 py-2 text-xs text-gray-400">검색 결과 없음</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 소스 필터 */}
      <select
        value={filters.source || ''}
        onChange={(e) => update('source', e.target.value || null)}
        className={`px-3 py-1.5 text-sm border rounded-lg outline-none transition-colors ${
          filters.source
            ? 'border-blue-300 bg-blue-50 text-blue-700'
            : 'border-gray-200 text-gray-600'
        }`}
      >
        {SOURCE_OPTIONS.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      {/* topic 필터 */}
      <select
        value={filters.topic || ''}
        onChange={(e) => update('topic', e.target.value || null)}
        className={`px-3 py-1.5 text-sm border rounded-lg outline-none transition-colors ${
          filters.topic
            ? 'border-blue-300 bg-blue-50 text-blue-700'
            : 'border-gray-200 text-gray-600'
        }`}
      >
        {TOPIC_OPTIONS.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      {/* handler 필터 */}
      <select
        value={filters.handler || ''}
        onChange={(e) => update('handler', e.target.value || null)}
        className={`px-3 py-1.5 text-sm border rounded-lg outline-none transition-colors ${
          filters.handler
            ? 'border-blue-300 bg-blue-50 text-blue-700'
            : 'border-gray-200 text-gray-600'
        }`}
      >
        {HANDLER_OPTIONS.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      {/* 검색 */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="질문, 답변, 매장명 검색..."
          className="pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg outline-none focus:ring-1 focus:ring-gray-400 w-52"
        />
      </div>

      {/* 필터 초기화 */}
      {hasActiveFilters && (
        <button
          onClick={() => {
            setSearchInput('');
            onFiltersChange({ tenantId: null, source: null, topic: null, handler: null, search: '' });
          }}
          className="flex items-center gap-1 px-2 py-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors"
        >
          <Xmark className="w-3.5 h-3.5" />
          초기화
        </button>
      )}
    </div>
  );
}