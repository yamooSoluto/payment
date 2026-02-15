'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { HomeSimpleDoor, NavArrowLeft, RefreshDouble, Link as LinkIcon, CreditCards, InfoCircle, Spark, Timer, Database } from 'iconoir-react';
import Link from 'next/link';
import Spinner from '@/components/admin/Spinner';
import { DynamicField, DynamicFieldGroup } from '@/components/admin/DynamicFieldRenderer';
import PaymentsTab from '@/components/admin/tenant-detail/PaymentsTab';
import SubscriptionTab from '@/components/admin/tenant-detail/SubscriptionTab';
import DeleteTenantModal from '@/components/admin/tenant-detail/DeleteTenantModal';
import FaqTab from '@/components/admin/tenant-detail/FaqTab';
import type { TabType, CustomFieldSchema, CustomFieldTab } from '@/components/admin/tenant-detail/types';

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
  payments: [],
};

const ALL_GROUPED_FIELDS = [
  ...FIELD_GROUPS.basic,
  ...FIELD_GROUPS.ai,
  ...FIELD_GROUPS.integrations,
  ...FIELD_GROUPS.subscription,
  ...DELETION_FIELDS,
];

export default function TenantDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tenantId = params.tenantId as string;

  // URL에서 탭 상태 읽기
  const tabFromUrl = searchParams.get('tab') as TabType | null;
  const validTabs: TabType[] = ['basic', 'ai', 'integrations', 'payments', 'subscription', 'faq'];
  const initialTab = tabFromUrl && validTabs.includes(tabFromUrl) ? tabFromUrl : 'basic';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    const newParams = new URLSearchParams(searchParams.toString());
    newParams.set('tab', tab);
    router.replace(`?${newParams.toString()}`, { scroll: false });
  };

  const [tenant, setTenant] = useState<Record<string, unknown>>({});
  const [subscription, setSubscription] = useState<Record<string, unknown> | null>(null);
  const [adminNames, setAdminNames] = useState<Record<string, string>>({});
  const [editedFields, setEditedFields] = useState<Record<string, unknown>>({});
  const [hasChanges, setHasChanges] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // 충돌 감지용 원본 데이터
  const [originalTenant, setOriginalTenant] = useState<Record<string, unknown>>({});
  const [originalAdminFields, setOriginalAdminFields] = useState<Record<string, unknown>>({});

  // 삭제 모달
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // 커스텀 필드 스키마
  const [customFieldSchema, setCustomFieldSchema] = useState<CustomFieldSchema[]>([]);

  // 관리자 필드 데이터 (tenant_admin_fields 컬렉션)
  const [adminFields, setAdminFields] = useState<Record<string, unknown>>({});
  const [editedAdminFields, setEditedAdminFields] = useState<Record<string, unknown>>({});

  // 기본 데이터 fetch (tenant + subscription + adminNames만, payments/history 제외)
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
        setOriginalTenant(JSON.parse(JSON.stringify(tenantData)));
        setSubscription(data.subscription);
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
        setOriginalAdminFields(JSON.parse(JSON.stringify(fieldsData)));
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
    setEditedFields(prev => ({ ...prev, [fieldName]: value }));
    setHasChanges(true);
  };

  // 충돌 감지 함수
  const checkForConflicts = async (): Promise<{ hasConflict: boolean; message: string }> => {
    try {
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

      const changedTenantFields: string[] = [];
      const changedAdminFieldsList: string[] = [];

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
          changedAdminFieldsList.push(fieldName);
        }
      }

      const allChangedFields = [...changedTenantFields, ...changedAdminFieldsList];

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
      const { hasConflict, message } = await checkForConflicts();
      if (hasConflict && !confirm(message)) {
        setSaving(false);
        return;
      }

      const firestoreFields: Record<string, unknown> = {};
      const adminFieldsToSave: Record<string, unknown> = {};

      for (const [fieldName, value] of Object.entries(allEditedFields)) {
        const schema = customFieldSchema.find(s => s.name === fieldName);
        if (schema && !schema.saveToFirestore) {
          adminFieldsToSave[fieldName] = value;
        } else {
          firestoreFields[fieldName] = value;
        }
      }

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

  const handleRefresh = async () => {
    await fetchTenantDetail(true);
    await fetchAdminFields();
    setIsEditMode(false);
  };

  const handleCustomFieldChange = (fieldName: string, value: unknown) => {
    const schema = customFieldSchema.find(s => s.name === fieldName);
    if (schema && !schema.saveToFirestore) {
      setEditedAdminFields(prev => ({ ...prev, [fieldName]: value }));
    } else {
      setEditedFields(prev => ({ ...prev, [fieldName]: value }));
    }
    setHasChanges(true);
  };

  const resolveAdminName = (uid: unknown): string => {
    if (!uid || typeof uid !== 'string') return String(uid || '-');
    if (adminNames[uid]) return adminNames[uid];
    if (uid === 'system') return '시스템';
    if (uid === 'admin') return '관리자';
    return uid;
  };

  const getCurrentValue = (fieldName: string) => {
    let value: unknown;

    if (fieldName in editedFields) {
      value = editedFields[fieldName];
    } else if (fieldName in editedAdminFields) {
      value = editedAdminFields[fieldName];
    } else if (fieldName in tenant) {
      value = tenant[fieldName];
    } else {
      value = adminFields[fieldName];
    }

    const adminUidFields = ['updatedBy', 'createdBy', 'deletedBy'];
    if (adminUidFields.includes(fieldName) && !isEditMode) {
      return resolveAdminName(value);
    }

    return value;
  };

  const getCustomFieldsForTab = (tab: CustomFieldTab): CustomFieldSchema[] => {
    return customFieldSchema
      .filter(f => f.tab === tab)
      .sort((a, b) => a.order - b.order);
  };

  const hasAnyChanges = hasChanges || Object.keys(editedAdminFields).length > 0;

  const getFieldsForTab = (tab: TabType): Record<string, unknown> => {
    let groupFields = [...FIELD_GROUPS[tab]];

    if (tab === 'basic' && tenant.deleted) {
      groupFields = [...groupFields, ...DELETION_FIELDS];
    }

    const result: Record<string, unknown> = {};
    for (const field of groupFields) {
      result[field] = getCurrentValue(field) ?? null;
    }
    return result;
  };

  const getOtherFields = (): Record<string, unknown> => {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(tenant)) {
      if (!ALL_GROUPED_FIELDS.includes(key) && key !== 'id') {
        result[key] = getCurrentValue(key);
      }
    }
    return result;
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
          <h1 className="text-2xl font-bold text-gray-900">
            {tenant.brandName as string || '매장 상세'}
          </h1>
          {Boolean(tenant.deleted) && (
            <span className="px-3 py-1 text-sm font-medium bg-red-100 text-red-700 rounded-full">
              삭제됨
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={refreshing || saving}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
            title="새로고침"
          >
            <RefreshDouble className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>

          {!isEditMode && (
            <button
              onClick={() => setIsEditMode(true)}
              className="px-3 py-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 border border-blue-300 hover:border-blue-400 rounded-lg transition-colors"
            >
              수정
            </button>
          )}

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
        <div className="flex border-b border-gray-100 overflow-x-auto overflow-y-hidden touch-pan-x overscroll-x-contain">
          {[
            { id: 'basic' as TabType, label: '기본 정보', icon: <InfoCircle className="w-4 h-4" /> },
            { id: 'ai' as TabType, label: 'AI 설정', icon: <Spark className="w-4 h-4" /> },
            { id: 'integrations' as TabType, label: '연동 설정', icon: <LinkIcon className="w-4 h-4" /> },
            { id: 'payments' as TabType, label: '결제', icon: <CreditCards className="w-4 h-4" /> },
            { id: 'subscription' as TabType, label: '구독', icon: <Timer className="w-4 h-4" /> },
            { id: 'faq' as TabType, label: 'FAQ', icon: <Database className="w-4 h-4" /> },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`flex items-center gap-2 px-6 py-4 text-sm font-medium transition-colors whitespace-nowrap ${activeTab === tab.id
                  ? 'text-blue-600 border-b-2 border-blue-600 -mb-px'
                  : 'text-gray-500 hover:text-gray-700'
                }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* 탭 컨텐츠 */}
        <div className="p-6">
          {/* 기본 정보 탭 */}
          {activeTab === 'basic' && (
            <div className="space-y-6">
              {Object.keys(basicFields).length > 0 ? (
                <>
                  {/* 회원 정보 섹션 */}
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
                        onChange={() => { }}
                        disabled={true}
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

          {/* 결제 탭 — lazy loaded */}
          {activeTab === 'payments' && (
            <PaymentsTab tenantId={tenantId} />
          )}

          {/* 구독 탭 — history lazy loaded */}
          {activeTab === 'subscription' && (
            <SubscriptionTab
              tenantId={tenantId}
              subscription={subscription}
              tenant={tenant}
              adminNames={adminNames}
              onRefresh={() => fetchTenantDetail(true)}
            />
          )}

          {/* FAQ 탭 */}
          {activeTab === 'faq' && (
            <FaqTab tenantId={tenantId} />
          )}
        </div>
      </div>

      {/* 삭제 확인 모달 */}
      {showDeleteModal && (
        <DeleteTenantModal
          tenantId={tenantId}
          brandName={String(tenant.brandName || '')}
          onClose={() => setShowDeleteModal(false)}
          onSuccess={() => router.push('/admin/tenants')}
        />
      )}
    </div>
  );
}
