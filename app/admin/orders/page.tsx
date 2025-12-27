'use client';

import { useState, useEffect, useCallback } from 'react';
import { ShoppingCart, ChevronLeft, ChevronRight, Loader2, Download, Calendar, X, RefreshCw } from 'lucide-react';

type OrderType = 'subscription' | 'renewal' | 'upgrade' | 'downgrade' | 'refund' | 'cancel_refund' | 'unknown';

interface Order {
  id: string;
  email: string;
  amount: number;
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
    switch (orderStatus) {
      case 'completed':
      case 'done':
        return <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-700 rounded-full">완료</span>;
      case 'pending':
        return <span className="px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-700 rounded-full">대기</span>;
      case 'failed':
        return <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-700 rounded-full">실패</span>;
      case 'refunded':
        return <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded-full">환불</span>;
      default:
        return <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-500 rounded-full">{orderStatus}</span>;
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
    setRefundAmount(order.amount?.toString() || '');
    setRefundReason('');
    setShowRefundModal(true);
  };

  const handleRefund = async () => {
    if (!selectedOrder || !refundAmount) return;

    const amount = parseInt(refundAmount.replace(/,/g, ''));
    if (isNaN(amount) || amount <= 0) {
      alert('올바른 환불 금액을 입력하세요.');
      return;
    }

    if (amount > (selectedOrder.amount || 0)) {
      alert('환불 금액이 결제 금액보다 클 수 없습니다.');
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

    const headers = ['결제일', '매장명', '이름', '이메일', '플랜', '금액', '상태', '테스트'];
    const rows = orders.map(order => [
      order.paidAt ? new Date(order.paidAt).toLocaleDateString('ko-KR') : '-',
      order.memberInfo?.businessName || '-',
      order.memberInfo?.ownerName || '-',
      order.memberInfo?.email || order.email || '-',
      getPlanName(order.plan),
      order.amount?.toLocaleString() || '0',
      order.status,
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
          <ShoppingCart className="w-8 h-8 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900">주문 내역</h1>
        </div>
        <button
          onClick={handleExportCSV}
          disabled={orders.length === 0}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 shrink-0"
        >
          <Download className="w-4 h-4" />
          엑셀 다운로드
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
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            주문 내역이 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-max">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">결제일</th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">매장명</th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">이메일</th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">플랜</th>
                  <th className="text-center px-6 py-4 text-sm font-medium text-gray-500">유형</th>
                  <th className="text-right px-6 py-4 text-sm font-medium text-gray-500">금액</th>
                  <th className="text-center px-6 py-4 text-sm font-medium text-gray-500">상태</th>
                  <th className="text-center px-6 py-4 text-sm font-medium text-gray-500">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {orders.map((order) => (
                  <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {order.paidAt
                        ? new Date(order.paidAt).toLocaleDateString('ko-KR')
                        : order.createdAt
                        ? new Date(order.createdAt).toLocaleDateString('ko-KR')
                        : '-'}
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">
                      {order.memberInfo?.businessName || '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {order.memberInfo?.ownerName || '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {order.memberInfo?.email || order.email || '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {getPlanName(order.plan)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 text-right font-medium">
                      {order.amount?.toLocaleString()}원
                    </td>
                    <td className="px-6 py-4 text-center">
                      {getStatusBadge(order.status)}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {order.isTest ? (
                        <span className="px-2 py-1 text-xs font-medium bg-orange-100 text-orange-700 rounded-full">테스트</span>
                      ) : (
                        <span className="text-gray-400">-</span>
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
                <ChevronLeft className="w-5 h-5" />
              </button>
              <span className="text-sm text-gray-600">
                {pagination.page} / {pagination.totalPages}
              </span>
              <button
                onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                disabled={pagination.page === pagination.totalPages}
                className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
