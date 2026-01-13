'use client';

import { useState, useEffect, useCallback } from 'react';
import { CreditCards, NavArrowLeft, NavArrowRight, RefreshDouble, Download, Calendar, Xmark, Refresh } from 'iconoir-react';

type OrderType = 'subscription' | 'renewal' | 'upgrade' | 'downgrade' | 'downgrade_refund' | 'refund' | 'cancel_refund' | 'unknown';

interface Order {
  id: string;
  email: string;
  amount: number;
  refundedAmount?: number;
  remainingAmount?: number;
  status: string;
  plan: string;
  type: OrderType;
  isTest: boolean;
  createdAt: string;
  paidAt: string | null;
  canceledAt: string | null;
  paymentKey?: string;
  orderId?: string;
  cancelReason?: string;
  refundReason?: string;
  tenantId?: string;
  memberInfo: {
    businessName: string;
    ownerName: string;
    email: string;
  } | null;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface Stats {
  total: number;
  completed: number;
  pending: number;
  failed: number;
  refunded: number;
  totalAmount: number;
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });
  const [stats, setStats] = useState<Stats | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [isRefunding, setIsRefunding] = useState(false);
  const [search, setSearch] = useState('');
  const [cancelSubscription, setCancelSubscription] = useState<boolean | null>(null); // null = 미선택

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
        ...(status && { status }),
        ...(type && { type }),
        ...(startDate && { startDate }),
        ...(endDate && { endDate }),
        ...(search && { search }),
      });

      const response = await fetch(`/api/admin/orders?${params}`);
      if (response.ok) {
        const data = await response.json();
        setOrders(data.orders);
        setPagination(data.pagination);
        setStats(data.stats);
      }
    } catch (error) {
      console.error('Failed to fetch orders:', error);
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, status, type, startDate, endDate]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const handleFilter = () => {
    setPagination(prev => ({ ...prev, page: 1 }));
    fetchOrders();
  };

  const getStatusBadge = (orderStatus: string) => {
    const baseClass = "px-2 py-1 text-xs font-medium bg-gray-100 text-gray-600 rounded-full";
    switch (orderStatus) {
      case 'completed':
      case 'done':
        return <span className={baseClass}>완료</span>;
      case 'pending':
        return <span className={baseClass}>대기</span>;
      case 'failed':
        return <span className={baseClass}>실패</span>;
      case 'refunded':
        return <span className={baseClass}>환불</span>;
      default:
        return <span className={baseClass}>{orderStatus}</span>;
    }
  };

  const getTypeBadge = (orderType: OrderType) => {
    switch (orderType) {
      case 'subscription':
        return <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded-full">구독</span>;
      case 'renewal':
        return <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-700 rounded-full">갱신</span>;
      case 'upgrade':
        return <span className="px-2 py-1 text-xs font-medium bg-purple-100 text-purple-700 rounded-full">업그레이드</span>;
      case 'downgrade':
        return <span className="px-2 py-1 text-xs font-medium bg-orange-100 text-orange-700 rounded-full">다운그레이드</span>;
      case 'downgrade_refund':
        return <span className="px-2 py-1 text-xs font-medium bg-orange-100 text-orange-700 rounded-full">다운환불</span>;
      case 'refund':
        return <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-700 rounded-full">환불</span>;
      case 'cancel_refund':
        return <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-700 rounded-full">해지환불</span>;
      default:
        return <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-500 rounded-full">-</span>;
    }
  };

  const getPlanName = (plan: string) => {
    switch (plan) {
      case 'basic': return 'Basic';
      case 'business': return 'Business';
      case 'enterprise': return 'Enterprise';
      default: return plan || '-';
    }
  };

  const handleRowClick = (order: Order) => {
    setSelectedOrder(order);
  };

  const handleOpenRefundModal = (order: Order) => {
    setSelectedOrder(order);
    // 환불 가능 금액 (remainingAmount가 있으면 사용, 없으면 amount 사용)
    const refundableAmount = order.remainingAmount ?? order.amount;
    setRefundAmount(refundableAmount?.toString() || '');
    setRefundReason('');
    setCancelSubscription(null); // 미선택 상태로 시작
    setShowRefundModal(true);
  };

  const handleRefund = async () => {
    if (!selectedOrder || !refundAmount) return;

    if (cancelSubscription === null) {
      alert('구독 처리 방식을 선택해주세요.');
      return;
    }

    const amount = parseInt(refundAmount.replace(/,/g, ''));
    if (isNaN(amount) || amount <= 0) {
      alert('올바른 환불 금액을 입력하세요.');
      return;
    }

    // 환불 가능 금액 검증 (이미 환불된 금액 고려)
    const maxRefundable = selectedOrder.remainingAmount ?? selectedOrder.amount ?? 0;
    if (amount > maxRefundable) {
      alert(`환불 가능 금액(${maxRefundable.toLocaleString()}원)을 초과했습니다.`);
      return;
    }

    if (!confirm(`${amount.toLocaleString()}원을 환불하시겠습니까?`)) return;

    setIsRefunding(true);
    try {
      const response = await fetch('/api/admin/orders/refund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentId: selectedOrder.id,
          paymentKey: selectedOrder.paymentKey,
          tenantId: selectedOrder.tenantId,
          refundAmount: amount,
          refundReason: refundReason || '관리자 요청 환불',
          cancelSubscription, // 구독 취소 여부
        }),
      });

      const data = await response.json();

      if (response.ok) {
        alert('환불이 완료되었습니다.');
        setShowRefundModal(false);
        setSelectedOrder(null);
        fetchOrders();
      } else {
        alert(data.error || '환불 처리에 실패했습니다.');
      }
    } catch {
      alert('오류가 발생했습니다.');
    } finally {
      setIsRefunding(false);
    }
  };

  const handleExportCSV = () => {
    if (orders.length === 0) return;

    const headers = ['결제일', '매장명', '이름', '이메일', '플랜', '금액', '상태', '취소/환불 사유', '테스트'];
    const rows = orders.map(order => [
      order.paidAt ? new Date(order.paidAt).toLocaleDateString('ko-KR') : '-',
      order.memberInfo?.businessName || '-',
      order.memberInfo?.ownerName || '-',
      order.memberInfo?.email || order.email || '-',
      getPlanName(order.plan),
      order.amount?.toLocaleString() || '0',
      order.status,
      order.cancelReason || order.refundReason || '-',
      order.isTest ? 'Y' : 'N',
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `orders_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  return (
    <div className="space-y-6 overflow-x-hidden">
      <div className="flex items-center justify-between flex-wrap gap-4 sticky left-0">
        <div className="flex items-center gap-3">
          <CreditCards className="w-8 h-8 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900">결제 내역</h1>
        </div>
        <button
          onClick={handleExportCSV}
          disabled={orders.length === 0}
          className="p-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 shrink-0"
          title="엑셀 다운로드"
        >
          <Download className="w-5 h-5" />
        </button>
      </div>

      {/* 통계 카드 */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 sticky left-0">
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <p className="text-sm text-gray-500">전체</p>
            <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <p className="text-sm text-gray-500">완료</p>
            <p className="text-2xl font-bold text-green-600">{stats.completed}</p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <p className="text-sm text-gray-500">대기</p>
            <p className="text-2xl font-bold text-yellow-600">{stats.pending}</p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <p className="text-sm text-gray-500">실패/환불</p>
            <p className="text-2xl font-bold text-red-600">{stats.failed + stats.refunded}</p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 col-span-2 md:col-span-1">
            <p className="text-sm text-gray-500">총 매출</p>
            <p className="text-2xl font-bold text-blue-600">{stats.totalAmount.toLocaleString()}원</p>
          </div>
        </div>
      )}

      {/* 필터 */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 sticky left-0">
        <div className="flex flex-col sm:flex-row flex-wrap gap-4">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleFilter()}
            placeholder="회원명, 이메일 검색"
            className="px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 min-w-[200px]"
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="">전체 상태</option>
            <option value="completed">완료</option>
            <option value="pending">대기</option>
            <option value="failed">실패</option>
            <option value="refunded">환불</option>
          </select>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="">전체 유형</option>
            <option value="subscription">구독</option>
            <option value="cancellation">해지/환불</option>
          </select>
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-gray-400" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-gray-400">~</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={handleFilter}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            검색
          </button>
        </div>
      </div>

      {/* 주문 목록 테이블 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <RefreshDouble className="w-8 h-8 text-blue-600 animate-spin" />
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            결제 내역이 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-max">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-center px-6 py-4 text-sm font-medium text-gray-500">결제일</th>
                  <th className="text-center px-6 py-4 text-sm font-medium text-gray-500">회원</th>
                  <th className="text-center px-6 py-4 text-sm font-medium text-gray-500">매장</th>
                  <th className="text-center px-6 py-4 text-sm font-medium text-gray-500">이메일</th>
                  <th className="text-center px-6 py-4 text-sm font-medium text-gray-500">플랜</th>
                  <th className="text-center px-6 py-4 text-sm font-medium text-gray-500">결제유형</th>
                  <th className="text-center px-6 py-4 text-sm font-medium text-gray-500">금액</th>
                  <th className="text-center px-6 py-4 text-sm font-medium text-gray-500">상태</th>
                  <th className="text-center px-6 py-4 text-sm font-medium text-gray-500">취소/환불 사유</th>
                  <th className="text-center px-6 py-4 text-sm font-medium text-gray-500">환불</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {orders.map((order) => (
                  <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-sm text-gray-600 text-center">
                      {order.paidAt
                        ? new Date(order.paidAt).toLocaleDateString('ko-KR')
                        : order.createdAt
                        ? new Date(order.createdAt).toLocaleDateString('ko-KR')
                        : '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 text-center">
                      {order.memberInfo?.ownerName || '-'}
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900 text-center">
                      {order.memberInfo?.businessName || '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 text-center">
                      {order.memberInfo?.email || order.email || '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 text-center">
                      {getPlanName(order.plan)}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {getTypeBadge(order.type)}
                    </td>
                    <td className="px-6 py-4 text-sm text-center font-medium">
                      <span className={order.amount < 0 ? 'text-red-600' : 'text-gray-900'}>
                        {order.amount?.toLocaleString()}원
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      {getStatusBadge(order.status)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 text-center max-w-[200px]">
                      {order.cancelReason || order.refundReason ? (
                        <span className="line-clamp-2" title={order.cancelReason || order.refundReason}>
                          {order.cancelReason || order.refundReason}
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {(() => {
                        const remainingAmount = order.remainingAmount ?? order.amount ?? 0;
                        const hasPartialRefund = (order.refundedAmount ?? 0) > 0 && remainingAmount > 0;
                        const isCompleted = order.status === 'completed' || order.status === 'done';
                        const isRefundType = order.type === 'refund' || order.type === 'cancel_refund' || order.type === 'downgrade_refund';

                        if (isCompleted && !isRefundType && remainingAmount > 0) {
                          return (
                            <div className="flex flex-col items-center gap-1">
                              {hasPartialRefund && (
                                <span className="text-xs text-orange-600">부분환불됨</span>
                              )}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenRefundModal(order);
                                }}
                                className="px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 rounded transition-colors"
                              >
                                환불하기
                              </button>
                            </div>
                          );
                        } else if (order.status === 'refunded' || (isCompleted && remainingAmount === 0)) {
                          return <span className="text-xs text-gray-400">환불완료</span>;
                        } else {
                          return <span className="text-gray-400">-</span>;
                        }
                      })()}
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

      {/* 환불 모달 */}
      {showRefundModal && selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowRefundModal(false)}
          />
          <div className="relative bg-white rounded-xl shadow-2xl max-w-md w-full mx-4 p-6">
            <button
              onClick={() => setShowRefundModal(false)}
              className="absolute top-4 right-4 p-2 hover:bg-gray-100 rounded-full"
            >
              <Xmark className="w-5 h-5 text-gray-500" />
            </button>

            <h3 className="text-lg font-bold text-gray-900 mb-4">결제 취소/환불</h3>

            {/* 주문 정보 */}
            <div className="bg-gray-50 rounded-lg p-4 mb-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">매장명</span>
                <span className="font-medium">{selectedOrder.memberInfo?.businessName || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">이메일</span>
                <span className="font-medium">{selectedOrder.memberInfo?.email || selectedOrder.email || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">플랜</span>
                <span className="font-medium">{getPlanName(selectedOrder.plan)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">결제 금액</span>
                <span className="font-medium">{selectedOrder.amount?.toLocaleString()}원</span>
              </div>
              {(selectedOrder.refundedAmount ?? 0) > 0 && (
                <>
                  <div className="flex justify-between text-orange-600">
                    <span>이미 환불된 금액</span>
                    <span className="font-medium">-{selectedOrder.refundedAmount?.toLocaleString()}원</span>
                  </div>
                  <div className="flex justify-between border-t border-gray-200 pt-2 mt-2">
                    <span className="text-gray-700 font-medium">환불 가능 금액</span>
                    <span className="font-bold text-blue-600">{selectedOrder.remainingAmount?.toLocaleString()}원</span>
                  </div>
                </>
              )}
            </div>

            {/* 환불 금액 입력 */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                환불 금액
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={refundAmount}
                  onChange={(e) => {
                    const value = e.target.value.replace(/[^0-9]/g, '');
                    setRefundAmount(value ? parseInt(value).toLocaleString() : '');
                  }}
                  className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="환불할 금액 입력"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500">원</span>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                최대 환불 가능 금액: {(selectedOrder.remainingAmount ?? selectedOrder.amount)?.toLocaleString()}원
              </p>
            </div>

            {/* 환불 사유 입력 */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                환불 사유
              </label>
              <textarea
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                rows={3}
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                placeholder="환불 사유를 입력하세요 (선택)"
              />
            </div>

            {/* 구독 처리 방식 선택 (필수) */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-3">
                구독 처리 방식 <span className="text-red-500">*</span>
              </label>
              <div className="space-y-2">
                <label className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                  cancelSubscription === true ? 'border-red-400 bg-red-50' : 'border-gray-200 hover:bg-gray-50'
                }`}>
                  <input
                    type="radio"
                    name="cancelSubscription"
                    checked={cancelSubscription === true}
                    onChange={() => setCancelSubscription(true)}
                    className="mt-0.5 w-4 h-4 text-red-600 border-gray-300 focus:ring-red-500"
                  />
                  <div>
                    <span className="text-sm font-medium text-gray-900">구독 취소</span>
                    <p className="text-xs text-gray-500 mt-0.5">
                      환불과 함께 구독이 즉시 취소됩니다.
                    </p>
                  </div>
                </label>
                <label className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                  cancelSubscription === false ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'
                }`}>
                  <input
                    type="radio"
                    name="cancelSubscription"
                    checked={cancelSubscription === false}
                    onChange={() => setCancelSubscription(false)}
                    className="mt-0.5 w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                  />
                  <div>
                    <span className="text-sm font-medium text-gray-900">구독 유지</span>
                    <p className="text-xs text-gray-500 mt-0.5">
                      환불만 진행하고 구독은 그대로 유지됩니다.
                    </p>
                  </div>
                </label>
              </div>
            </div>

            {/* 버튼 */}
            <div className="flex gap-3">
              <button
                onClick={() => setShowRefundModal(false)}
                className="flex-1 py-3 px-4 rounded-lg font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleRefund}
                disabled={isRefunding || !refundAmount || cancelSubscription === null}
                className="flex-1 py-3 px-4 rounded-lg font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isRefunding ? (
                  <>
                    <Refresh className="w-4 h-4 animate-spin" />
                    처리 중...
                  </>
                ) : (
                  '환불 처리'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
