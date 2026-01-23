'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { HistoricShield, NavArrowLeft, NavArrowRight, Search, Filter, Xmark, RefreshDouble, Undo } from 'iconoir-react';
import Link from 'next/link';
import Spinner from '@/components/admin/Spinner';

interface Deletion {
  id: string;
  tenantId: string;
  userId: string;
  brandName: string;
  email: string;
  nameAtDeletion: string;
  phoneAtDeletion: string;
  currentName: string;
  currentPhone: string;
  deletedAt: string | null;
  deletedBy: string;
  deletedByDetails: string;
  permanentDeleteAt: string | null;
  permanentlyDeletedAt: string | null;
  paymentDeleteAt: string | null;
  paymentsDeletedAt: string | null;
  reason: string;
  status: 'pending' | 'deleted' | 'payment_deleted';
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function DeletedHistoryPage() {
  const [deletions, setDeletions] = useState<Deletion[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [showFilter, setShowFilter] = useState(false);
  const [filterPosition, setFilterPosition] = useState<{ top: number; right: number } | null>(null);
  const filterRef = useRef<HTMLDivElement>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });

  const fetchDeletions = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
        ...(search && { search }),
        ...(statusFilter.length > 0 && { status: statusFilter.join(',') }),
      });

      const response = await fetch(`/api/admin/tenant-deletions?${params}`);
      if (response.ok) {
        const data = await response.json();
        setDeletions(data.deletions);
        setPagination(data.pagination);
      }
    } catch (error) {
      console.error('Failed to fetch deletions:', error);
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, search, statusFilter]);

  useEffect(() => {
    fetchDeletions();
  }, [fetchDeletions]);

  const handleFilter = () => {
    setPagination(prev => ({ ...prev, page: 1 }));
    fetchDeletions();
  };

  const handleRestore = async (deletion: Deletion) => {
    if (!confirm(`'${deletion.brandName}' 매장을 복구하시겠습니까?`)) {
      return;
    }

    setRestoringId(deletion.id);
    try {
      const response = await fetch(`/api/admin/tenants/${deletion.tenantId}/restore`, {
        method: 'POST',
      });

      const data = await response.json();

      if (response.ok) {
        alert('매장이 복구되었습니다.');
        fetchDeletions();
      } else {
        alert(data.error || '복구에 실패했습니다.');
      }
    } catch (error) {
      console.error('Restore failed:', error);
      alert('복구 중 오류가 발생했습니다.');
    } finally {
      setRestoringId(null);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  };

  const formatDateTime = (dateString: string | null) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusBadge = (deletion: Deletion) => {
    const baseClass = "px-2 py-1 text-xs font-medium rounded-full whitespace-nowrap";
    if (deletion.status === 'payment_deleted') {
      return <span className={`${baseClass} bg-gray-100 text-gray-500`}>완전 삭제</span>;
    }
    if (deletion.status === 'deleted') {
      return <span className={`${baseClass} bg-red-100 text-red-700`}>영구 삭제</span>;
    }
    return <span className={`${baseClass} bg-yellow-100 text-yellow-700`}>대기중</span>;
  };

  const getDeletedByLabel = (deletion: Deletion) => {
    if (deletion.deletedBy === 'admin') {
      return <span className="text-purple-600">관리자</span>;
    }
    return <span className="text-gray-600">사용자</span>;
  };

  // 외부 클릭 감지 (필터 팝업 닫기)
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
        setShowFilter(false);
        setFilterPosition(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const hasActiveFilters = statusFilter.length > 0;

  return (
    <div className="space-y-6 overflow-x-hidden">
      <div className="flex items-center justify-between flex-wrap gap-4 sticky left-0">
        <div className="flex items-center gap-3">
          <HistoricShield className="w-8 h-8 text-red-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">삭제된 매장 히스토리</h1>
            <p className="text-sm text-gray-500 mt-1">
              삭제된 매장의 기록을 확인합니다
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/tenants"
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 hover:border-gray-400 rounded-lg transition-colors"
          >
            <NavArrowLeft className="w-4 h-4" />
            <span>매장 목록</span>
          </Link>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-100">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative">
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPagination(prev => ({ ...prev, page: 1 }));
                    }}
                    placeholder="검색"
                    className="w-48 sm:w-64 pl-8 pr-8 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  {search && (
                    <button
                      onClick={() => { setSearch(''); setPagination(prev => ({ ...prev, page: 1 })); }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 hover:bg-gray-100 rounded"
                    >
                      <Xmark className="w-3 h-3 text-gray-400" />
                    </button>
                  )}
                </div>
                <div className="relative" ref={filterRef}>
                  <button
                    onClick={(e) => {
                      if (showFilter) {
                        setShowFilter(false);
                        setFilterPosition(null);
                      } else {
                        const rect = e.currentTarget.getBoundingClientRect();
                        setFilterPosition({
                          top: rect.bottom + 8,
                          right: window.innerWidth - rect.right,
                        });
                        setShowFilter(true);
                      }
                    }}
                    className={`p-1.5 rounded-lg transition-colors ${
                      hasActiveFilters
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                    title="필터"
                  >
                    <Filter className="w-4 h-4" />
                  </button>
                  {showFilter && filterPosition && (
                    <div
                      className="fixed bg-white border border-gray-200 rounded-lg shadow-lg p-4 min-w-[200px] max-h-[70vh] overflow-y-auto"
                      style={{ top: filterPosition.top, right: filterPosition.right, zIndex: 9999 }}
                    >
                      <div className="space-y-4">
                        {/* 상태 필터 */}
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-2">상태</label>
                          <div className="space-y-1.5">
                            {[
                              { value: 'pending', label: '대기중 (복구 가능)' },
                              { value: 'deleted', label: '영구 삭제됨' },
                              { value: 'payment_deleted', label: '완전 삭제됨' },
                            ].map(option => (
                              <label key={option.value} className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={statusFilter.includes(option.value)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setStatusFilter(prev => [...prev, option.value]);
                                    } else {
                                      setStatusFilter(prev => prev.filter(v => v !== option.value));
                                    }
                                    setPagination(prev => ({ ...prev, page: 1 }));
                                  }}
                                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                />
                                <span className="text-sm text-gray-700">{option.label}</span>
                              </label>
                            ))}
                          </div>
                        </div>

                        <button
                          onClick={() => {
                            setStatusFilter([]);
                            setPagination(prev => ({ ...prev, page: 1 }));
                          }}
                          className="w-full text-xs text-gray-500 hover:text-gray-700 py-1"
                        >
                          필터 초기화
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                <button
                  onClick={handleFilter}
                  className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
                >
                  조회
                </button>
                <button
                  onClick={fetchDeletions}
                  className="p-1.5 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
                  title="새로고침"
                >
                  <RefreshDouble className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Spinner size="md" />
          </div>
        ) : deletions.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            삭제 히스토리가 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-max border-collapse">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-center px-3 py-3 text-sm font-medium text-gray-500 whitespace-nowrap">매장명</th>
                  <th className="text-center px-3 py-3 text-sm font-medium text-gray-500 whitespace-nowrap">회원</th>
                  <th className="text-center px-3 py-3 text-sm font-medium text-gray-500 whitespace-nowrap">연락처</th>
                  <th className="text-center px-3 py-3 text-sm font-medium text-gray-500 whitespace-nowrap">이메일</th>
                  <th className="text-center px-3 py-3 text-sm font-medium text-gray-500 whitespace-nowrap">삭제일</th>
                  <th className="text-center px-3 py-3 text-sm font-medium text-gray-500 whitespace-nowrap">삭제자</th>
                  <th className="text-center px-3 py-3 text-sm font-medium text-gray-500 whitespace-nowrap">기본정보 삭제일</th>
                  <th className="text-center px-3 py-3 text-sm font-medium text-gray-500 whitespace-nowrap">결제내역 삭제일</th>
                  <th className="text-center px-3 py-3 text-sm font-medium text-gray-500 whitespace-nowrap">상태</th>
                  <th className="text-center px-3 py-3 text-sm font-medium text-gray-500 whitespace-nowrap">액션</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {deletions.map((deletion) => (
                  <tr
                    key={deletion.id}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-3 py-3 text-sm font-medium text-gray-900 text-center whitespace-nowrap">
                      {deletion.status === 'pending' ? (
                        <Link
                          href={`/admin/tenants/${deletion.tenantId}`}
                          className="text-blue-600 hover:text-blue-800 hover:underline"
                        >
                          {deletion.brandName || '-'}
                        </Link>
                      ) : (
                        deletion.brandName || '-'
                      )}
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-600 text-center whitespace-nowrap">
                      <div className="flex flex-col items-center">
                        <span>{deletion.currentName || deletion.nameAtDeletion || '-'}</span>
                        {deletion.currentName && deletion.nameAtDeletion && deletion.currentName !== deletion.nameAtDeletion && (
                          <span className="text-xs text-gray-400">
                            (삭제시: {deletion.nameAtDeletion})
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-600 text-center whitespace-nowrap">
                      <div className="flex flex-col items-center">
                        <span>{deletion.currentPhone || deletion.phoneAtDeletion || '-'}</span>
                        {deletion.currentPhone && deletion.phoneAtDeletion && deletion.currentPhone !== deletion.phoneAtDeletion && (
                          <span className="text-xs text-gray-400">
                            (삭제시: {deletion.phoneAtDeletion})
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-600 text-center whitespace-nowrap">
                      {deletion.email || '-'}
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-600 text-center whitespace-nowrap">
                      {formatDateTime(deletion.deletedAt)}
                    </td>
                    <td className="px-3 py-3 text-sm text-center whitespace-nowrap">
                      {getDeletedByLabel(deletion)}
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-600 text-center whitespace-nowrap">
                      {deletion.permanentlyDeletedAt
                        ? formatDate(deletion.permanentlyDeletedAt)
                        : <span className="text-gray-400">{formatDate(deletion.permanentDeleteAt)} (예정)</span>
                      }
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-600 text-center whitespace-nowrap">
                      {deletion.paymentsDeletedAt
                        ? formatDate(deletion.paymentsDeletedAt)
                        : <span className="text-gray-400">{formatDate(deletion.paymentDeleteAt)} (예정)</span>
                      }
                    </td>
                    <td className="px-3 py-3 text-center whitespace-nowrap">
                      {getStatusBadge(deletion)}
                    </td>
                    <td className="px-3 py-3 text-center whitespace-nowrap">
                      {deletion.status === 'pending' ? (
                        <button
                          onClick={() => handleRestore(deletion)}
                          disabled={restoringId === deletion.id}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-green-600 hover:text-green-700 border border-green-300 hover:border-green-400 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {restoringId === deletion.id ? (
                            <span className="animate-spin w-4 h-4 border-2 border-green-300 border-t-green-600 rounded-full" />
                          ) : (
                            <Undo className="w-4 h-4" />
                          )}
                          <span>복구</span>
                        </button>
                      ) : (
                        <span className="text-gray-400 text-sm">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 페이지네이션 */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 sticky left-0">
            <p className="text-sm text-gray-500">
              {pagination.total}개 중 {(pagination.page - 1) * pagination.limit + 1}-
              {Math.min(pagination.page * pagination.limit, pagination.total)}개 표시
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                disabled={pagination.page === 1}
                className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <NavArrowLeft className="w-5 h-5" />
              </button>
              <span className="text-sm text-gray-600">
                {pagination.page} / {pagination.totalPages}
              </span>
              <button
                onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                disabled={pagination.page === pagination.totalPages}
                className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <NavArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 안내 문구 */}
      <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-600">
        <p className="font-medium mb-2">삭제 처리 안내</p>
        <ul className="space-y-1 list-disc list-inside text-gray-500">
          <li><span className="text-yellow-600 font-medium">대기중</span>: 삭제 후 90일 이내 상태로, 관리자가 복구할 수 있습니다.</li>
          <li><span className="text-red-600 font-medium">영구 삭제</span>: 90일 경과 후 기본 정보(매장, 구독)가 삭제된 상태입니다.</li>
          <li><span className="text-gray-500 font-medium">완전 삭제</span>: 5년 경과 후 결제 기록까지 모두 삭제된 상태입니다.</li>
        </ul>
      </div>
    </div>
  );
}
