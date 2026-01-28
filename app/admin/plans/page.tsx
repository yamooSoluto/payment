'use client';

import { useState, useEffect } from 'react';
import useSWR from 'swr';
import { useSearchParams, useRouter } from 'next/navigation';
import { Package, Plus, EditPencil, Trash, RefreshDouble, Xmark, Check, Menu, ViewGrid, Eye, Link as LinkIcon, Copy, Search, User } from 'iconoir-react';
import Spinner from '@/components/admin/Spinner';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface Plan {
  id: string;
  name: string;
  price: number;
  minPrice?: number;
  maxPrice?: number;
  tagline: string;
  description: string;
  features: string[];
  refundPolicy: string;
  isActive: boolean;
  displayMode: 'hidden' | 'coming_soon';
  popular: boolean;
  order: number;
  isNegotiable: boolean;
}

interface CustomLink {
  id: string;
  planId: string;
  planName: string;
  customAmount?: number;
  targetEmail?: string;
  targetUserName?: string;
  billingType: 'recurring' | 'onetime';
  subscriptionDays?: number;  // 1회성 결제 시 이용 기간 (일 단위)
  validFrom: string;
  validUntil: string;
  maxUses: number;
  currentUses: number;
  memo?: string;
  createdAt: string;
  status: 'active' | 'expired' | 'disabled';
}

interface Member {
  id: string;
  email: string;
  displayName?: string;
  name?: string;
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function formatDateTime(dateString: string): string {
  return new Date(dateString).toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getLinkStatus(link: CustomLink): { label: string; color: string } {
  if (link.status === 'disabled') {
    return { label: '비활성', color: 'bg-gray-100 text-gray-600' };
  }
  const now = new Date();
  const validUntil = new Date(link.validUntil);
  const validFrom = new Date(link.validFrom);
  if (now < validFrom) {
    return { label: '대기', color: 'bg-yellow-100 text-yellow-700' };
  }
  if (now > validUntil) {
    return { label: '만료', color: 'bg-red-100 text-red-600' };
  }
  if (link.maxUses > 0 && link.currentUses >= link.maxUses) {
    return { label: '소진', color: 'bg-orange-100 text-orange-600' };
  }
  return { label: '활성', color: 'bg-green-100 text-green-600' };
}

// 드래그 가능한 플랜 카드 컴포넌트
function SortablePlanCard({
  plan,
  onEdit,
  onDelete,
  onToggleActive,
  onTogglePopular,
}: {
  plan: Plan;
  onEdit: (plan: Plan) => void;
  onDelete: (plan: Plan) => void;
  onToggleActive: (plan: Plan) => void;
  onTogglePopular: (plan: Plan) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: plan.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-white rounded-xl p-6 shadow-sm border ${
        plan.isActive ? 'border-gray-100' : 'border-gray-300 bg-gray-50'
      } ${isDragging ? 'shadow-lg ring-2 ring-blue-500' : ''}`}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-start gap-2">
          <button
            {...attributes}
            {...listeners}
            className="p-1 hover:bg-gray-100 rounded cursor-grab active:cursor-grabbing mt-0.5"
            title="드래그하여 순서 변경"
          >
            <Menu className="w-4 h-4 text-gray-400" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-gray-900">{plan.name}</h3>
              {plan.popular && (
                <span className="px-2 py-0.5 text-xs bg-orange-100 text-orange-700 rounded-full">인기</span>
              )}
            </div>
            <p className="text-sm text-gray-500">ID: {plan.id}</p>
            {plan.tagline && (
              <p className="text-sm text-blue-600 mt-1">{plan.tagline}</p>
            )}
          </div>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => onEdit(plan)}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            title="수정"
          >
            <EditPencil className="w-4 h-4 text-gray-500" />
          </button>
          <button
            onClick={() => onDelete(plan)}
            className="p-2 hover:bg-red-50 rounded-lg transition-colors"
            title="삭제"
          >
            <Trash className="w-4 h-4 text-red-500" />
          </button>
        </div>
      </div>

      {/* 노출 여부 토글 */}
      <div className="flex items-center justify-between py-2 px-4 -mx-4 bg-gray-50 border-t border-gray-100">
        <span className="text-sm text-gray-600">요금제 페이지 노출</span>
        <button
          type="button"
          onClick={() => onToggleActive(plan)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            plan.isActive ? 'bg-green-500' : 'bg-gray-300'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              plan.isActive ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {/* 비활성 시 표시 모드 */}
      {!plan.isActive && (
        <div className="flex items-center justify-between py-2 px-4 -mx-4 bg-gray-50 border-t border-gray-100">
          <span className="text-sm text-gray-600">비활성 표시</span>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
            plan.displayMode === 'coming_soon'
              ? 'bg-yellow-100 text-yellow-700'
              : 'bg-gray-200 text-gray-600'
          }`}>
            {plan.displayMode === 'coming_soon' ? '준비중' : '숨김'}
          </span>
        </div>
      )}

