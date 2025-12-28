'use client';

import { useState, useEffect } from 'react';
import { Package, Plus, EditPencil, Trash, RefreshDouble, Xmark, Check, Menu, ViewGrid, Eye, UserStar } from 'iconoir-react';
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
  tagline: string;
  description: string;
  features: string[];
  refundPolicy: string;
  isActive: boolean;
  popular: boolean;
  order: number;
  isNegotiable: boolean;
}

interface PricePolicyStats {
  plan: string;
  currentPlanPrice: number;
  totalSubscribers: number;
  stats: {
    grandfathered: { count: number; totalAmount: number };
    protected_until: { count: number; totalAmount: number };
    standard: { count: number; totalAmount: number };
  };
}

const PRICE_POLICY_LABELS: Record<string, string> = {
  grandfathered: '가격 보호 (영구)',
  protected_until: '기간 한정 보호',
  standard: '일반 (최신 가격 적용)',
};

// 드래그 가능한 플랜 카드 컴포넌트
function SortablePlanCard({
  plan,
  onEdit,
  onDelete,
  onToggleActive,
  onPricePolicy,
}: {
  plan: Plan;
  onEdit: (plan: Plan) => void;
  onDelete: (plan: Plan) => void;
  onToggleActive: (plan: Plan) => void;
  onPricePolicy: (plan: Plan) => void;
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
            onClick={() => onPricePolicy(plan)}
            className="p-2 hover:bg-purple-50 rounded-lg transition-colors"
            title="구독자 가격 정책"
          >
            <UserStar className="w-4 h-4 text-purple-500" />
          </button>
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
      <div className="flex items-center justify-between py-3 px-4 -mx-4 mb-4 bg-gray-50 border-y border-gray-100">
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

      <p className="text-2xl font-bold text-gray-900 mb-2">
        {plan.isNegotiable ? (
          <>
            협의
            <span className="text-sm font-normal text-gray-500"> / 월</span>
          </>
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

export default function PlansPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [saving, setSaving] = useState(false);
  const [gridCols, setGridCols] = useState(4); // 기본 4열
  const [showGridSelector, setShowGridSelector] = useState(false);
  const [savingGrid, setSavingGrid] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showPricePolicyModal, setShowPricePolicyModal] = useState(false);
  const [selectedPlanForPolicy, setSelectedPlanForPolicy] = useState<Plan | null>(null);
  const [pricePolicyStats, setPricePolicyStats] = useState<PricePolicyStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [policyFormData, setPolicyFormData] = useState({
    pricePolicy: 'standard',
    priceProtectedUntil: '',
    newPlanPrice: 0,
  });
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    price: 0,
    tagline: '',
    description: '',
    features: '',
    refundPolicy: '',
    isActive: true,
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
    fetchPlans();
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

  const fetchPlans = async () => {
    try {
      const response = await fetch('/api/admin/plans');
      if (response.ok) {
        const data = await response.json();
        setPlans(data.plans);
      }
    } catch (error) {
      console.error('Failed to fetch plans:', error);
    } finally {
      setLoading(false);
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
          fetchPlans();
          alert('순서 변경에 실패했습니다.');
        }
      } catch (error) {
        console.error('Failed to reorder plans:', error);
        fetchPlans();
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
        tagline: plan.tagline || '',
        description: plan.description,
        features: plan.features?.join('\n') || '',
        refundPolicy: plan.refundPolicy || '',
        isActive: plan.isActive,
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
        tagline: '',
        description: '',
        features: '',
        refundPolicy: '',
        isActive: true,
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
        fetchPlans();
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
        fetchPlans();
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
        fetchPlans();
      } else {
        const data = await response.json();
        alert(data.error || '삭제에 실패했습니다.');
      }
    } catch (error) {
      console.error('Failed to delete plan:', error);
      alert('삭제에 실패했습니다.');
    }
  };

  const handleOpenPricePolicyModal = async (plan: Plan) => {
    setSelectedPlanForPolicy(plan);
    setShowPricePolicyModal(true);
    setPolicyFormData({
      pricePolicy: 'standard',
      priceProtectedUntil: '',
      newPlanPrice: plan.price,
    });

    // 해당 플랜의 구독자 가격 정책 통계 조회
    setLoadingStats(true);
    try {
      const response = await fetch(`/api/admin/subscriptions/price-policy?plan=${plan.id}`);
      if (response.ok) {
        const data = await response.json();
        setPricePolicyStats(data);
      }
    } catch (error) {
      console.error('Failed to fetch price policy stats:', error);
    } finally {
      setLoadingStats(false);
    }
  };

  const handleClosePricePolicyModal = () => {
    setShowPricePolicyModal(false);
    setSelectedPlanForPolicy(null);
    setPricePolicyStats(null);
  };

  const handleSaveBulkPricePolicy = async () => {
    if (!selectedPlanForPolicy) return;

    if (policyFormData.pricePolicy === 'protected_until' && !policyFormData.priceProtectedUntil) {
      alert('보호 종료일을 선택해주세요.');
      return;
    }

    setSavingPolicy(true);
    try {
      const response = await fetch('/api/admin/subscriptions/price-policy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan: selectedPlanForPolicy.id,
          pricePolicy: policyFormData.pricePolicy,
          priceProtectedUntil: policyFormData.pricePolicy === 'protected_until' ? policyFormData.priceProtectedUntil : null,
          newPlanPrice: policyFormData.pricePolicy === 'standard' ? policyFormData.newPlanPrice : undefined,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        alert(data.message || '가격 정책이 일괄 변경되었습니다.');
        handleClosePricePolicyModal();
      } else {
        const data = await response.json();
        alert(data.error || '가격 정책 변경에 실패했습니다.');
      }
    } catch (error) {
      console.error('Failed to save bulk price policy:', error);
      alert('오류가 발생했습니다.');
    } finally {
      setSavingPolicy(false);
    }
  };

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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Package className="w-8 h-8 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900">상품 관리</h1>
        </div>
        <div className="flex items-center gap-3">
          {/* 미리보기 버튼 */}
          <button
            onClick={() => setShowPreview(true)}
            className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            title="요금제 페이지 미리보기"
          >
            <Eye className="w-4 h-4 text-gray-600" />
            <span className="text-sm text-gray-700">미리보기</span>
          </button>
          {/* 그리드 열 수 선택 */}
          <div className="relative">
            <button
              onClick={() => setShowGridSelector(!showGridSelector)}
              className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              title="그리드 열 수 변경"
            >
              <ViewGrid className="w-4 h-4 text-gray-600" />
              <span className="text-sm text-gray-700">{gridCols}열</span>
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
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            플랜 추가
          </button>
        </div>
      </div>

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
                <RefreshDouble className="w-8 h-8 text-blue-600 animate-spin" />
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
                  onPricePolicy={handleOpenPricePolicyModal}
                />
              ))
            )}
          </div>
        </SortableContext>
      </DndContext>

      {/* 모달 */}
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
                  .filter((plan) => plan.isActive)
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
                              {plan.isNegotiable ? '협의' : plan.price === 0 ? 'Free' : `₩${plan.price.toLocaleString()}`}
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
                            plan.popular
                              ? 'bg-yellow-400 text-gray-900'
                              : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {plan.isNegotiable ? '문의하기' : plan.price === 0 ? '무료 체험하기' : '구독하기'}
                        </button>
                      </div>
                    </div>
                  ))}
              </div>

              {plans.filter((p) => p.isActive).length === 0 && (
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

      {/* 가격 정책 일괄 변경 모달 */}
      {showPricePolicyModal && selectedPlanForPolicy && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">
                {selectedPlanForPolicy.name} 플랜 구독자 가격 정책
              </h3>
              <button
                onClick={handleClosePricePolicyModal}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <Xmark className="w-5 h-5" />
              </button>
            </div>

            {/* 현재 통계 */}
            {loadingStats ? (
              <div className="flex items-center justify-center py-8">
                <RefreshDouble className="w-6 h-6 text-blue-600 animate-spin" />
              </div>
            ) : pricePolicyStats ? (
              <div className="mb-6">
                <div className="bg-gray-50 rounded-lg p-4 mb-4">
                  <div className="flex justify-between mb-2">
                    <span className="text-gray-500">현재 플랜 가격</span>
                    <span className="font-semibold">{pricePolicyStats.currentPlanPrice.toLocaleString()}원/월</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">활성 구독자</span>
                    <span className="font-semibold">{pricePolicyStats.totalSubscribers}명</span>
                  </div>
                </div>

                {/* 정책별 현황 */}
                <div className="space-y-2 mb-4">
                  <h4 className="text-sm font-medium text-gray-700">현재 가격 정책별 현황</h4>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div className="bg-purple-50 rounded-lg p-3 text-center">
                      <p className="text-purple-700 font-semibold">{pricePolicyStats.stats.grandfathered.count}명</p>
                      <p className="text-xs text-purple-600">영구 보호</p>
                    </div>
                    <div className="bg-amber-50 rounded-lg p-3 text-center">
                      <p className="text-amber-700 font-semibold">{pricePolicyStats.stats.protected_until.count}명</p>
                      <p className="text-xs text-amber-600">기간 한정</p>
                    </div>
                    <div className="bg-gray-100 rounded-lg p-3 text-center">
                      <p className="text-gray-700 font-semibold">{pricePolicyStats.stats.standard.count}명</p>
                      <p className="text-xs text-gray-600">일반</p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-4 text-gray-500 mb-4">
                통계를 불러오지 못했습니다.
              </div>
            )}

            {/* 일괄 변경 폼 */}
            <div className="border-t pt-4">
              <h4 className="text-sm font-medium text-gray-700 mb-3">일괄 가격 정책 변경</h4>

              <div className="space-y-3">
                <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                  <input
                    type="radio"
                    name="bulkPricePolicy"
                    value="grandfathered"
                    checked={policyFormData.pricePolicy === 'grandfathered'}
                    onChange={(e) => setPolicyFormData({ ...policyFormData, pricePolicy: e.target.value })}
                    className="mt-0.5"
                  />
                  <div>
                    <p className="font-medium text-sm">가격 보호 (영구)</p>
                    <p className="text-xs text-gray-500">모든 활성 구독자가 현재 결제 금액을 영구적으로 유지</p>
                  </div>
                </label>
                <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                  <input
                    type="radio"
                    name="bulkPricePolicy"
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
                    name="bulkPricePolicy"
                    value="standard"
                    checked={policyFormData.pricePolicy === 'standard'}
                    onChange={(e) => setPolicyFormData({ ...policyFormData, pricePolicy: e.target.value })}
                    className="mt-0.5"
                  />
                  <div>
                    <p className="font-medium text-sm">일반 (최신 가격 적용)</p>
                    <p className="text-xs text-gray-500">다음 결제부터 지정한 금액으로 청구</p>
                  </div>
                </label>
              </div>

              {/* 기간 한정 시 날짜 선택 */}
              {policyFormData.pricePolicy === 'protected_until' && (
                <div className="mt-4">
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
                </div>
              )}

              {/* 일반 정책 시 새 가격 입력 */}
              {policyFormData.pricePolicy === 'standard' && (
                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    새 결제 금액 (원/월)
                  </label>
                  <input
                    type="number"
                    value={policyFormData.newPlanPrice}
                    onChange={(e) => setPolicyFormData({ ...policyFormData, newPlanPrice: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    모든 활성 구독자의 다음 결제부터 이 금액으로 청구됩니다.
                  </p>
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleClosePricePolicyModal}
                className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleSaveBulkPricePolicy}
                disabled={savingPolicy || (pricePolicyStats?.totalSubscribers === 0)}
                className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {savingPolicy ? '적용 중...' : `${pricePolicyStats?.totalSubscribers || 0}명에게 적용`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
