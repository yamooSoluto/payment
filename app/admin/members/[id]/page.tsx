'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, User, Sofa, CreditCard, FloppyDisk, RefreshDouble, HandCash, Plus, EditPencil, Trash, Calendar, NavArrowLeft, NavArrowRight, Xmark, Search, Filter, Download } from 'iconoir-react';
import * as XLSX from 'xlsx';
import { INDUSTRY_OPTIONS } from '@/lib/constants';
import Spinner from '@/components/admin/Spinner';

interface Member {
  id: string;
  email: string;
  name: string;
  phone: string;
  createdAt: string;
  memo?: string;
  lastLoginAt?: string | null;
  lastLoginIP?: string | null;
  totalAmount?: number;
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
  industry?: string;
  address?: string;
  createdAt: string | null;
  subscription: TenantSubscription | null;
}

interface Payment {
  id: string;
  amount: number;
  status: string;
  planId: string;
  plan?: string;
  tenantId?: string;
  orderId?: string;
  category?: string;
  type?: string;
  transactionType?: 'charge' | 'refund';
  initiatedBy?: 'system' | 'admin' | 'user';
  adminId?: string;
  adminName?: string;
  changeGroupId?: string;
  receiptUrl?: string;
  createdAt: string;
  paidAt: string | null;
  // 카드 정보
  cardInfo?: { company?: string; number?: string };
  cardCompany?: string;
  cardNumber?: string;
  // 환불 관련
  originalPaymentId?: string;
  refundReason?: string;
  cancelReason?: string;
  // 기타
  email?: string;
  [key: string]: unknown;
}

const PRICE_POLICY_LABELS: Record<string, string> = {
  grandfathered: '가격 보호 (영구)',
  protected_until: '기간 한정 보호',
  standard: '일반',
};

const PAYMENT_CATEGORY_LABELS: Record<string, string> = {
  subscription: '신규 구독',
  recurring: '정기 결제',
  change: '플랜 변경',
  cancel: '구독 취소',
};

const PAYMENT_TYPE_LABELS: Record<string, string> = {
  first_payment: '첫 결제',
  trial_convert: 'Trial 전환',
  auto: '자동 결제',
  retry: '재결제',
  upgrade: '업그레이드',
  downgrade: '다운그레이드',
  immediate: '즉시 취소',
  end_of_period: '기간 만료',
  admin_manual: '관리자 수동',
  admin_refund: '관리자 환불',
};

const TRANSACTION_TYPE_LABELS: Record<string, string> = {
  charge: '결제',
  refund: '환불',
};