      {/* 인기 표시 토글 */}
      <div className="flex items-center justify-between py-2 px-4 -mx-4 mb-4 bg-gray-50 border-y border-gray-100">
        <span className="text-sm text-gray-600">인기 표시</span>
        <button
          type="button"
          onClick={() => onTogglePopular(plan)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            plan.popular ? 'bg-orange-500' : 'bg-gray-300'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              plan.popular ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      <p className="text-2xl font-bold text-gray-900 mb-2">
        {plan.isNegotiable ? (
          plan.minPrice && plan.maxPrice ? (
            <>
              {(plan.minPrice / 10000).toLocaleString()}~{(plan.maxPrice / 10000).toLocaleString()}만원
              <span className="text-sm font-normal text-gray-500">/월</span>
            </>
          ) : (
            <>
              협의
              <span className="text-sm font-normal text-gray-500"> / 월</span>
            </>
          )
        ) : (
          <>
            {plan.price.toLocaleString()}원
            <span className="text-sm font-normal text-gray-500">/월</span>
          </>
        )}
      </p>

      {plan.description && (
        <p className="text-sm text-gray-600 mb-4">{plan.description}</p>
      )}

      {plan.features && plan.features.length > 0 && (
        <ul className="space-y-2">
          {plan.features.slice(0, 5).map((feature, index) => (
            <li key={index} className="flex items-start gap-2 text-sm">
              <Check className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
              <span className="text-gray-600">{feature}</span>
            </li>
          ))}
          {plan.features.length > 5 && (
            <li className="text-sm text-gray-400">
              +{plan.features.length - 5}개 더...
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

const fetcher = (url: string) => fetch(url).then(res => res.json());

export default function PlansPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // URL에서 탭 상태 읽기
  type TabType = 'plans' | 'links';
  const tabFromUrl = searchParams.get('tab') as TabType | null;
  const initialTab = tabFromUrl === 'links' ? 'links' : 'plans';

  const [activeTab, setActiveTab] = useState<TabType>(initialTab);

  // 탭 변경 시 URL 업데이트
  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    const newParams = new URLSearchParams(searchParams.toString());
    newParams.set('tab', tab);
    router.replace(`?${newParams.toString()}`, { scroll: false });
  };

  // SWR: Plans
  const { data: plansData, isLoading: loading, mutate: mutatePlans } = useSWR(
    '/api/admin/plans',
    fetcher,
    { fallbackData: { plans: [] }, keepPreviousData: true }
  );
  const [plans, setPlans] = useState<Plan[]>([]);

  // Sync SWR data to local state (needed for drag reorder)
  useEffect(() => {
    if (plansData?.plans) setPlans(plansData.plans);
  }, [plansData]);
  const [showModal, setShowModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [saving, setSaving] = useState(false);
  const [gridCols, setGridCols] = useState(4); // 기본 4열
  const [showGridSelector, setShowGridSelector] = useState(false);
  const [savingGrid, setSavingGrid] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  // 커스텀 링크 관련 상태
  const [customLinks, setCustomLinks] = useState<CustomLink[]>([]);
  const [linksLoading, setLinksLoading] = useState(false);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [editingLink, setEditingLink] = useState<CustomLink | null>(null);
  const [savingLink, setSavingLink] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [linkFormData, setLinkFormData] = useState({
    planId: '',
    customAmount: '',
    targetEmail: '',
    targetUserName: '',
    billingType: 'recurring' as 'recurring' | 'onetime',
    subscriptionDays: '30',  // 기본 30일 (1개월)
    validFrom: '',
    validUntil: '',
    maxUses: '1',
    memo: '',
  });

  // 비활성 링크 표시 여부
  const [showDisabledLinks, setShowDisabledLinks] = useState(false);

  // 회원 검색 관련 상태
  const [showMemberSearch, setShowMemberSearch] = useState(false);
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  const [memberSearchResults, setMemberSearchResults] = useState<Member[]>([]);
  const [memberSearchLoading, setMemberSearchLoading] = useState(false);

  const [formData, setFormData] = useState({
    id: '',
    name: '',
    price: 0,
    minPrice: 0,
    maxPrice: 0,
    tagline: '',
    description: '',
    features: '',
    refundPolicy: '',
    isActive: true,
    displayMode: 'hidden' as 'hidden' | 'coming_soon',
    popular: false,
    order: 0,
    isNegotiable: false,
  });

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    fetchGridSettings();
  }, []);

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

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = plans.findIndex((p) => p.id === active.id);
      const newIndex = plans.findIndex((p) => p.id === over.id);

      const newPlans = arrayMove(plans, oldIndex, newIndex);
      setPlans(newPlans);

      // 서버에 순서 저장
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
          // 실패 시 원래 순서로 복원
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

  const handleOpenModal = (plan?: Plan) => {
    if (plan) {
      setEditingPlan(plan);
      setFormData({
        id: plan.id,
        name: plan.name,
        price: plan.price,
        minPrice: plan.minPrice || 0,
        maxPrice: plan.maxPrice || 0,
        tagline: plan.tagline || '',
        description: plan.description,
        features: plan.features?.join('\n') || '',
        refundPolicy: plan.refundPolicy || '',
        isActive: plan.isActive,
        displayMode: plan.displayMode || 'hidden',
        popular: plan.popular || false,
        order: plan.order || 0,
        isNegotiable: plan.isNegotiable || false,
      });
    } else {
      setEditingPlan(null);
      setFormData({
        id: '',
        name: '',
        price: 0,
        minPrice: 0,
        maxPrice: 0,
        tagline: '',
        description: '',
        features: '',
        refundPolicy: '',
        isActive: true,
        displayMode: 'hidden' as 'hidden' | 'coming_soon',
        popular: false,
        order: plans.length,
        isNegotiable: false,
      });
    }
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingPlan(null);
  };

  const handleSave = async () => {
    if (!formData.id || !formData.name) {
      alert('플랜 ID와 이름은 필수입니다.');
      return;
    }

    setSaving(true);
    try {
      const url = editingPlan
        ? `/api/admin/plans/${editingPlan.id}`
        : '/api/admin/plans';

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
      }
    } catch (error) {
      console.error('Failed to save plan:', error);
      alert('저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (plan: Plan) => {
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

  const handleDelete = async (plan: Plan) => {
    if (!confirm(`정말 "${plan.name}" 플랜을 삭제하시겠습니까?`)) {
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

  // 커스텀 링크 함수들
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
    if (link) {
      setEditingLink(link);
      setLinkFormData({
        planId: link.planId,
        customAmount: link.customAmount?.toString() || '',
        targetEmail: link.targetEmail || '',
        targetUserName: link.targetUserName || '',
        billingType: link.billingType || 'recurring',
        subscriptionDays: link.subscriptionDays?.toString() || '30',
        validFrom: link.validFrom ? new Date(link.validFrom).toISOString().slice(0, 16) : '',
        validUntil: link.validUntil ? new Date(link.validUntil).toISOString().slice(0, 16) : '',
        maxUses: link.maxUses?.toString() || '0',
        memo: link.memo || '',
      });
    } else {
      setEditingLink(null);
      const now = new Date();
      const validUntil = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      setLinkFormData({
        planId: '',
        customAmount: '',
        targetEmail: '',
        targetUserName: '',
        billingType: 'recurring',
        subscriptionDays: '30',
        validFrom: now.toISOString().slice(0, 16),
        validUntil: validUntil.toISOString().slice(0, 16),
        maxUses: '1',
        memo: '',
      });
    }
    setShowMemberSearch(false);
    setMemberSearchQuery('');
    setMemberSearchResults([]);
    setShowLinkModal(true);
  };

  const handleCloseLinkModal = () => {
    setShowLinkModal(false);
    setEditingLink(null);
    setShowMemberSearch(false);
  };

  // 회원 검색
  const searchMembers = async (query: string) => {
    if (!query.trim()) {
      setMemberSearchResults([]);
      return;
    }
    setMemberSearchLoading(true);
    try {
      const response = await fetch(`/api/admin/members?search=${encodeURIComponent(query)}&limit=10`);
      if (response.ok) {
        const data = await response.json();
        setMemberSearchResults(data.members || []);
      }
    } catch (error) {
      console.error('Failed to search members:', error);
    } finally {
      setMemberSearchLoading(false);
    }
  };

  // 회원 선택
  const handleSelectMember = (member: Member) => {
    setLinkFormData({
      ...linkFormData,
      targetEmail: member.email,
      targetUserName: member.displayName || member.name || '',
    });
    setShowMemberSearch(false);
    setMemberSearchQuery('');
    setMemberSearchResults([]);
  };

  // 대상 회원 초기화
  const handleClearTargetMember = () => {
    setLinkFormData({
      ...linkFormData,
      targetEmail: '',
      targetUserName: '',
    });
  };

  const handleSaveLink = async () => {
    if (!linkFormData.planId) {
      alert('플랜을 선택해주세요.');
      return;
    }
    if (!linkFormData.validFrom || !linkFormData.validUntil) {
      alert('유효기간을 설정해주세요.');
      return;
    }

    setSavingLink(true);
    try {
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
      }
    } catch (error) {
      console.error('Failed to save link:', error);
      alert('저장에 실패했습니다.');
    } finally {
      setSavingLink(false);
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

  const copyLink = async (linkId: string) => {
    const baseUrl = window.location.origin;
    const url = `${baseUrl}/checkout?link=${linkId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(linkId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      alert('복사에 실패했습니다. URL: ' + url);
    }
  };

  const selectedPlanForLink = plans.find(p => p.id === linkFormData.planId);

  const getGridClass = () => {
    switch (gridCols) {
      case 1:
        return 'grid-cols-1';
      case 2:
        return 'grid-cols-1 md:grid-cols-2';
      case 3:
        return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3';
      case 4:
        return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4';
      default:
        return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3';
    }
  };

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Package className="w-8 h-8 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900">상품 관리</h1>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          {activeTab === 'plans' && (
            <>
              {/* 미리보기 버튼 */}
              <button
                onClick={() => setShowPreview(true)}
                className="flex items-center gap-2 p-2 sm:px-3 sm:py-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                title="요금제 페이지 미리보기"
              >
                <Eye className="w-4 h-4 text-gray-600" />
                <span className="hidden sm:inline text-sm text-gray-700">미리보기</span>
              </button>
              {/* 그리드 열 수 선택 */}
              <div className="relative">
                <button
                  onClick={() => setShowGridSelector(!showGridSelector)}
                  className="flex items-center gap-2 p-2 sm:px-3 sm:py-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  title="그리드 열 수 변경"
                >
                  <ViewGrid className="w-4 h-4 text-gray-600" />
                  <span className="hidden sm:inline text-sm text-gray-700">{gridCols}열</span>
                </button>
                {showGridSelector && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setShowGridSelector(false)}
                    />
                    <div className="absolute right-0 mt-2 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-20 min-w-[120px]">
                      {[1, 2, 3, 4].map((cols) => (
                        <button
                          key={cols}
                          onClick={() => {
                            setGridCols(cols);
                            saveGridSettings(cols);
                            setShowGridSelector(false);
                          }}
                          disabled={savingGrid}
                          className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center justify-between ${
                            gridCols === cols ? 'text-blue-600 bg-blue-50' : 'text-gray-700'
                          } disabled:opacity-50`}
                        >
                          <span>{cols}열 보기</span>
                          {gridCols === cols && <Check className="w-4 h-4" />}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
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

      {/* 탭 네비게이션 */}
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

      {/* 플랜 목록 탭 */}
      {activeTab === 'plans' && (
        <>
          {/* 드래그 안내 메시지 */}
          <div className="flex items-center gap-2 text-sm text-gray-500 bg-gray-50 px-4 py-2 rounded-lg">
            <Menu className="w-4 h-4" />
            <span>카드 왼쪽의 핸들을 드래그하여 순서를 변경할 수 있습니다.</span>
          </div>

          {/* 플랜 목록 */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={plans.map((p) => p.id)} strategy={rectSortingStrategy}>
          <div className={`grid ${getGridClass()} gap-6`}>
            {loading ? (
              <div className="col-span-full flex items-center justify-center py-20">
                <Spinner size="md" />
              </div>
            ) : plans.length === 0 ? (
              <div className="col-span-full text-center py-20 text-gray-500">
                등록된 플랜이 없습니다.
              </div>
            ) : (
              plans.map((plan) => (
                <SortablePlanCard
                  key={plan.id}
                  plan={plan}
                  onEdit={handleOpenModal}
                  onDelete={handleDelete}
                  onToggleActive={handleToggleActive}
                  onTogglePopular={handleTogglePopular}
                />
              ))
            )}
          </div>
        </SortableContext>
      </DndContext>
        </>
      )}

      {/* 커스텀 링크 탭 */}
      {activeTab === 'links' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {linksLoading ? (
            <div className="flex items-center justify-center py-20">
              <Spinner size="md" />
            </div>
          ) : customLinks.length === 0 ? (
            <div className="text-center py-20 text-gray-500">
              <LinkIcon className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>생성된 커스텀 링크가 없습니다.</p>
              <button
                onClick={() => handleOpenLinkModal()}
                className="mt-4 text-blue-600 hover:text-blue-700 font-medium"
              >
                + 새 링크 만들기
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px]">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-4 py-3 text-sm font-medium text-gray-600 whitespace-nowrap">링크 ID</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-gray-600 whitespace-nowrap">플랜</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-gray-600 whitespace-nowrap">유형</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-gray-600 whitespace-nowrap">금액</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-gray-600 whitespace-nowrap">대상 회원</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-gray-600 whitespace-nowrap">유효기간</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-gray-600 whitespace-nowrap">사용</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-gray-600 whitespace-nowrap">상태</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-gray-600 whitespace-nowrap">액션</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {customLinks.map((link) => {
                    const status = getLinkStatus(link);
                    return (
                      <tr key={link.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <code className="text-sm font-mono bg-gray-100 px-2 py-0.5 rounded">
                              {link.id}
                            </code>
                            <button
                              onClick={() => copyLink(link.id)}
                              className="p-1 hover:bg-gray-200 rounded transition-colors"
                              title="링크 복사"
                            >
                              {copiedId === link.id ? (
                                <Check className="w-4 h-4 text-green-500" />
                              ) : (
                                <Copy className="w-4 h-4 text-gray-400" />
                              )}
                            </button>
                          </div>
                          {link.memo && (
                            <p className="text-xs text-gray-500 mt-1">{link.memo}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">{link.planName}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${
                            link.billingType === 'onetime'
                              ? 'bg-purple-100 text-purple-700'
                              : 'bg-blue-100 text-blue-700'
                          }`}>
                            {link.billingType === 'onetime' ? '1회성' : '정기'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">
                          {link.customAmount
                            ? `${link.customAmount.toLocaleString()}원`
                            : <span className="text-gray-400">플랜 가격</span>
                          }
                        </td>
                        <td className="px-4 py-3 text-sm whitespace-nowrap">
                          {link.targetEmail ? (
                            <div>
                              {link.targetUserName && (
                                <p className="font-medium text-gray-900">{link.targetUserName}</p>
                              )}
                              <p className="text-gray-600 text-xs">{link.targetEmail}</p>
                            </div>
                          ) : (
                            <span className="text-gray-400">제한없음</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                          <div>{formatDate(link.validFrom)}</div>
                          <div className="text-gray-400">~ {formatDate(link.validUntil)}</div>
                        </td>
                        <td className="px-4 py-3 text-sm whitespace-nowrap">
                          <span className="font-medium">{link.currentUses}</span>
                          <span className="text-gray-400">
                            /{link.maxUses === 0 ? '무제한' : link.maxUses}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${status.color}`}>
                            {status.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleOpenLinkModal(link)}
                              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                              title="수정"
                            >
                              <EditPencil className="w-4 h-4 text-gray-500" />
                            </button>
                            <button
                              onClick={() => handleDeleteLink(link)}
                              className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                              title="비활성화"
                            >
                              <Trash className="w-4 h-4 text-red-500" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 플랜 모달 */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold">
                {editingPlan ? '플랜 수정' : '플랜 추가'}
              </h2>
              <button
                onClick={handleCloseModal}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <Xmark className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  플랜 ID <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.id}
                  onChange={(e) => setFormData({ ...formData, id: e.target.value.toLowerCase() })}
                  disabled={!!editingPlan}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                  placeholder="예: basic"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  플랜 이름 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="예: Basic"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  가격 (원/월)
                </label>
                <input
                  type="number"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: parseInt(e.target.value) || 0 })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="0"
                />
              </div>

              {/* 협의 가격일 때 범위 입력 */}
              {formData.isNegotiable && (
                <div className="bg-purple-50 rounded-lg p-4">
                  <label className="block text-sm font-medium text-purple-700 mb-2">
                    가격 범위 (만원 단위)
                  </label>
                  <p className="text-xs text-purple-600 mb-3">
                    가격 범위를 입력하세요. 예: 최소 29만원 ~ 최대 100만원
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={formData.minPrice / 10000 || ''}
                      onChange={(e) => setFormData({ ...formData, minPrice: (parseInt(e.target.value) || 0) * 10000 })}
                      className="flex-1 px-3 py-2 border border-purple-200 rounded-lg focus:ring-2 focus:ring-purple-500"
                      placeholder="최소"
                    />
                    <span className="text-gray-500">~</span>
                    <input
                      type="number"
                      value={formData.maxPrice / 10000 || ''}
                      onChange={(e) => setFormData({ ...formData, maxPrice: (parseInt(e.target.value) || 0) * 10000 })}
                      className="flex-1 px-3 py-2 border border-purple-200 rounded-lg focus:ring-2 focus:ring-purple-500"
                      placeholder="최대"
                    />
                    <span className="text-gray-500">만원</span>
                  </div>
                  {formData.minPrice > 0 && formData.maxPrice > 0 && (
                    <p className="text-xs text-purple-600 mt-2">
                      표시: {(formData.minPrice / 10000).toLocaleString()}~{(formData.maxPrice / 10000).toLocaleString()}만원/월
                    </p>
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  태그라인
                </label>
                <input
                  type="text"
                  value={formData.tagline}
                  onChange={(e) => setFormData({ ...formData, tagline: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="예: CS 마스터 고용하기"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  설명
                </label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="플랜 설명"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  기능 (줄바꿈으로 구분)
                </label>
                <textarea
                  value={formData.features}
                  onChange={(e) => setFormData({ ...formData, features: e.target.value })}
                  rows={5}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="기능 1&#10;기능 2&#10;기능 3"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  환불 정책
                </label>
                <textarea
                  value={formData.refundPolicy}
                  onChange={(e) => setFormData({ ...formData, refundPolicy: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="환불 정책 내용"
                />
              </div>

              <div className="flex flex-wrap items-center gap-6">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, isActive: !formData.isActive })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      formData.isActive ? 'bg-blue-600' : 'bg-gray-200'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        formData.isActive ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                  <span className="text-sm text-gray-700">활성화</span>
                </div>

                {/* 비활성 시 표시 모드 */}
                {!formData.isActive && (
                  <div className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2">
                    <span className="text-sm text-gray-600">비활성 표시:</span>
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input
                        type="radio"
                        name="displayMode"
                        checked={formData.displayMode === 'hidden'}
                        onChange={() => setFormData({ ...formData, displayMode: 'hidden' })}
                        className="text-blue-600"
                      />
                      <span className="text-sm text-gray-700">숨김</span>
                    </label>
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input
                        type="radio"
                        name="displayMode"
                        checked={formData.displayMode === 'coming_soon'}
                        onChange={() => setFormData({ ...formData, displayMode: 'coming_soon' })}
                        className="text-blue-600"
                      />
                      <span className="text-sm text-gray-700">준비중</span>
                    </label>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, popular: !formData.popular })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      formData.popular ? 'bg-orange-500' : 'bg-gray-200'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        formData.popular ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                  <span className="text-sm text-gray-700">인기 플랜</span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, isNegotiable: !formData.isNegotiable })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      formData.isNegotiable ? 'bg-purple-500' : 'bg-gray-200'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        formData.isNegotiable ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                  <span className="text-sm text-gray-700">협의 가격</span>
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleCloseModal}
                className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {saving ? <RefreshDouble className="w-5 h-5 animate-spin mx-auto" /> : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 미리보기 모달 */}
      {showPreview && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-100 rounded-xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-4 bg-white border-b">
              <div className="flex items-center gap-3">
                <Eye className="w-5 h-5 text-blue-600" />
                <h2 className="text-lg font-bold">요금제 페이지 미리보기</h2>
                <span className="text-sm text-gray-500">({gridCols}열 레이아웃)</span>
              </div>
              <button
                onClick={() => setShowPreview(false)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <Xmark className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8">
              {/* 요금제 페이지 헤더 */}
              <div className="text-center mb-8">
                <h1 className="text-3xl font-bold text-gray-900 mb-3">
                  요금제 선택
                </h1>
                <p className="text-gray-600">
                  비즈니스에 맞는 플랜을 선택하세요. 모든 플랜은 1달 무료체험이 가능합니다.
                </p>
              </div>

              {/* 플랜 카드 그리드 */}
              <div className={`grid gap-6 max-w-5xl mx-auto ${
                gridCols === 3
                  ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
                  : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4'
              }`}>
                {plans
                  .filter((plan) => plan.isActive || plan.displayMode === 'coming_soon')
                  .map((plan) => (
                    <div key={plan.id} className="flex flex-col">
                      {/* Tagline */}
                      {plan.tagline && (
                        <div className="text-center mb-3">
                          <span className="text-gray-800 font-medium text-sm">
                            🔥 {plan.tagline}
                          </span>
                        </div>
                      )}

                      {/* 카드 */}
                      <div
                        className={`flex flex-col relative flex-1 rounded-2xl p-5 bg-white border transition-all duration-300 ${
                          plan.popular
                            ? 'border-2 border-yellow-400 shadow-lg'
                            : 'border-gray-200 shadow-sm'
                        }`}
                      >
                        {plan.popular && (
                          <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                            <span className="bg-gradient-to-r from-yellow-400 to-yellow-500 text-gray-900 text-xs font-semibold px-3 py-1 rounded-full shadow">
                              인기
                            </span>
                          </div>
                        )}

                        <div className="mb-4">
                          <h3 className="text-lg font-bold text-gray-900 mb-3">{plan.name}</h3>
                          <div className="flex items-baseline gap-1">
                            <span className="text-2xl font-bold text-gray-900">
                              {plan.isNegotiable ? (
                                plan.minPrice && plan.maxPrice ? (
                                  `${(plan.minPrice / 10000).toLocaleString()}~${(plan.maxPrice / 10000).toLocaleString()}만원`
                                ) : '협의'
                              ) : plan.price === 0 ? 'Free' : `₩${plan.price.toLocaleString()}`}
                            </span>
                            <span className="text-gray-500 text-sm">/월</span>
                          </div>
                        </div>

                        <ul className="space-y-2 mb-4 flex-1">
                          {plan.features.slice(0, 5).map((feature, index) => (
                            <li key={index} className="flex items-start gap-2">
                              <Check className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                              <span className="text-gray-600 text-sm">{feature}</span>
                            </li>
                          ))}
                          {plan.features.length > 5 && (
                            <li className="text-sm text-gray-400">
                              +{plan.features.length - 5}개 더...
                            </li>
                          )}
                        </ul>

                        <button
                          disabled
                          className={`w-full py-2.5 px-4 rounded-lg font-semibold text-sm cursor-not-allowed ${
                            !plan.isActive && plan.displayMode === 'coming_soon'
                              ? 'bg-gray-200 text-gray-400'
                              : plan.popular
                              ? 'bg-yellow-400 text-gray-900'
                              : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {!plan.isActive && plan.displayMode === 'coming_soon'
                            ? '준비중'
                            : plan.isNegotiable ? '문의하기' : plan.price === 0 ? '무료 체험하기' : '구독하기'}
                        </button>
                      </div>
                    </div>
                  ))}
              </div>

              {plans.filter((p) => p.isActive || p.displayMode === 'coming_soon').length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  활성화된 플랜이 없습니다.
                </div>
              )}
            </div>

            <div className="p-4 bg-white border-t text-center">
              <p className="text-sm text-gray-500">
                이 미리보기는 실제 요금제 페이지의 레이아웃을 보여줍니다.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 커스텀 링크 모달 */}
      {showLinkModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold">
                {editingLink ? '링크 수정' : '새 커스텀 링크'}
              </h2>
              <button
                onClick={handleCloseLinkModal}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <Xmark className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* 플랜 선택 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  플랜 <span className="text-red-500">*</span>
                </label>
                <select
                  value={linkFormData.planId}
                  onChange={(e) => setLinkFormData({ ...linkFormData, planId: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">플랜을 선택하세요</option>
                  {plans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name} ({plan.price.toLocaleString()}원/월)
                      {!plan.isActive && ' [숨김]'}
                    </option>
                  ))}
                </select>
              </div>

              {/* 커스텀 금액 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  커스텀 금액 (선택)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={linkFormData.customAmount}
                    onChange={(e) => setLinkFormData({ ...linkFormData, customAmount: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 pr-12"
                    placeholder={selectedPlanForLink ? selectedPlanForLink.price.toString() : '플랜 가격 사용'}
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">원</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  비워두면 플랜의 기본 가격이 적용됩니다.
                </p>
              </div>

              {/* 결제 유형 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  결제 유형 <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setLinkFormData({ ...linkFormData, billingType: 'recurring' })}
                    className={`flex-1 py-2.5 px-4 rounded-lg border-2 transition-colors ${
                      linkFormData.billingType === 'recurring'
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-200 hover:border-gray-300 text-gray-600'
                    }`}
                  >
                    <div className="font-medium">정기 결제</div>
                    <div className="text-xs mt-0.5 opacity-75">매월 자동 갱신</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setLinkFormData({ ...linkFormData, billingType: 'onetime' })}
                    className={`flex-1 py-2.5 px-4 rounded-lg border-2 transition-colors ${
                      linkFormData.billingType === 'onetime'
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-200 hover:border-gray-300 text-gray-600'
                    }`}
                  >
                    <div className="font-medium">1회성 결제</div>
                    <div className="text-xs mt-0.5 opacity-75">지정 기간 후 해지</div>
                  </button>
                </div>
              </div>

              {/* 이용 기간 (1회성일 때만) */}
              {linkFormData.billingType === 'onetime' && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <label className="block text-sm font-medium text-blue-700 mb-2">
                    이용 기간 <span className="text-red-500">*</span>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { days: 30, label: '1개월' },
                      { days: 60, label: '2개월' },
                      { days: 90, label: '3개월' },
                      { days: 180, label: '6개월' },
                      { days: 365, label: '1년' },
                    ].map((option) => (
                      <button
                        key={option.days}
                        type="button"
                        onClick={() => setLinkFormData({ ...linkFormData, subscriptionDays: option.days.toString() })}
                        className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                          parseInt(linkFormData.subscriptionDays) === option.days
                            ? 'border-blue-500 bg-blue-100 text-blue-700'
                            : 'border-blue-200 hover:border-blue-300 text-blue-600'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  <div className="mt-3 space-y-3">
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-blue-600 w-20">일수 입력:</span>
                      <input
                        type="number"
                        value={linkFormData.subscriptionDays}
                        onChange={(e) => setLinkFormData({ ...linkFormData, subscriptionDays: e.target.value })}
                        className="w-24 px-3 py-1.5 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                        min="1"
                      />
                      <span className="text-sm text-blue-600">일</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-blue-600 w-20">종료일:</span>
                      <input
                        type="date"
                        onChange={(e) => {
                          if (e.target.value) {
                            const endDate = new Date(e.target.value);
                            const today = new Date();
                            today.setHours(0, 0, 0, 0);
                            const diffDays = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                            if (diffDays > 0) {
                              setLinkFormData({ ...linkFormData, subscriptionDays: diffDays.toString() });
                            }
                          }
                        }}
                        className="w-40 px-3 py-1.5 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                        min={new Date().toISOString().split('T')[0]}
                      />
                    </div>
                  </div>
                  <p className="text-xs text-blue-500 mt-2">
                    결제 완료 후 {linkFormData.subscriptionDays}일간 서비스 이용 후 자동 해지됩니다.
                  </p>
                </div>
              )}

              {/* 대상 회원 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  대상 회원 (선택)
                </label>
                {linkFormData.targetEmail ? (
                  <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <User className="w-5 h-5 text-blue-600" />
                    <div className="flex-1 min-w-0">
                      {linkFormData.targetUserName && (
                        <p className="font-medium text-gray-900 truncate">{linkFormData.targetUserName}</p>
                      )}
                      <p className="text-sm text-gray-600 truncate">{linkFormData.targetEmail}</p>
                    </div>
                    <button
                      type="button"
                      onClick={handleClearTargetMember}
                      className="p-1 hover:bg-blue-100 rounded"
                    >
                      <Xmark className="w-4 h-4 text-gray-500" />
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowMemberSearch(!showMemberSearch)}
                      className="w-full flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg hover:border-gray-300 text-left"
                    >
                      <Search className="w-4 h-4 text-gray-400" />
                      <span className="text-gray-500">회원 검색...</span>
                    </button>

                    {showMemberSearch && (
                      <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg">
                        <div className="p-2 border-b">
                          <input
                            type="text"
                            value={memberSearchQuery}
                            onChange={(e) => {
                              setMemberSearchQuery(e.target.value);
                              searchMembers(e.target.value);
                            }}
                            placeholder="이름 또는 이메일로 검색"
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                            autoFocus
                          />
                        </div>
                        <div className="max-h-48 overflow-y-auto">
                          {memberSearchLoading ? (
                            <div className="p-4 text-center text-gray-500">
                              <Spinner size="sm" />
                            </div>
                          ) : memberSearchResults.length > 0 ? (
                            memberSearchResults.map((member) => (
                              <button
                                key={member.id}
                                type="button"
                                onClick={() => handleSelectMember(member)}
                                className="w-full flex items-center gap-3 px-4 py-2 hover:bg-gray-50 text-left"
                              >
                                <User className="w-4 h-4 text-gray-400" />
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium text-gray-900 truncate">
                                    {member.displayName || member.name || '이름 없음'}
                                  </p>
                                  <p className="text-sm text-gray-500 truncate">{member.email}</p>
                                </div>
                              </button>
                            ))
                          ) : memberSearchQuery ? (
                            <div className="p-4 text-center text-gray-500 text-sm">
                              검색 결과가 없습니다
                            </div>
                          ) : (
                            <div className="p-4 text-center text-gray-500 text-sm">
                              이름 또는 이메일을 입력하세요
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <p className="text-xs text-gray-500 mt-1">
                  비워두면 누구나 사용할 수 있습니다.
                </p>
              </div>

              {/* 링크 유효기간 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    링크 유효 시작일 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="datetime-local"
                    value={linkFormData.validFrom}
                    onChange={(e) => setLinkFormData({ ...linkFormData, validFrom: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    링크 유효 종료일 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="datetime-local"
                    value={linkFormData.validUntil}
                    onChange={(e) => setLinkFormData({ ...linkFormData, validUntil: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* 최대 사용 횟수 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  최대 사용 횟수
                </label>
                <input
                  type="number"
                  value={linkFormData.maxUses}
                  onChange={(e) => setLinkFormData({ ...linkFormData, maxUses: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="0"
                  min="0"
                />
                <p className="text-xs text-gray-500 mt-1">
                  0으로 설정하면 무제한 사용 가능합니다.
                </p>
              </div>

              {/* 메모 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  메모 (선택)
                </label>
                <textarea
                  value={linkFormData.memo}
                  onChange={(e) => setLinkFormData({ ...linkFormData, memo: e.target.value })}
                  rows={2}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="관리용 메모 (예: ABC 기업 특가)"
                />
              </div>

              {/* 현재 사용 횟수 (수정 모드에서만) */}
              {editingLink && (
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600">
                    현재 사용 횟수: <span className="font-medium">{editingLink.currentUses}회</span>
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    생성일: {formatDateTime(editingLink.createdAt)}
                  </p>
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleCloseLinkModal}
                className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleSaveLink}
                disabled={savingLink}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {savingLink ? <RefreshDouble className="w-5 h-5 animate-spin mx-auto" /> : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
