'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { HomeSimpleDoor, NavArrowLeft, NavArrowDown, NavArrowUp, Check, RefreshDouble, Link as LinkIcon, CreditCards, InfoCircle, Spark, Xmark, PageFlip, Timer, Trash } from 'iconoir-react';
import Link from 'next/link';
import Spinner from '@/components/admin/Spinner';
import { DynamicField, DynamicFieldGroup } from '@/components/admin/DynamicFieldRenderer';

type TabType = 'basic' | 'ai' | 'integrations' | 'payments' | 'subscription';

// 삭제 관련 필드 (삭제된 매장에서만 표시)
const DELETION_FIELDS = ['deleted', 'deletedAt', 'deletedBy', 'permanentDeleteAt'];

// 탭별 필드 그룹핑
const FIELD_GROUPS: Record<string, string[]> = {
  basic: [
    'tenantId', 'branchNo', 'brandName', 'brandCode', 'address', 'industry',
    'email', 'phone', 'name', 'userId',
    'createdAt', 'createdBy', 'updatedAt', 'updatedBy',
    'isManualRegistration', 'onboardingCompleted', 'onboardingCompletedAt',
    'locale', 'timezone', 'opsTimeStart', 'opsTimeEnd', 'storeInfo', 'storeInfoCompleted'
  ],
  ai: ['ai_stop', 'csTone', 'avatar_url', 'tenantPrompt', 'tenantItem', 'criteria', 'items', 'library', 'meta'],
  integrations: [
    'slack', 'channeltalk', 'naverAuthorization', 'taskBoard', 'addons',
    'policy', 'qa', 'widgetUrl', 'naverInboundUrl', 'webhook'
  ],
  subscription: ['plan', 'planId', 'subscription', 'subscriptionStatus', 'orderNo', 'totalPrice', 'trial'],
  payments: [], // 결제 탭은 별도 데이터 사용
};

const ALL_GROUPED_FIELDS = [
  ...FIELD_GROUPS.basic,
  ...FIELD_GROUPS.ai,
  ...FIELD_GROUPS.integrations,
  ...FIELD_GROUPS.subscription,
  ...DELETION_FIELDS,
];

interface Payment {
  id: string;
  amount: number;
  refundedAmount?: number;
  remainingAmount?: number;
  status: string;
  planId?: string;
  plan?: string;
  tenantId?: string;
  orderId?: string;
  category?: string;
  type?: string;
  transactionType?: 'charge' | 'refund';
  initiatedBy?: 'system' | 'admin' | 'user';
  adminId?: string;
  adminName?: string;
  receiptUrl?: string;
  createdAt: string;
  paidAt?: string | null;
  cardInfo?: { company?: string; number?: string };
  cardCompany?: string;
  cardNumber?: string;
  originalPaymentId?: string;
  refundReason?: string;
  cancelReason?: string;
  paymentKey?: string;
  email?: string;
  [key: string]: unknown;
}

interface SubscriptionHistoryItem {
  recordId: string;
  tenantId?: string;
  email?: string;
  brandName?: string;
  plan: string;
  status: string;
  amount?: number;
  periodStart?: string | null;
  periodEnd?: string | null;
  billingDate?: string | null;
  changeType: string;
  changedAt?: string | null;
  changedBy?: string;
  previousPlan?: string | null;
  previousStatus?: string | null;
  note?: string | null;
}

// 결제 라벨
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
  downgrade_refund: '다운환불',
  cancel_refund: '해지환불',
  refund: '환불',
  subscription: '구독',
  renewal: '갱신',
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

// 구독 변경 유형 라벨
const CHANGE_TYPE_LABELS: Record<string, string> = {
  new: '신규',
  upgrade: '업그레이드',
  downgrade: '다운그레이드',
  renew: '갱신',
  cancel: '해지',
  expire: '만료',
  reactivate: '재활성화',
  admin_edit: '수정',
};