const INITIATED_BY_LABELS: Record<string, string> = {
  system: '자동',
  admin: '관리자',
  user: '회원',
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
    newEmail: '',
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

  // 수동 결제 모달 상태
  const [manualChargeModal, setManualChargeModal] = useState<{
    isOpen: boolean;
    tenantId: string;
    tenantName: string;
  } | null>(null);
  const [chargeFormData, setChargeFormData] = useState({
    plan: 'basic',
    amount: 39000,
    reason: '',
    selectedCardId: '',
  });
  const [chargeInfo, setChargeInfo] = useState<{
    canCharge: boolean;
    email?: string;
    cards?: Array<{
      id: string;
      cardInfo?: { company?: string; number?: string; cardType?: string };
      alias?: string;
      isPrimary?: boolean;
    }>;
    reason?: string;
  } | null>(null);
  const [loadingChargeInfo, setLoadingChargeInfo] = useState(false);
  const [processingCharge, setProcessingCharge] = useState(false);
  const [expandedTenantId, setExpandedTenantId] = useState<string | null>(null);

  // 매장 추가 모달 상태
  const [addTenantModal, setAddTenantModal] = useState(false);
  const [addTenantForm, setAddTenantForm] = useState({ brandName: '', industry: '' });
  const [addingTenant, setAddingTenant] = useState(false);

  // 매장 수정 모달 상태
  const [editTenantModal, setEditTenantModal] = useState<{ isOpen: boolean; tenant: TenantInfo | null }>({ isOpen: false, tenant: null });
  const [editTenantForm, setEditTenantForm] = useState({ brandName: '' });
  const [editingTenant, setEditingTenant] = useState(false);

  // 구독 정보 수정 모달 상태
  const [editSubModal, setEditSubModal] = useState<{ isOpen: boolean; tenant: TenantInfo | null }>({ isOpen: false, tenant: null });
  const [editSubForm, setEditSubForm] = useState({
    plan: 'basic',
    status: 'active',
    amount: 39000,
    currentPeriodStart: '',
    currentPeriodEnd: '',
    nextBillingDate: '',
  });
  const [editingSub, setEditingSub] = useState(false);

  // 비밀번호 변경 모달 상태
  const [passwordModal, setPasswordModal] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    newPassword: '',
    confirmPassword: '',
  });
  const [changingPassword, setChangingPassword] = useState(false);

  // 결제 내역 페이지네이션 및 필터 상태
  const [paymentPage, setPaymentPage] = useState(1);
  const [paymentFilterType, setPaymentFilterType] = useState<'thisMonth' | 'custom'>('thisMonth');
  const [paymentDateRange, setPaymentDateRange] = useState<{ start: string; end: string }>({ start: '', end: '' });
  const [showDatePickerModal, setShowDatePickerModal] = useState(false);
  const [tempDateRange, setTempDateRange] = useState<{ start: string; end: string }>({ start: '', end: '' });
  const [paymentDetailModal, setPaymentDetailModal] = useState<Payment | null>(null);
  const [paymentSearchId, setPaymentSearchId] = useState('');
  const [showPaymentFilter, setShowPaymentFilter] = useState(false);
  const [paymentTypeFilter, setPaymentTypeFilter] = useState<'all' | 'charge' | 'refund'>('all');
  const [paymentTenantFilter, setPaymentTenantFilter] = useState<string>('all');
  const [paymentPlanFilter, setPaymentPlanFilter] = useState<string>('all');
  const PAYMENTS_PER_PAGE = 10;

  // 이번달 시작/끝 날짜 계산
  const getThisMonthRange = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { start, end };
  };

  // 필터링된 결제 내역
  const filteredPayments = payments.filter((payment) => {
    // 검색어 필터 (ID, orderId, 매장명)
    if (paymentSearchId) {
      const searchLower = paymentSearchId.toLowerCase();
      const paymentIdMatch = payment.id.toLowerCase().includes(searchLower);
      const orderIdMatch = (payment.orderId as string)?.toLowerCase().includes(searchLower);
      const tenantName = tenants.find(t => t.tenantId === payment.tenantId)?.brandName || '';
      const tenantMatch = tenantName.toLowerCase().includes(searchLower);
      if (!paymentIdMatch && !orderIdMatch && !tenantMatch) {
        return false;
      }
    }

    // 유형 필터 (결제/환불)
    if (paymentTypeFilter !== 'all') {
      const isRefund = payment.transactionType === 'refund' || (payment.amount ?? 0) < 0;
      if (paymentTypeFilter === 'charge' && isRefund) return false;
      if (paymentTypeFilter === 'refund' && !isRefund) return false;
    }

    // 매장 필터
    if (paymentTenantFilter !== 'all' && payment.tenantId !== paymentTenantFilter) {
      return false;
    }

    // 플랜 필터
    if (paymentPlanFilter !== 'all' && payment.plan !== paymentPlanFilter) {
      return false;
    }

    // 날짜 필터
    const paymentDate = new Date(payment.paidAt || payment.createdAt);

    if (paymentFilterType === 'thisMonth') {
      const { start, end } = getThisMonthRange();
      return paymentDate >= start && paymentDate <= end;
    } else if (paymentFilterType === 'custom' && paymentDateRange.start && paymentDateRange.end) {
      const start = new Date(paymentDateRange.start);
      const end = new Date(paymentDateRange.end);
      end.setHours(23, 59, 59, 999);
      return paymentDate >= start && paymentDate <= end;
    }
    return true;
  });

  // 페이지네이션 계산
  const totalPaymentPages = Math.ceil(filteredPayments.length / PAYMENTS_PER_PAGE);
  const paginatedPayments = filteredPayments.slice(
    (paymentPage - 1) * PAYMENTS_PER_PAGE,
    paymentPage * PAYMENTS_PER_PAGE
  );

  // 이번달 필터 선택
  const handleThisMonthFilter = () => {
    setPaymentFilterType('thisMonth');
    setPaymentDateRange({ start: '', end: '' });
    setPaymentPage(1);
  };

  // 직접 입력 모달 열기
  const handleOpenDatePicker = () => {
    const today = new Date().toISOString().split('T')[0];
    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    setTempDateRange(paymentDateRange.start ? paymentDateRange : { start: monthAgo, end: today });
    setShowDatePickerModal(true);
  };

  // 날짜 범위 적용
  const handleApplyDateRange = () => {
    if (tempDateRange.start && tempDateRange.end) {
      setPaymentFilterType('custom');
      setPaymentDateRange(tempDateRange);
      setPaymentPage(1);
      setShowDatePickerModal(false);
    }
  };

  // 결제 내역 xlsx 내보내기
  const handleExportPayments = () => {
    if (filteredPayments.length === 0) {
      alert('내보낼 결제 내역이 없습니다.');
      return;
    }

    const exportData = filteredPayments.map((payment) => {
      const isRefund = payment.transactionType === 'refund' || (payment.amount ?? 0) < 0;
      const tenant = tenants.find(t => t.tenantId === payment.tenantId);

      return {
        '유형': isRefund ? '환불' : '결제',
        'ID': payment.orderId || payment.id,
        '날짜': payment.paidAt
          ? new Date(payment.paidAt).toLocaleString('ko-KR')
          : payment.createdAt
          ? new Date(payment.createdAt).toLocaleString('ko-KR')
          : '-',
        '매장': tenant?.brandName || '-',
        '플랜': payment.plan || '-',
        '금액': payment.amount ?? 0,
        '분류': payment.category ? PAYMENT_CATEGORY_LABELS[payment.category] || payment.category : '-',
        '거래 유형': payment.type ? PAYMENT_TYPE_LABELS[payment.type] || payment.type : '-',
        '처리자': payment.initiatedBy ? INITIATED_BY_LABELS[payment.initiatedBy] || payment.initiatedBy : '-',
        '상태': payment.status || '-',
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '결제 내역');

    // 열 너비 설정
    worksheet['!cols'] = [
      { wch: 8 },   // 유형
      { wch: 30 },  // ID
      { wch: 22 },  // 날짜
      { wch: 15 },  // 매장
      { wch: 12 },  // 플랜
      { wch: 12 },  // 금액
      { wch: 15 },  // 분류
      { wch: 15 },  // 거래 유형
      { wch: 10 },  // 처리자
      { wch: 10 },  // 상태
    ];

    // 파일명에 날짜 포함
    const today = new Date().toISOString().split('T')[0];
    const fileName = `결제내역_${member?.name || member?.email || 'unknown'}_${today}.xlsx`;

    XLSX.writeFile(workbook, fileName);
  };

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
          newEmail: data.member.email || '',
        });
      }
    } catch (error) {
      console.error('Failed to fetch member:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    // 이메일 변경 시 확인
    if (formData.newEmail && member && formData.newEmail.toLowerCase() !== member.email.toLowerCase()) {
      const confirmed = confirm(
        `이메일을 변경하시겠습니까?\n\n` +
        `기존: ${member.email}\n` +
        `변경: ${formData.newEmail}\n\n` +
        `⚠️ 변경 후 사용자는 새 이메일로 재로그인해야 합니다.`
      );
      if (!confirmed) return;
    }

    setSaving(true);
    try {
      const response = await fetch(`/api/admin/members/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (response.ok) {
        setEditMode(false);
        // 이메일이 변경된 경우 새 URL로 이동
        if (data.newEmail) {
          alert(data.message || '이메일이 변경되었습니다.');
          router.replace(`/admin/members/${encodeURIComponent(data.newEmail)}`);
        } else {
          fetchMemberDetail();
        }
      } else {
        alert(data.error || '저장에 실패했습니다.');
      }
    } catch (error) {
      console.error('Failed to save member:', error);
      alert('저장 중 오류가 발생했습니다.');
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

  // 수동 결제 모달 열기
  const openManualChargeModal = async (tenant: TenantInfo) => {
    setManualChargeModal({
      isOpen: true,
      tenantId: tenant.tenantId,
      tenantName: tenant.brandName,
    });
    setChargeInfo(null);
    setLoadingChargeInfo(true);

    // 플랜별 기본 금액 설정
    const planPrices: Record<string, number> = {
      basic: 39000,
      business: 99000,
    };
    const currentPlan = tenant.subscription?.plan || 'basic';
    const defaultPlan = currentPlan === 'trial' ? 'basic' : currentPlan;
    setChargeFormData({
      plan: defaultPlan,
      amount: planPrices[defaultPlan] || 39000,
      reason: '',
      selectedCardId: '',
    });

    // 결제 가능 여부 확인 및 카드 목록 조회
    try {
      const response = await fetch(`/api/admin/payments/manual-charge?tenantId=${tenant.tenantId}`);
      const data = await response.json();
      setChargeInfo(data);
      // 첫 번째 카드(primary)를 기본 선택
      if (data.cards && data.cards.length > 0) {
        setChargeFormData(prev => ({ ...prev, selectedCardId: data.cards[0].id }));
      }
    } catch (error) {
      console.error('Failed to check charge availability:', error);
      setChargeInfo({ canCharge: false, reason: '정보를 불러올 수 없습니다.' });
    } finally {
      setLoadingChargeInfo(false);
    }
  };

  // 수동 결제 실행
  const handleManualCharge = async () => {
    if (!manualChargeModal || !chargeInfo?.canCharge) return;

    if (!confirm(`${chargeFormData.amount.toLocaleString()}원을 결제하시겠습니까?`)) {
      return;
    }

    setProcessingCharge(true);
    try {
      const response = await fetch('/api/admin/payments/manual-charge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: manualChargeModal.tenantId,
          plan: chargeFormData.plan,
          amount: chargeFormData.amount,
          reason: chargeFormData.reason || '관리자 수동 결제',
          cardId: chargeFormData.selectedCardId || undefined,
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        alert(`결제가 완료되었습니다.\n주문번호: ${data.orderId}\n금액: ${data.amount.toLocaleString()}원`);
        setManualChargeModal(null);
        fetchMemberDetail(); // 데이터 새로고침
      } else {
        alert(data.error || '결제에 실패했습니다.');
      }
    } catch (error) {
      console.error('Manual charge failed:', error);
      alert('결제 처리 중 오류가 발생했습니다.');
    } finally {
      setProcessingCharge(false);
    }
  };

  // 플랜 변경 시 금액 자동 설정
  const handlePlanChange = (plan: string) => {
    const planPrices: Record<string, number> = {
      basic: 39000,
      business: 99000,
    };
    setChargeFormData({
      ...chargeFormData,
      plan,
      amount: planPrices[plan] || chargeFormData.amount,
    });
  };

  // 매장 추가
  const handleAddTenant = async () => {
    if (!addTenantForm.brandName.trim() || !addTenantForm.industry) {
      alert('매장명과 업종을 입력해주세요.');
      return;
    }
    setAddingTenant(true);
    try {
      const response = await fetch('/api/admin/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: member?.email,
          brandName: addTenantForm.brandName.trim(),
          industry: addTenantForm.industry,
        }),
      });
      const data = await response.json();
      if (response.ok) {
        alert('매장이 추가되었습니다.');
        setAddTenantModal(false);
        setAddTenantForm({ brandName: '', industry: '' });
        fetchMemberDetail();
      } else {
        alert(data.error || '매장 추가에 실패했습니다.');
      }
    } catch (error) {
      console.error('Failed to add tenant:', error);
      alert('오류가 발생했습니다.');
    } finally {
      setAddingTenant(false);
    }
  };

  // 매장 수정
  const handleEditTenant = async () => {
    if (!editTenantModal.tenant || !editTenantForm.brandName.trim()) {
      alert('매장명을 입력해주세요.');
      return;
    }
    setEditingTenant(true);
    try {
      const response = await fetch(`/api/admin/tenants/${editTenantModal.tenant.tenantId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandName: editTenantForm.brandName.trim() }),
      });
      const data = await response.json();
      if (response.ok) {
        alert('매장 정보가 수정되었습니다.');
        setEditTenantModal({ isOpen: false, tenant: null });
        fetchMemberDetail();
      } else {
        alert(data.error || '매장 수정에 실패했습니다.');
      }
    } catch (error) {
      console.error('Failed to edit tenant:', error);
      alert('오류가 발생했습니다.');
    } finally {
      setEditingTenant(false);
    }
  };

  // 매장 삭제
  const handleDeleteTenant = async (tenant: TenantInfo) => {
    if (!confirm(`'${tenant.brandName}' 매장을 삭제하시겠습니까?\n\n삭제 후 90일간 복구 가능합니다.`)) {
      return;
    }
    try {
      const response = await fetch(`/api/admin/tenants/${tenant.tenantId}`, {
        method: 'DELETE',
      });
      const data = await response.json();
      if (response.ok) {
        alert('매장이 삭제되었습니다.');
        fetchMemberDetail();
      } else {
        alert(data.error || '매장 삭제에 실패했습니다.');
      }
    } catch (error) {
      console.error('Failed to delete tenant:', error);
      alert('오류가 발생했습니다.');
    }
  };

  // 구독 수정 모달 열기
  const openEditSubModal = (tenant: TenantInfo) => {
    const sub = tenant.subscription;
    setEditSubModal({ isOpen: true, tenant });
    setEditSubForm({
      plan: sub?.plan || 'basic',
      status: sub?.status || 'active',
      amount: sub?.amount || 39000,
      currentPeriodStart: '',
      currentPeriodEnd: sub?.currentPeriodEnd?.split('T')[0] || '',
      nextBillingDate: sub?.nextBillingDate?.split('T')[0] || '',
    });
  };

  // 구독 정보 수정
  const handleEditSubscription = async () => {
    if (!editSubModal.tenant) return;
    setEditingSub(true);
    try {
      const response = await fetch(`/api/admin/subscriptions/${editSubModal.tenant.tenantId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan: editSubForm.plan,
          status: editSubForm.status,
          amount: editSubForm.amount,
          currentPeriodStart: editSubForm.currentPeriodStart || undefined,
          currentPeriodEnd: editSubForm.currentPeriodEnd || undefined,
          nextBillingDate: editSubForm.nextBillingDate || undefined,
        }),
      });
      const data = await response.json();
      if (response.ok) {
        alert('구독 정보가 수정되었습니다.');
        setEditSubModal({ isOpen: false, tenant: null });
        fetchMemberDetail();
      } else {
        alert(data.error || '구독 정보 수정에 실패했습니다.');
      }
    } catch (error) {
      console.error('Failed to edit subscription:', error);
      alert('오류가 발생했습니다.');
    } finally {
      setEditingSub(false);
    }
  };

  // 비밀번호 변경
  const handleChangePassword = async () => {
    if (!passwordForm.newPassword) {
      alert('새 비밀번호를 입력해주세요.');
      return;
    }
    if (passwordForm.newPassword.length < 6) {
      alert('비밀번호는 최소 6자 이상이어야 합니다.');
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      alert('비밀번호가 일치하지 않습니다.');
      return;
    }
    if (!confirm('비밀번호를 변경하시겠습니까?')) {
      return;
    }

    setChangingPassword(true);
    try {
      const response = await fetch(`/api/admin/members/${id}/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword: passwordForm.newPassword }),
      });

      const data = await response.json();

      if (response.ok) {
        alert('비밀번호가 변경되었습니다.');
        setPasswordForm({ newPassword: '', confirmPassword: '' });
        setPasswordModal(false);
      } else {
        alert(data.error || '비밀번호 변경에 실패했습니다.');
      }
    } catch (error) {
      console.error('Failed to change password:', error);
      alert('비밀번호 변경 중 오류가 발생했습니다.');
    } finally {
      setChangingPassword(false);
    }
  };

  // 구독 플랜 변경 시 금액 자동 설정
  const handleSubPlanChange = (plan: string) => {
    const planPrices: Record<string, number> = {
      trial: 0,
      basic: 39000,
      business: 99000,
      enterprise: 199000,
    };
    setEditSubForm({
      ...editSubForm,
      plan,
      amount: planPrices[plan] || editSubForm.amount,
    });
  };

  const getStatusBadge = (status: string | null | undefined, size: 'sm' | 'md' = 'md') => {
    const sizeClass = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm';
    switch (status) {
      case 'active':
        return <span className={`${sizeClass} font-medium bg-green-100 text-green-700 rounded-full`}>구독중</span>;
      case 'trial':
        return <span className={`${sizeClass} font-medium bg-blue-100 text-blue-700 rounded-full`}>체험중</span>;
      case 'canceled':
        return <span className={`${sizeClass} font-medium bg-orange-100 text-orange-700 rounded-full`}>해지 예정</span>;
      case 'expired':
        return <span className={`${sizeClass} font-medium bg-gray-100 text-gray-500 rounded-full`}>만료</span>;
      case 'past_due':
        return <span className={`${sizeClass} font-medium bg-red-100 text-red-700 rounded-full`}>결제 실패</span>;
      case 'deleted':
        return <span className={`${sizeClass} font-medium bg-red-100 text-red-500 rounded-full`}>삭제</span>;
      case null:
      case undefined:
      case '':
        return <span className={`${sizeClass} font-medium bg-gray-100 text-gray-400 rounded-full`}>미구독</span>;
      default:
        return <span className={`${sizeClass} font-medium bg-gray-100 text-gray-500 rounded-full`}>{status}</span>;
    }
  };

  const getPlanName = (planId?: string) => {
    switch (planId) {
      case 'basic': return 'Basic';
      case 'business': return 'Business';
      case 'enterprise': return 'Enterprise';
      case 'trial': return 'Trial';
      default: return planId || '-';
    }
  };


  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Spinner size="md" />
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

      {/* 기본 정보 */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
        <div className="flex items-center gap-2 mb-4">
          <User className="w-5 h-5 text-blue-600" />
          <h2 className="text-lg font-semibold">기본 정보</h2>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 이메일 */}
          <div>
            <label className="block text-sm text-gray-500 mb-1">이메일</label>
            {editMode ? (
              <div>
                <input
                  type="email"
                  value={formData.newEmail}
                  onChange={(e) => setFormData({ ...formData, newEmail: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
                {formData.newEmail.toLowerCase() !== member.email.toLowerCase() && (
                  <p className="text-xs text-amber-600 mt-1">
                    ⚠️ 이메일 변경 시 재로그인 필요
                  </p>
                )}
              </div>
            ) : (
              <p className="font-medium break-all">{member.email || '-'}</p>
            )}
          </div>

          {/* 이름 */}
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
              <p className="font-medium break-all">{member.name || '-'}</p>
            )}
          </div>

          {/* 연락처 */}
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

          {/* 비밀번호 */}
          <div>
            <label className="block text-sm text-gray-500 mb-1">비밀번호</label>
            <button
              onClick={() => {
                setPasswordForm({ newPassword: '', confirmPassword: '' });
                setPasswordModal(true);
              }}
              className="px-4 py-2 bg-gray-100 text-gray-700 text-sm rounded-lg hover:bg-gray-200 transition-colors"
            >
              비밀번호 변경
            </button>
          </div>
        </div>

        {/* 가입일, 최종 로그인 정보, 이용금액 */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-4 pt-4 border-t border-gray-100">
          <div>
            <label className="block text-sm text-gray-500 mb-1">가입일</label>
            <p className="font-medium">
              {member.createdAt
                ? new Date(member.createdAt).toLocaleDateString('ko-KR')
                : '-'}
            </p>
          </div>
          <div>
            <label className="block text-sm text-gray-500 mb-1">최종 로그인</label>
            <p className="font-medium">
              {member.lastLoginAt
                ? new Date(member.lastLoginAt).toLocaleString('ko-KR')
                : '-'}
            </p>
          </div>
          <div>
            <label className="block text-sm text-gray-500 mb-1">최종 로그인 IP</label>
            <p className="font-medium text-sm">{member.lastLoginIP || '-'}</p>
          </div>
          <div>
            <label className="block text-sm text-gray-500 mb-1">이용금액</label>
            <p className="font-medium text-blue-600">
              {(member.totalAmount ?? 0).toLocaleString()}원
            </p>
          </div>
        </div>

        {/* 메모 - 별도 줄 */}
        <div className="mt-4 pt-4 border-t border-gray-100">
          <label className="block text-sm text-gray-500 mb-1">메모</label>
          {editMode ? (
            <textarea
              value={formData.memo}
              onChange={(e) => setFormData({ ...formData, memo: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="관리자 메모"
            />
          ) : (
            <p className="text-gray-600">{member.memo || '-'}</p>
          )}
        </div>
      </div>

      {/* 매장 목록 */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Sofa className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold">매장 목록</h2>
            <span className="text-sm text-gray-400">({tenants.length})</span>
          </div>
          <button
            onClick={() => setAddTenantModal(true)}
            className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            매장 추가
          </button>
        </div>
        {tenants.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500 mb-2">등록된 매장이 없습니다.</p>
            <button
              onClick={() => setAddTenantModal(true)}
              className="text-sm text-blue-600 hover:underline"
            >
              새 매장 추가하기
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {tenants.map((tenant) => {
              const isExpanded = expandedTenantId === tenant.tenantId;
              return (
                <div
                  key={tenant.tenantId}
                  className="border border-gray-200 rounded-xl overflow-hidden hover:border-blue-300 transition-colors"
                >
                  {/* 카드 헤더 - 항상 보이는 정보 */}
                  <button
                    onClick={() => setExpandedTenantId(isExpanded ? null : tenant.tenantId)}
                    className="w-full p-4 text-left bg-white hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-semibold text-gray-900">{tenant.brandName}</h3>
                      {getStatusBadge(tenant.subscription?.status, 'sm')}
                    </div>
                    {tenant.subscription && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">{getPlanName(tenant.subscription.plan)}</span>
                        {tenant.subscription.amount > 0 && (
                          <span className="text-gray-500">{tenant.subscription.amount.toLocaleString()}원/월</span>
                        )}
                      </div>
                    )}
                    {tenant.subscription?.nextBillingDate && (
                      <p className="text-xs text-gray-400 mt-1">
                        다음 결제: {new Date(tenant.subscription.nextBillingDate).toLocaleDateString('ko-KR')}
                      </p>
                    )}
                    {tenant.subscription?.status === 'trial' && tenant.subscription?.currentPeriodEnd && (
                      <p className="text-xs text-blue-500 mt-1">
                        체험 종료: {new Date(tenant.subscription.currentPeriodEnd).toLocaleDateString('ko-KR')}
                      </p>
                    )}
                  </button>

                  {/* 확장 콘텐츠 */}
                  {isExpanded && (
                    <div className="px-4 pb-4 bg-gray-50 border-t border-gray-100">
                      {tenant.address && <p className="text-sm text-gray-500 py-2">{tenant.address}</p>}
                      {tenant.subscription && (
                        <div className="text-sm text-gray-600 space-y-1 py-2">
                          {/* 가격 정책 */}
                          <div className="flex justify-between items-center">
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
                            <div className="flex justify-between text-xs text-amber-600">
                              <span>보호 기간</span>
                              <span>~{new Date(tenant.subscription.priceProtectedUntil).toLocaleDateString('ko-KR')}</span>
                            </div>
                          )}
                          {tenant.subscription.originalAmount && tenant.subscription.originalAmount !== tenant.subscription.amount && (
                            <div className="flex justify-between text-xs text-gray-500">
                              <span>원래 금액</span>
                              <span>{tenant.subscription.originalAmount.toLocaleString()}원</span>
                            </div>
                          )}
                          {/* 관리자 액션 버튼들 */}
                          <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-gray-200">
                            <button
                              onClick={(e) => { e.stopPropagation(); openEditSubModal(tenant); }}
                              className="flex-1 px-3 py-1.5 text-xs bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded transition-colors flex items-center justify-center gap-1"
                            >
                              <Calendar className="w-3 h-3" />
                              구독 정보
                            </button>
                            {tenant.subscription.status === 'active' && (
                              <button
                                onClick={(e) => { e.stopPropagation(); openPricePolicyModal(tenant); }}
                                className="flex-1 px-3 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded transition-colors"
                              >
                                가격 정책
                              </button>
                            )}
                            <button
                              onClick={(e) => { e.stopPropagation(); openManualChargeModal(tenant); }}
                              className="flex-1 px-3 py-1.5 text-xs bg-blue-100 hover:bg-blue-200 text-blue-700 rounded transition-colors flex items-center justify-center gap-1"
                            >
                              <HandCash className="w-3 h-3" />
                              수동 결제
                            </button>
                          </div>
                        </div>
                      )}
                      {/* 매장 관리 버튼들 */}
                      <div className="flex gap-2 mt-3 pt-3 border-t border-gray-200">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditTenantForm({ brandName: tenant.brandName });
                            setEditTenantModal({ isOpen: true, tenant });
                          }}
                          className="flex-1 px-3 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded transition-colors flex items-center justify-center gap-1"
                        >
                          <EditPencil className="w-3 h-3" />
                          매장 수정
                        </button>
                        {!tenant.subscription && (
                          <button
                            onClick={(e) => { e.stopPropagation(); openEditSubModal(tenant); }}
                            className="flex-1 px-3 py-1.5 text-xs bg-green-100 hover:bg-green-200 text-green-700 rounded transition-colors flex items-center justify-center gap-1"
                          >
                            <Plus className="w-3 h-3" />
                            구독 생성
                          </button>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteTenant(tenant); }}
                          className="px-3 py-1.5 text-xs bg-red-100 hover:bg-red-200 text-red-700 rounded transition-colors flex items-center justify-center gap-1"
                        >
                          <Trash className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 결제 내역 */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
        <div className="flex flex-col gap-3 mb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-blue-600" />
              <h2 className="text-lg font-semibold">결제 내역</h2>
              <span className="text-sm text-gray-400">({filteredPayments.length}건)</span>
            </div>
            {/* 기간 필터 + 검색 (PC) */}
            <div className="flex items-center gap-2">
              {/* 검색 - PC에서만 이 위치에 표시 */}
              <div className="relative hidden sm:block">
                <input
                  type="text"
                  value={paymentSearchId}
                  onChange={(e) => {
                    setPaymentSearchId(e.target.value);
                    setPaymentPage(1);
                  }}
                  placeholder="ID 또는 매장명 검색..."
                  className="w-48 pl-8 pr-8 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                {paymentSearchId && (
                  <button
                    onClick={() => {
                      setPaymentSearchId('');
                      setPaymentPage(1);
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 hover:bg-gray-100 rounded"
                  >
                    <Xmark className="w-3 h-3 text-gray-400" />
                  </button>
                )}
              </div>
              <button
                onClick={handleThisMonthFilter}
                className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                  paymentFilterType === 'thisMonth'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                이번달
              </button>
              <button
                onClick={handleOpenDatePicker}
                className={`text-xs rounded-lg transition-colors flex items-center gap-1 ${
                  paymentFilterType === 'custom' && paymentDateRange.start
                    ? 'px-3 py-1.5 bg-blue-600 text-white'
                    : 'p-1.5 bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
                title="기간 선택"
              >
                <Calendar className="w-4 h-4" />
                {paymentFilterType === 'custom' && paymentDateRange.start && (
                  <span>{paymentDateRange.start} ~ {paymentDateRange.end}</span>
                )}
              </button>
              {/* 상세 필터 버튼 */}
              <div className="relative">
                <button
                  onClick={() => setShowPaymentFilter(!showPaymentFilter)}
                  className={`p-1.5 rounded-lg transition-colors ${
                    paymentTypeFilter !== 'all' || paymentTenantFilter !== 'all' || paymentPlanFilter !== 'all'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                  title="필터"
                >
                  <Filter className="w-4 h-4" />
                </button>
                {/* 필터 드롭다운 */}
                {showPaymentFilter && (
                  <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-xl shadow-lg border border-gray-200 z-50 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-medium text-gray-900">필터</span>
                      {(paymentTypeFilter !== 'all' || paymentTenantFilter !== 'all' || paymentPlanFilter !== 'all') && (
                        <button
                          onClick={() => {
                            setPaymentTypeFilter('all');
                            setPaymentTenantFilter('all');
                            setPaymentPlanFilter('all');
                            setPaymentPage(1);
                          }}
                          className="text-xs text-blue-600 hover:text-blue-700"
                        >
                          초기화
                        </button>
                      )}
                    </div>
                    {/* 유형 필터 */}
                    <div className="mb-3">
                      <label className="block text-xs text-gray-500 mb-1.5">유형</label>
                      <div className="flex gap-1.5">
                        {[
                          { value: 'all', label: '전체' },
                          { value: 'charge', label: '결제' },
                          { value: 'refund', label: '환불' },
                        ].map((option) => (
                          <button
                            key={option.value}
                            onClick={() => {
                              setPaymentTypeFilter(option.value as 'all' | 'charge' | 'refund');
                              setPaymentPage(1);
                            }}
                            className={`flex-1 px-2 py-1.5 text-xs rounded-lg transition-colors ${
                              paymentTypeFilter === option.value
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    {/* 매장 필터 */}
                    <div className="mb-3">
                      <label className="block text-xs text-gray-500 mb-1.5">매장</label>
                      <select
                        value={paymentTenantFilter}
                        onChange={(e) => {
                          setPaymentTenantFilter(e.target.value);
                          setPaymentPage(1);
                        }}
                        className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="all">전체</option>
                        {tenants.map((tenant) => (
                          <option key={tenant.tenantId} value={tenant.tenantId}>
                            {tenant.brandName}
                          </option>
                        ))}
                      </select>
                    </div>
                    {/* 플랜 필터 */}
                    <div>
                      <label className="block text-xs text-gray-500 mb-1.5">플랜</label>
                      <select
                        value={paymentPlanFilter}
                        onChange={(e) => {
                          setPaymentPlanFilter(e.target.value);
                          setPaymentPage(1);
                        }}
                        className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="all">전체</option>
                        <option value="trial">Trial</option>
                        <option value="basic">Basic</option>
                        <option value="business">Business</option>
                        <option value="enterprise">Enterprise</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>
              {/* 내보내기 버튼 */}
              <button
                onClick={handleExportPayments}
                className="p-1.5 rounded-lg transition-colors bg-gray-100 text-gray-600 hover:bg-gray-200"
                title="xlsx로 내보내기"
              >
                <Download className="w-4 h-4" />
              </button>
            </div>
          </div>
          {/* 검색 필터 - 모바일에서만 표시 */}
          <div className="flex items-center justify-end sm:hidden">
            <div className="relative w-full">
              <input
                type="text"
                value={paymentSearchId}
                onChange={(e) => {
                  setPaymentSearchId(e.target.value);
                  setPaymentPage(1);
                }}
                placeholder="ID 또는 매장명 검색..."
                className="w-full pl-8 pr-8 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              {paymentSearchId && (
                <button
                  onClick={() => {
                    setPaymentSearchId('');
                    setPaymentPage(1);
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 hover:bg-gray-100 rounded"
                >
                  <Xmark className="w-3 h-3 text-gray-400" />
                </button>
              )}
            </div>
          </div>
        </div>
        {filteredPayments.length === 0 ? (
          <p className="text-gray-500 text-center py-6 text-sm">결제 내역이 없습니다.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-max">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-center px-2 py-3 text-sm font-medium text-gray-500 w-14">유형</th>
                    <th className="text-center px-2 py-3 text-sm font-medium text-gray-500 w-32">ID</th>
                    <th className="text-center px-2 py-3 text-sm font-medium text-gray-500 w-24">날짜</th>
                    <th className="text-center px-2 py-3 text-sm font-medium text-gray-500 w-28">매장</th>
                    <th className="text-center px-2 py-3 text-sm font-medium text-gray-500 w-20">플랜</th>
                    <th className="text-center px-2 py-3 text-sm font-medium text-gray-500 w-20">금액</th>
                    <th className="text-center px-2 py-3 text-sm font-medium text-gray-500 w-14">처리자</th>
                    <th className="w-12 px-1 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paginatedPayments.map((payment) => {
                    // transactionType이 refund이거나 (레거시) category가 refund이거나 status가 refunded인 경우 환불로 판단
                    const isRefund = payment.transactionType === 'refund' || payment.category === 'refund' || payment.status === 'refunded';
                    const paymentDate = payment.paidAt || payment.createdAt;
                    let formattedDate = '-';
                    if (paymentDate) {
                      const d = new Date(paymentDate);
                      formattedDate = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
                    }
                    // 금액 표시: 이미 음수면 그대로, 양수인데 환불이면 - 추가
                    const displayAmount = payment.amount < 0
                      ? payment.amount.toLocaleString()
                      : (isRefund ? `-${payment.amount.toLocaleString()}` : payment.amount?.toLocaleString());
                    return (
                      <tr key={payment.id} className="hover:bg-gray-50">
                        <td className="px-2 py-3 text-sm text-gray-600 text-center">
                          {isRefund ? '환불' : '결제'}
                        </td>
                        <td className="px-2 py-3 text-xs text-gray-400 font-mono text-center truncate max-w-32" title={payment.orderId || payment.id}>
                          {payment.orderId || payment.id}
                        </td>
                        <td className="px-2 py-3 text-sm text-gray-600 text-center whitespace-nowrap">
                          {formattedDate}
                        </td>
                        <td className="px-2 py-3 text-sm text-gray-600 text-center truncate max-w-28" title={tenants.find(t => t.tenantId === payment.tenantId)?.brandName || '-'}>
                          {tenants.find(t => t.tenantId === payment.tenantId)?.brandName || '-'}
                        </td>
                        <td className="px-2 py-3 text-sm text-gray-600 text-center">
                          {getPlanName(payment.planId || payment.plan)}
                        </td>
                        <td className={`px-2 py-3 text-sm font-medium text-center whitespace-nowrap ${isRefund ? 'text-red-500' : 'text-gray-900'}`}>
                          {displayAmount}원
                        </td>
                        <td className="px-2 py-3 text-sm text-gray-600 text-center">
                          {payment.initiatedBy ? INITIATED_BY_LABELS[payment.initiatedBy] || payment.initiatedBy : '-'}
                        </td>
                        <td className="px-1 py-3 text-center">
                          <button
                            onClick={() => setPaymentDetailModal(payment)}
                            className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded transition-colors"
                          >
                            상세
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {/* 페이지네이션 */}
            {totalPaymentPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 mt-2">
                <p className="text-sm text-gray-500">
                  {filteredPayments.length}건 중 {(paymentPage - 1) * PAYMENTS_PER_PAGE + 1}-
                  {Math.min(paymentPage * PAYMENTS_PER_PAGE, filteredPayments.length)}건
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPaymentPage((p) => Math.max(1, p - 1))}
                    disabled={paymentPage === 1}
                    className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <NavArrowLeft className="w-5 h-5" />
                  </button>
                  <span className="text-sm text-gray-600">
                    {paymentPage} / {totalPaymentPages}
                  </span>
                  <button
                    onClick={() => setPaymentPage((p) => Math.min(totalPaymentPages, p + 1))}
                    disabled={paymentPage === totalPaymentPages}
                    className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <NavArrowRight className="w-5 h-5" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
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

      {/* 수동 결제 모달 */}
      {manualChargeModal?.isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl">
            <div className="flex items-center gap-2 mb-4">
              <HandCash className="w-5 h-5 text-blue-600" />
              <h3 className="text-lg font-semibold">수동 결제</h3>
            </div>

            {/* 매장 정보 */}
            <div className="bg-gray-50 rounded-lg p-3 text-sm mb-4">
              <div className="flex justify-between mb-1">
                <span className="text-gray-500">매장</span>
                <span className="font-medium">{manualChargeModal.tenantName}</span>
              </div>
              {chargeInfo?.email && (
                <div className="flex justify-between">
                  <span className="text-gray-500">이메일</span>
                  <span className="font-medium text-xs">{chargeInfo.email}</span>
                </div>
              )}
            </div>

            {loadingChargeInfo ? (
              <div className="flex items-center justify-center py-8">
                <RefreshDouble className="w-6 h-6 text-blue-600 animate-spin" />
              </div>
            ) : !chargeInfo?.canCharge ? (
              <div className="text-center py-6">
                <p className="text-red-500 mb-2">결제를 진행할 수 없습니다.</p>
                <p className="text-sm text-gray-500">{chargeInfo?.reason}</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* 결제 카드 선택 */}
                {chargeInfo.cards && chargeInfo.cards.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      결제 카드 선택 <span className="text-gray-400 font-normal">({chargeInfo.cards.length}개)</span>
                    </label>
                    <div className="relative">
                      <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <select
                        value={chargeFormData.selectedCardId}
                        onChange={(e) => setChargeFormData({ ...chargeFormData, selectedCardId: e.target.value })}
                        className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 appearance-none bg-white cursor-pointer"
                      >
                        {chargeInfo.cards.map((card) => (
                          <option key={card.id} value={card.id}>
                            {card.cardInfo?.company || '카드'} {card.cardInfo?.number || '****'}
                            {card.isPrimary ? ' (기본)' : ''}
                            {card.alias ? ` - ${card.alias}` : ''}
                          </option>
                        ))}
                      </select>
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                  </div>
                )}

                {/* 플랜 선택 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    플랜 선택
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => handlePlanChange('basic')}
                      className={`px-4 py-3 rounded-lg border-2 text-sm font-medium transition-colors ${
                        chargeFormData.plan === 'basic'
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div>Basic</div>
                      <div className="text-xs text-gray-500">39,000원</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePlanChange('business')}
                      className={`px-4 py-3 rounded-lg border-2 text-sm font-medium transition-colors ${
                        chargeFormData.plan === 'business'
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div>Business</div>
                      <div className="text-xs text-gray-500">99,000원</div>
                    </button>
                  </div>
                </div>

                {/* 금액 입력 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    결제 금액 (원)
                  </label>
                  <input
                    type="number"
                    value={chargeFormData.amount}
                    onChange={(e) => setChargeFormData({ ...chargeFormData, amount: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                    min={0}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    금액을 직접 수정할 수 있습니다. (할인, 프로모션 등)
                  </p>
                </div>

                {/* 결제 사유 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    결제 사유 (선택)
                  </label>
                  <input
                    type="text"
                    value={chargeFormData.reason}
                    onChange={(e) => setChargeFormData({ ...chargeFormData, reason: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="예: 카드 변경 후 재결제, 환불 후 재청구"
                  />
                </div>
              </div>
            )}

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setManualChargeModal(null)}
                className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleManualCharge}
                disabled={!chargeInfo?.canCharge || processingCharge || chargeFormData.amount <= 0}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {processingCharge ? (
                  <>
                    <RefreshDouble className="w-4 h-4 animate-spin" />
                    처리중...
                  </>
                ) : (
                  <>
                    <HandCash className="w-4 h-4" />
                    {chargeFormData.amount.toLocaleString()}원 결제
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 매장 추가 모달 */}
      {addTenantModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
            <div className="p-6 border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-900">새 매장 추가</h3>
              <p className="text-sm text-gray-500 mt-1">{member?.email} 계정에 매장을 추가합니다</p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  매장명 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={addTenantForm.brandName}
                  onChange={(e) => setAddTenantForm({ ...addTenantForm, brandName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="매장 이름을 입력하세요"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  업종 <span className="text-red-500">*</span>
                </label>
                <select
                  value={addTenantForm.industry}
                  onChange={(e) => setAddTenantForm({ ...addTenantForm, industry: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">업종을 선택하세요</option>
                  {INDUSTRY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="p-6 border-t border-gray-100 flex gap-3">
              <button
                onClick={() => {
                  setAddTenantModal(false);
                  setAddTenantForm({ brandName: '', industry: '' });
                }}
                className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                취소
              </button>
              <button
                onClick={handleAddTenant}
                disabled={addingTenant || !addTenantForm.brandName.trim() || !addTenantForm.industry}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {addingTenant ? (
                  <>
                    <RefreshDouble className="w-4 h-4 animate-spin" />
                    추가 중...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    매장 추가
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 매장 수정 모달 */}
      {editTenantModal.isOpen && editTenantModal.tenant && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
            <div className="p-6 border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-900">매장 정보 수정</h3>
              <p className="text-sm text-gray-500 mt-1">{editTenantModal.tenant.brandName}</p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  매장명 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={editTenantForm.brandName}
                  onChange={(e) => setEditTenantForm({ ...editTenantForm, brandName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="매장 이름을 입력하세요"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">업종</label>
                <p className="px-3 py-2 bg-gray-50 rounded-lg text-gray-600">
                  {INDUSTRY_OPTIONS.find(opt => opt.value === editTenantModal.tenant?.industry)?.label || editTenantModal.tenant.industry || '미설정'}
                </p>
                <p className="text-xs text-gray-400 mt-1">업종은 변경할 수 없습니다</p>
              </div>
            </div>
            <div className="p-6 border-t border-gray-100 flex gap-3">
              <button
                onClick={() => setEditTenantModal({ isOpen: false, tenant: null })}
                className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                취소
              </button>
              <button
                onClick={handleEditTenant}
                disabled={editingTenant || !editTenantForm.brandName.trim()}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {editingTenant ? (
                  <>
                    <RefreshDouble className="w-4 h-4 animate-spin" />
                    저장 중...
                  </>
                ) : (
                  <>
                    <FloppyDisk className="w-4 h-4" />
                    저장
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 구독 정보 수정 모달 */}
      {editSubModal.isOpen && editSubModal.tenant && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4">
            <div className="p-6 border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-900">구독 정보 수정</h3>
              <p className="text-sm text-gray-500 mt-1">{editSubModal.tenant.brandName}</p>
            </div>
            <div className="p-6 space-y-4">
              {/* 플랜 선택 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">플랜</label>
                <div className="grid grid-cols-4 gap-2">
                  {['trial', 'basic', 'business', 'enterprise'].map((plan) => (
                    <button
                      key={plan}
                      type="button"
                      onClick={() => handleSubPlanChange(plan)}
                      className={`px-3 py-2 rounded-lg border-2 text-sm font-medium transition-colors ${
                        editSubForm.plan === plan
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      {plan === 'trial' ? 'Trial' : plan === 'basic' ? 'Basic' : plan === 'business' ? 'Business' : 'Enterprise'}
                    </button>
                  ))}
                </div>
              </div>

              {/* 상태 선택 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">상태</label>
                <select
                  value={editSubForm.status}
                  onChange={(e) => setEditSubForm({ ...editSubForm, status: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="trial">체험 중</option>
                  <option value="active">구독 중</option>
                  <option value="canceled">해지 예정</option>
                  <option value="past_due">결제 실패</option>
                  <option value="expired">만료</option>
                </select>
              </div>

              {/* 금액 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">금액 (원)</label>
                <input
                  type="number"
                  value={editSubForm.amount}
                  onChange={(e) => setEditSubForm({ ...editSubForm, amount: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* 날짜 설정 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">구독 시작일</label>
                  <input
                    type="date"
                    value={editSubForm.currentPeriodStart}
                    onChange={(e) => setEditSubForm({ ...editSubForm, currentPeriodStart: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">구독 종료일</label>
                  <input
                    type="date"
                    value={editSubForm.currentPeriodEnd}
                    onChange={(e) => setEditSubForm({ ...editSubForm, currentPeriodEnd: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">다음 결제일</label>
                <input
                  type="date"
                  value={editSubForm.nextBillingDate}
                  onChange={(e) => setEditSubForm({ ...editSubForm, nextBillingDate: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="p-6 border-t border-gray-100 flex gap-3">
              <button
                onClick={() => setEditSubModal({ isOpen: false, tenant: null })}
                className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                취소
              </button>
              <button
                onClick={handleEditSubscription}
                disabled={editingSub}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {editingSub ? (
                  <>
                    <RefreshDouble className="w-4 h-4 animate-spin" />
                    저장 중...
                  </>
                ) : (
                  <>
                    <FloppyDisk className="w-4 h-4" />
                    저장
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 비밀번호 변경 모달 */}
      {passwordModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full shadow-xl">
            <div className="p-6 border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-900">비밀번호 변경</h3>
              <p className="text-sm text-gray-500 mt-1">{member?.email}</p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  새 비밀번호
                </label>
                <input
                  type="password"
                  value={passwordForm.newPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="새 비밀번호 입력"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  새 비밀번호 확인
                </label>
                <input
                  type="password"
                  value={passwordForm.confirmPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="비밀번호 확인"
                />
                {passwordForm.newPassword && passwordForm.confirmPassword && passwordForm.newPassword !== passwordForm.confirmPassword && (
                  <p className="text-xs text-red-500 mt-1">비밀번호가 일치하지 않습니다.</p>
                )}
              </div>
            </div>
            <div className="p-6 border-t border-gray-100 flex gap-3">
              <button
                onClick={() => setPasswordModal(false)}
                className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                취소
              </button>
              <button
                onClick={handleChangePassword}
                disabled={changingPassword || !passwordForm.newPassword || !passwordForm.confirmPassword || passwordForm.newPassword !== passwordForm.confirmPassword}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {changingPassword ? (
                  <>
                    <RefreshDouble className="w-4 h-4 animate-spin" />
                    변경 중...
                  </>
                ) : (
                  '변경하기'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 결제 상세 모달 */}
      {paymentDetailModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">결제 상세</h3>
              <button
                onClick={() => setPaymentDetailModal(null)}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <Xmark className="w-5 h-5" />
              </button>
            </div>
            <div className="divide-y divide-gray-100">
              <div className="flex py-3">
                <span className="text-gray-500 w-24 shrink-0">계정</span>
                <span className="text-gray-900">{paymentDetailModal.email as string || member?.email || '-'}</span>
              </div>
              <div className="flex py-3">
                <span className="text-gray-500 w-24 shrink-0">일시</span>
                <span className="text-gray-900">
                  {paymentDetailModal.paidAt
                    ? new Date(paymentDetailModal.paidAt).toLocaleString('ko-KR')
                    : paymentDetailModal.createdAt
                    ? new Date(paymentDetailModal.createdAt).toLocaleString('ko-KR')
                    : '-'}
                </span>
              </div>
              <div className="flex py-3">
                <span className="text-gray-500 w-24 shrink-0">주문 ID</span>
                <span className="text-gray-900 font-mono">{paymentDetailModal.orderId || paymentDetailModal.id}</span>
              </div>
              <div className="flex py-3">
                <span className="text-gray-500 w-24 shrink-0">매장</span>
                <span className="text-gray-900">{tenants.find(t => t.tenantId === paymentDetailModal.tenantId)?.brandName || '-'}</span>
              </div>
              <div className="flex py-3">
                <span className="text-gray-500 w-24 shrink-0">거래</span>
                <span className={`font-medium ${paymentDetailModal.transactionType === 'refund' ? 'text-red-500' : 'text-gray-900'}`}>
                  {paymentDetailModal.transactionType ? TRANSACTION_TYPE_LABELS[paymentDetailModal.transactionType] || paymentDetailModal.transactionType : '-'}
                </span>
              </div>
              <div className="flex py-3">
                <span className="text-gray-500 w-24 shrink-0">분류</span>
                <span className="text-gray-900">
                  {paymentDetailModal.category ? PAYMENT_CATEGORY_LABELS[paymentDetailModal.category] || paymentDetailModal.category : '-'}
                </span>
              </div>
              <div className="flex py-3">
                <span className="text-gray-500 w-24 shrink-0">유형</span>
                <span className="text-gray-900">
                  {paymentDetailModal.type ? PAYMENT_TYPE_LABELS[paymentDetailModal.type] || paymentDetailModal.type : '-'}
                </span>
              </div>
              <div className="flex py-3">
                <span className="text-gray-500 w-24 shrink-0">처리자</span>
                <span className="text-gray-900">
                  {paymentDetailModal.initiatedBy ? (
                    <>
                      {INITIATED_BY_LABELS[paymentDetailModal.initiatedBy] || paymentDetailModal.initiatedBy}
                      {paymentDetailModal.initiatedBy === 'admin' && paymentDetailModal.adminName && (
                        <span className="text-gray-500 ml-1">({paymentDetailModal.adminName})</span>
                      )}
                    </>
                  ) : '-'}
                </span>
              </div>
              <div className="flex py-3">
                <span className="text-gray-500 w-24 shrink-0">금액</span>
                <span className={`font-medium ${(paymentDetailModal.amount ?? 0) < 0 ? 'text-red-500' : 'text-gray-900'}`}>
                  {(paymentDetailModal.amount ?? 0) < 0 ? '-' : ''}{Math.abs(paymentDetailModal.amount ?? 0).toLocaleString()}원
                </span>
              </div>
              {/* 카드 정보 */}
              {(() => {
                const cardInfo = paymentDetailModal.cardInfo as { company?: string; number?: string } | undefined;
                const cardCompany = String(cardInfo?.company || (paymentDetailModal.cardCompany as string) || '');
                const cardNumber = String(cardInfo?.number || (paymentDetailModal.cardNumber as string) || '');
                if (!cardNumber) return null;
                return (
                  <div className="flex py-3">
                    <span className="text-gray-500 w-24 shrink-0">카드</span>
                    <span className="text-gray-900">{cardCompany} {cardNumber}</span>
                  </div>
                );
              })()}
              {/* 원 결제 연결 (환불인 경우) */}
              {paymentDetailModal.originalPaymentId && (
                <div className="flex py-3">
                  <span className="text-gray-500 w-24 shrink-0">원 결제</span>
                  <span className="text-gray-900 font-mono">
                    {/* SUB_xxx_xxx 형태에서 앞의 SUB_xxx만 표시 */}
                    {String(paymentDetailModal.originalPaymentId).split('_').slice(0, 2).join('_')}
                  </span>
                </div>
              )}
              {/* 환불 사유 */}
              {(paymentDetailModal.refundReason || paymentDetailModal.cancelReason) && (
                <div className="flex py-3">
                  <span className="text-gray-500 w-24 shrink-0">사유</span>
                  <span className="text-gray-900">{String(paymentDetailModal.refundReason || paymentDetailModal.cancelReason)}</span>
                </div>
              )}
              {/* 영수증 버튼 - 원 결제 영수증도 포함 */}
              {(() => {
                // 환불 건인 경우 원 결제의 영수증 URL 찾기
                const isRefund = paymentDetailModal.transactionType === 'refund' || (paymentDetailModal.amount ?? 0) < 0;
                let receiptUrl = paymentDetailModal.receiptUrl;

                if (isRefund && paymentDetailModal.originalPaymentId && !receiptUrl) {
                  // payments 배열에서 원 결제 찾기 (orderId 또는 id로 매칭)
                  const origPaymentId = String(paymentDetailModal.originalPaymentId);
                  const origPaymentIdBase = origPaymentId.split('_').slice(0, 2).join('_');
                  const originalPayment = payments.find(p =>
                    p.id === origPaymentId ||
                    p.orderId === origPaymentId ||
                    // orderId에서 타임스탬프 제거한 값으로도 매칭 (SUB_xxx_xxx -> SUB_xxx)
                    p.orderId?.startsWith(origPaymentIdBase)
                  );
                  receiptUrl = originalPayment?.receiptUrl;
                }

                return receiptUrl ? (
                  <div className="pt-4">
                    <a
                      href={receiptUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                    >
                      {isRefund ? '영수증' : '영수증'}
                    </a>
                  </div>
                ) : null;
              })()}
            </div>
            <div className="mt-6">
              <button
                onClick={() => setPaymentDetailModal(null)}
                className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 결제 내역 기간 선택 모달 */}
      {showDatePickerModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-sm w-full p-6 shadow-xl">
            <h3 className="text-lg font-semibold mb-4">기간 선택</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">시작일</label>
                <input
                  type="date"
                  value={tempDateRange.start}
                  onChange={(e) => setTempDateRange({ ...tempDateRange, start: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">종료일</label>
                <input
                  type="date"
                  value={tempDateRange.end}
                  onChange={(e) => setTempDateRange({ ...tempDateRange, end: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowDatePickerModal(false)}
                className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                취소
              </button>
              <button
                onClick={handleApplyDateRange}
                disabled={!tempDateRange.start || !tempDateRange.end}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                적용
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
