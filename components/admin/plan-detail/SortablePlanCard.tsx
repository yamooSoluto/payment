'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { EditPencil, Trash, Check, Menu } from 'iconoir-react';
import { Plan } from './types';

interface SortablePlanCardProps {
  plan: Plan;
  onEdit: (plan: Plan) => void;
  onDelete: (plan: Plan) => void;
  onToggleActive: (plan: Plan) => void;
  onTogglePopular: (plan: Plan) => void;
  onToggleDisplayMode?: (plan: Plan) => void;
}

export default function SortablePlanCard({
  plan,
  onEdit,
  onDelete,
  onToggleActive,
  onTogglePopular,
  onToggleDisplayMode,
}: SortablePlanCardProps) {
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
          <button
            type="button"
            onClick={() => onToggleDisplayMode?.(plan)}
            className={`text-xs font-medium px-2 py-0.5 rounded-full transition-colors ${
              plan.displayMode === 'coming_soon'
                ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
                : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
            }`}
          >
            {plan.displayMode === 'coming_soon' ? '준비중' : '숨김'}
          </button>
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