export default function TenantDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tenantId = params.tenantId as string;

  // URL에서 탭 상태 읽기
  const tabFromUrl = searchParams.get('tab') as TabType | null;
  const validTabs: TabType[] = ['basic', 'ai', 'integrations', 'payments', 'subscription'];
  const initialTab = tabFromUrl && validTabs.includes(tabFromUrl) ? tabFromUrl : 'basic';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);

  // 탭 변경 시 URL 업데이트
  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    const newParams = new URLSearchParams(searchParams.toString());
    newParams.set('tab', tab);
    router.replace(`?${newParams.toString()}`, { scroll: false });
  };
  const [tenant, setTenant] = useState<Record<string, unknown>>({});
  const [subscription, setSubscription] = useState<Record<string, unknown> | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [subscriptionHistory, setSubscriptionHistory] = useState<SubscriptionHistoryItem[]>([]);
  const [adminNames, setAdminNames] = useState<Record<string, string>>({});
  const [editedFields, setEditedFields] = useState<Record<string, unknown>>({});
  const [hasChanges, setHasChanges] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // 충돌 감지용 원본 데이터
  const [originalTenant, setOriginalTenant] = useState<Record<string, unknown>>({});
  const [originalAdminFields, setOriginalAdminFields] = useState<Record<string, unknown>>({});

  // 결제 상세 모달
  const [paymentDetailModal, setPaymentDetailModal] = useState<Payment | null>(null);

  // 결제 정렬 (desc: 최신순, asc: 오래된순)
  const [paymentSortOrder, setPaymentSortOrder] = useState<'desc' | 'asc'>('desc');

  // 구독 내역 정렬 (desc: 최신순, asc: 오래된순)
  const [historySortOrder, setHistorySortOrder] = useState<'desc' | 'asc'>('desc');


  // 구독 수정 모달
  const [subscriptionEditModal, setSubscriptionEditModal] = useState(false);
  const [subscriptionEditData, setSubscriptionEditData] = useState({
    plan: '',
    status: '',
    currentPeriodStart: '',
    currentPeriodEnd: '',
    nextBillingDate: '',
  });
  const [savingSubscription, setSavingSubscription] = useState(false);

  // 삭제 모달 상태
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deletingTenant, setDeletingTenant] = useState(false);

  // 커스텀 필드 스키마
  type CustomFieldType = 'string' | 'number' | 'boolean' | 'map' | 'array' | 'timestamp' | 'select';
  type CustomFieldTab = 'basic' | 'ai' | 'integrations' | 'subscription';
  interface CustomFieldSchema {
    name: string;
    label: string;
    type: CustomFieldType;
    options?: string[];
    tab: CustomFieldTab;
    saveToFirestore: boolean;
    order: number;
  }
  const [customFieldSchema, setCustomFieldSchema] = useState<CustomFieldSchema[]>([]);

  // 관리자 필드 데이터 (tenant_admin_fields 컬렉션)
  const [adminFields, setAdminFields] = useState<Record<string, unknown>>({});
  const [editedAdminFields, setEditedAdminFields] = useState<Record<string, unknown>>({});

  const fetchTenantDetail = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    try {
      const response = await fetch(`/api/admin/tenants/${tenantId}`);
      if (response.ok) {
        const data = await response.json();
        const tenantData = data.tenant || {};
        setTenant(tenantData);
        setOriginalTenant(JSON.parse(JSON.stringify(tenantData))); // 깊은 복사
        setSubscription(data.subscription);
        setPayments(data.payments || []);
        setSubscriptionHistory(data.subscriptionHistory || []);
        setAdminNames(data.adminNames || {});
        setEditedFields({});
        setEditedAdminFields({});
        setHasChanges(false);
      } else if (response.status === 404) {
        alert('매장을 찾을 수 없습니다.');
        router.push('/admin/tenants');
      }
    } catch (error) {
      console.error('Failed to fetch tenant:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tenantId, router]);

  const fetchAdminFields = useCallback(async () => {
    try {
      const response = await fetch(`/api/admin/tenants/${tenantId}/admin-fields`);
      if (response.ok) {
        const data = await response.json();
        const fieldsData = data.data || {};
        setAdminFields(fieldsData);
        setOriginalAdminFields(JSON.parse(JSON.stringify(fieldsData))); // 깊은 복사
        setEditedAdminFields({});
      }
    } catch (error) {
      console.error('Failed to fetch admin fields:', error);
    }
  }, [tenantId]);

  const fetchCustomFieldSchema = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/tenant-meta-schema');
      if (response.ok) {
        const data = await response.json();
        setCustomFieldSchema(data.fields || []);
      }
    } catch (error) {
      console.error('Failed to fetch custom field schema:', error);
    }
  }, []);

  useEffect(() => {
    fetchTenantDetail();
    fetchAdminFields();
    fetchCustomFieldSchema();
  }, [fetchTenantDetail, fetchAdminFields, fetchCustomFieldSchema]);

  const handleFieldChange = (fieldName: string, value: unknown) => {
    setEditedFields(prev => ({
      ...prev,
      [fieldName]: value,
    }));
    setHasChanges(true);
  };

  // 충돌 감지 함수
  const checkForConflicts = async (): Promise<{ hasConflict: boolean; message: string }> => {
    try {
      // 최신 데이터 조회
      const [tenantRes, adminFieldsRes] = await Promise.all([
        fetch(`/api/admin/tenants/${tenantId}`),
        fetch(`/api/admin/tenants/${tenantId}/admin-fields`)
      ]);

      if (!tenantRes.ok || !adminFieldsRes.ok) {
        return { hasConflict: false, message: '' };
      }

      const tenantData = await tenantRes.json();
      const adminFieldsData = await adminFieldsRes.json();

      const currentTenant = tenantData.tenant || {};
      const currentAdminFields = adminFieldsData.data || {};

      // 변경된 필드 찾기
      const changedTenantFields: string[] = [];
      const changedAdminFields: string[] = [];

      // 편집 중인 필드만 비교
      for (const fieldName of Object.keys(editedFields)) {
        const originalValue = JSON.stringify(originalTenant[fieldName]);
        const currentValue = JSON.stringify(currentTenant[fieldName]);
        if (originalValue !== currentValue) {
          changedTenantFields.push(fieldName);
        }
      }

      for (const fieldName of Object.keys(editedAdminFields)) {
        const originalValue = JSON.stringify(originalAdminFields[fieldName]);
        const currentValue = JSON.stringify(currentAdminFields[fieldName]);
        if (originalValue !== currentValue) {
          changedAdminFields.push(fieldName);
        }
      }

      const allChangedFields = [...changedTenantFields, ...changedAdminFields];

      if (allChangedFields.length > 0) {
        return {
          hasConflict: true,
          message: `다음 필드가 다른 곳에서 수정되었습니다:\n${allChangedFields.join(', ')}\n\n계속 저장하시겠습니까? (기존 값을 덮어씁니다)`,
        };
      }

      return { hasConflict: false, message: '' };
    } catch (error) {
      console.error('Conflict check failed:', error);
      return { hasConflict: false, message: '' };
    }
  };

  const handleSave = async () => {
    const allEditedFields = { ...editedFields, ...editedAdminFields };
    if (Object.keys(allEditedFields).length === 0) return;

    setSaving(true);
    try {
      // 충돌 감지
      const { hasConflict, message } = await checkForConflicts();
      if (hasConflict && !confirm(message)) {
        setSaving(false);
        return;
      }

      // 커스텀 필드 스키마에서 saveToFirestore 여부 확인
      const firestoreFields: Record<string, unknown> = {};
      const adminFieldsToSave: Record<string, unknown> = {};

      for (const [fieldName, value] of Object.entries(allEditedFields)) {
        const schema = customFieldSchema.find(s => s.name === fieldName);
        if (schema && !schema.saveToFirestore) {
          // tenant_admin_fields에 저장
          adminFieldsToSave[fieldName] = value;
        } else {
          // tenant 문서에 저장 (기본 필드 또는 saveToFirestore=true인 커스텀 필드)
          firestoreFields[fieldName] = value;
        }
      }

      // Firestore 필드 저장
      if (Object.keys(firestoreFields).length > 0) {
        const response = await fetch(`/api/admin/tenants/${tenantId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(firestoreFields),
        });

        if (!response.ok) {
          const data = await response.json();
          alert(data.error || '저장에 실패했습니다.');
          return;
        }
      }

      // 관리자 필드 저장
      if (Object.keys(adminFieldsToSave).length > 0) {
        const response = await fetch(`/api/admin/tenants/${tenantId}/admin-fields`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: adminFieldsToSave }),
        });

        if (!response.ok) {
          const data = await response.json();
          alert(data.error || '관리자 필드 저장에 실패했습니다.');
          return;
        }
      }

      alert('저장되었습니다.');
      setIsEditMode(false);
      await fetchTenantDetail();
      await fetchAdminFields();
    } catch {
      alert('오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditedFields({});
    setEditedAdminFields({});
    setHasChanges(false);
    setIsEditMode(false);
  };

  // 새로고침 핸들러
  const handleRefresh = async () => {
    await fetchTenantDetail(true);
    await fetchAdminFields();
    setIsEditMode(false);
  };

  // 삭제 핸들러
  const handleDeleteTenant = async () => {
    if (deleteConfirmText !== '매장 삭제') return;

    setDeletingTenant(true);
    try {
      const response = await fetch(`/api/admin/tenants/${tenantId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        alert('매장이 삭제되었습니다.');
        router.push('/admin/tenants');
      } else {
        const data = await response.json();
        alert(data.error || '삭제에 실패했습니다.');
      }
    } catch (error) {
      console.error('Delete failed:', error);
      alert('삭제 중 오류가 발생했습니다.');
    } finally {
      setDeletingTenant(false);
      setShowDeleteModal(false);
      setDeleteConfirmText('');
    }
  };

  // 커스텀 필드 변경 핸들러 (saveToFirestore에 따라 적절한 상태에 저장)
  const handleCustomFieldChange = (fieldName: string, value: unknown) => {
    const schema = customFieldSchema.find(s => s.name === fieldName);
    if (schema && !schema.saveToFirestore) {
      setEditedAdminFields(prev => ({ ...prev, [fieldName]: value }));
    } else {
      setEditedFields(prev => ({ ...prev, [fieldName]: value }));
    }
    setHasChanges(true);
  };

  // 관리자 UID를 이름으로 변환
  const resolveAdminName = (uid: unknown): string => {
    if (!uid || typeof uid !== 'string') return String(uid || '-');
    // adminNames에서 찾기
    if (adminNames[uid]) return adminNames[uid];
    // 예약어 확인 (system, admin 등)
    if (uid === 'system') return '시스템';
    if (uid === 'admin') return '관리자';
    // UID 그대로 반환
    return uid;
  };

  // 현재 값 가져오기 (편집된 값 우선, adminFields도 고려)
  const getCurrentValue = (fieldName: string) => {
    let value: unknown;

    // 편집된 값 우선
    if (fieldName in editedFields) {
      value = editedFields[fieldName];
    } else if (fieldName in editedAdminFields) {
      value = editedAdminFields[fieldName];
    } else if (fieldName in tenant) {
      // tenant 문서에서 찾기
      value = tenant[fieldName];
    } else {
      // adminFields에서 찾기
      value = adminFields[fieldName];
    }

    // 관리자 UID 필드는 이름으로 변환 (뷰 모드에서만)
    const adminUidFields = ['updatedBy', 'createdBy', 'deletedBy'];
    if (adminUidFields.includes(fieldName) && !isEditMode) {
      return resolveAdminName(value);
    }

    return value;
  };

  // 해당 탭의 커스텀 필드 스키마 가져오기
  const getCustomFieldsForTab = (tab: CustomFieldTab): CustomFieldSchema[] => {
    return customFieldSchema
      .filter(f => f.tab === tab)
      .sort((a, b) => a.order - b.order);
  };

  // 변경사항 있는지 확인
  const hasAnyChanges = hasChanges || Object.keys(editedAdminFields).length > 0;

  // 탭별 필드 필터링 (정의된 필드는 값이 없어도 항상 표시)
  const getFieldsForTab = (tab: TabType): Record<string, unknown> => {
    let groupFields = [...FIELD_GROUPS[tab]];

    // basic 탭에서 삭제된 매장인 경우에만 삭제 관련 필드 추가
    if (tab === 'basic' && tenant.deleted) {
      groupFields = [...groupFields, ...DELETION_FIELDS];
    }

    const result: Record<string, unknown> = {};

    for (const field of groupFields) {
      // tenant에 있든 없든 항상 포함 (값이 없으면 null)
      result[field] = getCurrentValue(field) ?? null;
    }

    return result;
  };

  // 기타 필드 (그룹에 정의되지 않은 새 필드들)
  const getOtherFields = (): Record<string, unknown> => {
    const result: Record<string, unknown> = {};

    for (const key of Object.keys(tenant)) {
      if (!ALL_GROUPED_FIELDS.includes(key) && key !== 'id') {
        result[key] = getCurrentValue(key);
      }
    }

    return result;
  };

  const getPlanName = (plan: unknown) => {
    if (!plan) return '-';
    const planStr = String(plan);
    switch (planStr) {
      case 'trial': return 'Trial';
      case 'basic': return 'Basic';
      case 'business': return 'Business';
      case 'enterprise': return 'Enterprise';
      default: return planStr;
    }
  };

  const getSubscriptionStatusBadge = (status: unknown) => {
    const statusStr = String(status || '');
    const baseClass = "px-2 py-1 text-xs font-medium rounded-full";
    switch (statusStr) {
      case 'active':
        return <span className={`${baseClass} bg-green-100 text-green-700`}>구독중</span>;
      case 'trial':
      case 'trialing':
        return <span className={`${baseClass} bg-blue-100 text-blue-700`}>체험</span>;
      case 'canceled':
        return <span className={`${baseClass} bg-red-100 text-red-700`}>해지</span>;
      case 'pending_cancel':
        return <span className={`${baseClass} bg-orange-100 text-orange-700`}>해지 예정</span>;
      case 'expired':
        return <span className={`${baseClass} bg-gray-100 text-gray-600`}>만료</span>;
      default:
        return <span className={`${baseClass} bg-gray-100 text-gray-600`}>미구독</span>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner size="lg" />
      </div>
    );
  }

  const basicFields = getFieldsForTab('basic');
  const aiFields = getFieldsForTab('ai');
  const integrationFields = getFieldsForTab('integrations');
  const otherFields = getOtherFields();

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/tenants"
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <NavArrowLeft className="w-5 h-5 text-gray-600" />
          </Link>
          <HomeSimpleDoor className="w-8 h-8 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {tenant.brandName as string || '매장 상세'}
            </h1>
            <p className="text-sm text-gray-500">{tenantId}</p>
          </div>
          {Boolean(tenant.deleted) && (
            <span className="px-3 py-1 text-sm font-medium bg-red-100 text-red-700 rounded-full">
              삭제됨
            </span>
          )}
        </div>

        {/* 우측 버튼 그룹: 새로고침 / 수정 / 저장 */}
        <div className="flex items-center gap-2">
          {/* 새로고침 버튼 */}
          <button
            onClick={handleRefresh}
            disabled={refreshing || saving}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
            title="새로고침"
          >
            <RefreshDouble className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>

          {/* 수정 모드가 아닐 때: 수정 버튼 */}
          {!isEditMode && (
            <button
              onClick={() => setIsEditMode(true)}
              className="px-3 py-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 border border-blue-300 hover:border-blue-400 rounded-lg transition-colors"
            >
              수정
            </button>
          )}

          {/* 수정 모드일 때: 취소 / 저장 버튼 */}
          {isEditMode && (
            <>
              <button
                onClick={handleCancel}
                className="px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 border border-gray-300 hover:border-gray-400 rounded-lg transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !hasAnyChanges}
                className="px-3 py-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 border border-blue-300 hover:border-blue-400 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? '저장 중...' : '저장'}
              </button>
            </>
          )}

          {/* 삭제 버튼 (삭제되지 않은 매장만) */}
          {!tenant.deleted && (
            <button
              onClick={() => setShowDeleteModal(true)}
              className="px-3 py-1.5 text-sm font-medium text-red-600 hover:text-red-700 border border-red-300 hover:border-red-400 rounded-lg transition-colors"
            >
              삭제
            </button>
          )}
        </div>
      </div>

      {/* 탭 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="flex border-b border-gray-100 overflow-x-auto">
          <button
            onClick={() => handleTabChange('basic')}
            className={`flex items-center gap-2 px-6 py-4 text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === 'basic'
                ? 'text-blue-600 border-b-2 border-blue-600 -mb-px'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <InfoCircle className="w-4 h-4" />
            기본 정보
          </button>
          <button
            onClick={() => handleTabChange('ai')}
            className={`flex items-center gap-2 px-6 py-4 text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === 'ai'
                ? 'text-blue-600 border-b-2 border-blue-600 -mb-px'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Spark className="w-4 h-4" />
            AI 설정
          </button>
          <button
            onClick={() => handleTabChange('integrations')}
            className={`flex items-center gap-2 px-6 py-4 text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === 'integrations'
                ? 'text-blue-600 border-b-2 border-blue-600 -mb-px'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <LinkIcon className="w-4 h-4" />
            연동 설정
          </button>
          <button
            onClick={() => handleTabChange('payments')}
            className={`flex items-center gap-2 px-6 py-4 text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === 'payments'
                ? 'text-blue-600 border-b-2 border-blue-600 -mb-px'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <CreditCards className="w-4 h-4" />
            결제
          </button>
          <button
            onClick={() => handleTabChange('subscription')}
            className={`flex items-center gap-2 px-6 py-4 text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === 'subscription'
                ? 'text-blue-600 border-b-2 border-blue-600 -mb-px'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Timer className="w-4 h-4" />
            구독
          </button>
        </div>

        {/* 탭 컨텐츠 */}
        <div className="p-6">
          {/* 기본 정보 탭 */}
          {activeTab === 'basic' && (
            <div className="space-y-6">
              {Object.keys(basicFields).length > 0 ? (
                <>
                  {/* 회원 정보 섹션 - 항상 읽기 전용 (회원 정보는 회원 상세 페이지에서만 수정 가능) */}
                  {(() => {
                    const memberFields = ['name', 'phone', 'email', 'userId'];
                    const memberFieldsData: Record<string, unknown> = {};
                    for (const field of memberFields) {
                      if (field in basicFields) {
                        memberFieldsData[field] = basicFields[field];
                      }
                    }
                    return Object.keys(memberFieldsData).length > 0 ? (
                      <DynamicFieldGroup
                        title="회원 정보 (회원 상세 페이지에서 수정)"
                        fields={memberFieldsData}
                        onChange={() => {}} // 회원 정보는 수정 불가
                        disabled={true} // 항상 비활성화
                      />
                    ) : null;
                  })()}
                  {/* 매장 정보 섹션 */}
                  {(() => {
                    const memberFields = ['name', 'phone', 'email', 'userId'];
                    const storeFieldsData: Record<string, unknown> = {};
                    for (const [key] of Object.entries(basicFields)) {
                      if (!memberFields.includes(key)) {
                        storeFieldsData[key] = basicFields[key];
                      }
                    }
                    return Object.keys(storeFieldsData).length > 0 ? (
                      <DynamicFieldGroup
                        title="매장 정보"
                        fields={storeFieldsData}
                        onChange={handleFieldChange}
                        disabled={!isEditMode}
                      />
                    ) : null;
                  })()}
                  {Object.keys(otherFields).length > 0 && (
                    <DynamicFieldGroup
                      title="기타"
                      fields={otherFields}
                      onChange={handleFieldChange}
                      disabled={!isEditMode}
                    />
                  )}
                  {/* 커스텀 필드 (basic 탭) */}
                  {getCustomFieldsForTab('basic').length > 0 && (
                    <DynamicFieldGroup
                      title="커스텀 필드"
                      fields={Object.fromEntries(
                        getCustomFieldsForTab('basic').map(schema => [
                          schema.name,
                          getCurrentValue(schema.name) ?? ''
                        ])
                      )}
                      onChange={handleCustomFieldChange}
                      disabled={!isEditMode}
                    />
                  )}
                </>
              ) : Object.keys(tenant).length > 0 ? (
                // 기본 필드 그룹에 없는 경우 전체 필드 표시
                <DynamicFieldGroup
                  title="전체 필드"
                  fields={tenant}
                  onChange={handleFieldChange}
                  disabled={!isEditMode}
                />
              ) : (
                <div className="text-center py-10 text-gray-500">
                  매장 정보를 불러오지 못했습니다.
                </div>
              )}
            </div>
          )}

          {/* AI 설정 탭 */}
          {activeTab === 'ai' && (
            <div className="space-y-4">
              {/* AI 정지 토글 */}
              <div className="py-3 border-b border-gray-100">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <label className="text-sm font-medium text-gray-600 w-40 flex-shrink-0">AI 정지</label>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!tenant.ai_stop}
                      onChange={async (e) => {
                        const newValue = e.target.checked;
                        const msg = newValue
                          ? 'AI 프로세스가 중지됩니다. 정지하시겠습니까?'
                          : 'AI 정지를 해제하시겠습니까?';
                        if (!confirm(msg)) {
                          e.preventDefault();
                          return;
                        }
                        try {
                          const response = await fetch(`/api/admin/tenants/${tenantId}/ai-stop`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ ai_stop: newValue }),
                          });
                          if (response.ok) {
                            setTenant(prev => ({ ...prev, ai_stop: newValue }));
                          } else {
                            const data = await response.json();
                            alert(data.error || 'AI 상태 변경에 실패했습니다.');
                          }
                        } catch {
                          alert('오류가 발생했습니다.');
                        }
                      }}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-500"></div>
                  </label>
                </div>
              </div>

              {/* 기존 AI 설정 필드 (ai_stop 제외) */}
              {(() => {
                const filteredAiFields = Object.entries(aiFields).filter(([key]) => key !== 'ai_stop');
                return filteredAiFields.length === 0 && getCustomFieldsForTab('ai').length === 0 ? null : (
                  <>
                    {filteredAiFields.map(([key, value]) => (
                      <DynamicField
                        key={key}
                        fieldName={key}
                        value={value}
                        onChange={handleFieldChange}
                        disabled={!isEditMode}
                      />
                    ))}
                    {getCustomFieldsForTab('ai').map(schema => (
                      <DynamicField
                        key={schema.name}
                        fieldName={schema.name}
                        value={getCurrentValue(schema.name) ?? ''}
                        onChange={handleCustomFieldChange}
                        disabled={!isEditMode}
                      />
                    ))}
                  </>
                );
              })()}
            </div>
          )}

          {/* 연동 설정 탭 */}
          {activeTab === 'integrations' && (
            <div className="space-y-4">
              {Object.keys(integrationFields).length === 0 && getCustomFieldsForTab('integrations').length === 0 ? (
                <div className="text-center py-10 text-gray-500">
                  연동 설정 정보가 없습니다.
                </div>
              ) : (
                <>
                  {Object.entries(integrationFields).map(([key, value]) => (
                    <DynamicField
                      key={key}
                      fieldName={key}
                      value={value}
                      onChange={handleFieldChange}
                      disabled={!isEditMode}
                    />
                  ))}
                  {/* 커스텀 필드 (integrations 탭) */}
                  {getCustomFieldsForTab('integrations').map(schema => (
                    <DynamicField
                      key={schema.name}
                      fieldName={schema.name}
                      value={getCurrentValue(schema.name) ?? ''}
                      onChange={handleCustomFieldChange}
                      disabled={!isEditMode}
                    />
                  ))}
                </>
              )}
            </div>
          )}

          {/* 결제 탭 */}
          {activeTab === 'payments' && (
            <div className="space-y-6">
              {/* 누적 금액 요약 */}
              {payments.length > 0 && (() => {
                const totalCharge = payments
                  .filter(p => p.transactionType !== 'refund' && (p.amount ?? 0) >= 0)
                  .reduce((sum, p) => sum + (p.amount ?? 0), 0);
                const totalRefund = payments
                  .filter(p => p.transactionType === 'refund' || (p.amount ?? 0) < 0)
                  .reduce((sum, p) => sum + Math.abs(p.amount ?? 0), 0);
                const netTotal = totalCharge - totalRefund;
                return (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <p className="text-xs text-gray-500 mb-1">총 결제</p>
                        <p className="text-lg font-semibold text-gray-900">{totalCharge.toLocaleString()}원</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">총 환불</p>
                        <p className="text-lg font-semibold text-red-600">-{totalRefund.toLocaleString()}원</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">순 결제</p>
                        <p className={`text-lg font-semibold ${netTotal >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                          {netTotal.toLocaleString()}원
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })()}

              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-4">결제 내역 ({payments.length}건)</h3>
                {payments.length === 0 ? (
                  <div className="text-center py-10 text-gray-500 bg-gray-50 rounded-lg">
                    결제 내역이 없습니다.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-max">
                      <thead className="bg-gray-50 border-b border-gray-100">
                        <tr>
                          <th
                            className="text-center px-3 py-3 text-sm font-medium text-gray-500 cursor-pointer hover:bg-gray-100 select-none"
                            onClick={() => setPaymentSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
                          >
                            <span className="inline-flex items-center gap-1">
                              결제일
                              {paymentSortOrder === 'desc' ? (
                                <NavArrowDown className="w-3.5 h-3.5" />
                              ) : (
                                <NavArrowUp className="w-3.5 h-3.5" />
                              )}
                            </span>
                          </th>
                          <th className="text-center px-3 py-3 text-sm font-medium text-gray-500">플랜</th>
                          <th className="text-center px-3 py-3 text-sm font-medium text-gray-500">유형</th>
                          <th className="text-center px-3 py-3 text-sm font-medium text-gray-500">거래</th>
                          <th className="text-center px-3 py-3 text-sm font-medium text-gray-500">금액</th>
                          <th className="text-center px-3 py-3 text-sm font-medium text-gray-500">처리자</th>
                          <th className="text-center px-3 py-3 text-sm font-medium text-gray-500">주문ID</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {[...payments].sort((a, b) => {
                          const dateA = new Date(a.paidAt || a.createdAt).getTime();
                          const dateB = new Date(b.paidAt || b.createdAt).getTime();
                          return paymentSortOrder === 'desc' ? dateB - dateA : dateA - dateB;
                        }).map((payment) => {
                          const isRefund = payment.transactionType === 'refund' || (payment.amount ?? 0) < 0;
                          const paymentDate = payment.paidAt || payment.createdAt;
                          return (
                            <tr
                              key={payment.id}
                              className="hover:bg-gray-50 cursor-pointer"
                              onClick={() => setPaymentDetailModal(payment)}
                            >
                              <td className="px-3 py-3 text-sm text-gray-600 text-center whitespace-nowrap">
                                {paymentDate
                                  ? new Date(paymentDate).toLocaleString('ko-KR', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                                  : '-'}
                              </td>
                              <td className="px-3 py-3 text-sm text-gray-600 text-center">
                                {getPlanName(payment.plan)}
                              </td>
                              <td className="px-3 py-3 text-sm text-gray-600 text-center whitespace-nowrap">
                                {payment.type ? PAYMENT_TYPE_LABELS[payment.type] || payment.type : '-'}
                              </td>
                              <td className="px-3 py-3 text-sm text-gray-600 text-center">
                                {payment.transactionType
                                  ? TRANSACTION_TYPE_LABELS[payment.transactionType] || payment.transactionType
                                  : (isRefund ? '환불' : '결제')}
                              </td>
                              <td className={`px-3 py-3 text-sm font-medium text-center ${isRefund ? 'text-red-600' : 'text-gray-900'}`}>
                                {isRefund ? '-' : ''}{Math.abs(payment.amount ?? 0).toLocaleString()}원
                              </td>
                              <td className="px-3 py-3 text-sm text-gray-600 text-center">
                                {payment.initiatedBy
                                  ? INITIATED_BY_LABELS[payment.initiatedBy] || payment.initiatedBy
                                  : '-'}
                              </td>
                              <td className="px-3 py-3 text-sm text-gray-500 text-center font-mono text-xs">
                                {payment.orderId || payment.id || '-'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 구독 탭 */}
          {activeTab === 'subscription' && (
            <div className="space-y-6">
              {/* 현재 구독 정보 - 카드 UI */}
              {subscription ? (
                <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
                  {/* 상단: 플랜명 + 가격 */}
                  <div className="px-6 py-5 border-b border-gray-100">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-xl font-bold text-gray-900">{getPlanName(subscription.plan)}</h3>
                      {getSubscriptionStatusBadge(subscription.status)}
                      <button
                        onClick={() => {
                          setSubscriptionEditData({
                            plan: String(subscription.plan || ''),
                            status: String(subscription.status || ''),
                            currentPeriodStart: subscription.currentPeriodStart ? new Date(subscription.currentPeriodStart as string).toISOString().split('T')[0] : '',
                            currentPeriodEnd: subscription.currentPeriodEnd ? new Date(subscription.currentPeriodEnd as string).toISOString().split('T')[0] : '',
                            nextBillingDate: subscription.nextBillingDate ? new Date(subscription.nextBillingDate as string).toISOString().split('T')[0] : '',
                          });
                          setSubscriptionEditModal(true);
                        }}
                        className="px-2 py-1 text-xs font-medium text-gray-600 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors"
                      >
                        수정
                      </button>
                    </div>
                    <div className="flex items-baseline gap-2">
                      {subscription.baseAmount && (subscription.baseAmount as number) !== (subscription.amount as number) ? (
                        <>
                          <span className="text-2xl font-bold text-gray-900">
                            {((subscription.amount as number) ?? 0).toLocaleString()}
                            <span className="text-sm font-normal text-gray-500">원/월</span>
                          </span>
                          <span className="text-sm text-gray-400 line-through">
                            {((subscription.baseAmount as number) ?? 0).toLocaleString()}원
                          </span>
                        </>
                      ) : (
                        <span className="text-2xl font-bold text-gray-900">
                          {((subscription.amount as number) ?? 0).toLocaleString()}
                          <span className="text-sm font-normal text-gray-500">원/월</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 하단: 상세 정보 */}
                  <div className="px-6 py-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                      <div>
                        <p className="text-xs text-gray-400 mb-1">구독 시작</p>
                        <p className="text-sm font-medium text-gray-900">
                          {subscription.currentPeriodStart
                            ? new Date(subscription.currentPeriodStart as string).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })
                            : '-'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 mb-1">구독 종료</p>
                        <p className="text-sm font-medium text-gray-900">
                          {subscription.currentPeriodEnd
                            ? new Date(subscription.currentPeriodEnd as string).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })
                            : '-'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 mb-1">다음 결제</p>
                        <p className={`text-sm font-medium ${subscription.nextBillingDate ? 'text-blue-600' : 'text-gray-400'}`}>
                          {subscription.nextBillingDate
                            ? new Date(subscription.nextBillingDate as string).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })
                            : '-'}
                        </p>
                        {Boolean(subscription.nextBillingDate) && ((subscription.baseAmount as number) || (subscription.amount as number) || 0) > 0 && (
                          <p className="text-xs text-gray-500 mt-0.5">
                            {((subscription.baseAmount as number) || (subscription.amount as number) || 0).toLocaleString()}원 결제 예정
                          </p>
                        )}
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 mb-1">결제수단</p>
                        {subscription.billingKey ? (
                          <span className="inline-flex items-center gap-1 text-sm font-medium text-green-600">
                            <Check className="w-3.5 h-3.5" />
                            카드 등록됨
                          </span>
                        ) : (
                          <span className="text-sm font-medium text-gray-400">미등록</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="border border-gray-200 rounded-xl p-8 text-center bg-gray-50">
                  <RefreshDouble className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                  <p className="text-gray-500 font-medium">구독 정보가 없습니다</p>
                  <p className="text-sm text-gray-400 mt-1">이 매장은 아직 구독을 시작하지 않았습니다.</p>
                </div>
              )}

              {/* 구독 변경 내역 */}
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <PageFlip className="w-4 h-4" />
                  구독 내역 ({subscriptionHistory.length}건)
                </h3>
                {subscriptionHistory.length === 0 ? (
                  <div className="text-center py-10 text-gray-500 bg-gray-50 rounded-lg">
                    구독 내역이 없습니다.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-max">
                      <thead className="bg-gray-50 border-b border-gray-100">
                        <tr>
                          <th
                            className="text-center px-3 py-3 text-sm font-medium text-gray-500 cursor-pointer hover:bg-gray-100 select-none"
                            onClick={() => setHistorySortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
                          >
                            <span className="inline-flex items-center gap-1">
                              처리일
                              {historySortOrder === 'desc' ? (
                                <NavArrowDown className="w-3.5 h-3.5" />
                              ) : (
                                <NavArrowUp className="w-3.5 h-3.5" />
                              )}
                            </span>
                          </th>
                          <th className="text-center px-3 py-3 text-sm font-medium text-gray-500">변경유형</th>
                          <th className="text-center px-3 py-3 text-sm font-medium text-gray-500">플랜</th>
                          <th className="text-center px-3 py-3 text-sm font-medium text-gray-500">상태</th>
                          <th className="text-center px-3 py-3 text-sm font-medium text-gray-500">시작일</th>
                          <th className="text-center px-3 py-3 text-sm font-medium text-gray-500">종료일</th>
                          <th className="text-center px-3 py-3 text-sm font-medium text-gray-500">처리자</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {[...subscriptionHistory].sort((a, b) => {
                          const dateA = new Date(a.changedAt || 0).getTime();
                          const dateB = new Date(b.changedAt || 0).getTime();
                          return historySortOrder === 'desc' ? dateB - dateA : dateA - dateB;
                        }).map((record) => (
                          <tr key={record.recordId} className="hover:bg-gray-50">
                            <td className="px-3 py-3 text-sm text-gray-600 text-center whitespace-nowrap">
                              {record.changedAt ? new Date(record.changedAt).toLocaleString('ko-KR') : '-'}
                            </td>
                            <td className="px-3 py-3 text-center text-sm text-gray-700">
                              {CHANGE_TYPE_LABELS[record.changeType] || record.changeType}
                            </td>
                            <td className="px-3 py-3 text-sm text-gray-600 text-center">
                              {record.previousPlan && record.previousPlan !== record.plan ? (
                                <span>
                                  <span className="text-gray-400">{getPlanName(record.previousPlan)}</span>
                                  <span className="mx-1">→</span>
                                  <span className="font-medium">{getPlanName(record.plan)}</span>
                                </span>
                              ) : (
                                getPlanName(record.plan)
                              )}
                            </td>
                            <td className="px-3 py-3 text-center">
                              {getSubscriptionStatusBadge(record.status)}
                            </td>
                            <td className="px-3 py-3 text-sm text-gray-600 text-center whitespace-nowrap">
                              {record.periodStart ? new Date(record.periodStart).toLocaleDateString('ko-KR') : '-'}
                            </td>
                            <td className="px-3 py-3 text-sm text-gray-600 text-center whitespace-nowrap">
                              {record.periodEnd ? new Date(record.periodEnd).toLocaleDateString('ko-KR') : '-'}
                            </td>
                            <td className="px-3 py-3 text-sm text-gray-600 text-center">
                              {record.changedBy ? (INITIATED_BY_LABELS[record.changedBy] || resolveAdminName(record.changedBy)) : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      </div>

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
                <span className="text-gray-900 font-mono text-sm break-all">{paymentDetailModal.orderId || paymentDetailModal.id}</span>
              </div>
              <div className="flex py-3">
                <span className="text-gray-500 w-24 shrink-0">플랜</span>
                <span className="text-gray-900">{getPlanName(paymentDetailModal.plan)}</span>
              </div>
              <div className="flex py-3">
                <span className="text-gray-500 w-24 shrink-0">결제유형</span>
                <span className="text-gray-900">
                  {paymentDetailModal.type ? PAYMENT_TYPE_LABELS[paymentDetailModal.type] || paymentDetailModal.type : '-'}
                </span>
              </div>
              <div className="flex py-3">
                <span className="text-gray-500 w-24 shrink-0">분류</span>
                <span className="text-gray-900">
                  {paymentDetailModal.category ? PAYMENT_CATEGORY_LABELS[paymentDetailModal.category] || paymentDetailModal.category : '-'}
                </span>
              </div>
              <div className="flex py-3">
                <span className="text-gray-500 w-24 shrink-0">거래</span>
                <span className={`font-medium ${paymentDetailModal.transactionType === 'refund' || (paymentDetailModal.amount ?? 0) < 0 ? 'text-red-500' : 'text-gray-900'}`}>
                  {paymentDetailModal.transactionType ? TRANSACTION_TYPE_LABELS[paymentDetailModal.transactionType] || paymentDetailModal.transactionType : ((paymentDetailModal.amount ?? 0) < 0 ? '환불' : '결제')}
                </span>
              </div>
              <div className="flex py-3">
                <span className="text-gray-500 w-24 shrink-0">금액</span>
                <span className={`font-medium ${(paymentDetailModal.amount ?? 0) < 0 ? 'text-red-500' : 'text-gray-900'}`}>
                  {(paymentDetailModal.amount ?? 0) < 0 ? '-' : ''}{Math.abs(paymentDetailModal.amount ?? 0).toLocaleString()}원
                </span>
              </div>
              {/* 환불 정보 */}
              {(paymentDetailModal.refundedAmount ?? 0) > 0 && (
                <>
                  <div className="flex py-3">
                    <span className="text-gray-500 w-24 shrink-0">환불된 금액</span>
                    <span className="text-orange-600 font-medium">-{paymentDetailModal.refundedAmount?.toLocaleString()}원</span>
                  </div>
                  <div className="flex py-3">
                    <span className="text-gray-500 w-24 shrink-0">잔여 금액</span>
                    <span className="text-blue-600 font-medium">{paymentDetailModal.remainingAmount?.toLocaleString()}원</span>
                  </div>
                </>
              )}
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
                  <span className="text-gray-900 font-mono text-sm">
                    {String(paymentDetailModal.originalPaymentId).split('_').slice(0, 2).join('_')}
                  </span>
                </div>
              )}
              {/* 처리자 */}
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
              {/* 사유 */}
              {(paymentDetailModal.refundReason || paymentDetailModal.cancelReason) && (
                <div className="flex py-3">
                  <span className="text-gray-500 w-24 shrink-0">사유</span>
                  <span className="text-gray-900">{String(paymentDetailModal.refundReason || paymentDetailModal.cancelReason)}</span>
                </div>
              )}
              {/* 영수증 버튼 */}
              {paymentDetailModal.receiptUrl && (
                <div className="pt-4">
                  <a
                    href={paymentDetailModal.receiptUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                  >
                    영수증
                  </a>
                </div>
              )}
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

      {/* 삭제 확인 모달 */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full shadow-xl">
            <div className="p-6 border-b border-gray-100">
              <h3 className="text-lg font-bold text-red-600 flex items-center gap-2">
                <Trash className="w-5 h-5" />
                매장 삭제
              </h3>
            </div>
            <div className="p-6 space-y-4">
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-800 font-medium mb-2">
                  &quot;{tenant.brandName}&quot; 매장을 삭제하시겠습니까?
                </p>
                <p className="text-xs text-red-600">
                  • 삭제된 매장은 90일 후 영구 삭제됩니다.<br />
                  • 삭제된 매장의 구독은 즉시 만료 처리됩니다.<br />
                  • 이 작업은 취소할 수 없습니다.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  확인을 위해 <span className="font-bold text-red-600">&quot;매장 삭제&quot;</span>를 입력하세요
                </label>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="매장 삭제"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                />
              </div>
            </div>
            <div className="flex gap-3 p-6 border-t border-gray-100">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeleteConfirmText('');
                }}
                className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                취소
              </button>
              <button
                onClick={handleDeleteTenant}
                disabled={deleteConfirmText !== '매장 삭제' || deletingTenant}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {deletingTenant ? (
                  <>
                    <RefreshDouble className="w-4 h-4 animate-spin" />
                    삭제 중...
                  </>
                ) : (
                  <>
                    <Trash className="w-4 h-4" />
                    삭제
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 구독 수정 모달 */}
      {subscriptionEditModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold">구독 정보 수정</h3>
              <button
                onClick={() => setSubscriptionEditModal(false)}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <Xmark className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* 플랜 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">플랜</label>
                <select
                  value={subscriptionEditData.plan}
                  onChange={(e) => setSubscriptionEditData(prev => ({ ...prev, plan: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">선택...</option>
                  <option value="trial">Trial</option>
                  <option value="basic">Basic</option>
                  <option value="business">Business</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </div>

              {/* 상태 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">상태</label>
                <select
                  value={subscriptionEditData.status}
                  onChange={(e) => setSubscriptionEditData(prev => ({ ...prev, status: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">선택...</option>
                  <option value="active">구독중</option>
                  <option value="trial">체험</option>
                  <option value="trialing">체험</option>
                  <option value="pending_cancel">해지 예정</option>
                  <option value="canceled">해지</option>
                  <option value="expired">만료</option>
                </select>
              </div>

              {/* 시작일 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">구독 시작일</label>
                <input
                  type="date"
                  value={subscriptionEditData.currentPeriodStart}
                  onChange={(e) => setSubscriptionEditData(prev => ({ ...prev, currentPeriodStart: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* 종료일 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">구독 종료일</label>
                <input
                  type="date"
                  value={subscriptionEditData.currentPeriodEnd}
                  onChange={(e) => setSubscriptionEditData(prev => ({ ...prev, currentPeriodEnd: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* 다음 결제일 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">다음 결제일</label>
                <input
                  type="date"
                  value={subscriptionEditData.nextBillingDate}
                  onChange={(e) => setSubscriptionEditData(prev => ({ ...prev, nextBillingDate: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={() => setSubscriptionEditModal(false)}
                className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              >
                취소
              </button>
              <button
                onClick={async () => {
                  setSavingSubscription(true);
                  try {
                    const response = await fetch(`/api/admin/tenants/${tenantId}`, {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        'subscription.plan': subscriptionEditData.plan,
                        'subscription.status': subscriptionEditData.status,
                        'subscription.currentPeriodStart': subscriptionEditData.currentPeriodStart ? new Date(subscriptionEditData.currentPeriodStart).toISOString() : null,
                        'subscription.currentPeriodEnd': subscriptionEditData.currentPeriodEnd ? new Date(subscriptionEditData.currentPeriodEnd).toISOString() : null,
                        'subscription.nextBillingDate': subscriptionEditData.nextBillingDate ? new Date(subscriptionEditData.nextBillingDate).toISOString() : null,
                      }),
                    });

                    if (response.ok) {
                      alert('저장되었습니다.');
                      setSubscriptionEditModal(false);
                      await fetchTenantDetail();
                    } else {
                      const data = await response.json();
                      alert(data.error || '저장에 실패했습니다.');
                    }
                  } catch {
                    alert('오류가 발생했습니다.');
                  } finally {
                    setSavingSubscription(false);
                  }
                }}
                disabled={savingSubscription}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {savingSubscription ? (
                  <>
                    <RefreshDouble className="w-4 h-4 animate-spin" />
                    저장 중...
                  </>
                ) : (
                  '저장'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
