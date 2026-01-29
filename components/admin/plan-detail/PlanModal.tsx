'use client';

import { useState, useEffect } from 'react';
import { Xmark, RefreshDouble } from 'iconoir-react';
import { Plan } from './types';

interface PlanModalProps {
  showModal: boolean;
  editingPlan: Plan | null;
  plansLength: number;
  onClose: () => void;
  onSave: (formData: PlanFormData) => Promise<void>;
}

export interface PlanFormData {
  id: string;
  name: string;
  price: number;
  minPrice: number;
  maxPrice: number;
  tagline: string;
  description: string;
  features: string;
  refundPolicy: string;
  isActive: boolean;
  displayMode: 'hidden' | 'coming_soon';
  popular: boolean;
  order: number;
  isNegotiable: boolean;
}

export default function PlanModal({
  showModal,
  editingPlan,
  plansLength,
  onClose,
  onSave,
}: PlanModalProps) {
  const [formData, setFormData] = useState<PlanFormData>({
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
    displayMode: 'hidden',
    popular: false,
    order: plansLength,
    isNegotiable: false,
  });

  const [saving, setSaving] = useState(false);

  // Initialize form data when editingPlan changes
  useEffect(() => {
    if (editingPlan) {
      setFormData({
        id: editingPlan.id,
        name: editingPlan.name,
        price: editingPlan.price,
        minPrice: editingPlan.minPrice || 0,
        maxPrice: editingPlan.maxPrice || 0,
        tagline: editingPlan.tagline,
        description: editingPlan.description,
        features: editingPlan.features.join('\n'),
        refundPolicy: editingPlan.refundPolicy,
        isActive: editingPlan.isActive,
        displayMode: editingPlan.displayMode || 'hidden',
        popular: editingPlan.popular,
        order: editingPlan.order || 0,
        isNegotiable: editingPlan.isNegotiable || false,
      });
    } else {
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
        displayMode: 'hidden',
        popular: false,
        order: plansLength,
        isNegotiable: false,
      });
    }
  }, [editingPlan, plansLength]);

  const handleSave = async () => {
    if (!formData.id || !formData.name) {
      alert('플랜 ID와 이름은 필수입니다.');
      return;
    }

    setSaving(true);
    try {
      await onSave(formData);
    } catch (error) {
      console.error('Failed to save plan:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    onClose();
  };

  if (!showModal) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">
            {editingPlan ? '플랜 수정' : '플랜 추가'}
          </h2>
          <button
            onClick={handleClose}
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
            onClick={handleClose}
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
  );
}
