'use client';

import { useState } from 'react';
import { Plus, Trash, Code, List, EditPencil, NavArrowDown, NavArrowUp } from 'iconoir-react';

interface ReviewChoice {
  label: string;
  type: 'code' | 'task';
  content?: string;
  handler?: string;
  task?: string;
}

interface TenantItemEditorProps {
  value: Record<string, unknown> | null;
  onChange: (fieldName: string, value: unknown) => void;
  disabled?: boolean;
}

// ─── reviewChoices 전용 에디터 ───
function ReviewChoicesEditor({
  choices,
  onChange,
  disabled,
}: {
  choices: ReviewChoice[];
  onChange: (updated: ReviewChoice[]) => void;
  disabled?: boolean;
}) {
  const updateChoice = (idx: number, patch: Partial<ReviewChoice>) => {
    const updated = choices.map((c, i) => (i === idx ? { ...c, ...patch } : c));
    // type이 code로 변경되면 task 전용 필드 제거
    if (patch.type === 'code') {
      const item = updated[idx] as unknown as Record<string, unknown>;
      delete item.handler;
      delete item.task;
    }
    onChange(updated);
  };

  const removeChoice = (idx: number) => {
    onChange(choices.filter((_, i) => i !== idx));
  };

  const addChoice = () => {
    onChange([...choices, { label: '', type: 'code', content: '' }]);
  };

  const moveChoice = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= choices.length) return;
    const updated = [...choices];
    [updated[idx], updated[target]] = [updated[target], updated[idx]];
    onChange(updated);
  };

  return (
    <div className="space-y-3">
      {choices.map((choice, idx) => (
        <div key={idx} className="border border-gray-200 rounded-lg bg-white overflow-hidden">
          {/* 헤더 */}
          <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-200">
            <span className="text-xs font-semibold text-gray-500">선택지 {idx + 1}</span>
            {!disabled && (
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => moveChoice(idx, -1)} disabled={idx === 0}
                  className="p-0.5 rounded text-gray-400 hover:text-gray-600 disabled:opacity-20">
                  <NavArrowUp className="w-3.5 h-3.5" />
                </button>
                <button type="button" onClick={() => moveChoice(idx, 1)} disabled={idx === choices.length - 1}
                  className="p-0.5 rounded text-gray-400 hover:text-gray-600 disabled:opacity-20">
                  <NavArrowDown className="w-3.5 h-3.5" />
                </button>
                <button type="button" onClick={() => removeChoice(idx)}
                  className="p-0.5 rounded text-gray-400 hover:text-red-500 ml-1">
                  <Trash className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          <div className="px-4 py-3 space-y-3">
            {/* label */}
            <div>
              <label className="text-xs text-gray-500 mb-1 block">라벨 (label) — 유저에게 보이는 텍스트</label>
              <input
                type="text"
                value={choice.label}
                onChange={(e) => updateChoice(idx, { label: e.target.value })}
                disabled={disabled}
                placeholder="예: 8시간 원데이 이용권 (1회권)"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50"
              />
            </div>

            {/* type */}
            <div>
              <label className="text-xs text-gray-500 mb-1 block">타입 (type)</label>
              <div className="flex gap-2">
                {(['code', 'task'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => updateChoice(idx, { type: t })}
                    disabled={disabled}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                      choice.type === t
                        ? t === 'code' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    } disabled:opacity-50`}
                  >
                    {t === 'code' ? '코드 발급 (skip)' : '업무 등록 (task)'}
                  </button>
                ))}
              </div>
            </div>

            {/* content */}
            <div>
              <label className="text-xs text-gray-500 mb-1 block">
                {choice.type === 'code' ? '응답 메시지 (content) — 코드+안내문 전체' : '안내 메시지 (content) — 정보 수집 전 전송'}
              </label>
              <textarea
                value={choice.content || ''}
                onChange={(e) => updateChoice(idx, { content: e.target.value })}
                disabled={disabled}
                rows={Math.min(12, Math.max(3, (choice.content || '').split('\n').length + 1))}
                placeholder={choice.type === 'code'
                  ? '코드 사용 방법을 포함한 전체 안내문을 입력하세요'
                  : '예: 성함, 연락처 남겨주시면 시간 추가 도와드리겠습니다!'
                }
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y leading-relaxed disabled:bg-gray-50"
                spellCheck={false}
              />
            </div>

            {/* task 전용 필드 */}
            {choice.type === 'task' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">담당 (handler)</label>
                  <input
                    type="text"
                    value={choice.handler || ''}
                    onChange={(e) => updateChoice(idx, { handler: e.target.value })}
                    disabled={disabled}
                    placeholder="op"
                    className="w-full px-3 py-2 text-sm font-mono border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">업무명 (task) — 업무 페이지 표시용</label>
                  <input
                    type="text"
                    value={choice.task || ''}
                    onChange={(e) => updateChoice(idx, { task: e.target.value })}
                    disabled={disabled}
                    placeholder="요청: 리뷰 보상 시간 추가"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      ))}

      {!disabled && (
        <button
          type="button"
          onClick={addChoice}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors w-full justify-center"
        >
          <Plus className="w-3.5 h-3.5" />
          선택지 추가
        </button>
      )}
    </div>
  );
}

// ─── 메인 에디터 ───
export default function TenantItemEditor({ value, onChange, disabled }: TenantItemEditorProps) {
  const [viewMode, setViewMode] = useState<'fields' | 'json'>('fields');
  const [jsonBuffer, setJsonBuffer] = useState('');
  const [jsonError, setJsonError] = useState('');
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editBuffer, setEditBuffer] = useState('');

  const data = value && typeof value === 'object' ? value : {};
  // reviewChoices는 별도 렌더링하므로 일반 필드에서 제외
  const entries = Object.entries(data)
    .filter(([key]) => key !== 'reviewChoices')
    .sort(([a], [b]) => a.localeCompare(b));

  const updateData = (updated: Record<string, unknown>) => {
    onChange('tenantItem', updated);
  };

  const updateField = (key: string, val: unknown) => {
    updateData({ ...data, [key]: val });
  };

  // 필드 추가
  const handleAdd = () => {
    const key = newKey.trim();
    if (!key || disabled) return;
    let parsed: unknown = newValue;
    try {
      if (newValue.startsWith('{') || newValue.startsWith('[') || newValue.startsWith('"')) {
        parsed = JSON.parse(newValue);
      }
    } catch { /* plain string */ }
    updateData({ ...data, [key]: parsed });
    setNewKey('');
    setNewValue('');
  };

  // 필드 삭제
  const handleDelete = (key: string) => {
    if (disabled) return;
    const updated = { ...data };
    delete updated[key];
    updateData(updated);
  };

  // 인라인 편집 시작
  const handleEditStart = (key: string) => {
    if (disabled) return;
    const val = data[key];
    setEditingKey(key);
    setEditBuffer(typeof val === 'object' && val !== null ? JSON.stringify(val, null, 2) : String(val ?? ''));
  };

  // 인라인 편집 저장
  const handleEditSave = () => {
    if (!editingKey || disabled) return;
    let parsed: unknown = editBuffer;
    try {
      if (editBuffer.startsWith('{') || editBuffer.startsWith('[') || editBuffer.startsWith('"')) {
        parsed = JSON.parse(editBuffer);
      }
    } catch { /* plain string */ }
    updateData({ ...data, [editingKey]: parsed });
    setEditingKey(null);
  };

  // JSON 모드 전환
  const handleJsonOpen = () => {
    setJsonBuffer(JSON.stringify(data, null, 2));
    setJsonError('');
    setViewMode('json');
  };

  // JSON 저장
  const handleJsonApply = () => {
    try {
      const parsed = JSON.parse(jsonBuffer);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        setJsonError('최상위는 객체({})여야 합니다');
        return;
      }
      updateData(parsed);
      setViewMode('fields');
    } catch (e: unknown) {
      setJsonError('JSON 파싱 오류: ' + (e instanceof Error ? e.message : String(e)));
    }
  };

  const formatDisplay = (val: unknown): string => {
    if (val === null || val === undefined) return '';
    if (typeof val === 'object') return JSON.stringify(val);
    return String(val);
  };

  const isLong = (val: unknown): boolean => {
    const str = formatDisplay(val);
    return str.length > 80 || str.includes('\n');
  };

  // reviewChoices 데이터
  const reviewChoices = Array.isArray(data.reviewChoices) ? data.reviewChoices as ReviewChoice[] : null;
  const reviewType = data.reviewType as string | undefined;

  return (
    <div className="py-3 border-b border-gray-100 last:border-0">
      <div className="flex flex-col gap-2">
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-gray-600">테넌트 아이템</label>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setViewMode('fields')}
              className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${
                viewMode === 'fields' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <List className="w-3 h-3" />
              필드
            </button>
            <button
              type="button"
              onClick={handleJsonOpen}
              className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${
                viewMode === 'json' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <Code className="w-3 h-3" />
              JSON
            </button>
          </div>
        </div>

        {/* JSON 모드 */}
        {viewMode === 'json' && (
          <div className="space-y-2">
            <textarea
              value={jsonBuffer}
              onChange={(e) => { setJsonBuffer(e.target.value); setJsonError(''); }}
              rows={Math.min(20, Math.max(6, jsonBuffer.split('\n').length + 1))}
              disabled={disabled}
              className="w-full px-3 py-2 text-xs font-mono border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y disabled:bg-gray-50 disabled:text-gray-500"
              spellCheck={false}
            />
            {jsonError && <p className="text-xs text-red-500">{jsonError}</p>}
            {!disabled && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleJsonApply}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  적용
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('fields')}
                  className="px-3 py-1.5 text-xs text-gray-600 hover:text-gray-800 transition-colors"
                >
                  취소
                </button>
              </div>
            )}
          </div>
        )}

        {/* 필드 모드 */}
        {viewMode === 'fields' && (
          <div className="space-y-0 rounded-lg border border-gray-200 overflow-hidden bg-gray-50">
            {/* 일반 필드 목록 */}
            {entries.length === 0 && !reviewChoices ? (
              <div className="px-4 py-6 text-center">
                <p className="text-sm text-gray-400">등록된 필드가 없습니다</p>
                {!disabled && <p className="text-xs text-gray-300 mt-1">아래에서 필드를 추가하세요</p>}
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {entries.map(([key, val]) => (
                  <div key={key} className="px-5 py-4 bg-white group">
                    {editingKey === key ? (
                      /* 편집 모드 */
                      <div className="space-y-3">
                        <p className="text-sm font-mono font-semibold text-gray-600">{key}</p>
                        <textarea
                          value={editBuffer}
                          onChange={(e) => setEditBuffer(e.target.value)}
                          rows={typeof val === 'object' ? Math.min(16, Math.max(6, editBuffer.split('\n').length + 1)) : Math.min(10, Math.max(4, editBuffer.split('\n').length + 1))}
                          className="w-full px-4 py-3 text-sm border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y leading-relaxed"
                          autoFocus
                          spellCheck={false}
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={handleEditSave}
                            className="px-3.5 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                          >
                            확인
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingKey(null)}
                            className="px-3.5 py-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
                          >
                            취소
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* 읽기 모드 */
                      <div className="flex items-start gap-3">
                        <span className="text-sm font-mono font-semibold text-gray-500 w-32 pt-0.5 shrink-0 truncate" title={key}>
                          {key}
                        </span>
                        <div className="flex-1 min-w-0">
                          {isLong(val) ? (
                            <pre className="text-sm text-gray-900 whitespace-pre-wrap break-words leading-relaxed">
                              {formatDisplay(val)}
                            </pre>
                          ) : (
                            <span className="text-sm text-gray-900">
                              {formatDisplay(val) || <span className="text-gray-400">-</span>}
                            </span>
                          )}
                        </div>
                        {!disabled && (
                          <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              type="button"
                              onClick={() => handleEditStart(key)}
                              className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                              title="편집"
                            >
                              <EditPencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(key)}
                              className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                              title="삭제"
                            >
                              <Trash className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* reviewChoices 전용 에디터 (reviewType이 choice일 때) */}
            {reviewType === 'choice' && (
              <div className="border-t border-gray-200 px-5 py-4 bg-white">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-mono font-semibold text-gray-600">reviewChoices</p>
                  {!disabled && !reviewChoices && (
                    <button
                      type="button"
                      onClick={() => updateField('reviewChoices', [{ label: '', type: 'code', content: '' }])}
                      className="text-xs text-blue-600 hover:text-blue-700"
                    >
                      + 선택지 만들기
                    </button>
                  )}
                </div>
                {reviewChoices ? (
                  <ReviewChoicesEditor
                    choices={reviewChoices}
                    onChange={(updated) => updateField('reviewChoices', updated)}
                    disabled={disabled}
                  />
                ) : (
                  <p className="text-sm text-gray-400">선택지가 없습니다</p>
                )}
              </div>
            )}

            {/* 새 필드 추가 */}
            {!disabled && (
              <div className="border-t border-gray-200 px-5 py-5 bg-white space-y-3">
                <p className="text-xs font-medium text-gray-500">새 필드 추가</p>
                <div className="space-y-3">
                  <input
                    type="text"
                    value={newKey}
                    onChange={(e) => setNewKey(e.target.value)}
                    placeholder="키 이름 (예: reviewCode, BotName)"
                    className="w-full px-3 py-2.5 text-sm font-mono border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleAdd(); }}
                  />
                  <textarea
                    value={newValue}
                    onChange={(e) => setNewValue(e.target.value)}
                    placeholder="값을 입력하세요 (텍스트 또는 JSON)"
                    rows={4}
                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y transition-colors leading-relaxed"
                  />
                  <button
                    type="button"
                    onClick={handleAdd}
                    disabled={!newKey.trim()}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium disabled:opacity-30 hover:bg-blue-700 transition-colors"
                    title="추가"
                  >
                    <Plus className="w-4 h-4" />
                    추가
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}