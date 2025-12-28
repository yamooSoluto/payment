'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, User, Sofa, CreditCard, FloppyDisk, RefreshDouble } from 'iconoir-react';

interface Member {
  id: string;
  email: string;
  name: string;
  phone: string;
  createdAt: string;
  memo?: string;
}

interface TenantSubscription {
  plan: string;
  status: string;
  amount: number;
  nextBillingDate: string | null;
  currentPeriodEnd: string | null;
  pricePolicy: string | null;
  priceProtectedUntil: string | null;
  originalAmount: number | null;
}

interface TenantInfo {
  docId: string;
  tenantId: string;
  brandName: string;
  address?: string;
  createdAt: string | null;
  subscription: TenantSubscription | null;
}

interface Payment {
  id: string;
  amount: number;
  status: string;
  planId: string;
  tenantId?: string;
  createdAt: string;
  paidAt: string | null;
}

const PRICE_POLICY_LABELS: Record<string, string> = {
  grandfathered: '가격 보호 (영구)',
  protected_until: '기간 한정 보호',
  standard: '일반',
};

export default function MemberDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [member, setMember] = useState<Member | null>(null);
  const [tenants, setTenants] = useState<TenantInfo[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    memo: '',
  });
  const [pricePolicyModal, setPricePolicyModal] = useState<{
    isOpen: boolean;
    tenantId: string;
    currentPolicy: string;
    currentAmount: number;
    protectedUntil: string | null;
  } | null>(null);
  const [policyFormData, setPolicyFormData] = useState({
    pricePolicy: 'standard',
    priceProtectedUntil: '',
    amount: 0,
  });
  const [savingPolicy, setSavingPolicy] = useState(false);

  useEffect(() => {
    fetchMemberDetail();
  }, [id]);

  const fetchMemberDetail = async () => {
    try {
      const response = await fetch(`/api/admin/members/${id}`);
      if (response.ok) {
        const data = await response.json();
        setMember(data.member);
        setTenants(data.tenants || []);
        setPayments(data.payments || []);
        setFormData({
          name: data.member.name || '',
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

  const openPricePolicyModal = (tenant: TenantInfo) => {
    if (!tenant.subscription) return;
    setPricePolicyModal({
      isOpen: true,
      tenantId: tenant.tenantId,
      currentPolicy: tenant.subscription.pricePolicy || 'standard',
      currentAmount: tenant.subscription.amount,
      protectedUntil: tenant.subscription.priceProtectedUntil,
    });
    setPolicyFormData({
      pricePolicy: tenant.subscription.pricePolicy || 'standard',
      priceProtectedUntil: tenant.subscription.priceProtectedUntil?.split('T')[0] || '',
      amount: tenant.subscription.amount,
    });
  };

  const handleSavePricePolicy = async () => {
    if (!pricePolicyModal) return;
    setSavingPolicy(true);
    try {
      const response = await fetch('/api/admin/subscriptions/price-policy', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: pricePolicyModal.tenantId,
          pricePolicy: policyFormData.pricePolicy,
          priceProtectedUntil: policyFormData.pricePolicy === 'protected_until' ? policyFormData.priceProtectedUntil : null,
          amount: policyFormData.amount,
        }),
      });

      if (response.ok) {
        setPricePolicyModal(null);
        fetchMemberDetail();
      } else {
        const data = await response.json();
        alert(data.error || '가격 정책 변경에 실패했습니다.');
      }
    } catch (error) {
      console.error('Failed to save price policy:', error);
      alert('오류가 발생했습니다.');
    } finally {
      setSavingPolicy(false);
    }
  };

  const getStatusBadge = (status: string, size: 'sm' | 'md' = 'md') => {
    const sizeClass = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm';
    switch (status) {
      case 'active':
        return <span className={`${sizeClass} font-medium bg-green-100 text-green-700 rounded-full`}>활성</span>;
      case 'trial':
        return <span className={`${sizeClass} font-medium bg-blue-100 text-blue-700 rounded-full`}>체험중</span>;
      case 'canceled':
        return <span className={`${sizeClass} font-medium bg-gray-100 text-gray-700 rounded-full`}>해지</span>;
      case 'past_due':
        return <span className={`${sizeClass} font-medium bg-red-100 text-red-700 rounded-full`}>연체</span>;
      default:
        return <span className={`${sizeClass} font-medium bg-gray-100 text-gray-500 rounded-full`}>{status || '-'}</span>;
    }
  };

  const getPlanName = (planId: string) => {
    switch (planId) {
      case 'basic': return 'Basic';
      case 'business': return 'Business';
      case 'enterprise': return 'Enterprise';
      case 'trial': return 'Trial';
      default: return planId || '-';
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
        <RefreshDouble className="w-8 h-8 text-blue-600 animate-spin" />
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
            <h1 className="text-2xl font-bold text-gray-900">{member.name || '이름 없음'}</h1>
            <p className="text-sm text-gray-500">{member.email}</p>
          </div>
          <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded-full">
            매장 {tenants.length}개
          </span>
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
                {saving ? <RefreshDouble className="w-4 h-4 animate-spin" /> : <FloppyDisk className="w-4 h-4" />}
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
                <label className="block text-sm text-gray-500 mb-1">이름</label>
                {editMode ? (
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                ) : (
                  <p className="font-medium">{member.name || '-'}</p>
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
          {/* 매장 목록 */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <div className="flex items-center gap-2 mb-4">
              <Sofa className="w-5 h-5 text-blue-600" />
              <h2 className="text-lg font-semibold">매장 목록</h2>
            </div>
            {tenants.length === 0 ? (
              <p className="text-gray-500 text-center py-4">등록된 매장이 없습니다.</p>
            ) : (
              <ul className="space-y-3">
                {tenants.map((tenant) => (
                  <li key={tenant.tenantId} className="p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-start justify-between">
                      <p className="font-medium text-gray-900">{tenant.brandName}</p>
                      {tenant.subscription && getStatusBadge(tenant.subscription.status, 'sm')}
                    </div>
                    {tenant.address && <p className="text-sm text-gray-500 mt-1">{tenant.address}</p>}
                    {tenant.subscription && (
                      <div className="mt-2 text-sm text-gray-600">
                        <div className="flex justify-between">
                          <span>플랜</span>
                          <span className="font-medium">{getPlanName(tenant.subscription.plan)}</span>
                        </div>
                        {tenant.subscription.amount > 0 && (
                          <div className="flex justify-between">
                            <span>금액</span>
                            <span>{tenant.subscription.amount.toLocaleString()}원/월</span>
                          </div>
                        )}
                        {tenant.subscription.nextBillingDate && (
                          <div className="flex justify-between">
                            <span>다음 결제일</span>
                            <span>{new Date(tenant.subscription.nextBillingDate).toLocaleDateString('ko-KR')}</span>
                          </div>
                        )}
                        {/* 가격 정책 */}
                        <div className="flex justify-between items-center mt-1">
                          <span>가격 정책</span>
                          <span className={`text-xs px-2 py-0.5 rounded ${
                            tenant.subscription.pricePolicy === 'grandfathered'
                              ? 'bg-purple-100 text-purple-700'
                              : tenant.subscription.pricePolicy === 'protected_until'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-gray-100 text-gray-600'
                          }`}>
                            {PRICE_POLICY_LABELS[tenant.subscription.pricePolicy || 'standard']}
                          </span>
                        </div>
                        {tenant.subscription.pricePolicy === 'protected_until' && tenant.subscription.priceProtectedUntil && (
                          <div className="flex justify-between text-xs text-amber-600 mt-1">
                            <span>보호 기간</span>
                            <span>~{new Date(tenant.subscription.priceProtectedUntil).toLocaleDateString('ko-KR')}</span>
                          </div>
                        )}
                        {tenant.subscription.originalAmount && tenant.subscription.originalAmount !== tenant.subscription.amount && (
                          <div className="flex justify-between text-xs text-gray-500 mt-1">
                            <span>원래 금액</span>
                            <span>{tenant.subscription.originalAmount.toLocaleString()}원</span>
                          </div>
                        )}
                        {tenant.subscription.status === 'active' && (
                          <button
                            onClick={() => openPricePolicyModal(tenant)}
                            className="w-full mt-2 px-3 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded transition-colors"
                          >
                            가격 정책 변경
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* 가격 정책 변경 모달 */}
      {pricePolicyModal?.isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl">
            <h3 className="text-lg font-semibold mb-4">가격 정책 변경</h3>

            <div className="space-y-4">
              {/* 현재 정보 */}
              <div className="bg-gray-50 rounded-lg p-3 text-sm">
                <div className="flex justify-between mb-1">
                  <span className="text-gray-500">현재 결제 금액</span>
                  <span className="font-medium">{pricePolicyModal.currentAmount.toLocaleString()}원</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">현재 정책</span>
                  <span className="font-medium">{PRICE_POLICY_LABELS[pricePolicyModal.currentPolicy]}</span>
                </div>
              </div>

              {/* 가격 정책 선택 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  새 가격 정책
                </label>
                <div className="space-y-2">
                  <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                    <input
                      type="radio"
                      name="pricePolicy"
                      value="grandfathered"
                      checked={policyFormData.pricePolicy === 'grandfathered'}
                      onChange={(e) => setPolicyFormData({ ...policyFormData, pricePolicy: e.target.value })}
                      className="mt-0.5"
                    />
                    <div>
                      <p className="font-medium text-sm">가격 보호 (영구)</p>
                      <p className="text-xs text-gray-500">플랜 가격이 변경되어도 영구적으로 현재 금액 유지</p>
                    </div>
                  </label>
                  <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                    <input
                      type="radio"
                      name="pricePolicy"
                      value="protected_until"
                      checked={policyFormData.pricePolicy === 'protected_until'}
                      onChange={(e) => setPolicyFormData({ ...policyFormData, pricePolicy: e.target.value })}
                      className="mt-0.5"
                    />
                    <div className="flex-1">
                      <p className="font-medium text-sm">기간 한정 보호</p>
                      <p className="text-xs text-gray-500">지정 날짜까지만 현재 금액 유지</p>
                    </div>
                  </label>
                  <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                    <input
                      type="radio"
                      name="pricePolicy"
                      value="standard"
                      checked={policyFormData.pricePolicy === 'standard'}
                      onChange={(e) => setPolicyFormData({ ...policyFormData, pricePolicy: e.target.value })}
                      className="mt-0.5"
                    />
                    <div>
                      <p className="font-medium text-sm">일반 (최신 가격 적용)</p>
                      <p className="text-xs text-gray-500">플랜 가격이 변경되면 다음 결제부터 새 가격 적용</p>
                    </div>
                  </label>
                </div>
              </div>

              {/* 기간 한정일 경우 날짜 선택 */}
              {policyFormData.pricePolicy === 'protected_until' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    보호 종료일
                  </label>
                  <input
                    type="date"
                    value={policyFormData.priceProtectedUntil}
                    onChange={(e) => setPolicyFormData({ ...policyFormData, priceProtectedUntil: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                    min={new Date().toISOString().split('T')[0]}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    이 날짜까지 현재 금액이 유지되고, 이후 최신 플랜 가격이 적용됩니다.
                  </p>
                </div>
              )}

              {/* 금액 직접 설정 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  결제 금액 (원)
                </label>
                <input
                  type="number"
                  value={policyFormData.amount}
                  onChange={(e) => setPolicyFormData({ ...policyFormData, amount: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  다음 정기결제부터 이 금액으로 청구됩니다.
                </p>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setPricePolicyModal(null)}
                className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleSavePricePolicy}
                disabled={savingPolicy || (policyFormData.pricePolicy === 'protected_until' && !policyFormData.priceProtectedUntil)}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {savingPolicy ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
