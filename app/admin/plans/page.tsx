'use client';

import { useState, useEffect } from 'react';
import useSWR from 'swr';
import { useSearchParams, useRouter } from 'next/navigation';
import { Package, Plus, Eye, Link as LinkIcon } from 'iconoir-react';
import { arrayMove } from '@dnd-kit/sortable';
import { DragEndEvent } from '@dnd-kit/core';

// Component imports
import { PlanListSection } from '@/components/admin/plan-detail/PlanListSection';
import PlanModal, { PlanFormData } from '@/components/admin/plan-detail/PlanModal';
import PlanPreviewModal from '@/components/admin/plan-detail/PlanPreviewModal';
import CustomLinkTable from '@/components/admin/plan-detail/CustomLinkTable';
import CustomLinkModal from '@/components/admin/plan-detail/CustomLinkModal';
import GridSelector from '@/components/admin/plan-detail/GridSelector';

// Type imports
import type { Plan, CustomLink, LinkFormData } from '@/components/admin/plan-detail/types';

type TabType = 'plans' | 'links';

export default function PlansPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Tab state
  const tabFromUrl = searchParams.get('tab') as TabType | null;
  const [activeTab, setActiveTab] = useState<TabType>(tabFromUrl === 'links' ? 'links' : 'plans');

  // SWR data fetching
  const { data: plansData, isLoading: loading, mutate: mutatePlans } = useSWR(
    '/api/admin/plans',
    { fallbackData: { plans: [] } }
  );
  const [plans, setPlans] = useState<Plan[]>([]);

  // Plan modal state
  const [showModal, setShowModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);

  // Preview modal state
  const [showPreview, setShowPreview] = useState(false);

  // Grid settings state
  const [gridCols, setGridCols] = useState(4);
  const [savingGrid, setSavingGrid] = useState(false);

  // Custom links state
  const [customLinks, setCustomLinks] = useState<CustomLink[]>([]);
  const [linksLoading, setLinksLoading] = useState(false);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [editingLink, setEditingLink] = useState<CustomLink | null>(null);
  const [showDisabledLinks, setShowDisabledLinks] = useState(false);

  // Sync SWR data to local state for drag reordering
  useEffect(() => {
    if (plansData?.plans) setPlans(plansData.plans);
  }, [plansData]);

  // Fetch grid settings on mount
  useEffect(() => {
    fetchGridSettings();
  }, []);

  // Tab change handler
  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    const newParams = new URLSearchParams(searchParams.toString());
    newParams.set('tab', tab);
    router.replace(`?${newParams.toString()}`, { scroll: false });
  };

  // Grid settings
  const fetchGridSettings = async () => {
    try {
      const response = await fetch('/api/admin/settings/plans');
      if (response.ok) {
        const data = await response.json();
        if (data.gridCols) {
          setGridCols(data.gridCols);
        }
      }
    } catch (error) {
      console.error('Failed to fetch grid settings:', error);
    }
  };

  const saveGridSettings = async (cols: number) => {
    setSavingGrid(true);
    setGridCols(cols);
    try {
      const response = await fetch('/api/admin/settings/plans', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gridCols: cols }),
      });
      if (!response.ok) {
        console.error('Failed to save grid settings');
      }
    } catch (error) {
      console.error('Failed to save grid settings:', error);
    } finally {
      setSavingGrid(false);
    }
  };

  // Plan drag & drop handler
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = plans.findIndex((p) => p.id === active.id);
      const newIndex = plans.findIndex((p) => p.id === over.id);
      const newPlans = arrayMove(plans, oldIndex, newIndex);
      setPlans(newPlans);

      const orders: Record<string, number> = {};
      newPlans.forEach((plan, index) => {
        orders[plan.id] = index;
      });

      try {
        const response = await fetch('/api/admin/plans/reorder', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orders }),
        });
        if (!response.ok) {
          mutatePlans();
          alert('순서 변경에 실패했습니다.');
        }
      } catch (error) {
        console.error('Failed to reorder plans:', error);
        mutatePlans();
        alert('순서 변경에 실패했습니다.');
      }
    }
  };

  // Plan modal handlers
  const handleOpenModal = (plan?: Plan) => {
    setEditingPlan(plan || null);
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingPlan(null);
  };

  const handleSavePlan = async (formData: PlanFormData) => {
    const url = editingPlan ? `/api/admin/plans/${editingPlan.id}` : '/api/admin/plans';
    const body = {
      ...formData,
      features: formData.features.split('\n').filter(f => f.trim()),
    };

    const response = await fetch(url, {
      method: editingPlan ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (response.ok) {
      handleCloseModal();
      mutatePlans();
    } else {
      const data = await response.json();
      alert(data.error || '저장에 실패했습니다.');
      throw new Error(data.error || '저장에 실패했습니다.');
    }
  };

  // Plan action handlers
  const handleToggleActive = async (plan: Plan) => {
    if (!plan) return;

    try {
      const response = await fetch(`/api/admin/plans/${plan.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...plan, isActive: !plan.isActive }),
      });
      if (response.ok) {
        mutatePlans();
      } else {
        const data = await response.json();
        alert(data.error || '변경에 실패했습니다.');
      }
    } catch (error) {
      console.error('Failed to toggle plan:', error);
      alert('변경에 실패했습니다.');
    }
  };

  const handleDeletePlan = async (plan: Plan) => {
    if (!plan || !confirm(`정말 "${plan.name}" 플랜을 삭제하시겠습니까?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/plans/${plan.id}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        mutatePlans();
      } else {
        const data = await response.json();
        alert(data.error || '삭제에 실패했습니다.');
      }
    } catch (error) {
      console.error('Failed to delete plan:', error);
      alert('삭제에 실패했습니다.');
    }
  };

  const handleTogglePopular = async (plan: Plan) => {
    if (!plan) return;

    try {
      const response = await fetch(`/api/admin/plans/${plan.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...plan, popular: !plan.popular }),
      });
      if (response.ok) {
        mutatePlans();
      } else {
        const data = await response.json();
        alert(data.error || '변경에 실패했습니다.');
      }
    } catch (error) {
      console.error('Failed to toggle popular:', error);
      alert('변경에 실패했습니다.');
    }
  };

  // Custom link handlers
  const fetchCustomLinks = async (includeDisabled = false) => {
    setLinksLoading(true);
    try {
      const url = includeDisabled
        ? '/api/admin/custom-links?includeDisabled=true'
        : '/api/admin/custom-links';
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setCustomLinks(data.links);
      }
    } catch (error) {
      console.error('Failed to fetch custom links:', error);
    } finally {
      setLinksLoading(false);
    }
  };

  const handleOpenLinkModal = (link?: CustomLink) => {
    setEditingLink(link || null);
    setShowLinkModal(true);
  };

  const handleCloseLinkModal = () => {
    setShowLinkModal(false);
    setEditingLink(null);
  };

  const handleSaveLink = async (linkFormData: LinkFormData) => {
    const selectedPlan = plans.find(p => p.id === linkFormData.planId);
    const body = {
      planId: linkFormData.planId,
      planName: selectedPlan?.name || linkFormData.planId,
      customAmount: linkFormData.customAmount ? parseInt(linkFormData.customAmount) : null,
      targetEmail: linkFormData.targetEmail.trim() || null,
      targetUserName: linkFormData.targetUserName.trim() || null,
      billingType: linkFormData.billingType,
      subscriptionDays: linkFormData.billingType === 'onetime' ? parseInt(linkFormData.subscriptionDays) || 30 : null,
      validFrom: linkFormData.validFrom,
      validUntil: linkFormData.validUntil,
      maxUses: parseInt(linkFormData.maxUses) || 0,
      memo: linkFormData.memo.trim() || null,
    };

    const url = editingLink
      ? `/api/admin/custom-links/${editingLink.id}`
      : '/api/admin/custom-links';

    const response = await fetch(url, {
      method: editingLink ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (response.ok) {
      handleCloseLinkModal();
      fetchCustomLinks(showDisabledLinks);
    } else {
      const data = await response.json();
      alert(data.error || '저장에 실패했습니다.');
      throw new Error(data.error || '저장에 실패했습니다.');
    }
  };

  const handleDeleteLink = async (link: CustomLink) => {
    if (!confirm(`정말 이 링크를 비활성화하시겠습니까?\n(${link.planName} - ${link.id})`)) {
      return;
    }
    try {
      const response = await fetch(`/api/admin/custom-links/${link.id}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        fetchCustomLinks(showDisabledLinks);
      } else {
        const data = await response.json();
        alert(data.error || '비활성화에 실패했습니다.');
      }
    } catch (error) {
      console.error('Failed to delete link:', error);
      alert('비활성화에 실패했습니다.');
    }
  };

  const handleCopyLink = (linkId: string) => {
    const baseUrl = window.location.origin;
    const url = `${baseUrl}/checkout?link=${linkId}`;
    navigator.clipboard.writeText(url).catch(() => {
      alert('복사에 실패했습니다. URL: ' + url);
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Package className="w-8 h-8 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900">상품 관리</h1>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          {activeTab === 'plans' && (
            <>
              <button
                onClick={() => setShowPreview(true)}
                className="flex items-center gap-2 p-2 sm:px-3 sm:py-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                title="요금제 페이지 미리보기"
              >
                <Eye className="w-4 h-4 text-gray-600" />
                <span className="hidden sm:inline text-sm text-gray-700">미리보기</span>
              </button>
              <GridSelector
                currentCols={gridCols}
                onSelectCols={saveGridSettings}
                saving={savingGrid}
              />
              <button
                onClick={() => handleOpenModal()}
                className="flex items-center gap-2 p-2 sm:px-4 sm:py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">플랜 추가</span>
              </button>
            </>
          )}
          {activeTab === 'links' && (
            <>
              <div className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg">
                <span className="text-sm text-gray-600 hidden sm:inline">비활성 포함</span>
                <button
                  type="button"
                  onClick={() => {
                    const newValue = !showDisabledLinks;
                    setShowDisabledLinks(newValue);
                    fetchCustomLinks(newValue);
                  }}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                    showDisabledLinks ? 'bg-blue-600' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                      showDisabledLinks ? 'translate-x-4' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
              <button
                onClick={() => handleOpenLinkModal()}
                className="flex items-center gap-2 p-2 sm:px-4 sm:py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">새 링크 만들기</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-4">
          <button
            onClick={() => handleTabChange('plans')}
            className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'plans'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4" />
              플랜 목록
            </div>
          </button>
          <button
            onClick={() => {
              handleTabChange('links');
              if (customLinks.length === 0 && !linksLoading) {
                fetchCustomLinks(showDisabledLinks);
              }
            }}
            className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'links'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <div className="flex items-center gap-2">
              <LinkIcon className="w-4 h-4" />
              커스텀 링크
            </div>
          </button>
        </nav>
      </div>

      {/* Plans Tab */}
      {activeTab === 'plans' && (
        <PlanListSection
          plans={plans}
          loading={loading}
          gridCols={gridCols}
          onDragEnd={handleDragEnd}
          onEditPlan={handleOpenModal}
          onDeletePlan={handleDeletePlan}
          onToggleActive={handleToggleActive}
          onTogglePopular={handleTogglePopular}
        />
      )}

      {/* Links Tab */}
      {activeTab === 'links' && (
        <CustomLinkTable
          customLinks={customLinks}
          loading={linksLoading}
          onEdit={handleOpenLinkModal}
          onDelete={handleDeleteLink}
          onCopyLink={handleCopyLink}
        />
      )}

      {/* Plan Modal */}
      <PlanModal
        showModal={showModal}
        editingPlan={editingPlan}
        plansLength={plans.length}
        onClose={handleCloseModal}
        onSave={handleSavePlan}
      />

      {/* Preview Modal */}
      <PlanPreviewModal
        showPreview={showPreview}
        plans={plans}
        gridCols={gridCols}
        onClose={() => setShowPreview(false)}
      />

      {/* Custom Link Modal */}
      <CustomLinkModal
        showModal={showLinkModal}
        editingLink={editingLink}
        plans={plans}
        onClose={handleCloseLinkModal}
        onSave={handleSaveLink}
      />

    </div>
  );
}
