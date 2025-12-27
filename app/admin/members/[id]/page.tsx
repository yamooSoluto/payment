'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, User, Store, CreditCard, Save, Loader2 } from 'lucide-react';

interface Member {
  id: string;
  businessName: string;
  ownerName: string;
  email: string;
  phone: string;
  planId: string;
  subscriptionStatus: string;
  subscriptionStartDate: string | null;
  subscriptionEndDate: string | null;
  trialEndDate: string | null;
  createdAt: string;
  memo?: string;
}

interface Payment {
  id: string;
  amount: number;
  status: string;
  planId: string;
  createdAt: string;
  paidAt: string | null;
}

interface StoreInfo {
  id: string;
  name: string;
  address?: string;
}

export default function MemberDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [member, setMember] = useState<Member | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [stores, setStores] = useState<StoreInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState({
    businessName: '',
    ownerName: '',
    phone: '',
    memo: '',
  });

  useEffect(() => {
    fetchMemberDetail();
  }, [id]);

  const fetchMemberDetail = async () => {
    try {
      const response = await fetch(`/api/admin/members/${id}`);
      if (response.ok) {
        const data = await response.json();
        setMember(data.member);
        setPayments(data.payments);
        setStores(data.stores);
        setFormData({
          businessName: data.member.businessName || '',
          ownerName: data.member.ownerName || '',
          phone: data.member.phone || '',
          memo: data.member.memo || '',
        });
      }
    } catch (error) {
      console.error('Failed to fetch member:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch(`/api/admin/members/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        setEditMode(false);
        fetchMemberDetail();
      }
    } catch (error) {
      console.error('Failed to save member:', error);
    } finally {
      setSaving(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <span className="px-3 py-1 text-sm font-medium bg-green-100 text-green-700 rounded-full">활성</span>;
      case 'trial':
        return <span className="px-3 py-1 text-sm font-medium bg-blue-100 text-blue-700 rounded-full">체험중</span>;
      case 'canceled':
        return <span className="px-3 py-1 text-sm font-medium bg-gray-100 text-gray-700 rounded-full">해지</span>;
      case 'past_due':
        return <span className="px-3 py-1 text-sm font-medium bg-red-100 text-red-700 rounded-full">연체</span>;
      default:
        return <span className="px-3 py-1 text-sm font-medium bg-gray-100 text-gray-500 rounded-full">{status || '-'}</span>;
    }
  };

  const getPaymentStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded">완료</span>;
      case 'pending':
        return <span className="px-2 py-0.5 text-xs bg-yellow-100 text-yellow-700 rounded">대기</span>;
      case 'failed':
        return <span className="px-2 py-0.5 text-xs bg-red-100 text-red-700 rounded">실패</span>;
      case 'refunded':
        return <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-700 rounded">환불</span>;
      default:
        return <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-500 rounded">{status}</span>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  if (!member) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500">회원을 찾을 수 없습니다.</p>
        <button
          onClick={() => router.back()}
          className="mt-4 text-blue-600 hover:underline"
        >
          돌아가기
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{member.businessName || '이름 없음'}</h1>
            <p className="text-sm text-gray-500">{member.email}</p>
          </div>
          {getStatusBadge(member.subscriptionStatus)}
        </div>
        <div className="flex gap-2">
          {editMode ? (
            <>
              <button
                onClick={() => setEditMode(false)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                저장
              </button>
            </>
          ) : (
            <button
              onClick={() => setEditMode(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              수정
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 기본 정보 */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <div className="flex items-center gap-2 mb-4">
              <User className="w-5 h-5 text-blue-600" />
              <h2 className="text-lg font-semibold">기본 정보</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-500 mb-1">매장명</label>
                {editMode ? (
                  <input
                    type="text"
                    value={formData.businessName}
                    onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                ) : (
                  <p className="font-medium">{member.businessName || '-'}</p>
                )}
              </div>
              <div>
                <label className="block text-sm text-gray-500 mb-1">대표자명</label>
                {editMode ? (
                  <input
                    type="text"
                    value={formData.ownerName}
                    onChange={(e) => setFormData({ ...formData, ownerName: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                ) : (
                  <p className="font-medium">{member.ownerName || '-'}</p>
                )}
              </div>
              <div>
                <label className="block text-sm text-gray-500 mb-1">이메일</label>
                <p className="font-medium">{member.email || '-'}</p>
              </div>
              <div>
                <label className="block text-sm text-gray-500 mb-1">연락처</label>
                {editMode ? (
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                ) : (
                  <p className="font-medium">{member.phone || '-'}</p>
                )}
              </div>
              <div>
                <label className="block text-sm text-gray-500 mb-1">가입일</label>
                <p className="font-medium">
                  {member.createdAt ? new Date(member.createdAt).toLocaleDateString('ko-KR') : '-'}
                </p>
              </div>
              <div>
                <label className="block text-sm text-gray-500 mb-1">플랜</label>
                <p className="font-medium">{member.planId || '-'}</p>
              </div>
            </div>
            {/* 메모 */}
            <div className="mt-4">
              <label className="block text-sm text-gray-500 mb-1">메모</label>
              {editMode ? (
                <textarea
                  value={formData.memo}
                  onChange={(e) => setFormData({ ...formData, memo: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="관리자 메모"
                />
              ) : (
                <p className="text-gray-600">{member.memo || '-'}</p>
              )}
            </div>
          </div>

          {/* 결제 내역 */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <div className="flex items-center gap-2 mb-4">
              <CreditCard className="w-5 h-5 text-blue-600" />
              <h2 className="text-lg font-semibold">결제 내역</h2>
            </div>
            {payments.length === 0 ? (
              <p className="text-gray-500 text-center py-8">결제 내역이 없습니다.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-max">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-4 py-2 text-sm font-medium text-gray-500">결제일</th>
                      <th className="text-left px-4 py-2 text-sm font-medium text-gray-500">플랜</th>
                      <th className="text-right px-4 py-2 text-sm font-medium text-gray-500">금액</th>
                      <th className="text-center px-4 py-2 text-sm font-medium text-gray-500">상태</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {payments.map((payment) => (
                      <tr key={payment.id}>
                        <td className="px-4 py-3 text-sm">
                          {payment.paidAt
                            ? new Date(payment.paidAt).toLocaleDateString('ko-KR')
                            : payment.createdAt
                            ? new Date(payment.createdAt).toLocaleDateString('ko-KR')
                            : '-'}
                        </td>
                        <td className="px-4 py-3 text-sm">{payment.planId || '-'}</td>
                        <td className="px-4 py-3 text-sm text-right">
                          {payment.amount?.toLocaleString()}원
                        </td>
                        <td className="px-4 py-3 text-center">
                          {getPaymentStatusBadge(payment.status)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* 사이드바 */}
        <div className="space-y-6">
          {/* 구독 정보 */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <h2 className="text-lg font-semibold mb-4">구독 정보</h2>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-500">상태</span>
                {getStatusBadge(member.subscriptionStatus)}
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">시작일</span>
                <span className="font-medium">
                  {member.subscriptionStartDate
                    ? new Date(member.subscriptionStartDate).toLocaleDateString('ko-KR')
                    : '-'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">종료일</span>
                <span className="font-medium">
                  {member.subscriptionEndDate
                    ? new Date(member.subscriptionEndDate).toLocaleDateString('ko-KR')
                    : '-'}
                </span>
              </div>
              {member.trialEndDate && (
                <div className="flex justify-between">
                  <span className="text-gray-500">체험 종료</span>
                  <span className="font-medium">
                    {new Date(member.trialEndDate).toLocaleDateString('ko-KR')}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* 매장 목록 */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <div className="flex items-center gap-2 mb-4">
              <Store className="w-5 h-5 text-blue-600" />
              <h2 className="text-lg font-semibold">매장 목록</h2>
            </div>
            {stores.length === 0 ? (
              <p className="text-gray-500 text-center py-4">등록된 매장이 없습니다.</p>
            ) : (
              <ul className="space-y-2">
                {stores.map((store) => (
                  <li key={store.id} className="p-3 bg-gray-50 rounded-lg">
                    <p className="font-medium">{store.name}</p>
                    {store.address && <p className="text-sm text-gray-500">{store.address}</p>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
