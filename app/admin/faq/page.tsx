'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import useSWR from 'swr';
import {
  DocMagnifyingGlassIn,
  Plus,
  Edit,
  BinMinusIn,
  Check,
  Xmark,
  NavArrowDown,
  NavArrowRight,
  Menu,
} from 'iconoir-react';
import Spinner from '@/components/admin/Spinner';
import dynamic from 'next/dynamic';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  UniqueIdentifier,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const RichTextEditor = dynamic(() => import('@/components/RichTextEditor'), {
  ssr: false,
  loading: () => <div className="h-[200px] border border-gray-200 rounded-lg animate-pulse bg-gray-50" />,
});

interface FAQItem {
  id: string;
  question: string;
  answer: string;
  category: string;
  subcategory?: string; // 하위 카테고리 (선택사항)
  order: number;
  visible: boolean;
}

// 드래그 가능한 FAQ 항목 컴포넌트
function SortableFAQItem({
  faq,
  isSelected,
  onSelect,
  onToggleVisible,
}: {
  faq: FAQItem;
  isSelected: boolean;
  onSelect: () => void;
  onToggleVisible: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: faq.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center gap-1 pl-3 pr-1 py-1.5 cursor-pointer transition-colors ${isSelected
        ? 'bg-blue-50 border-l-2 border-blue-600 -ml-[2px]'
        : 'hover:bg-gray-50'
        }`}
    >
      {/* 드래그 핸들 */}
      <button
        {...attributes}
        {...listeners}
        className="p-0.5 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <Menu className="w-3.5 h-3.5" />
      </button>

      {/* 제목 */}
      <button
        onClick={onSelect}
        className={`flex-1 text-left text-sm truncate ${faq.visible ? 'text-gray-700' : 'text-gray-400'
          } ${isSelected ? 'font-medium text-blue-700' : ''}`}
      >
        {faq.question}
      </button>

      {/* 표시/숨김 토글 */}
      <button
        onClick={(e) => { e.stopPropagation(); onToggleVisible(); }}
        className="shrink-0"
        title={faq.visible ? '숨기기' : '표시하기'}
      >
        <div className={`relative w-7 h-4 rounded-full transition-colors ${faq.visible ? 'bg-blue-500' : 'bg-gray-300'
          }`}>
          <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${faq.visible ? 'translate-x-3.5' : 'translate-x-0.5'
            }`} />
        </div>
      </button>
    </div>
  );
}

// 드래그 가능한 하위 카테고리 컴포넌트
function SortableSubcategory({
  category,
  subcategory,
  faqCount,
  isExpanded,
  isEditing,
  editValue,
  onToggleExpand,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onEditChange,
  onAddFaq,
  onDelete,
  children,
}: {
  category: string;
  subcategory: string;
  faqCount: number;
  isExpanded: boolean;
  isEditing: boolean;
  editValue: string;
  onToggleExpand: () => void;
  onStartEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onEditChange: (value: string) => void;
  onAddFaq: () => void;
  onDelete: () => void;
  children: React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `subcategory-${category}-${subcategory}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="mb-1">
      {/* 하위 카테고리 헤더 */}
      <div className="group flex items-center gap-1 px-2 py-1 bg-gray-50/50 rounded">
        {isEditing ? (
          <div className="flex-1 flex items-center gap-1">
            <input
              type="text"
              value={editValue}
              onChange={(e) => onEditChange(e.target.value)}
              className="flex-1 px-2 py-0.5 text-sm border border-blue-300 rounded focus:ring-2 focus:ring-blue-500"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSaveEdit();
                if (e.key === 'Escape') onCancelEdit();
              }}
            />
            <button onClick={onSaveEdit} className="p-0.5 text-blue-600 hover:bg-blue-50 rounded">
              <Check className="w-3 h-3" />
            </button>
            <button onClick={onCancelEdit} className="p-0.5 text-gray-400 hover:bg-gray-100 rounded">
              <Xmark className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <>
            {/* 드래그 핸들 */}
            <button
              {...attributes}
              {...listeners}
              className="p-0.5 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500"
            >
              <Menu className="w-3 h-3" />
            </button>

            {/* 접기/펼치기 버튼 */}
            <button
              onClick={onToggleExpand}
              className="p-0.5 text-gray-400 hover:text-gray-600"
            >
              {isExpanded ? (
                <NavArrowDown className="w-3 h-3" />
              ) : (
                <NavArrowRight className="w-3 h-3" />
              )}
            </button>

            <span className="flex-1 text-xs font-medium text-gray-600">
              {subcategory}
              <span className="ml-1 text-xs text-gray-400">
                ({faqCount})
              </span>
            </span>

            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={onAddFaq}
                className="p-0.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                title="FAQ 추가"
              >
                <Plus className="w-3 h-3" />
              </button>
              <button
                onClick={onStartEdit}
                className="p-0.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                title="하위 카테고리 수정"
              >
                <Edit className="w-3 h-3" />
              </button>
              <button
                onClick={onDelete}
                className="p-0.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                title="하위 카테고리 삭제"
              >
                <BinMinusIn className="w-3 h-3" />
              </button>
            </div>
          </>
        )}
      </div>

      {/* FAQ 항목 (펼쳐진 경우에만 표시) */}
      {isExpanded && (
        <div className="ml-2 mt-0.5 border-l border-gray-100">
          {children}
        </div>
      )}
    </div>
  );
}

// 드래그 가능한 카테고리 컴포넌트
function SortableCategory({
  category,
  faqCount,
  isExpanded,
  isEditing,
  editValue,
  onToggleExpand,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onEditChange,
  onAddFaq,
  onAddSubcategory,
  onDelete,
  children,
}: {
  category: string;
  faqCount: number;
  isExpanded: boolean;
  isEditing: boolean;
  editValue: string;
  onToggleExpand: () => void;
  onStartEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onEditChange: (value: string) => void;
  onAddFaq: () => void;
  onAddSubcategory: () => void;
  onDelete: () => void;
  children: React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `category-${category}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="mb-2">
      {/* 카테고리 헤더 */}
      <div className="group flex items-center gap-1 px-2 py-1.5 bg-gray-50 rounded-lg">
        {isEditing ? (
          <div className="flex-1 flex items-center gap-1">
            <input
              type="text"
              value={editValue}
              onChange={(e) => onEditChange(e.target.value)}
              className="flex-1 px-2 py-1 text-sm border border-blue-300 rounded focus:ring-2 focus:ring-blue-500"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSaveEdit();
                if (e.key === 'Escape') onCancelEdit();
              }}
            />
            <button onClick={onSaveEdit} className="p-1 text-blue-600 hover:bg-blue-50 rounded">
              <Check className="w-3.5 h-3.5" />
            </button>
            <button onClick={onCancelEdit} className="p-1 text-gray-400 hover:bg-gray-100 rounded">
              <Xmark className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <>
            {/* 드래그 핸들 */}
            <button
              {...attributes}
              {...listeners}
              className="p-0.5 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500"
            >
              <Menu className="w-4 h-4" />
            </button>

            {/* 접기/펼치기 버튼 */}
            <button
              onClick={onToggleExpand}
              className="p-0.5 text-gray-400 hover:text-gray-600"
            >
              {isExpanded ? (
                <NavArrowDown className="w-4 h-4" />
              ) : (
                <NavArrowRight className="w-4 h-4" />
              )}
            </button>

            <span className="flex-1 text-sm font-semibold text-gray-700">
              {category}
              <span className="ml-1 text-xs text-gray-400">
                ({faqCount})
              </span>
            </span>

            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={onAddSubcategory}
                className="p-1 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded"
                title="하위 카테고리 추가"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={onAddFaq}
                className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                title="FAQ 추가"
              >
                <DocMagnifyingGlassIn className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={onStartEdit}
                className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                title="카테고리 수정"
              >
                <Edit className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={onDelete}
                className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                title="카테고리 삭제"
              >
                <BinMinusIn className="w-3.5 h-3.5" />
              </button>
            </div>
          </>
        )}
      </div>

      {/* FAQ 항목 (펼쳐진 경우에만 표시) */}
      {isExpanded && (
        <div className="ml-2 mt-1 border-l-2 border-gray-100">
          {children}
        </div>
      )}
    </div>
  );
}


