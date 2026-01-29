'use client';

import { Menu } from 'iconoir-react';
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
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { Plan } from './types';
import SortablePlanCard from './SortablePlanCard';

interface PlanListSectionProps {
  plans: Plan[];
  loading: boolean;
  gridCols: number;
  onDragEnd: (event: DragEndEvent) => void;
  onEditPlan: (plan: Plan) => void;
  onDeletePlan: (plan: Plan) => void;
  onToggleActive: (plan: Plan) => void;
  onTogglePopular: (plan: Plan) => void;
  onToggleDisplayMode?: (plan: Plan) => void;
}

export function PlanListSection({
  plans,
  loading,
  gridCols,
  onDragEnd,
  onEditPlan,
  onDeletePlan,
  onToggleActive,
  onTogglePopular,
  onToggleDisplayMode,
}: PlanListSectionProps) {
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
        onDragEnd={onDragEnd}
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
                  onEdit={onEditPlan}
                  onDelete={onDeletePlan}
                  onToggleActive={onToggleActive}
                  onTogglePopular={onTogglePopular}
                />
              ))
            )}
          </div>
        </SortableContext>
      </DndContext>
    </>
  );
}
