'use client';

import { useState, useEffect, useCallback } from 'react';
import { Search, NavArrowLeft, NavArrowRight } from 'iconoir-react';
import type { ManagerTenantAccess } from '@/lib/manager-auth';
import AdminManagerDetailModal from './AdminManagerDetailModal';

interface ManagerRow {
  managerId: string;
  loginId: string;
  name: string;
  phone: string | null;
  masterEmail: string;
  active: boolean;
  tenants: ManagerTenantAccess[];
  tenantCount: number;
  createdAt: string | null;
  updatedAt: string | null;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function AdminManagersList() {
  const [search, setSearch] = useState('');
  const [inputValue, setInputValue] = useState('');
  const [managers, setManagers] = useState<ManagerRow[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 30, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [selectedManager, setSelectedManager] = useState<ManagerRow | null>(null);

  const fetchManagers = useCallback(async (page = 1, q = search) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '30' });
      if (q) params.set('search', q);
      const res = await fetch(`/api/admin/managers?${params}`);
      if (res.ok) {
        const data = await res.json();
        setManagers(data.managers || []);
        setPagination(data.pagination);
      }
    } catch {
      setManagers([]);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    fetchManagers(1, '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(inputValue);
    fetchManagers(1, inputValue);
  };

  const handlePageChange = (page: number) => {
    fetchManagers(page, search);
  };

  return (
    <>
      <div className="space-y-4">
        {/* 검색 */}
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <form onSubmit={handleSearch} className="flex gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="이름, 아이디, 마스터 이메일 검색"
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              />
            </div>
            <button
              type="submit"
              className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
            >
              검색
            </button>
          </form>
        </div>

        {/* 테이블 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-6 w-6 border-2 border-gray-200 border-t-blue-500" />
            </div>
          ) : managers.length === 0 ? (
            <div className="text-center py-20 text-gray-400 text-sm">
              {search ? '검색 결과가 없습니다.' : '등록된 매니저가 없습니다.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-max">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-center px-5 py-4 text-xs font-medium text-gray-500 uppercase tracking-wide">이름</th>
                    <th className="text-center px-5 py-4 text-xs font-medium text-gray-500 uppercase tracking-wide">아이디</th>
                    <th className="text-center px-5 py-4 text-xs font-medium text-gray-500 uppercase tracking-wide">소속 마스터</th>
                    <th className="text-center px-5 py-4 text-xs font-medium text-gray-500 uppercase tracking-wide">연락처</th>
                    <th className="text-center px-5 py-4 text-xs font-medium text-gray-500 uppercase tracking-wide">매장</th>
                    <th className="text-center px-5 py-4 text-xs font-medium text-gray-500 uppercase tracking-wide">상태</th>
                    <th className="text-center px-5 py-4 text-xs font-medium text-gray-500 uppercase tracking-wide">생성일</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {managers.map(m => (
                    <tr
                      key={m.managerId}
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => setSelectedManager(m)}
                    >
                      <td className="px-5 py-4 text-sm font-medium text-gray-900 text-center">{m.name}</td>
                      <td className="px-5 py-4 text-sm text-gray-500 text-center font-mono">@{m.loginId}</td>
                      <td className="px-5 py-4 text-sm text-gray-500 text-center">{m.masterEmail}</td>
                      <td className="px-5 py-4 text-sm text-gray-500 text-center">{m.phone || '-'}</td>
                      <td className="px-5 py-4 text-sm text-gray-600 text-center">{m.tenantCount}개</td>
                      <td className="px-5 py-4 text-center">
                        {m.active ? (
                          <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-700">활성</span>
                        ) : (
                          <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-600">비활성</span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-sm text-gray-400 text-center">
                        {m.createdAt ? new Date(m.createdAt).toLocaleDateString('ko-KR') : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 페이지네이션 */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
              <p className="text-sm text-gray-500">
                총 {pagination.total}명 중 {(pagination.page - 1) * pagination.limit + 1}–
                {Math.min(pagination.page * pagination.limit, pagination.total)}명 표시
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handlePageChange(pagination.page - 1)}
                  disabled={pagination.page === 1}
                  className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-40"
                >
                  <NavArrowLeft className="w-5 h-5" />
                </button>
                <span className="text-sm text-gray-600">{pagination.page} / {pagination.totalPages}</span>
                <button
                  onClick={() => handlePageChange(pagination.page + 1)}
                  disabled={pagination.page === pagination.totalPages}
                  className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-40"
                >
                  <NavArrowRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {selectedManager && (
        <AdminManagerDetailModal
          manager={selectedManager}
          onClose={() => setSelectedManager(null)}
        />
      )}
    </>
  );
}