export default function FAQManagementPage() {
  // SWR: FAQ data
  const { data: faqSWRData, isLoading: loading, mutate: mutateFaqs } = useSWR(
    '/api/admin/faq',
    { fallbackData: { faqs: [] } }
  );
  const { data: catSWRData, mutate: mutateCategories } = useSWR(
    '/api/admin/faq/categories',
    { fallbackData: { categories: [] } }
  );

  const mutateAll = useCallback(() => {
    mutateFaqs();
    mutateCategories();
  }, [mutateFaqs, mutateCategories]);

  const [saving, setSaving] = useState(false);
  const [faqs, setFaqs] = useState<FAQItem[]>([]);
  const [selectedFaqId, setSelectedFaqId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ question: '', answer: '' });
  const [isEditing, setIsEditing] = useState(false);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newFaqCategory, setNewFaqCategory] = useState<string>('');
  const [newFaqSubcategory, setNewFaqSubcategory] = useState<string>(''); // 새 FAQ의 하위 카테고리

  // 자동 임시저장 상태
  const [autoSaveStatus, setAutoSaveStatus] = useState<'saved' | 'saving' | null>(null);
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 카테고리 관리
  const [emptyCategories, setEmptyCategories] = useState<string[]>([]);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editCategoryName, setEditCategoryName] = useState('');

  // 하위 카테고리 관리
  // emptySubcategories: { [category]: [subcategory1, subcategory2, ...] }
  const [emptySubcategories, setEmptySubcategories] = useState<Record<string, string[]>>({});
  const [addingSubcategoryFor, setAddingSubcategoryFor] = useState<string | null>(null); // 어느 카테고리에 하위 추가 중인지
  const [newSubcategoryName, setNewSubcategoryName] = useState('');
  const [editingSubcategory, setEditingSubcategory] = useState<{ category: string; subcategory: string } | null>(null);
  const [editSubcategoryName, setEditSubcategoryName] = useState('');

  // 카테고리 순서 및 접기/펼치기 상태
  const [categoryOrder, setCategoryOrder] = useState<string[]>([]);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [expandedSubcategories, setExpandedSubcategories] = useState<Set<string>>(new Set()); // "category-subcategory" 형태
  const [activeDragId, setActiveDragId] = useState<UniqueIdentifier | null>(null);

  // DnD 센서 설정
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // 자동 임시저장 키 생성
  const getAutoSaveKey = useCallback((faqId: string | null, isNew: boolean) => {
    if (isNew) {
      return `faq_draft_new_${newFaqCategory}_${newFaqSubcategory || 'root'}`;
    }
    return faqId ? `faq_draft_${faqId}` : null;
  }, [newFaqCategory, newFaqSubcategory]);

  // 임시저장 데이터 저장
  const saveToLocalStorage = useCallback((key: string, data: { question: string; answer: string }) => {
    try {
      localStorage.setItem(key, JSON.stringify({
        ...data,
        savedAt: new Date().toISOString(),
      }));
      setAutoSaveStatus('saved');
    } catch (e) {
      console.error('Failed to save draft:', e);
    }
  }, []);

  // 임시저장 데이터 불러오기
  const loadFromLocalStorage = useCallback((key: string): { question: string; answer: string; savedAt: string } | null => {
    try {
      const saved = localStorage.getItem(key);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error('Failed to load draft:', e);
    }
    return null;
  }, []);

  // 임시저장 삭제
  const clearAutoSave = useCallback((key: string | null) => {
    if (key) {
      try {
        localStorage.removeItem(key);
        setAutoSaveStatus(null);
      } catch (e) {
        console.error('Failed to clear draft:', e);
      }
    }
  }, []);

  // 자동 임시저장 (debounce)
  useEffect(() => {
    // 편집 중이 아니면 저장하지 않음
    if (!isEditing && !isAddingNew) {
      setAutoSaveStatus(null);
      return;
    }

    // 내용이 비어있으면 저장하지 않음
    if (!editForm.question.trim() && !editForm.answer.trim()) {
      return;
    }

    const key = getAutoSaveKey(selectedFaqId, isAddingNew);
    if (!key) return;

    // 이전 타이머 취소
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    setAutoSaveStatus('saving');

    // 2초 후 저장
    autoSaveTimeoutRef.current = setTimeout(() => {
      saveToLocalStorage(key, editForm);
    }, 2000);

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [editForm, isEditing, isAddingNew, selectedFaqId, getAutoSaveKey, saveToLocalStorage]);

  // 임시저장 복구 확인
  const checkAndRestoreDraft = useCallback((key: string, currentData: { question: string; answer: string }) => {
    const saved = loadFromLocalStorage(key);
    if (saved) {
      // 저장된 내용과 현재 내용이 다른 경우에만 복구 확인
      if (saved.question !== currentData.question || saved.answer !== currentData.answer) {
        const savedTime = new Date(saved.savedAt).toLocaleString('ko-KR');
        if (confirm(`임시 저장된 내용이 있습니다. (${savedTime})\n복구하시겠습니까?`)) {
          setEditForm({ question: saved.question, answer: saved.answer });
          setAutoSaveStatus('saved');
          return true;
        } else {
          // 복구 안 함 -> 임시저장 삭제
          clearAutoSave(key);
        }
      }
    }
    return false;
  }, [loadFromLocalStorage, clearAutoSave]);

  // Sync SWR data to local state
  useEffect(() => {
    if (faqSWRData?.faqs) {
      setFaqs(faqSWRData.faqs);
    }
  }, [faqSWRData]);

  useEffect(() => {
    if (catSWRData?.categories) {
      const catNames = catSWRData.categories.map((c: any) => c.name);
      setCategoryOrder(catNames);
      // 처음 로드 시 모든 카테고리 펼치기
      if (expandedCategories.size === 0) {
        setExpandedCategories(new Set(catNames));
      }
    }
  }, [catSWRData]);

  // 카테고리 목록 (서버에서 가져온 categoryOrder를 기준으로 사용)
  const categories = categoryOrder;

  // 카테고리별 하위 카테고리 목록
  const subcategoriesByCategory = useMemo(() => {
    const result: Record<string, string[]> = {};
    categories.forEach(category => {
      const faqSubcats = Array.from(new Set(
        faqs
          .filter(f => f.category === category && f.subcategory)
          .map(f => f.subcategory!)
      ));
      const emptySubcats = emptySubcategories[category] || [];
      result[category] = Array.from(new Set([...faqSubcats, ...emptySubcats]));
    });
    return result;
  }, [faqs, categories, emptySubcategories]);

  // 카테고리/하위카테고리별 FAQ 그룹화
  const faqsByCategory = useMemo(() => {
    return categories.reduce((acc, category) => {
      acc[category] = {
        // 하위 카테고리 없는 FAQ들
        noSubcategory: faqs
          .filter(f => f.category === category && !f.subcategory)
          .sort((a, b) => a.order - b.order),
        // 하위 카테고리별 FAQ들
        bySubcategory: (subcategoriesByCategory[category] || []).reduce((subAcc, subcategory) => {
          subAcc[subcategory] = faqs
            .filter(f => f.category === category && f.subcategory === subcategory)
            .sort((a, b) => a.order - b.order);
          return subAcc;
        }, {} as Record<string, FAQItem[]>),
      };
      return acc;
    }, {} as Record<string, { noSubcategory: FAQItem[]; bySubcategory: Record<string, FAQItem[]> }>);
  }, [faqs, categories, subcategoriesByCategory]);

  // 카테고리별 전체 FAQ 수
  const faqCountByCategory = useMemo(() => {
    return categories.reduce((acc, category) => {
      acc[category] = faqs.filter(f => f.category === category).length;
      return acc;
    }, {} as Record<string, number>);
  }, [faqs, categories]);

  // 선택된 FAQ
  const selectedFaq = useMemo(() => {
    return faqs.find(f => f.id === selectedFaqId);
  }, [faqs, selectedFaqId]);

  // FAQ 선택
  const handleSelectFaq = (faq: FAQItem) => {
    if (isEditing || isAddingNew) {
      if (!confirm('수정 중인 내용이 있습니다. 다른 FAQ를 선택하시겠습니까?')) return;
    }
    setSelectedFaqId(faq.id);
    setEditForm({ question: faq.question, answer: faq.answer });
    setIsEditing(false);
    setIsAddingNew(false);
    setAutoSaveStatus(null);

    // 임시저장 복구 확인 (편집 모드로 전환 시)
    const key = `faq_draft_${faq.id}`;
    setTimeout(() => {
      checkAndRestoreDraft(key, { question: faq.question, answer: faq.answer });
    }, 100);
  };

  // 새 FAQ 추가 시작
  const handleStartAddFaq = (category: string, subcategory?: string) => {
    if (isEditing || isAddingNew) {
      if (!confirm('수정 중인 내용이 있습니다. 새 FAQ를 추가하시겠습니까?')) return;
    }
    setSelectedFaqId(null);
    setNewFaqCategory(category);
    setNewFaqSubcategory(subcategory || '');
    setEditForm({ question: '', answer: '' });
    setIsAddingNew(true);
    setIsEditing(false);
    setAutoSaveStatus(null);

    // 임시저장 복구 확인
    const key = `faq_draft_new_${category}_${subcategory || 'root'}`;
    setTimeout(() => {
      checkAndRestoreDraft(key, { question: '', answer: '' });
    }, 100);
  };

  // 카테고리 접기/펼치기
  const toggleCategoryExpand = (category: string) => {
    setExpandedCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(category)) {
        newSet.delete(category);
      } else {
        newSet.add(category);
      }
      return newSet;
    });
  };

  // 하위 카테고리 접기/펼치기
  const toggleSubcategoryExpand = (category: string, subcategory: string) => {
    const key = `${category}-${subcategory}`;
    setExpandedSubcategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      return newSet;
    });
  };

  // 하위 카테고리 추가
  const handleAddSubcategory = (category: string) => {
    if (!newSubcategoryName.trim()) {
      alert('하위 카테고리명을 입력해주세요.');
      return;
    }
    const existingSubcats = subcategoriesByCategory[category] || [];
    if (existingSubcats.includes(newSubcategoryName.trim())) {
      alert('이미 존재하는 하위 카테고리입니다.');
      return;
    }
    const newSubcat = newSubcategoryName.trim();
    setEmptySubcategories(prev => ({
      ...prev,
      [category]: [...(prev[category] || []), newSubcat],
    }));
    // 자동으로 펼치기
    setExpandedSubcategories(prev => new Set([...prev, `${category}-${newSubcat}`]));
    setAddingSubcategoryFor(null);
    setNewSubcategoryName('');
  };

  // 하위 카테고리 수정
  const handleSaveSubcategoryEdit = async () => {
    if (!editingSubcategory || !editSubcategoryName.trim()) return;
    const { category, subcategory } = editingSubcategory;
    if (editSubcategoryName.trim() === subcategory) {
      setEditingSubcategory(null);
      return;
    }
    const existingSubcats = subcategoriesByCategory[category] || [];
    if (existingSubcats.includes(editSubcategoryName.trim())) {
      alert('이미 존재하는 하위 카테고리입니다.');
      return;
    }

    const faqsToUpdate = faqs.filter(f => f.category === category && f.subcategory === subcategory);

    if (faqsToUpdate.length === 0) {
      // 빈 하위 카테고리 이름 변경
      setEmptySubcategories(prev => ({
        ...prev,
        [category]: (prev[category] || []).map(s => s === subcategory ? editSubcategoryName.trim() : s),
      }));
      setEditingSubcategory(null);
      setEditSubcategoryName('');
      return;
    }

    setSaving(true);
    try {
      for (const faq of faqsToUpdate) {
        await fetch(`/api/admin/faq/${faq.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subcategory: editSubcategoryName.trim() }),
        });
      }
      setEditingSubcategory(null);
      setEditSubcategoryName('');
      mutateAll();
    } catch (error) {
      console.error('Failed to update subcategory:', error);
      alert('하위 카테고리 수정에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  // 하위 카테고리 삭제
  const handleDeleteSubcategory = async (category: string, subcategory: string) => {
    const faqCount = faqs.filter(f => f.category === category && f.subcategory === subcategory).length;

    if (faqCount === 0) {
      if (!confirm(`"${subcategory}" 하위 카테고리를 삭제하시겠습니까?`)) return;
      setEmptySubcategories(prev => ({
        ...prev,
        [category]: (prev[category] || []).filter(s => s !== subcategory),
      }));
      return;
    }

    if (!confirm(`"${subcategory}" 하위 카테고리와 포함된 FAQ ${faqCount}개를 모두 삭제하시겠습니까?`)) return;

    setSaving(true);
    try {
      const faqsToDelete = faqs.filter(f => f.category === category && f.subcategory === subcategory);
      for (const faq of faqsToDelete) {
        await fetch(`/api/admin/faq/${faq.id}`, { method: 'DELETE' });
      }
      if (selectedFaq?.category === category && selectedFaq?.subcategory === subcategory) {
        setSelectedFaqId(null);
      }
      mutateAll();
    } catch (error) {
      console.error('Failed to delete subcategory:', error);
      alert('하위 카테고리 삭제에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  // 카테고리 추가
  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) {
      alert('카테고리명을 입력해주세요.');
      return;
    }
    if (categories.includes(newCategoryName.trim())) {
      alert('이미 존재하는 카테고리입니다.');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch('/api/admin/faq/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newCategoryName.trim() }),
      });

      if (response.ok) {
        setShowAddCategory(false);
        setNewCategoryName('');
        mutateAll();
      } else {
        const error = await response.json();
        alert(error.error || '카테고리 추가에 실패했습니다.');
      }
    } catch (error) {
      console.error('Failed to add category:', error);
      alert('오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  // 카테고리 수정


  // 기존 handleSaveCategoryEdit 로직 대체 (API 호출)
  const handleSaveCategoryEdit = async () => {
    if (!editingCategory || !editCategoryName.trim()) return;
    if (editCategoryName.trim() === editingCategory) {
      setEditingCategory(null);
      return;
    }
    if (categories.includes(editCategoryName.trim())) {
      alert('이미 존재하는 카테고리입니다.');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch('/api/admin/faq/categories', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldName: editingCategory, newName: editCategoryName.trim() }),
      });

      if (response.ok) {
        setEditingCategory(null);
        setEditCategoryName('');
        mutateAll();
      } else {
        alert('카테고리 수정에 실패했습니다.');
      }
    } catch (error) {
      console.error('Failed to update category:', error);
      alert('오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  // 카테고리 삭제
  const handleDeleteCategory = async (category: string) => {
    const faqCount = faqs.filter(f => f.category === category).length;

    if (faqCount === 0) {
      if (!confirm(`"${category}" 카테고리를 삭제하시겠습니까?`)) return;
      if (!confirm(`"${category}" 카테고리를 삭제하시겠습니까?`)) return;

      setSaving(true);
      try {
        const response = await fetch(`/api/admin/faq/categories?name=${encodeURIComponent(category)}`, {
          method: 'DELETE',
        });
        if (response.ok) {
          mutateAll();
        } else {
          alert('삭제 실패');
        }
      } catch (e) {
        console.error(e);
      } finally {
        setSaving(false);
      }
      return;
    }

    if (!confirm(`"${category}" 카테고리와 포함된 FAQ ${faqCount}개를 모두 삭제하시겠습니까?`)) return;

    setSaving(true);
    try {
      // 카테고리 삭제 API 호출 (서버에서 FAQ 삭제도 처리하거나 여기서 별도 처리)
      // 현재 서버 API가 FAQ 삭제도 처리하도록 구현됨
      const response = await fetch(`/api/admin/faq/categories?name=${encodeURIComponent(category)}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        if (selectedFaq?.category === category) {
          setSelectedFaqId(null);
        }
        mutateAll();
      } else {
        alert('카테고리 삭제에 실패했습니다.');
      }
    } catch (error) {
      console.error('Failed to delete category:', error);
      alert('오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  // FAQ 저장 (새로 추가 또는 수정)
  const handleSave = async () => {
    if (!editForm.question.trim() || !editForm.answer.trim()) {
      alert('제목과 내용을 입력해주세요.');
      return;
    }

    setSaving(true);
    try {
      if (isAddingNew) {
        const faqData: Record<string, string> = {
          ...editForm,
          category: newFaqCategory,
        };
        if (newFaqSubcategory) {
          faqData.subcategory = newFaqSubcategory;
        }
        const response = await fetch('/api/admin/faq', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(faqData),
        });
        if (response.ok) {
          const data = await response.json();
          // 저장 성공 시 임시저장 삭제
          clearAutoSave(`faq_draft_new_${newFaqCategory}_${newFaqSubcategory || 'root'}`);
          setEmptyCategories(prev => prev.filter(c => c !== newFaqCategory));
          // 빈 하위 카테고리에서 제거
          if (newFaqSubcategory) {
            setEmptySubcategories(prev => ({
              ...prev,
              [newFaqCategory]: (prev[newFaqCategory] || []).filter(s => s !== newFaqSubcategory),
            }));
          }
          setIsAddingNew(false);
          setSelectedFaqId(data.id);
          mutateAll();
        } else {
          alert('추가에 실패했습니다.');
        }
      } else if (selectedFaqId) {
        const response = await fetch(`/api/admin/faq/${selectedFaqId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(editForm),
        });
        if (response.ok) {
          // 저장 성공 시 임시저장 삭제
          clearAutoSave(`faq_draft_${selectedFaqId}`);
          setIsEditing(false);
          mutateAll();
        } else {
          alert('수정에 실패했습니다.');
        }
      }
    } catch (error) {
      console.error('Failed to save FAQ:', error);
      alert('오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  // FAQ 삭제
  const handleDelete = async () => {
    if (!selectedFaqId) return;
    if (!confirm('정말 삭제하시겠습니까?')) return;

    try {
      const response = await fetch(`/api/admin/faq/${selectedFaqId}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        setSelectedFaqId(null);
        setIsEditing(false);
        mutateAll();
      } else {
        alert('삭제에 실패했습니다.');
      }
    } catch (error) {
      console.error('Failed to delete FAQ:', error);
      alert('오류가 발생했습니다.');
    }
  };

  // 표시/숨김 토글
  const handleToggleVisible = async (faq: FAQItem) => {
    try {
      await fetch(`/api/admin/faq/${faq.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visible: !faq.visible }),
      });
      mutateAll();
    } catch (error) {
      console.error('Failed to toggle visibility:', error);
    }
  };

  // 드래그 시작
  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(event.active.id);
  };

  // 드래그 종료 - FAQ 및 카테고리 순서 변경
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragId(null);

    if (!over || active.id === over.id) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    // 카테고리 드래그인 경우
    if (activeId.startsWith('category-') && overId.startsWith('category-')) {
      const activeCat = activeId.replace('category-', '');
      const overCat = overId.replace('category-', '');

      setCategoryOrder(prev => {
        const oldIndex = prev.indexOf(activeCat);
        const newIndex = prev.indexOf(overCat);
        if (oldIndex === -1 || newIndex === -1) return prev;
        return arrayMove(prev, oldIndex, newIndex);
      });
      return;
    }

    // FAQ 드래그인 경우
    if (!activeId.startsWith('category-') && !activeId.startsWith('subcategory-') &&
      !overId.startsWith('category-') && !overId.startsWith('subcategory-')) {
      const activeFaq = faqs.find(f => f.id === activeId);
      const overFaq = faqs.find(f => f.id === overId);

      if (!activeFaq || !overFaq) return;

      // 같은 카테고리와 하위 카테고리 내에서만 이동 가능
      if (activeFaq.category !== overFaq.category) return;
      if (activeFaq.subcategory !== overFaq.subcategory) return;

      // 해당 카테고리/하위카테고리의 FAQ 목록 가져오기
      const categoryData = faqsByCategory[activeFaq.category];
      let targetFaqs: FAQItem[];
      if (activeFaq.subcategory) {
        targetFaqs = categoryData?.bySubcategory[activeFaq.subcategory] || [];
      } else {
        targetFaqs = categoryData?.noSubcategory || [];
      }

      const oldIndex = targetFaqs.findIndex(f => f.id === activeId);
      const newIndex = targetFaqs.findIndex(f => f.id === overId);

      if (oldIndex === -1 || newIndex === -1) return;

      // 새로운 순서 계산
      const reorderedFaqs = arrayMove(targetFaqs, oldIndex, newIndex);
      const orders = reorderedFaqs.map((faq, index) => ({
        id: faq.id,
        order: index,
      }));

      try {
        await fetch('/api/admin/faq/reorder', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orders }),
        });
        mutateAll();
      } catch (error) {
        console.error('Failed to reorder:', error);
      }
    }
  };

  // 드래그 중인 항목 정보
  const activeDragItem = useMemo((): { type: 'category'; name: string } | { type: 'faq'; faq: FAQItem } | null => {
    if (!activeDragId) return null;
    const id = String(activeDragId);
    if (id.startsWith('category-')) {
      return { type: 'category', name: id.replace('category-', '') };
    }
    const faq = faqs.find(f => f.id === id);
    return faq ? { type: 'faq', faq } : null;
  }, [activeDragId, faqs]);

  // 모바일에서 편집 패널 표시 여부
  const showMobileEditor = selectedFaq || isAddingNew;

  // 모바일에서 목록으로 돌아가기
  const handleBackToList = () => {
    if (isEditing || isAddingNew) {
      if (!confirm('수정 중인 내용이 있습니다. 목록으로 돌아가시겠습니까?')) return;
    }
    setSelectedFaqId(null);
    setIsAddingNew(false);
    setIsEditing(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-120px)] md:gap-6">
      {/* 좌측 사이드바 - FAQ 목록 */}
      {/* 모바일: 편집 중일 때 숨김 / 데스크톱: 항상 표시 */}
      <aside className={`w-full md:w-80 flex-shrink-0 bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col overflow-hidden ${showMobileEditor ? 'hidden md:flex' : 'flex'}`}>
        {/* 헤더 */}
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center gap-2 mb-3">
            <DocMagnifyingGlassIn className="w-6 h-6 text-blue-600" />
            <h1 className="text-lg font-bold text-gray-900">FAQ</h1>
          </div>

          {/* 카테고리 추가 */}
          {showAddCategory ? (
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="카테고리명"
                className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddCategory();
                  if (e.key === 'Escape') {
                    setShowAddCategory(false);
                    setNewCategoryName('');
                  }
                }}
              />
              <button onClick={handleAddCategory} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded">
                <Check className="w-4 h-4" />
              </button>
              <button
                onClick={() => { setShowAddCategory(false); setNewCategoryName(''); }}
                className="p-1.5 text-gray-400 hover:bg-gray-100 rounded"
              >
                <Xmark className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowAddCategory(true)}
              className="w-full px-3 py-2 text-sm font-medium text-gray-500 border border-dashed border-gray-300 rounded-lg hover:border-blue-400 hover:text-blue-600 transition-colors flex items-center justify-center gap-1"
            >
              <Plus className="w-4 h-4" />
              카테고리 추가
            </button>
          )}
        </div>

        {/* FAQ 목록 */}
        <div className="flex-1 overflow-y-auto p-2">
          {categories.length === 0 ? (
            <div className="p-4 text-center text-gray-500 text-sm">
              카테고리를 먼저 추가해주세요.
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={categories.map(c => `category-${c}`)}
                strategy={verticalListSortingStrategy}
              >
                {categories.map(category => {
                  const categoryData = faqsByCategory[category];
                  const subcategories = subcategoriesByCategory[category] || [];

                  return (
                    <SortableCategory
                      key={category}
                      category={category}
                      faqCount={faqCountByCategory[category] || 0}
                      isExpanded={expandedCategories.has(category)}
                      isEditing={editingCategory === category}
                      editValue={editCategoryName}
                      onToggleExpand={() => toggleCategoryExpand(category)}
                      onStartEdit={() => { setEditingCategory(category); setEditCategoryName(category); }}
                      onSaveEdit={handleSaveCategoryEdit}
                      onCancelEdit={() => setEditingCategory(null)}
                      onEditChange={setEditCategoryName}
                      onAddFaq={() => handleStartAddFaq(category)}
                      onAddSubcategory={() => {
                        setAddingSubcategoryFor(category);
                        setNewSubcategoryName('');
                      }}
                      onDelete={() => handleDeleteCategory(category)}
                    >
                      {/* 하위 카테고리 추가 입력 */}
                      {addingSubcategoryFor === category && (
                        <div className="flex items-center gap-1 px-2 py-1 mb-1">
                          <input
                            type="text"
                            value={newSubcategoryName}
                            onChange={(e) => setNewSubcategoryName(e.target.value)}
                            placeholder="하위 카테고리명"
                            className="flex-1 px-2 py-0.5 text-xs border border-gray-200 rounded focus:ring-2 focus:ring-blue-500"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleAddSubcategory(category);
                              if (e.key === 'Escape') {
                                setAddingSubcategoryFor(null);
                                setNewSubcategoryName('');
                              }
                            }}
                          />
                          <button
                            onClick={() => handleAddSubcategory(category)}
                            className="p-0.5 text-blue-600 hover:bg-blue-50 rounded"
                          >
                            <Check className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => { setAddingSubcategoryFor(null); setNewSubcategoryName(''); }}
                            className="p-0.5 text-gray-400 hover:bg-gray-100 rounded"
                          >
                            <Xmark className="w-3 h-3" />
                          </button>
                        </div>
                      )}

                      {/* 하위 카테고리들 */}
                      <SortableContext
                        items={subcategories.map(s => `subcategory-${category}-${s}`)}
                        strategy={verticalListSortingStrategy}
                      >
                        {subcategories.map(subcategory => {
                          const subcatFaqs = categoryData?.bySubcategory[subcategory] || [];
                          const subcatKey = `${category}-${subcategory}`;

                          return (
                            <SortableSubcategory
                              key={subcatKey}
                              category={category}
                              subcategory={subcategory}
                              faqCount={subcatFaqs.length}
                              isExpanded={expandedSubcategories.has(subcatKey)}
                              isEditing={editingSubcategory?.category === category && editingSubcategory?.subcategory === subcategory}
                              editValue={editSubcategoryName}
                              onToggleExpand={() => toggleSubcategoryExpand(category, subcategory)}
                              onStartEdit={() => { setEditingSubcategory({ category, subcategory }); setEditSubcategoryName(subcategory); }}
                              onSaveEdit={handleSaveSubcategoryEdit}
                              onCancelEdit={() => setEditingSubcategory(null)}
                              onEditChange={setEditSubcategoryName}
                              onAddFaq={() => handleStartAddFaq(category, subcategory)}
                              onDelete={() => handleDeleteSubcategory(category, subcategory)}
                            >
                              <SortableContext
                                items={subcatFaqs.map(f => f.id)}
                                strategy={verticalListSortingStrategy}
                              >
                                {subcatFaqs.map(faq => (
                                  <SortableFAQItem
                                    key={faq.id}
                                    faq={faq}
                                    isSelected={selectedFaqId === faq.id}
                                    onSelect={() => handleSelectFaq(faq)}
                                    onToggleVisible={() => handleToggleVisible(faq)}
                                  />
                                ))}
                              </SortableContext>
                            </SortableSubcategory>
                          );
                        })}
                      </SortableContext>

                      {/* 하위 카테고리 없는 FAQ들 */}
                      <SortableContext
                        items={(categoryData?.noSubcategory || []).map(f => f.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        {categoryData?.noSubcategory?.map(faq => (
                          <SortableFAQItem
                            key={faq.id}
                            faq={faq}
                            isSelected={selectedFaqId === faq.id}
                            onSelect={() => handleSelectFaq(faq)}
                            onToggleVisible={() => handleToggleVisible(faq)}
                          />
                        ))}
                      </SortableContext>
                    </SortableCategory>
                  );
                })}
              </SortableContext>

              {/* 드래그 오버레이 */}
              <DragOverlay>
                {activeDragItem && activeDragItem.type === 'category' && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 shadow-lg">
                    <span className="text-sm font-semibold text-blue-700">
                      {activeDragItem.name}
                    </span>
                  </div>
                )}
                {activeDragItem && activeDragItem.type === 'faq' && (
                  <div className="bg-blue-50 border border-blue-200 rounded px-3 py-1.5 shadow-lg">
                    <span className="text-sm text-blue-700">
                      {activeDragItem.faq.question}
                    </span>
                  </div>
                )}
              </DragOverlay>
            </DndContext>
          )}
        </div>
      </aside>

      {/* 우측 메인 콘텐츠 - FAQ 편집 */}
      {/* 모바일: 편집 중일 때만 표시 / 데스크톱: 항상 표시 */}
      <main className={`flex-1 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex-col ${showMobileEditor ? 'flex' : 'hidden md:flex'}`}>
        {selectedFaq || isAddingNew ? (
          <>
            {/* 툴바 */}
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                {/* 모바일 뒤로가기 버튼 */}
                <button
                  onClick={handleBackToList}
                  className="md:hidden p-1.5 -ml-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                  title="목록으로"
                >
                  <NavArrowRight className="w-5 h-5 rotate-180" />
                </button>
                {isAddingNew ? (
                  <span className="text-sm text-gray-500">
                    새 FAQ 추가{' '}
                    <span className="text-blue-600">
                      ({newFaqCategory}{newFaqSubcategory ? ` > ${newFaqSubcategory}` : ''})
                    </span>
                  </span>
                ) : (
                  <span className="text-sm text-gray-500">
                    {selectedFaq?.category}
                    {selectedFaq?.subcategory && (
                      <span className="text-gray-400"> &gt; {selectedFaq.subcategory}</span>
                    )}
                  </span>
                )}
                {/* 자동 임시저장 상태 표시 */}
                {(isEditing || isAddingNew) && autoSaveStatus && (
                  <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${
                    autoSaveStatus === 'saving'
                      ? 'bg-yellow-100 text-yellow-700'
                      : 'bg-green-100 text-green-700'
                  }`}>
                    {autoSaveStatus === 'saving' ? '저장 중...' : '임시 저장됨'}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {isEditing || isAddingNew ? (
                  <>
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                      {saving ? <Spinner size="sm" /> : <Check className="w-4 h-4" />}
                      저장
                    </button>
                    <button
                      onClick={() => {
                        if (isAddingNew) {
                          setIsAddingNew(false);
                          setSelectedFaqId(null);
                        } else {
                          setIsEditing(false);
                          if (selectedFaq) {
                            setEditForm({ question: selectedFaq.question, answer: selectedFaq.answer });
                          }
                        }
                      }}
                      className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors flex items-center gap-2"
                    >
                      <Xmark className="w-4 h-4" />
                      취소
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => setIsEditing(true)}
                      className="p-2 text-gray-500 hover:text-blue-600 rounded-lg transition-colors"
                      title="수정"
                    >
                      <Edit className="w-5 h-5" />
                    </button>
                    <button
                      onClick={handleDelete}
                      className="p-2 text-gray-500 hover:text-red-600 rounded-lg transition-colors"
                      title="삭제"
                    >
                      <BinMinusIn className="w-5 h-5" />
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* 폼 */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden p-6">
              <div className="max-w-3xl space-y-6 break-words">
                <div>
                  <label className="inline-block text-xs font-semibold text-gray-500 bg-gray-100 px-2 py-1 rounded mb-2">
                    제목
                  </label>
                  {isEditing || isAddingNew ? (
                    <input
                      type="text"
                      value={editForm.question}
                      onChange={(e) => setEditForm(prev => ({ ...prev, question: e.target.value }))}
                      placeholder="제목을 입력하세요"
                      className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg"
                    />
                  ) : (
                    <h2 className="text-xl font-semibold text-gray-900 break-words">
                      {selectedFaq?.question}
                    </h2>
                  )}
                </div>

                <div>
                  <label className="inline-block text-xs font-semibold text-gray-500 bg-gray-100 px-2 py-1 rounded mb-2">
                    내용
                  </label>
                  {isEditing || isAddingNew ? (
                    <RichTextEditor
                      content={editForm.answer}
                      onChange={(html) => setEditForm(prev => ({ ...prev, answer: html }))}
                      placeholder="내용을 입력하세요"
                      faqId={selectedFaqId || undefined}
                    />
                  ) : (
                    <div
                      className="prose prose-sm max-w-none text-gray-700"
                      dangerouslySetInnerHTML={{ __html: (selectedFaq?.answer || '').replace(/(<summary[^>]*>)\s*(?:질문|답변)\s*/g, '$1') }}
                    />
                  )}
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <DocMagnifyingGlassIn className="w-16 h-16 mx-auto mb-4 opacity-30" />
              <p>FAQ를 선택하거나 새로 추가해주세요.</p>
            </div>
          </div>
        )}
      </main>

      {/* 프리뷰 스타일 */}
      <style jsx global>{`
        /* 링크 스타일 */
        .prose a {
          color: #3b82f6;
          text-decoration: underline;
        }
        .prose a:hover {
          color: #2563eb;
        }
        /* 아코디언/펼치기접기 스타일 */
        .prose details.faq-accordion {
          border: 1px solid #e5e7eb;
          border-radius: 0.5rem;
          margin: 1rem 0;
          overflow: hidden;
        }
        .prose summary.faq-accordion-summary {
          padding: 0.75rem 1rem;
          background: #f9fafb;
          cursor: pointer;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          list-style: none;
        }
        .prose summary.faq-accordion-summary::-webkit-details-marker {
          display: none;
        }
        .prose summary.faq-accordion-summary::before {
          content: '▶';
          font-size: 0.625rem;
          color: #6b7280;
          transition: transform 0.2s;
        }
        .prose details.faq-accordion[open] summary.faq-accordion-summary::before {
          transform: rotate(90deg);
        }
        .prose div.faq-accordion-content,
        .prose div[data-details-content] {
          padding: 1rem;
          border-top: 1px solid #e5e7eb;
        }
      `}</style>
    </div>
  );
}
