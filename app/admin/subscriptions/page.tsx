'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshDouble, NavArrowLeft, NavArrowRight, Edit, Xmark, Check } from 'iconoir-react';

interface Subscription {
  id: string;
  tenantId: string;
  email: string;
  memberName: string;
  brandName: string;
  phone: string;
  plan: string;
  status: string;
  amount: number;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  nextBillingDate: string | null;
  createdAt: string | null;
  pricePolicy: string | null;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function SubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [planFilter, setPlanFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });

  // 편집 모달 상태
  const [editModal, setEditModal] = useState(false);
  const [editingSubscription, setEditingSubscription] = useState<Subscription | null>(null);
  const [editForm, setEditForm] = useState({
    brandName: '',
    name: '',
    phone: '',
    plan: '',
    status: '',
    currentPeriodStart: '',
    currentPeriodEnd: '',
  });
  const [isSaving, setIsSaving] = useState(false);

  const fetchSubscriptions = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
        ...(search && { search }),
        ...(planFilter && { plan: planFilter }),
        ...(statusFilter && { status: statusFilter }),
      });

      const response = await fetch(`/api/admin/subscriptions/list?${params}`);
      if (response.ok) {
        const data = await response.json();
        setSubscriptions(data.subscriptions);
        setPagination(data.pagination);
      }
    } catch (error) {
      console.error('Failed to fetch subscriptions:', error);
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, search, planFilter, statusFilter]);

  useEffect(() => {
    fetchSubscriptions();
  }, [fetchSubscriptions]);

  const handleFilter = () => {
    setPagination(prev => ({ ...prev, page: 1 }));
    fetchSubscriptions();
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('ko-KR');
  };

  // 마이페이지와 동일하게 종료일 계산 (nextBillingDate - 1일)
  const getEndDateFromNextBilling = (nextBillingDate: string | null) => {
    if (!nextBillingDate) return null;
    const endDate = new Date(nextBillingDate);
    endDate.setDate(endDate.getDate() - 1);
    return endDate.toISOString();
  };

  const formatDateForInput = (dateString: string | null) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toISOString().split('T')[0];
  };

  const getPlanName = (plan: string) => {
    switch (plan) {
      case 'trial': return 'Trial';
      case 'basic': return 'Basic';
      case 'business': return 'Business';
      case 'enterprise': return 'Enterprise';
      default: return plan || '-';
    }
  };

  const getStatusBadge = (status: string) => {
    const baseClass = "px-2 py-1 text-xs font-medium rounded-full";
    switch (status) {
      case 'active':
        return <span className={`${baseClass} bg-green-100 text-green-700`}>활성</span>;
      case 'trial':
        return <span className={`${baseClass} bg-blue-100 text-blue-700`}>체험</span>;
      case 'canceled':
        return <span className={`${baseClass} bg-red-100 text-red-700`}>해지</span>;
      case 'past_due':
        return <span className={`${baseClass} bg-orange-100 text-orange-700`}>연체</span>;
      case 'expired':
        return <span className={`${baseClass} bg-gray-100 text-gray-600`}>만료</span>;
      default:
        return <span className={`${baseClass} bg-gray-100 text-gray-600`}>{status || '-'}</span>;
    }
  };

  const openEditModal = (subscription: Subscription) => {
    setEditingSubscription(subscription);
    // 종료일은 nextBillingDate - 1로 표시 (마이페이지와 동일)
    const endDate = getEndDateFromNextBilling(subscription.nextBillingDate);
    setEditForm({
      brandName: subscription.brandName || '',
      name: subscription.memberName || '',
      phone: subscription.phone || '',
      plan: subscription.plan || '',
      status: subscription.status || '',
      currentPeriodStart: formatDateForInput(subscription.currentPeriodStart),
      currentPeriodEnd: formatDateForInput(endDate),
    });
    setEditModal(true);
  };

  const handleSave = async () => {
    if (!editingSubscription) return;

    setIsSaving(true);
    try {
      // 종료일 + 1 = nextBillingDate로 변환
      let nextBillingDate = null;
      if (editForm.currentPeriodEnd) {
        const endDate = new Date(editForm.currentPeriodEnd);
        endDate.setDate(endDate.getDate() + 1);
        nextBillingDate = endDate.toISOString();
      }

      const response = await fetch('/api/admin/subscriptions/list', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: editingSubscription.tenantId,
          brandName: editForm.brandName || null,
          name: editForm.name || null,
          phone: editForm.phone || null,
          plan: editForm.plan,
          status: editForm.status,
          currentPeriodStart: editForm.currentPeriodStart || null,
          currentPeriodEnd: editForm.currentPeriodEnd || null,
          nextBillingDate: nextBillingDate,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        alert('구독 정보가 수정되었습니다.');
        setEditModal(false);
        setEditingSubscription(null);
        fetchSubscriptions();
      } else {
        alert(data.error || '수정에 실패했습니다.');
      }
    } catch {
      alert('오류가 발생했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 overflow-x-hidden">
      <div className="flex items-center justify-between flex-wrap gap-4 sticky left-0">
        <div className="flex items-center gap-3">
          <RefreshDouble className="w-8 h-8 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900">구독 관리</h1>
        </div>
      </div>

      {/* 필터 */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 sticky left-0">
        <div className="flex flex-col sm:flex-row flex-wrap gap-4">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleFilter()}
            placeholder="회원명, 매장명, 이메일 검색"
            className="px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 min-w-[200px]"
          />
          <select
            value={planFilter}
            onChange={(e) => setPlanFilter(e.target.value)}
            className="px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="">전체 플랜</option>
            <option value="trial">Trial</option>
            <option value="basic">Basic</option>
            <option value="business">Business</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="">전체 상태</option>
            <option value="active">활성</option>
            <option value="trial">체험</option>
            <option value="canceled">해지</option>
            <option value="past_due">연체</option>
            <option value="expired">만료</option>
          </select>
          <button
            onClick={handleFilter}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            검색
          </button>
        </div>
      </div>

      {/* 구독 목록 테이블 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <RefreshDouble className="w-8 h-8 text-blue-600 animate-spin" />
          </div>
        ) : subscriptions.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            구독 정보가 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-max">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-center px-6 py-4 text-sm font-medium text-gray-500">회원</th>
                  <th className="text-center px-6 py-4 text-sm font-medium text-gray-500">매장</th>
                  <th className="text-center px-6 py-4 text-sm font-medium text-gray-500">이메일</th>
                  <th className="text-center px-6 py-4 text-sm font-medium text-gray-500">플랜</th>
                  <th className="text-center px-6 py-4 text-sm font-medium text-gray-500">상태</th>
                  <th className="text-center px-6 py-4 text-sm font-medium text-gray-500">시작일</th>
                  <th className="text-center px-6 py-4 text-sm font-medium text-gray-500">종료일</th>
                  <th className="text-center px-6 py-4 text-sm font-medium text-gray-500">수정</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {subscriptions.map((subscription) => (
                  <tr key={subscription.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-sm text-gray-600 text-center">
                      {subscription.memberName || '-'}
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900 text-center">
                      {subscription.brandName}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 text-center">
                      {subscription.email || '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 text-center">
                      {getPlanName(subscription.plan)}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {getStatusBadge(subscription.status)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 text-center">
                      {formatDate(subscription.currentPeriodStart)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 text-center">
                      {formatDate(getEndDateFromNextBilling(subscription.nextBillingDate))}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() => openEditModal(subscription)}
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                        title="수정"
                      >
                        <Edit className="w-4 h-4 text-gray-600" />
                      </button>
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

      {/* 편집 모달 */}
      {editModal && editingSubscription && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setEditModal(false)}
          />
          <div className="relative bg-white rounded-xl shadow-2xl max-w-md w-full mx-4 p-6">
            <button
              onClick={() => setEditModal(false)}
              className="absolute top-4 right-4 p-2 hover:bg-gray-100 rounded-full"
            >
              <Xmark className="w-5 h-5 text-gray-500" />
            </button>

            <h3 className="text-lg font-bold text-gray-900 mb-4">구독 정보 수정</h3>

            {/* 이메일 (읽기 전용) */}
            <div className="bg-gray-50 rounded-lg p-3 mb-4 text-sm">
              <span className="text-gray-500">이메일: </span>
              <span className="font-medium">{editingSubscription.email || '-'}</span>
            </div>

            {/* 매장 정보 */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                매장명
              </label>
              <input
                type="text"
                value={editForm.brandName}
                onChange={(e) => setEditForm(prev => ({ ...prev, brandName: e.target.value }))}
                placeholder="매장명 입력"
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                담당자 이름
              </label>
              <input
                type="text"
                value={editForm.name}
                onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="담당자 이름 입력"
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                전화번호
              </label>
              <input
                type="tel"
                value={editForm.phone}
                onChange={(e) => setEditForm(prev => ({ ...prev, phone: e.target.value }))}
                placeholder="전화번호 입력"
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <hr className="my-4 border-gray-200" />

            {/* 플랜 선택 */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                플랜
              </label>
              <select
                value={editForm.plan}
                onChange={(e) => setEditForm(prev => ({ ...prev, plan: e.target.value }))}
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">선택</option>
                <option value="trial">Trial</option>
                <option value="basic">Basic</option>
                <option value="business">Business</option>
              </select>
            </div>

            {/* 상태 선택 */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                상태
              </label>
              <select
                value={editForm.status}
                onChange={(e) => setEditForm(prev => ({ ...prev, status: e.target.value }))}
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">선택</option>
                <option value="active">활성</option>
                <option value="trial">체험</option>
                <option value="canceled">해지</option>
                <option value="past_due">연체</option>
                <option value="expired">만료</option>
              </select>
            </div>

            {/* 시작일 */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                시작일
              </label>
              <input
                type="date"
                value={editForm.currentPeriodStart}
                onChange={(e) => setEditForm(prev => ({ ...prev, currentPeriodStart: e.target.value }))}
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* 종료일 */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                종료일
              </label>
              <input
                type="date"
                value={editForm.currentPeriodEnd}
                onChange={(e) => setEditForm(prev => ({ ...prev, currentPeriodEnd: e.target.value }))}
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* 버튼 */}
            <div className="flex gap-3">
              <button
                onClick={() => setEditModal(false)}
                className="flex-1 py-3 px-4 rounded-lg font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex-1 py-3 px-4 rounded-lg font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isSaving ? (
                  <>
                    <RefreshDouble className="w-4 h-4 animate-spin" />
                    저장 중...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    저장
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
