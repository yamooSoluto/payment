'use client';

import { useState, useEffect, useRef, useCallback, useMemo, Fragment } from 'react';
import { Plus, Trash, Xmark, Check, Copy, NavArrowDown, NavArrowUp, NavArrowRight, MoreHoriz, RefreshDouble, Shop, Search, EditPencil } from 'iconoir-react';
import { TenantManageModal, type AppliedTenant, type TenantOption } from './PackageTenantsTab';
import { UndoableInput } from '@/components/ui/UndoableInput';

// ═══════════════════════════════════════════════════════════
// 타입
// ═══════════════════════════════════════════════════════════

export interface KeyDataSource {
  sourceType: 'datasheet' | 'storeinfo';
  topic?: string;           // datasheet: '공간', '시설' 등
  facets?: string[];        // datasheet: ['냉난방규정', '위치']
  matchKeywords?: string[];  // 키워드 필터 (선택)
  sectionId?: string;       // storeinfo: 단일 (하위호환)
  sectionIds?: string[];    // storeinfo: 복수 섹션 선택
  field?: string;           // storeinfo: 특정 필드만 추출
}

export interface FaqTemplate {
  id: string;
  questions: string[];
  answer: string;
  guide: string;
  keyDataRefs: string[];
  keyDataSources?: KeyDataSource[];
  topic: string;
  tags: string[];
  handlerType: 'bot' | 'staff' | 'conditional';
  handler: 'bot' | 'op' | 'manager';
  rule: string;
  action_product: string | null;
  action: string | null;
}

export interface RuleOption {
  id: string;
  platform: string;
  store: string[];
  label: string;
  content: string;
}

export interface PackageData {
  id: string;
  name: string;
  description: string;
  isPublic: boolean;
  provisionMode?: 'manual' | 'auto';
  requiredTags: string[];
  faqTemplates: FaqTemplate[];
  appliedTenants: AppliedTenant[];
  createdAt: string | null;
  updatedAt: string | null;
}

export interface SchemaData {
  topics: Record<string, { id: string; name: string; icon: string }>;
  facets: Record<string, { label: string; aspect: string }>;
  topicFacets: Record<string, string[]>;
  storeinfoSections: Record<string, { id: string; label: string; icon: string; fields?: Record<string, string> }>;
}

export interface TagOptions {
  platforms: string[];
  services: string[];
  brands: string[];
}

export interface PackageFaqTabProps {
  packages: PackageData[];
  rules: RuleOption[];
  allTenants: TenantOption[];
  schemaData: SchemaData | null;
  tagOptions: TagOptions;
  onCreatePackage: (name: string) => Promise<string>;
  onUpdateTemplates: (packageId: string, templates: FaqTemplate[]) => Promise<void>;
  onUpdateMeta: (packageId: string, updates: Record<string, any>) => Promise<void>;
  onDeletePackage: (packageId: string, force?: boolean) => Promise<void>;
  onApplyTenants: (packageId: string, tenantIds: string[]) => Promise<void>;
  onSyncTenants: (packageId: string, tenantIds?: string[]) => Promise<void>;
  onRemoveTenant: (packageId: string, tenantId: string, brandName: string, mode?: 'delete' | 'keep') => Promise<void>;
  onRefresh: () => void;
}

// ═══════════════════════════════════════════════════════════
// 상수
// ═══════════════════════════════════════════════════════════

const TOPIC_OPTIONS = [
  '매장/운영', '시설/환경', '상품/서비스', '예약/주문', '결제/환불',
  '회원/혜택', '기술/접속', '제보/신고', '기타',
];

const HANDLER_OPTIONS = [
  { value: 'bot', label: 'AI 답변' },
  { value: 'op', label: '운영팀' },
  { value: 'manager', label: '현장매니저' },
];

const TAG_OPTIONS = ['문의', '칭찬', '건의', '불만', '요청', '긴급', 'c2c'];

const TAG_COLORS: Record<string, string> = {
  '문의': 'bg-blue-100 text-blue-700',
  '칭찬': 'bg-emerald-100 text-emerald-700',
  '건의': 'bg-yellow-100 text-yellow-700',
  '불만': 'bg-red-100 text-red-700',
  '요청': 'bg-purple-100 text-purple-700',
  '긴급': 'bg-orange-100 text-orange-700',
  'c2c': 'bg-teal-100 text-teal-700',
};

const NAV_FIELDS = ['question', 'topic', 'handler', 'tag', 'keyDataRefs'] as const;
const EDITABLE_FIELDS = new Set(['question', 'topic', 'handler', 'tag']);
const COL_SPAN = 7;

const DEFAULT_WIDTHS: Record<string, number> = { topic: 120, handler: 110, tag: 130, keyDataRefs: 180 };
const NUM_WIDTH = 48;
const MIN_QUESTION_WIDTH = 240;

type SortDir = 'asc' | 'desc';
type SortField = 'question' | 'topic' | 'handler' | 'keyDataRefs' | null;

const FIELD_LABELS: Record<string, string> = {
  question: '질문', topic: 'topic', handler: '처리', keyDataRefs: '규정 참조',
};

function getCellText(t: FaqTemplate, field: string, rules: RuleOption[]): string {
  switch (field) {
    case 'question': return t.questions.join('\n');
    case 'topic': return t.topic || '';
    case 'handler': return HANDLER_OPTIONS.find(o => o.value === t.handler)?.label || t.handler;
    case 'keyDataRefs': return (t.keyDataRefs || []).map(refId => rules.find(r => r.id === refId)?.label || refId).join(', ');
    case 'tag': return (t.tags || []).join(', ');
    default: return '';
  }
}

// templateId → packageId 매핑 빌드
function buildOwnerMap(packages: PackageData[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const pkg of packages) {
    for (const t of pkg.faqTemplates) map.set(t.id, pkg.id);
  }
  return map;
}

// ═══════════════════════════════════════════════════════════
// 규정 멀티셀렉터 (확장 패널용)
// ═══════════════════════════════════════════════════════════

function RuleMultiSelect({
  selected, options, onChange, appliedStores = [],
}: {
  selected: string[]; options: RuleOption[]; appliedStores?: string[];
  onChange: (refs: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const nonEmpty = options.filter(r => r.label.trim() !== '' || r.content.trim() !== '');
  const storeFiltered = appliedStores.length > 0
    ? nonEmpty.filter(r => r.store.includes('공통') || r.store.some(s => appliedStores.includes(s)))
    : nonEmpty;

  const filtered = storeFiltered.filter(r =>
    !search || r.label.toLowerCase().includes(search.toLowerCase()) || r.platform.includes(search) || r.store.some(s => s.includes(search))
  );

  // 삭제된(죽은) 참조 자동 정리
  const alive = selected.filter(id => options.some(r => r.id === id));
  useEffect(() => {
    if (alive.length !== selected.length) onChange(alive);
  }, [alive.length, selected.length]);

  const selectedRules = alive.map(id => options.find(r => r.id === id)!);

  return (
    <div ref={ref} className="relative">
      <div onClick={() => setOpen(!open)}
        className="min-h-[32px] flex flex-wrap gap-1 items-center px-2 py-1 border border-gray-200 rounded-lg cursor-pointer hover:border-gray-300 text-xs">
        {selectedRules.length === 0 ? (
          <span className="text-gray-400">규정 선택...</span>
        ) : selectedRules.map(r => (
          <span key={r.id} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded">
            {r.label}
            <button onClick={e => { e.stopPropagation(); onChange(alive.filter(id => id !== r.id)); }} className="hover:text-red-500">
              <Xmark className="w-3 h-3" />
            </button>
          </span>
        ))}
      </div>
      {open && (
        <div className="absolute z-50 mt-1 w-96 bg-white border border-gray-200 rounded-lg shadow-lg max-h-80 overflow-hidden">
          <div className="p-2.5 border-b border-gray-100">
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="규정 검색..." autoFocus
              className="w-full text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400" />
          </div>
          <div className="overflow-y-auto max-h-64">
            {filtered.length === 0 ? (
              <div className="p-4 text-xs text-gray-400 text-center">결과 없음</div>
            ) : filtered.map(r => {
              const isSel = selected.includes(r.id);
              return (
                <button key={r.id}
                  onClick={() => isSel ? onChange(selected.filter(id => id !== r.id)) : onChange([...selected, r.id])}
                  className={`w-full text-left px-3 py-2.5 text-xs hover:bg-gray-50 flex gap-2.5 border-b border-gray-50 last:border-0 ${isSel ? 'bg-blue-50/60' : ''}`}>
                  <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 mt-0.5 ${isSel ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}`}>
                    {isSel && <Check className="w-2.5 h-2.5 text-white" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-gray-400 shrink-0">[{r.platform}]</span>
                      <span className="font-medium text-gray-700 truncate">{r.label}</span>
                    </div>
                    {r.content && (
                      <div className="text-[11px] text-gray-400 mt-1 line-clamp-2 leading-relaxed whitespace-pre-wrap">{r.content}</div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════
// 규정 참조 미리보기 (접기/펼치기)
// ═══════════════════════════════════════════════════════════

function RulePreviewCollapsible({ refs, rules }: { refs: string[]; rules: RuleOption[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2">
      <button onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-600 transition-colors">
        {open ? <NavArrowDown className="w-3 h-3" /> : <NavArrowRight className="w-3 h-3" />}
        규정 내용 보기 ({refs.length}건)
      </button>
      {open && (
        <div className="mt-1.5 space-y-1.5">
          {refs.map(refId => {
            const rule = rules.find(r => r.id === refId);
            if (!rule) return null;
            return (
              <div key={refId} className="text-[11px] bg-white border border-gray-100 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-gray-700">{rule.label}</span>
                  <span className="text-gray-300">
                    {rule.platform && rule.platform !== '-' ? `플랫폼: ${rule.platform}` : ''}
                    {rule.store?.length > 0 ? `${rule.platform && rule.platform !== '-' ? '  ' : ''}매장: ${rule.store.join(', ')}` : ''}
                  </span>
                </div>
                {rule.content && (
                  <div className="text-gray-500 whitespace-pre-wrap leading-relaxed">{rule.content}</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 변수 매핑 삽입기
// ═══════════════════════════════════════════════════════════

// 변수 정의: 기본 변수
const BASE_VAR_LABELS: Record<string, string> = {
  brandName: '매장명',
};

// schemaData에서 섹션별 변수 정의를 가져오는 헬퍼
function getSectionVarDefs(schemaData: SchemaData | null): Record<string, { label: string; icon: string; fields: Record<string, string> }> {
  if (!schemaData?.storeinfoSections) return {};
  const result: Record<string, { label: string; icon: string; fields: Record<string, string> }> = {};
  for (const [sectionId, sec] of Object.entries(schemaData.storeinfoSections)) {
    result[sectionId] = {
      label: sec.label,
      icon: sec.icon,
      fields: sec.fields || {},
    };
  }
  return result;
}

// 템플릿의 keyDataSources에서 사용 가능한 변수 목록 계산
function getAvailableVars(template: FaqTemplate, schemaData: SchemaData | null): { key: string; label: string; group?: string }[] {
  const vars: { key: string; label: string; group?: string }[] = [
    { key: 'brandName', label: '매장명', group: '기본' },
  ];
  const sectionDefs = getSectionVarDefs(schemaData);
  const sources = template.keyDataSources || [];
  const addedSections = new Set<string>();

  for (const src of sources) {
    if (src.sourceType === 'storeinfo') {
      const ids = src.sectionIds || (src.sectionId ? [src.sectionId] : []);
      for (const sid of ids) {
        if (addedSections.has(sid)) continue;
        addedSections.add(sid);
        const def = sectionDefs[sid];
        if (!def || !def.fields) continue;
        if (src.field && def.fields[`${sid}.${src.field}`]) {
          vars.push({ key: `${sid}.${src.field}`, label: def.fields[`${sid}.${src.field}`], group: def.label });
        } else {
          for (const [k, v] of Object.entries(def.fields)) {
            vars.push({ key: k, label: v, group: def.label });
          }
        }
      }
    }
  }
  return vars;
}

// VAR_LABELS: textToHtml에서 사용 (변수키 → 라벨 맵, schemaData 기반으로 동적 생성)
function buildVarLabels(schemaData: SchemaData | null): Record<string, string> {
  const map: Record<string, string> = { ...BASE_VAR_LABELS };
  const sectionDefs = getSectionVarDefs(schemaData);
  for (const sec of Object.values(sectionDefs)) {
    if (sec.fields) {
      for (const [k, v] of Object.entries(sec.fields)) {
        map[k] = v;
      }
    }
  }
  return map;
}

// contentEditable에서 plain text 추출 (chip → {{key}})
function extractText(el: HTMLElement): string {
  let result = '';
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      result += node.textContent || '';
    } else if (node instanceof HTMLElement) {
      if (node.dataset.var) {
        result += `{{${node.dataset.var}}}`;
      } else if (node.tagName === 'BR') {
        result += '\n';
      } else if (node.tagName === 'DIV' || node.tagName === 'P') {
        if (result.length > 0 && !result.endsWith('\n')) result += '\n';
        result += extractText(node);
      } else {
        result += extractText(node);
      }
    }
  }
  return result;
}

// plain text → HTML ({{key}} → chip span)
function textToHtml(text: string, varLabels?: Record<string, string>): string {
  if (!text) return '';
  const labels = varLabels || {};
  const escaped = text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return escaped
    .replace(/\{\{(\w[\w.]*)\}\}/g, (_, key) => {
      const label = labels[key] || key;
      return `<span contenteditable="false" data-var="${key}" style="display:inline-flex;align-items:center;padding:1px 8px;margin:0 2px;font-size:12px;font-weight:500;background:#ede9fe;color:#7c3aed;border:1px solid #c4b5fd;border-radius:6px;cursor:default;user-select:all;vertical-align:baseline;line-height:1.6">${label}</span>`;
    })
    .replace(/\n/g, '<br>');
}

// ChipEditor: insertVar를 외부에 노출
interface ChipEditorHandle {
  insertVar: (key: string) => void;
}

function ChipEditor({ value, onChange, minRows = 3, placeholder, onFocus, editorHandleRef, varLabels }: {
  value: string; onChange: (v: string) => void; minRows?: number; placeholder?: string;
  onFocus?: () => void;
  editorHandleRef?: React.MutableRefObject<ChipEditorHandle | null>;
  varLabels?: Record<string, string>;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const lastValueRef = useRef(value);
  const isComposing = useRef(false);

  // 초기 마운트 시 HTML 설정
  const initialized = useRef(false);
  useEffect(() => {
    if (!editorRef.current) return;
    if (!initialized.current) {
      editorRef.current.innerHTML = textToHtml(value, varLabels) || '';
      initialized.current = true;
      lastValueRef.current = value;
      return;
    }
    const currentText = extractText(editorRef.current);
    if (currentText !== value) {
      const sel = window.getSelection();
      const hadFocus = document.activeElement === editorRef.current;
      editorRef.current.innerHTML = textToHtml(value, varLabels) || '';
      if (hadFocus && sel) {
        const range = document.createRange();
        range.selectNodeContents(editorRef.current);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }
    lastValueRef.current = value;
  }, [value]);

  const handleInput = useCallback(() => {
    if (isComposing.current) return;
    if (!editorRef.current) return;
    const newText = extractText(editorRef.current);
    if (newText !== lastValueRef.current) {
      lastValueRef.current = newText;
      onChange(newText);
    }
  }, [onChange]);

  const insertVar = useCallback((key: string) => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) {
      // 끝에 삽입
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
    const label = (varLabels || {})[key] || key;
    const chip = document.createElement('span');
    chip.contentEditable = 'false';
    chip.dataset.var = key;
    chip.style.cssText = 'display:inline-flex;align-items:center;padding:1px 8px;margin:0 2px;font-size:12px;font-weight:500;background:#ede9fe;color:#7c3aed;border:1px solid #c4b5fd;border-radius:6px;cursor:default;user-select:all;vertical-align:baseline;line-height:1.6';
    chip.textContent = label;
    const range = sel!.getRangeAt(0);
    range.deleteContents();
    range.insertNode(chip);
    // 커서를 칩 뒤로
    const after = document.createTextNode('\u200B');
    chip.after(after);
    range.setStartAfter(after);
    range.collapse(true);
    sel!.removeAllRanges();
    sel!.addRange(range);
    handleInput();
  }, [handleInput]);

  // editorHandleRef로 insertVar 노출
  useEffect(() => {
    if (editorHandleRef) {
      editorHandleRef.current = { insertVar };
    }
    return () => { if (editorHandleRef) editorHandleRef.current = null; };
  }, [insertVar, editorHandleRef]);

  const minH = Math.max(60, minRows * 24);

  return (
    <div onClick={e => e.stopPropagation()}>
      <div className="relative">
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          onFocus={onFocus}
          onCompositionStart={() => { isComposing.current = true; }}
          onCompositionEnd={() => { isComposing.current = false; handleInput(); }}
          onPaste={e => {
            e.preventDefault();
            const text = e.clipboardData.getData('text/plain');
            document.execCommand('insertText', false, text);
          }}
          data-expand
          className="w-full text-sm px-3 py-2.5 bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 focus:bg-white transition-colors overflow-y-auto whitespace-pre-wrap break-words leading-relaxed"
          style={{ minHeight: minH }}
        />
        {!value && placeholder && (
          <div className="absolute top-2.5 left-3 text-sm text-gray-400 pointer-events-none">{placeholder}</div>
        )}
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════
// 변수 삽입 패널 컴포넌트
// ═══════════════════════════════════════════════════════════

function VarInsertPanel({ template, schemaData, onInsert }: {
  template: FaqTemplate;
  schemaData: SchemaData | null;
  onInsert: (key: string) => void;
}) {
  const [previewSection, setPreviewSection] = useState<string | null>(null);
  const sectionDefs = getSectionVarDefs(schemaData);
  const availVars = getAvailableVars(template, schemaData);
  const groups = new Map<string, { key: string; label: string }[]>();
  for (const v of availVars) {
    const g = v.group || '기본';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(v);
  }

  return (
    <div className="mt-3 pt-3 border-t border-stone-100">
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">변수 삽입</span>
        <span className="text-[10px] text-gray-300">클릭 → 커서에 삽입 · 그룹명 클릭 → 필드 미리보기</span>
      </div>
      <div className="space-y-1.5">
        {Array.from(groups.entries()).map(([group, vars]) => {
          // 해당 그룹의 섹션 키 찾기
          const sectionKey = Object.entries(sectionDefs).find(([, d]) => d.label === group)?.[0];
          const sectionDef = sectionKey ? sectionDefs[sectionKey] : null;
          const isPreview = previewSection === group;

          return (
            <div key={group}>
              <div className="flex items-start gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); setPreviewSection(isPreview ? null : group); }}
                  className={`text-[10px] shrink-0 pt-0.5 min-w-[40px] transition-colors cursor-pointer hover:text-violet-500 ${isPreview ? 'text-violet-600 font-semibold' : 'text-gray-400'}`}
                  title="클릭하면 필드 구조 미리보기">
                  {sectionDef ? `${sectionDef.icon} ${group}` : group} {sectionDef && (isPreview ? '▾' : '▸')}
                </button>
                {vars.map(v => (
                  <div key={v.key} className="relative group/var">
                    <button type="button"
                      onClick={e => { e.stopPropagation(); onInsert(v.key); }}
                      className="inline-flex items-center gap-0.5 px-2 py-0.5 text-[11px] font-medium bg-violet-50 text-violet-600 rounded-md border border-violet-200 hover:bg-violet-100 hover:border-violet-300 transition-colors cursor-pointer">
                      {v.label}
                    </button>
                    {/* 호버 툴팁 */}
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover/var:block z-50 pointer-events-none">
                      <div className="bg-gray-800 text-white text-[10px] rounded-md px-2.5 py-1.5 whitespace-nowrap shadow-lg">
                        <div className="font-mono text-violet-300">{`{{${v.key}}}`}</div>
                        <div className="text-gray-300 mt-0.5">적용 시 매장의 실제 {v.label} 값으로 치환</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* 섹션 필드 구조 미리보기 */}
              {isPreview && sectionDef && (
                <div className="ml-[48px] mt-1 mb-1 bg-stone-50 border border-stone-200 rounded-lg p-2.5 text-[11px]" onClick={e => e.stopPropagation()}>
                  <div className="text-[10px] text-gray-400 mb-1.5">매장 적용 시 아래 형식으로 keyData에 저장됩니다</div>
                  <div className="space-y-0.5 font-mono text-gray-600">
                    {Object.entries(sectionDef.fields).map(([fKey, fLabel]) => (
                      <div key={fKey} className="flex items-center gap-2">
                        <span className="text-violet-500">{fLabel}</span>
                        <span className="text-gray-300">:</span>
                        <span className="text-gray-400 italic">{`{매장의 ${fLabel} 값}`}</span>
                        <span className="text-gray-300 ml-auto text-[9px]">{`{{${fKey}}}`}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 pt-1.5 border-t border-stone-200 text-[10px] text-gray-400">
                    답변/가이드에서 <span className="font-mono text-violet-500">{`{{${Object.keys(sectionDef.fields)[0]}}}`}</span> 형태로 사용 → 적용 시 실제 값으로 치환
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {availVars.length <= 1 && (
        <p className="text-[10px] text-gray-300 mt-1.5">우측 데이터 소스에서 섹션을 연결하면 해당 변수를 사용할 수 있습니다</p>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 데이터 소스 편집
// ═══════════════════════════════════════════════════════════

function KeyDataSourceEditor({
  sources, schemaData, onChange,
}: {
  sources: KeyDataSource[];
  schemaData: SchemaData | null;
  onChange: (sources: KeyDataSource[]) => void;
}) {
  const topics = schemaData?.topics || {};
  const topicFacets = schemaData?.topicFacets || {};
  const facetDefs = schemaData?.facets || {};
  const sections = schemaData?.storeinfoSections || {};

  const updateSource = (idx: number, patch: Partial<KeyDataSource>) => {
    const next = sources.map((s, i) => i === idx ? { ...s, ...patch } : s);
    onChange(next);
  };

  const removeSource = (idx: number) => onChange(sources.filter((_, i) => i !== idx));

  const addSource = () => onChange([...sources, { sourceType: 'datasheet' }]);

  if (!schemaData) {
    return <div className="text-xs text-gray-400">스키마 로딩 중...</div>;
  }

  return (
    <div className="space-y-3">
      {sources.map((src, idx) => (
        <div key={idx} className="relative border border-gray-200 rounded-xl p-3.5 bg-white">
          <button onClick={() => removeSource(idx)}
            className="absolute top-2.5 right-2.5 p-0.5 text-gray-300 hover:text-red-500 rounded">
            <Xmark className="w-3.5 h-3.5" />
          </button>

          {/* 소스 타입 */}
          <div className="flex gap-1.5 mb-3">
            {(['datasheet', 'storeinfo'] as const).map(st => (
              <button key={st} onClick={() => updateSource(idx, {
                sourceType: st, topic: undefined, facets: undefined,
                matchKeywords: undefined, sectionId: undefined, sectionIds: undefined,
              })}
                className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                  src.sourceType === st ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}>
                {st === 'datasheet' ? '데이터시트' : '매장정보'}
              </button>
            ))}
          </div>

          {src.sourceType === 'datasheet' ? (
            <div className="space-y-2.5">
              {/* 토글 */}
              <div>
                <label className="text-xs text-gray-500 font-medium">토픽</label>
                <select value={src.topic || ''} onChange={e => updateSource(idx, { topic: e.target.value || undefined, facets: [] })}
                  className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white">
                  <option value="">선택...</option>
                  {Object.entries(topics).map(([key, t]) => (
                    <option key={key} value={key}>{t.icon} {t.name}</option>
                  ))}
                </select>
              </div>

              {/* 컬럼(facets) */}
              {src.topic && topicFacets[src.topic] && (
                <div>
                  <label className="text-xs text-gray-500 font-medium">컬럼</label>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {topicFacets[src.topic].map(fKey => {
                      const isSelected = (src.facets || []).includes(fKey);
                      const label = facetDefs[fKey]?.label || fKey;
                      return (
                        <button key={fKey} onClick={() => {
                          const next = isSelected
                            ? (src.facets || []).filter(f => f !== fKey)
                            : [...(src.facets || []), fKey];
                          updateSource(idx, { facets: next });
                        }}
                          className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                            isSelected ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                          }`}>
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 키워드 필터 */}
              <div>
                <label className="text-xs text-gray-500 font-medium">키워드 필터 (선택)</label>
                <input value={(src.matchKeywords || []).join(', ')}
                  onChange={e => updateSource(idx, {
                    matchKeywords: e.target.value.split(',').map(s => s.trim()).filter(Boolean),
                  })}
                  placeholder="스터디룸, 집중실, ..."
                  className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400" />
              </div>
            </div>
          ) : (
            <div>
              <label className="text-xs text-gray-500 font-medium">섹션 {(src.sectionIds || (src.sectionId ? [src.sectionId] : [])).length > 0 && <span className="text-blue-500">({(src.sectionIds || (src.sectionId ? [src.sectionId] : [])).length}개 연결)</span>}</label>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {Object.entries(sections).map(([key, s]) => {
                  const selected = (src.sectionIds || (src.sectionId ? [src.sectionId] : []));
                  const isSelected = selected.includes(key);
                  return (
                    <button key={key} onClick={() => {
                      const next = isSelected
                        ? selected.filter(k => k !== key)
                        : [...selected, key];
                      updateSource(idx, { sectionIds: next, sectionId: undefined });
                    }}
                      className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                        isSelected ? 'bg-violet-50 text-violet-700 border-violet-200' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                      }`}>
                      {s.icon} {s.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ))}

      <button onClick={addSource}
        className="text-sm text-blue-500 hover:text-blue-700 flex items-center gap-1">
        <Plus className="w-3.5 h-3.5" /> 소스 추가
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Topic 드롭다운
// ═══════════════════════════════════════════════════════════

function TopicSelect({ value, onChange, onClose }: { value: string; onChange: (v: string) => void; onClose: () => void }) {
  const options = ['', ...TOPIC_OPTIONS];
  const [focused, setFocused] = useState(() => Math.max(0, options.indexOf(value)));
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => { listRef.current?.focus(); }, []);
  useEffect(() => { (listRef.current?.children[focused] as HTMLElement)?.scrollIntoView({ block: 'nearest' }); }, [focused]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); setFocused(i => Math.min(i + 1, options.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); setFocused(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); onChange(options[focused]); onClose(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); }
  }, [focused, options, onChange, onClose]);

  return (
    <div data-dropdown className="relative w-full">
      <div ref={listRef} data-dropdown tabIndex={-1} onKeyDown={handleKeyDown}
        className="absolute z-50 top-full left-0 mt-1 w-44 bg-white border border-gray-200 rounded-lg shadow-lg max-h-[240px] overflow-y-auto py-1 outline-none">
        {options.map((opt, i) => (
          <button key={opt || '__empty__'} onClick={() => { onChange(opt); onClose(); }} onMouseEnter={() => setFocused(i)}
            className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${i === focused ? 'bg-blue-50' : 'hover:bg-gray-50'} ${value === opt ? 'text-blue-600 font-medium' : opt === '' ? 'text-gray-400' : 'text-gray-600'}`}>
            {opt ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-violet-50 text-violet-700 border border-violet-100">{opt}</span> : '-'}
          </button>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Handler 드롭다운
// ═══════════════════════════════════════════════════════════

function HandlerSelect({ value, onChange, onClose }: { value: string; onChange: (v: string) => void; onClose: () => void }) {
  const [focused, setFocused] = useState(() => Math.max(0, HANDLER_OPTIONS.findIndex(o => o.value === value)));
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => { listRef.current?.focus(); }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); setFocused(i => Math.min(i + 1, HANDLER_OPTIONS.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); setFocused(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); onChange(HANDLER_OPTIONS[focused].value); onClose(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); }
  }, [focused, onChange, onClose]);

  const handlerColor = (v: string) => v === 'bot' ? 'bg-green-50 text-green-700 border-green-100' : v === 'op' ? 'bg-amber-50 text-amber-700 border-amber-100' : 'bg-red-50 text-red-700 border-red-100';

  return (
    <div data-dropdown className="relative w-full">
      <div ref={listRef} data-dropdown tabIndex={-1} onKeyDown={handleKeyDown}
        className="absolute z-50 top-full left-0 mt-1 w-40 bg-white border border-gray-200 rounded-lg shadow-lg py-1 outline-none">
        {HANDLER_OPTIONS.map((opt, i) => (
          <button key={opt.value} onClick={() => { onChange(opt.value); onClose(); }} onMouseEnter={() => setFocused(i)}
            className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${i === focused ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${handlerColor(opt.value)}`}>{opt.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 대상 필터 셀렉터 (requiredTags — 플랫폼/서비스)
// ═══════════════════════════════════════════════════════════

function RequiredTagsSelector({ tags, tagOptions, onChange }: {
  tags: string[];
  tagOptions: TagOptions;
  onChange: (tags: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  useEffect(() => {
    if (!open || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    setDropUp(spaceBelow < 260);
  }, [open]);

  const allOptions = [
    ...tagOptions.platforms.map(p => ({ value: p, group: '플랫폼' })),
    ...tagOptions.services.map(s => ({ value: s, group: '서비스' })),
    ...(tagOptions.brands || []).map(b => ({ value: b, group: '브랜드' })),
  ];

  const toggle = (val: string) => {
    onChange(tags.includes(val) ? tags.filter(t => t !== val) : [...tags, val]);
  };

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 px-2 py-1 text-[11px] text-gray-500 hover:bg-gray-100 rounded-md transition-colors">
        {tags.length > 0 ? (
          <span className="flex items-center gap-1">
            {tags.map(t => (
              <span key={t} className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded text-[11px] font-medium">{t}</span>
            ))}
          </span>
        ) : (
          <span className="text-gray-400">전체 대상</span>
        )}
        <NavArrowDown className="w-3 h-3 text-gray-300" />
      </button>
      {open && (
        <div className={`absolute left-0 z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[180px] ${dropUp ? 'bottom-full mb-1' : 'top-full mt-1'}`}
          data-dropdown onClick={e => e.stopPropagation()}>
          <div className="px-3 py-1.5 text-[10px] text-gray-400 font-medium">대상 필터 (플랫폼/서비스)</div>
          <button onClick={() => { onChange([]); setOpen(false); }}
            className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${tags.length === 0 ? 'bg-blue-50 text-blue-600' : 'hover:bg-gray-50 text-gray-600'}`}>
            전체 (필터 없음)
          </button>
          {['플랫폼', '서비스', '브랜드'].map(group => {
            const items = allOptions.filter(o => o.group === group);
            if (items.length === 0) return null;
            return (
              <Fragment key={group}>
                <div className="px-3 pt-2 pb-1 text-[10px] text-gray-400 font-medium border-t border-gray-100 mt-1">{group}</div>
                {items.map(opt => {
                  const active = tags.includes(opt.value);
                  return (
                    <button key={opt.value} onClick={() => toggle(opt.value)}
                      className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 transition-colors ${active ? 'bg-blue-50 text-blue-600' : 'hover:bg-gray-50 text-gray-600'}`}>
                      <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center text-[10px] ${active ? 'bg-blue-500 border-blue-500 text-white' : 'border-gray-300'}`}>
                        {active && <Check className="w-2.5 h-2.5" />}
                      </span>
                      {opt.value}
                    </button>
                  );
                })}
              </Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 리사이즈 헤더
// ═══════════════════════════════════════════════════════════

function ResizableHeader({ field, active, dir, onSort, onResizeStart, className, children, isLast }: {
  field: string; active: SortField; dir: SortDir;
  onSort: (f: SortField) => void; onResizeStart: (field: string, e: React.MouseEvent) => void;
  className?: string; children: React.ReactNode; isLast?: boolean;
}) {
  const isActive = active === field;
  return (
    <th className={`${className} relative cursor-pointer select-none hover:bg-stone-50 transition-colors group/th`} onClick={() => onSort(field as SortField)}>
      <div className="flex items-center gap-1">
        {children}
        <span className={`transition-opacity ${isActive ? 'opacity-100' : 'opacity-0 group-hover/th:opacity-40'}`}>
          {isActive && dir === 'desc' ? <NavArrowUp className="w-3 h-3" /> : <NavArrowDown className="w-3 h-3" />}
        </span>
      </div>
      {!isLast && (
        <div onMouseDown={(e) => onResizeStart(field, e)}
          className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-blue-400/50 active:bg-blue-500/60 z-10" />
      )}
    </th>
  );
}

// ═══════════════════════════════════════════════════════════
// 패키지 생성 모달
// ═══════════════════════════════════════════════════════════

function CreatePackageModal({ tagOptions, defaultTags, onSubmit, onClose }: {
  tagOptions: TagOptions;
  defaultTags: string[];
  onSubmit: (name: string, tags: string[]) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [tags, setTags] = useState<string[]>(defaultTags);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const allOptions = [
    ...tagOptions.platforms.map(p => ({ value: p, group: '플랫폼' })),
    ...tagOptions.services.map(s => ({ value: s, group: '서비스' })),
    ...(tagOptions.brands || []).map(b => ({ value: b, group: '브랜드' })),
  ];

  const toggle = (val: string) => {
    setTags(prev => prev.includes(val) ? prev.filter(t => t !== val) : [...prev, val]);
  };

  const handleSubmit = () => {
    if (!name.trim()) return;
    onSubmit(name.trim(), tags);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-[420px] overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-6 pt-5 pb-4">
          <h3 className="text-base font-bold text-gray-900 mb-4">새 패키지</h3>

          {/* 이름 */}
          <div className="mb-4">
            <label className="text-xs font-medium text-gray-500 mb-1.5 block">패키지 이름</label>
            <input
              ref={inputRef}
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.nativeEvent.isComposing) return; if (e.key === 'Enter') handleSubmit(); if (e.key === 'Escape') onClose(); }}
              placeholder="예: 락커 이용 안내"
              className="w-full text-sm px-3.5 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
            />
          </div>

          {/* 대상 태그 */}
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1.5 block">
              대상 그룹 <span className="text-gray-300 font-normal">(선택하면 해당 그룹에 자동 배치)</span>
            </label>
            {allOptions.length === 0 ? (
              <p className="text-xs text-gray-400">설정된 플랫폼/서비스가 없습니다.</p>
            ) : (
              <div className="space-y-2">
                {['플랫폼', '서비스', '브랜드'].map(group => {
                  const items = allOptions.filter(o => o.group === group);
                  if (items.length === 0) return null;
                  return (
                    <div key={group}>
                      <span className="text-[10px] text-gray-400 font-medium uppercase">{group}</span>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {items.map(opt => {
                          const active = tags.includes(opt.value);
                          return (
                            <button key={opt.value} type="button" onClick={() => toggle(opt.value)}
                              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                                active
                                  ? 'bg-blue-50 text-blue-700 border-blue-200 shadow-sm'
                                  : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                              }`}>
                              {opt.value}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {tags.length > 0 && (
              <div className="mt-2 flex items-center gap-1.5 text-xs text-gray-400">
                배치 그룹: <span className="font-medium text-gray-600">{tags.join(' · ')}</span>
                <button onClick={() => setTags([])} className="text-gray-300 hover:text-red-400 ml-1">
                  <Xmark className="w-3 h-3" />
                </button>
              </div>
            )}
            {tags.length === 0 && (
              <p className="mt-2 text-xs text-gray-400">&quot;공통&quot; 그룹에 배치됩니다.</p>
            )}
          </div>
        </div>

        {/* 하단 버튼 */}
        <div className="flex items-center justify-end gap-2 px-6 py-3.5 bg-stone-50 border-t border-stone-100">
          <button onClick={onClose}
            className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
            취소
          </button>
          <button onClick={handleSubmit} disabled={!name.trim()}
            className="px-4 py-2 text-sm font-semibold text-white bg-gray-900 hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-40 disabled:bg-gray-300">
            생성
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 패키지 이름 인라인 편집
// ═══════════════════════════════════════════════════════════

function InlinePackageName({ name, onSave }: { name: string; onSave: (name: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);

  useEffect(() => { setValue(name); }, [name]);

  if (!editing) {
    return (
      <span
        className="text-[13px] font-semibold text-gray-700 cursor-pointer hover:text-blue-600 transition-colors group/pkgname"
        onClick={() => setEditing(true)}
        title="클릭하여 이름 편집"
      >
        {name}
        <EditPencil className="w-3 h-3 ml-1 text-gray-300 inline opacity-0 group-hover/pkgname:opacity-100 transition-opacity" />
      </span>
    );
  }

  return (
    <input
      autoFocus
      value={value}
      onChange={e => setValue(e.target.value)}
      onBlur={() => { if (value.trim() && value.trim() !== name) onSave(value.trim()); setEditing(false); }}
      onKeyDown={e => {
        if (e.nativeEvent.isComposing) return;
        if (e.key === 'Enter') { if (value.trim() && value.trim() !== name) onSave(value.trim()); setEditing(false); }
        if (e.key === 'Escape') { setValue(name); setEditing(false); }
      }}
      className="text-[13px] font-semibold text-gray-700 bg-white border border-blue-300 rounded-lg px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400 w-48"
    />
  );
}

// ═══════════════════════════════════════════════════════════
// 패키지 메뉴 (···)
// ═══════════════════════════════════════════════════════════

function PackageMenu({ pkg, onUpdateMeta, onDelete, onClose }: {
  pkg: PackageData;
  onUpdateMeta: (updates: Record<string, any>) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [editingDesc, setEditingDesc] = useState(false);
  const [descVal, setDescVal] = useState(pkg.description);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div ref={ref} data-dropdown className="absolute z-50 right-0 top-full mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg py-1">
      {/* 설명 */}
      <div className="px-3 py-2.5 border-b border-gray-100">
        <label className="text-[10px] text-gray-400 font-medium mb-1 block">설명</label>
        {editingDesc ? (
          <div>
            <textarea autoFocus value={descVal} onChange={e => setDescVal(e.target.value)} rows={2}
              onKeyDown={e => { if (e.key === 'Escape') setEditingDesc(false); }}
              className="w-full text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 resize-y" />
            <div className="flex justify-end gap-1 mt-1.5">
              <button onClick={() => setEditingDesc(false)} className="text-xs text-gray-400 hover:text-gray-600 px-2 py-0.5">취소</button>
              <button onClick={() => { onUpdateMeta({ description: descVal }); setEditingDesc(false); }}
                className="text-xs text-blue-600 font-medium px-2 py-0.5 hover:bg-blue-50 rounded">저장</button>
            </div>
          </div>
        ) : (
          <div className="group/desc flex items-start gap-1.5 cursor-pointer" onClick={() => setEditingDesc(true)}>
            <span className="text-xs text-gray-500 flex-1">{pkg.description || '설명 없음'}</span>
            <EditPencil className="w-3 h-3 text-gray-300 shrink-0 mt-0.5 opacity-0 group-hover/desc:opacity-100 transition-opacity" />
          </div>
        )}
      </div>

      {/* 탭 전환 */}
      <div className="border-t border-gray-100 pt-1">
        <button onClick={() => {
          const newMode = (pkg.provisionMode || 'manual') === 'manual' ? 'auto' : 'manual';
          onUpdateMeta({ provisionMode: newMode });
          onClose();
        }}
          className="w-full text-left px-3 py-2 text-xs text-gray-600 hover:bg-gray-50 transition-colors">
          {(pkg.provisionMode || 'manual') === 'manual' ? '자동 규칙으로 전환' : '수동 패키지로 전환'}
        </button>
      </div>

      {/* 삭제 */}
      <div className="border-t border-gray-100">
        <button onClick={onDelete}
          className="w-full text-left px-3 py-2 text-xs text-red-500 hover:bg-red-50 transition-colors">
          패키지 삭제
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 메인 컴포넌트
// ═══════════════════════════════════════════════════════════

export default function PackageFaqTab({
  packages, rules, allTenants, schemaData, tagOptions,
  onCreatePackage, onUpdateTemplates, onUpdateMeta, onDeletePackage,
  onApplyTenants, onSyncTenants, onRemoveTenant, onRefresh,
}: PackageFaqTabProps) {
  // 로컬 편집 상태
  const [localPackages, setLocalPackages] = useState<PackageData[]>(packages);
  const [dirtyPkgIds, setDirtyPkgIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);

  // ── 자동 저장 (debounce 2초) ──
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyPkgIdsRef = useRef(dirtyPkgIds);
  const localPackagesRef = useRef(localPackages);
  dirtyPkgIdsRef.current = dirtyPkgIds;
  localPackagesRef.current = localPackages;

  const flushAutoSave = useCallback(async () => {
    const ids = dirtyPkgIdsRef.current;
    const pkgs = localPackagesRef.current;
    if (ids.size === 0) return;
    setSaving(true);
    const promises = Array.from(ids).map(pkgId => {
      const pkg = pkgs.find(p => p.id === pkgId);
      if (!pkg) return Promise.resolve();
      const filtered = pkg.faqTemplates.filter(t => t.questions.some(q => q.trim() !== ''));
      return onUpdateTemplates(pkgId, filtered);
    });
    await Promise.allSettled(promises);
    setDirtyPkgIds(new Set());
    setLastSavedAt(Date.now());
    setSaving(false);
  }, [onUpdateTemplates]);

  // dirty 변경 시 debounce 자동저장 트리거
  useEffect(() => {
    if (dirtyPkgIds.size === 0) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => { flushAutoSave(); }, 2000);
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
  }, [dirtyPkgIds, flushAutoSave]);

  // "저장됨" 표시 3초 후 페이드
  useEffect(() => {
    if (!lastSavedAt) return;
    const t = setTimeout(() => setLastSavedAt(null), 3000);
    return () => clearTimeout(t);
  }, [lastSavedAt]);

  // 언마운트 또는 탭 이탈 시 즉시 저장
  useEffect(() => {
    const handleBeforeUnload = () => { if (dirtyPkgIdsRef.current.size > 0) flushAutoSave(); };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
      if (dirtyPkgIdsRef.current.size > 0) flushAutoSave();
    };
  }, [flushAutoSave]);

  // 셀 선택/편집
  const [selectedCell, setSelectedCell] = useState<{ id: string; field: string } | null>(null);
  const [editingCell, setEditingCell] = useState<{ id: string; field: string } | null>(null);
  const [checkedRows, setCheckedRows] = useState<Set<string>>(new Set());
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [moveMenu, setMoveMenu] = useState<{ templateId: string; mode: 'move' | 'copy' } | null>(null);

  // 범위 선택 (드래그)
  const [rangeAnchor, setRangeAnchor] = useState<{ id: string; field: string } | null>(null);
  const [rangeEnd, setRangeEnd] = useState<{ id: string; field: string } | null>(null);
  const isDragging = useRef(false);

  // 그룹 접기
  const [collapsedPkgs, setCollapsedPkgs] = useState<Set<string>>(new Set());
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // 정렬
  const [sortField, setSortField] = useState<SortField>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // 칼럼 너비
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(DEFAULT_WIDTHS);
  const [questionWidth, setQuestionWidth] = useState<number | null>(null);
  const resizing = useRef<{ field: string; startX: number; startW: number } | null>(null);

  // 탭
  const [activeTab, setActiveTab] = useState<'manual' | 'auto' | 'rules' | 'synonyms'>('manual');

  // 필터
  const [filterText, setFilterText] = useState('');
  const [filterGroup, setFilterGroup] = useState<string>('all');
  const [filterPublic, setFilterPublic] = useState<'all' | 'public' | 'private'>('all');

  // 모달/메뉴
  const [tenantModalPkgId, setTenantModalPkgId] = useState<string | null>(null);
  const [menuPkgId, setMenuPkgId] = useState<string | null>(null);
  const [createModal, setCreateModal] = useState<{ defaultTags: string[] } | null>(null);

  const tableRef = useRef<HTMLDivElement>(null);

  // Undo / Redo (Airtable 방식: 셀 단위 스냅샷)
  type HistoryEntry = { templateId: string; pkgId: string; field: string; oldValue: any; newValue: any };
  const undoStack = useRef<HistoryEntry[]>([]);
  const redoStack = useRef<HistoryEntry[]>([]);
  const editSnapshot = useRef<{ templateId: string; pkgId: string; field: string; value: any } | null>(null);

  const fixedSum = Object.values(columnWidths).reduce((a, b) => a + b, 0);
  const effectiveQuestionW = questionWidth ?? MIN_QUESTION_WIDTH;
  const tableMinWidth = 24 + NUM_WIDTH + fixedSum + effectiveQuestionW;

  // templateId → packageId
  const ownerMap = useMemo(() => buildOwnerMap(localPackages), [localPackages]);

  // 부모 packages 변경 시 반영
  useEffect(() => {
    setLocalPackages(packages);
    setDirtyPkgIds(new Set());
  }, [packages]);

  // ── 셀 선택/편집 헬퍼 ──
  const isSelected = (id: string, field: string) => selectedCell?.id === id && selectedCell?.field === field;
  const isEditing = (id: string, field: string) => editingCell?.id === id && editingCell?.field === field;

  const selectCell = useCallback((id: string, field: string) => {
    setSelectedCell({ id, field }); setEditingCell(null); setMoveMenu(null);
    setRangeAnchor({ id, field }); setRangeEnd({ id, field });
  }, []);
  const startEdit = useCallback((id: string, field: string) => {
    if (!EDITABLE_FIELDS.has(field)) return;
    // 스냅샷: 셀 진입 시점의 값 캡처
    const pkgId = ownerMap.get(id);
    if (pkgId) {
      const pkg = localPackages.find(p => p.id === pkgId);
      const tpl = pkg?.faqTemplates.find(t => t.id === id);
      if (tpl) {
        const val = (tpl as any)[field];
        editSnapshot.current = { templateId: id, pkgId, field, value: JSON.parse(JSON.stringify(val ?? null)) };
      }
    }
    setSelectedCell({ id, field }); setEditingCell({ id, field });
    setRangeAnchor(null); setRangeEnd(null);
  }, [ownerMap, localPackages]);
  const stopEdit = useCallback(() => {
    // 셀 벗어날 때: 스냅샷 대비 변경됐으면 undo 엔트리 1건 생성
    if (editSnapshot.current) {
      const snap = editSnapshot.current;
      const pkg = localPackages.find(p => p.id === snap.pkgId);
      const tpl = pkg?.faqTemplates.find(t => t.id === snap.templateId);
      if (tpl) {
        const cur = (tpl as any)[snap.field];
        if (JSON.stringify(snap.value) !== JSON.stringify(cur)) {
          undoStack.current.push({ templateId: snap.templateId, pkgId: snap.pkgId, field: snap.field, oldValue: snap.value, newValue: cur });
          redoStack.current = [];
        }
      }
      editSnapshot.current = null;
    }
    setEditingCell(null);
    requestAnimationFrame(() => tableRef.current?.focus());
  }, [localPackages]);
  const deselectAll = useCallback(() => { setSelectedCell(null); setEditingCell(null); setRangeAnchor(null); setRangeEnd(null); }, []);

  // 드래그 셀 선택 핸들러
  const handleCellMouseDown = useCallback((id: string, field: string, e: React.MouseEvent) => {
    if (e.button !== 0) return; // 좌클릭만
    if ((e.target as HTMLElement).closest('[data-dropdown]')) return;
    if (e.shiftKey && rangeAnchor) {
      // Shift+클릭: 앵커에서 현재까지 범위 확장
      e.preventDefault();
      setRangeEnd({ id, field });
      setSelectedCell({ id, field });
      setEditingCell(null);
    } else {
      isDragging.current = true;
      setRangeAnchor({ id, field }); setRangeEnd({ id, field });
      setSelectedCell({ id, field }); setEditingCell(null);
    }
  }, [rangeAnchor]);

  const handleCellMouseEnter = useCallback((id: string, field: string) => {
    if (!isDragging.current) return;
    setRangeEnd({ id, field });
    setSelectedCell({ id, field });
  }, []);

  // 클릭 아웃사이드
  useEffect(() => {
    if (!selectedCell && !editingCell) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('[data-dropdown]') || target.closest('[data-cell]') || target.closest('[data-expand]')) return;
      deselectAll();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [selectedCell, editingCell, deselectAll]);

  // ── 필드 편집 ──
  // immediate: true → 비텍스트 필드(tag, topic, handler 등) 토글 시 즉시 undo 스택에 쌓음
  const editTemplate = useCallback((templateId: string, field: string, value: any, immediate?: boolean) => {
    const pkgId = ownerMap.get(templateId);
    if (!pkgId) return;
    // answer/guide 필드: 리터럴 \n을 실제 줄바꿈으로 변환
    if ((field === 'answer' || field === 'guide') && typeof value === 'string' && value.includes('\\n')) {
      value = value.replace(/\\n/g, '\n');
    }
    setLocalPackages(prev => {
      const pkgIdx = prev.findIndex(p => p.id === pkgId);
      if (pkgIdx === -1) return prev;
      const tpl = prev[pkgIdx].faqTemplates.find(t => t.id === templateId);
      if (!tpl) return prev;
      const old = (tpl as any)[field];
      if (JSON.stringify(old) === JSON.stringify(value)) return prev;
      // 즉시 변경(토글 등)은 바로 undo에 쌓고, 텍스트 입력은 stopEdit에서 셀 단위로 쌓음
      if (immediate) {
        undoStack.current.push({ templateId, pkgId, field, oldValue: old, newValue: value });
        redoStack.current = [];
      }
      const updated = prev.map(pkg => {
        if (pkg.id !== pkgId) return pkg;
        return { ...pkg, faqTemplates: pkg.faqTemplates.map(t => t.id === templateId ? { ...t, [field]: value } : t) };
      });
      setDirtyPkgIds(p => new Set(p).add(pkgId));
      return updated;
    });
  }, [ownerMap]);

  // FAQ 추가
  const handleAddFaq = useCallback((pkgId: string) => {
    const newT: FaqTemplate = {
      id: `ft_${Date.now().toString(36)}`,
      questions: [''], answer: '', guide: '',
      keyDataRefs: [], topic: '', tags: [],
      handlerType: 'bot', handler: 'bot',
      rule: '', action_product: null, action: null,
    };
    setLocalPackages(prev => prev.map(pkg => {
      if (pkg.id !== pkgId) return pkg;
      return { ...pkg, faqTemplates: [...pkg.faqTemplates, newT] };
    }));
    setDirtyPkgIds(prev => new Set(prev).add(pkgId));
    setSelectedCell({ id: newT.id, field: 'question' });
    setEditingCell({ id: newT.id, field: 'question' });
    // 접힌 상태면 펼치기
    setCollapsedPkgs(prev => { const n = new Set(prev); n.delete(pkgId); return n; });
  }, []);

  // FAQ 삭제
  const handleDeleteFaq = useCallback((templateId: string) => {
    const pkgId = ownerMap.get(templateId);
    if (!pkgId) return;
    const pkg = localPackages.find(p => p.id === pkgId);
    const t = pkg?.faqTemplates.find(tp => tp.id === templateId);
    if (t) {
      const hasContent = t.questions.some(q => q.trim()) || t.answer.trim();
      const hasRefs = (t.keyDataRefs || []).length > 0;
      if (hasContent || hasRefs) {
        const name = t.questions[0]?.trim() || "(제목 없음)";
        const refMsg = hasRefs ? "\n규정 참조 " + t.keyDataRefs.length + "개 연결됨" : "";
        if (!confirm(name + " 삭제하시겠습니까?" + refMsg)) return;
      }
    }
    setLocalPackages(prev => prev.map(p => {
      if (p.id !== pkgId) return p;
      return { ...p, faqTemplates: p.faqTemplates.filter(tp => tp.id !== templateId) };
    }));
    setDirtyPkgIds(prev => new Set(prev).add(pkgId));
    if (editingCell?.id === templateId) setEditingCell(null);
    if (selectedCell?.id === templateId) setSelectedCell(null);
  }, [ownerMap, localPackages, editingCell, selectedCell]);

  // FAQ 복제
  const handleDuplicateFaq = useCallback((templateId: string) => {
    const pkgId = ownerMap.get(templateId);
    if (!pkgId) return;
    setLocalPackages(prev => prev.map(pkg => {
      if (pkg.id !== pkgId) return pkg;
      const srcIdx = pkg.faqTemplates.findIndex(t => t.id === templateId);
      if (srcIdx < 0) return pkg;
      const src = pkg.faqTemplates[srcIdx];
      const dup: FaqTemplate = { ...src, id: `ft_${Date.now().toString(36)}`, questions: [...src.questions], keyDataRefs: [...(src.keyDataRefs || [])], tags: [...(src.tags || [])] };
      const next = [...pkg.faqTemplates];
      next.splice(srcIdx + 1, 0, dup);
      return { ...pkg, faqTemplates: next };
    }));
    setDirtyPkgIds(prev => new Set(prev).add(pkgId));
  }, [ownerMap]);

  // FAQ 다른 패키지로 이동/복제
  const handleMoveFaq = useCallback((templateId: string, targetPkgId: string, mode: 'move' | 'copy') => {
    const srcPkgId = ownerMap.get(templateId);
    if (!srcPkgId || srcPkgId === targetPkgId) return;

    setLocalPackages(prev => {
      const srcPkg = prev.find(p => p.id === srcPkgId);
      const template = srcPkg?.faqTemplates.find(t => t.id === templateId);
      if (!template) return prev;

      const copied: FaqTemplate = {
        ...template,
        id: `ft_${Date.now().toString(36)}`,
        questions: [...template.questions],
        keyDataRefs: [...(template.keyDataRefs || [])],
        tags: [...(template.tags || [])],
      };

      return prev.map(pkg => {
        if (pkg.id === targetPkgId) {
          return { ...pkg, faqTemplates: [...pkg.faqTemplates, copied] };
        }
        if (mode === 'move' && pkg.id === srcPkgId) {
          return { ...pkg, faqTemplates: pkg.faqTemplates.filter(t => t.id !== templateId) };
        }
        return pkg;
      });
    });

    setDirtyPkgIds(prev => {
      const next = new Set(prev);
      next.add(targetPkgId);
      if (mode === 'move' && srcPkgId) next.add(srcPkgId);
      return next;
    });
    setMoveMenu(null);
    if (mode === 'move') {
      if (editingCell?.id === templateId) setEditingCell(null);
      if (selectedCell?.id === templateId) setSelectedCell(null);
    }
  }, [ownerMap, editingCell, selectedCell]);

  // 질문 편집
  const handleQuestionChange = (templateId: string, idx: number, value: string) => {
    const pkgId = ownerMap.get(templateId);
    if (!pkgId) return;
    // // 로 구분된 복수 질문 자동 분리 (;는 같은 질문 내 구분자로 유지)
    if (value.includes('//')) {
      const parts = value.split('//').map(s => s.trim()).filter(Boolean);
      if (parts.length > 1) {
        setLocalPackages(prev => prev.map(pkg => {
          if (pkg.id !== pkgId) return pkg;
          return { ...pkg, faqTemplates: pkg.faqTemplates.map(t => {
            if (t.id !== templateId) return t;
            const newQ = [...t.questions];
            newQ.splice(idx, 1, ...parts);
            return { ...t, questions: newQ };
          }) };
        }));
        setDirtyPkgIds(prev => new Set(prev).add(pkgId));
        return;
      }
    }
    setLocalPackages(prev => prev.map(pkg => {
      if (pkg.id !== pkgId) return pkg;
      return { ...pkg, faqTemplates: pkg.faqTemplates.map(t => {
        if (t.id !== templateId) return t;
        const newQ = [...t.questions]; newQ[idx] = value;
        return { ...t, questions: newQ };
      }) };
    }));
    setDirtyPkgIds(prev => new Set(prev).add(pkgId));
  };

  const handleAddQuestion = (templateId: string) => {
    const pkgId = ownerMap.get(templateId);
    if (!pkgId) return;
    setLocalPackages(prev => prev.map(pkg => {
      if (pkg.id !== pkgId) return pkg;
      return { ...pkg, faqTemplates: pkg.faqTemplates.map(t => t.id !== templateId ? t : { ...t, questions: [...t.questions, ''] }) };
    }));
    setDirtyPkgIds(prev => new Set(prev).add(pkgId));
  };

  const handleRemoveQuestion = (templateId: string, idx: number) => {
    const pkgId = ownerMap.get(templateId);
    if (!pkgId) return;
    setLocalPackages(prev => prev.map(pkg => {
      if (pkg.id !== pkgId) return pkg;
      return { ...pkg, faqTemplates: pkg.faqTemplates.map(t => {
        if (t.id !== templateId) return t;
        const newQ = t.questions.filter((_, i) => i !== idx);
        return { ...t, questions: newQ.length > 0 ? newQ : [''] };
      }) };
    }));
    setDirtyPkgIds(prev => new Set(prev).add(pkgId));
  };

  // ── 정렬 ──
  const handleSort = (field: SortField) => {
    if (resizing.current) return;
    if (sortField === field) {
      if (sortDir === 'asc') setSortDir('desc');
      else { setSortField(null); setSortDir('asc'); }
    } else { setSortField(field); setSortDir('asc'); }
  };

  // 정렬된 템플릿 (그룹 내)
  const sortTemplates = useCallback((templates: FaqTemplate[]) => {
    if (!sortField) return templates;
    return [...templates].sort((a, b) => {
      let av: string, bv: string;
      switch (sortField) {
        case 'question': av = a.questions[0] || ''; bv = b.questions[0] || ''; break;
        case 'topic': av = a.topic || ''; bv = b.topic || ''; break;
        case 'handler': av = a.handler; bv = b.handler; break;
        case 'keyDataRefs': av = String((a.keyDataRefs || []).length); bv = String((b.keyDataRefs || []).length); break;
        default: av = ''; bv = '';
      }
      const cmp = av.localeCompare(bv);
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [sortField, sortDir]);

  // 전체 넘버링 (접히지 않은 모든 행 포함)
  const globalNumbering = useMemo(() => {
    const map = new Map<string, number>();
    let n = 0;
    for (const pkg of localPackages) {
      for (const t of pkg.faqTemplates) { n++; map.set(t.id, n); }
    }
    return map;
  }, [localPackages]);

  // 키보드 네비게이션용 visible rows
  const visibleRows = useMemo(() => {
    return localPackages.flatMap(pkg =>
      collapsedPkgs.has(pkg.id) ? [] : sortTemplates(pkg.faqTemplates)
    );
  }, [localPackages, collapsedPkgs, sortTemplates]);

  // ── 범위 선택 계산 ──
  const rangeRect = useMemo(() => {
    if (!rangeAnchor || !rangeEnd) return null;
    const rowIds = visibleRows.map(t => t.id);
    const r1 = rowIds.indexOf(rangeAnchor.id);
    const r2 = rowIds.indexOf(rangeEnd.id);
    const c1 = NAV_FIELDS.indexOf(rangeAnchor.field as typeof NAV_FIELDS[number]);
    const c2 = NAV_FIELDS.indexOf(rangeEnd.field as typeof NAV_FIELDS[number]);
    if (r1 < 0 || r2 < 0 || c1 < 0 || c2 < 0) return null;
    return {
      rowStart: Math.min(r1, r2), rowEnd: Math.max(r1, r2),
      colStart: Math.min(c1, c2), colEnd: Math.max(c1, c2),
    };
  }, [rangeAnchor, rangeEnd, visibleRows]);

  const isInRange = useCallback((id: string, field: string) => {
    if (!rangeRect) return false;
    const rowIds = visibleRows.map(t => t.id);
    const r = rowIds.indexOf(id);
    const c = NAV_FIELDS.indexOf(field as typeof NAV_FIELDS[number]);
    if (r < 0 || c < 0) return false;
    return r >= rangeRect.rowStart && r <= rangeRect.rowEnd && c >= rangeRect.colStart && c <= rangeRect.colEnd;
  }, [rangeRect, visibleRows]);

  const hasRange = rangeRect !== null && (rangeRect.rowStart !== rangeRect.rowEnd || rangeRect.colStart !== rangeRect.colEnd);

  // 드래그 mouseup 리스너
  useEffect(() => {
    if (!isDragging.current) return;
    const onUp = () => { isDragging.current = false; };
    document.addEventListener('mouseup', onUp);
    return () => document.removeEventListener('mouseup', onUp);
  });

  // ── 칼럼 리사이즈 ──
  const handleResizeStart = useCallback((field: string, e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (field === 'question') {
      const th = (e.target as HTMLElement).closest('th');
      const startW = questionWidth ?? (th?.offsetWidth || MIN_QUESTION_WIDTH);
      resizing.current = { field: 'question', startX: e.clientX, startW };
    } else {
      resizing.current = { field, startX: e.clientX, startW: columnWidths[field] || DEFAULT_WIDTHS[field] };
    }
    const onMove = (ev: MouseEvent) => {
      if (!resizing.current) return;
      const newW = Math.max(60, resizing.current.startW + (ev.clientX - resizing.current.startX));
      if (resizing.current.field === 'question') setQuestionWidth(newW);
      else setColumnWidths(prev => ({ ...prev, [resizing.current!.field]: newW }));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      requestAnimationFrame(() => { resizing.current = null; });
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [columnWidths, questionWidth]);

  // ── 복사/붙여넣기 ──
  const handleCopy = useCallback(() => {
    if (!selectedCell) return;
    // 범위 선택 시 전체 범위 복사 (TSV)
    if (hasRange && rangeRect) {
      const rowIds = visibleRows.map(t => t.id);
      const lines: string[] = [];
      for (let r = rangeRect.rowStart; r <= rangeRect.rowEnd; r++) {
        const tpl = visibleRows[r];
        if (!tpl) continue;
        const cols: string[] = [];
        for (let c = rangeRect.colStart; c <= rangeRect.colEnd; c++) {
          cols.push(getCellText(tpl, NAV_FIELDS[c], rules));
        }
        lines.push(cols.join('\t'));
      }
      navigator.clipboard.writeText(lines.join('\n')).then(() => {
        setCopyFeedback(true); setTimeout(() => setCopyFeedback(false), 1200);
      });
      return;
    }
    // 단일 셀 복사
    const pkg = localPackages.find(p => p.faqTemplates.some(t => t.id === selectedCell.id));
    const t = pkg?.faqTemplates.find(tp => tp.id === selectedCell.id);
    if (!t) return;
    navigator.clipboard.writeText(getCellText(t, selectedCell.field, rules)).then(() => {
      setCopyFeedback(true); setTimeout(() => setCopyFeedback(false), 1200);
    });
  }, [selectedCell, localPackages, rules, hasRange, rangeRect, visibleRows]);

  const handlePaste = useCallback(async () => {
    if (!selectedCell || editingCell || !EDITABLE_FIELDS.has(selectedCell.field)) return;
    try {
      const text = await navigator.clipboard.readText();
      if (!text) return;
      const { id, field } = selectedCell;
      if (field === 'topic') { const v = text.trim(); if (TOPIC_OPTIONS.includes(v) || v === '') editTemplate(id, 'topic', v); }
      else if (field === 'handler') {
        const opt = HANDLER_OPTIONS.find(o => o.value === text.trim().toLowerCase() || o.label === text.trim());
        if (opt) { editTemplate(id, 'handler', opt.value); editTemplate(id, 'handlerType', opt.value === 'bot' ? 'bot' : 'staff'); }
      } else if (field === 'tag') {
        const tag = text.trim();
        if (TAG_OPTIONS.includes(tag)) editTemplate(id, 'tags', [tag]);
      }
    } catch { /* clipboard denied */ }
  }, [selectedCell, editingCell, editTemplate]);

  const handleClearCell = useCallback(() => {
    if (!selectedCell || editingCell || !EDITABLE_FIELDS.has(selectedCell.field)) return;
    const { id, field } = selectedCell;
    if (field === 'topic') editTemplate(id, 'topic', '');
    else if (field === 'handler') { editTemplate(id, 'handler', 'bot'); editTemplate(id, 'handlerType', 'bot'); }
    else if (field === 'tag') editTemplate(id, 'tags', []);
  }, [selectedCell, editingCell, editTemplate]);

  // ── 키보드 ──
  const handleUndo = useCallback(() => {
    const entry = undoStack.current.pop();
    if (!entry) return;
    redoStack.current.push(entry);
    setLocalPackages(prev => prev.map(pkg => {
      if (pkg.id !== entry.pkgId) return pkg;
      return { ...pkg, faqTemplates: pkg.faqTemplates.map(t =>
        t.id === entry.templateId ? { ...t, [entry.field]: entry.oldValue } : t
      ) };
    }));
    setDirtyPkgIds(p => new Set(p).add(entry.pkgId));
  }, []);

  const handleRedo = useCallback(() => {
    const entry = redoStack.current.pop();
    if (!entry) return;
    undoStack.current.push(entry);
    setLocalPackages(prev => prev.map(pkg => {
      if (pkg.id !== entry.pkgId) return pkg;
      return { ...pkg, faqTemplates: pkg.faqTemplates.map(t =>
        t.id === entry.templateId ? { ...t, [entry.field]: entry.newValue } : t
      ) };
    }));
    setDirtyPkgIds(p => new Set(p).add(entry.pkgId));
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // 편집 중: 브라우저 네이티브 undo 사용 (UndoableInput), Escape만 처리
    if (editingCell) {
      if (e.key === 'Escape') { e.preventDefault(); stopEdit(); }
      return;
    }
    // 편집 중이 아닐 때: 셀 단위 undo/redo 스택 사용
    if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
      e.preventDefault();
      if (e.shiftKey) handleRedo(); else handleUndo();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'y') {
      e.preventDefault();
      handleRedo();
      return;
    }
    if (!selectedCell) return;

    const rowIds = visibleRows.map(t => t.id);
    const rowIdx = rowIds.indexOf(selectedCell.id);
    const colIdx = NAV_FIELDS.indexOf(selectedCell.field as typeof NAV_FIELDS[number]);
    if (rowIdx < 0 || colIdx < 0) return;

    switch (e.key) {
      case 'ArrowUp': {
        e.preventDefault();
        if (e.shiftKey) {
          const end = rangeEnd || selectedCell;
          const endRow = rowIds.indexOf(end.id);
          if (endRow > 0) { const next = { id: rowIds[endRow - 1], field: end.field }; setRangeEnd(next); setSelectedCell(next); }
        } else if (rowIdx > 0) { const next = { id: rowIds[rowIdx - 1], field: selectedCell.field }; setSelectedCell(next); setRangeAnchor(next); setRangeEnd(next); }
        break;
      }
      case 'ArrowDown': {
        e.preventDefault();
        if (e.shiftKey) {
          const end = rangeEnd || selectedCell;
          const endRow = rowIds.indexOf(end.id);
          if (endRow < rowIds.length - 1) { const next = { id: rowIds[endRow + 1], field: end.field }; setRangeEnd(next); setSelectedCell(next); }
        } else if (rowIdx < rowIds.length - 1) { const next = { id: rowIds[rowIdx + 1], field: selectedCell.field }; setSelectedCell(next); setRangeAnchor(next); setRangeEnd(next); }
        break;
      }
      case 'ArrowLeft': {
        e.preventDefault();
        if (e.shiftKey) {
          const end = rangeEnd || selectedCell;
          const endCol = NAV_FIELDS.indexOf(end.field as typeof NAV_FIELDS[number]);
          if (endCol > 0) { const next = { id: end.id, field: NAV_FIELDS[endCol - 1] }; setRangeEnd(next); setSelectedCell(next); }
        } else if (colIdx > 0) { const next = { id: selectedCell.id, field: NAV_FIELDS[colIdx - 1] }; setSelectedCell(next); setRangeAnchor(next); setRangeEnd(next); }
        break;
      }
      case 'ArrowRight': {
        e.preventDefault();
        if (e.shiftKey) {
          const end = rangeEnd || selectedCell;
          const endCol = NAV_FIELDS.indexOf(end.field as typeof NAV_FIELDS[number]);
          if (endCol < NAV_FIELDS.length - 1) { const next = { id: end.id, field: NAV_FIELDS[endCol + 1] }; setRangeEnd(next); setSelectedCell(next); }
        } else if (colIdx < NAV_FIELDS.length - 1) { const next = { id: selectedCell.id, field: NAV_FIELDS[colIdx + 1] }; setSelectedCell(next); setRangeAnchor(next); setRangeEnd(next); }
        break;
      }
      case 'Tab': {
        e.preventDefault();
        if (e.shiftKey) {
          if (colIdx > 0) setSelectedCell({ id: selectedCell.id, field: NAV_FIELDS[colIdx - 1] });
          else if (rowIdx > 0) setSelectedCell({ id: rowIds[rowIdx - 1], field: NAV_FIELDS[NAV_FIELDS.length - 1] });
        } else {
          if (colIdx < NAV_FIELDS.length - 1) setSelectedCell({ id: selectedCell.id, field: NAV_FIELDS[colIdx + 1] });
          else if (rowIdx < rowIds.length - 1) setSelectedCell({ id: rowIds[rowIdx + 1], field: NAV_FIELDS[0] });
        }
        break;
      }
      case 'Enter': {
        e.preventDefault();
        if (e.shiftKey) {
          const pkgId = ownerMap.get(selectedCell.id);
          if (pkgId) handleAddFaq(pkgId);
        } else if (EDITABLE_FIELDS.has(selectedCell.field)) {
          startEdit(selectedCell.id, selectedCell.field);
        }
        break;
      }
      case 'Escape': e.preventDefault(); deselectAll(); break;
      case 'Delete': case 'Backspace': e.preventDefault(); handleClearCell(); break;
      default:
        if ((e.metaKey || e.ctrlKey) && e.key === 'c') { e.preventDefault(); handleCopy(); }
        if ((e.metaKey || e.ctrlKey) && e.key === 'v') { e.preventDefault(); handlePaste(); }
        break;
    }
  }, [editingCell, selectedCell, rangeEnd, visibleRows, ownerMap, stopEdit, startEdit, deselectAll, handleCopy, handlePaste, handleClearCell, handleAddFaq, handleUndo, handleRedo]);

  // ── 저장 (자동저장으로 대체, 수동 호출용 래퍼) ──
  const handleSave = useCallback(async () => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    await flushAutoSave();
  }, [flushAutoSave]);

  // 일괄 삭제
  const handleBulkDelete = useCallback(() => {
    const ids = Array.from(checkedRows);
    if (!confirm(ids.length + "개 FAQ를 삭제하시겠습니까?")) return;
    const affectedPkgs = new Set<string>();
    for (const id of ids) { const pkgId = ownerMap.get(id); if (pkgId) affectedPkgs.add(pkgId); }
    setLocalPackages(prev => prev.map(pkg => {
      if (!affectedPkgs.has(pkg.id)) return pkg;
      return { ...pkg, faqTemplates: pkg.faqTemplates.filter(t => !checkedRows.has(t.id)) };
    }));
    setDirtyPkgIds(prev => { const n = new Set(prev); affectedPkgs.forEach(id => n.add(id)); return n; });
    setCheckedRows(new Set());
  }, [checkedRows, ownerMap]);

  // 새 패키지 (모달 오픈)
  const handleCreatePkg = useCallback((defaultTags: string[] = []) => {
    setCreateModal({ defaultTags });
  }, []);

  // 모달에서 실제 생성
  const handleCreatePkgSubmit = useCallback(async (name: string, tags: string[]) => {
    setCreateModal(null);
    try {
      const id = await onCreatePackage(name);
      const mode = activeTab as 'manual' | 'auto';
      const updates: Record<string, any> = { provisionMode: mode };
      if (tags.length > 0) updates.requiredTags = tags;
      await onUpdateMeta(id, updates);
      setLocalPackages(prev => [...prev, {
        id, name, description: '', isPublic: false,
        provisionMode: mode,
        requiredTags: tags, faqTemplates: [], appliedTenants: [],
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      }]);
    } catch (err: any) { alert(err.message || '생성 실패'); }
  }, [onCreatePackage, onUpdateMeta, activeTab]);

  // 패키지 삭제
  const handleDeletePkg = useCallback(async (pkgId: string) => {
    const pkg = localPackages.find(p => p.id === pkgId);
    if (!pkg) return;
    const tenantCount = pkg.appliedTenants.length;
    const force = tenantCount > 0;
    const msg = force
      ? pkg.name + " 패키지를 삭제합니다.\n적용된 매장 " + tenantCount + "곳이 있습니다. 강제 삭제하시겠습니까?"
      : pkg.name + " 패키지를 삭제하시겠습니까?";
    if (!confirm(msg)) return;
    try {
      await onDeletePackage(pkgId, force);
      setLocalPackages(prev => prev.filter(p => p.id !== pkgId));
    } catch (err: any) { alert(err.message || '삭제 실패'); }
  }, [localPackages, onDeletePackage]);

  // 패키지 메타 업데이트 (로컬 즉시 반영 + API)
  const handleUpdatePkgMeta = useCallback(async (pkgId: string, updates: Record<string, any>) => {
    setLocalPackages(prev => prev.map(p => p.id === pkgId ? { ...p, ...updates } : p));
    try { await onUpdateMeta(pkgId, updates); } catch (err: any) { alert(err.message || '업데이트 실패'); }
  }, [onUpdateMeta]);

  // 셀 클래스
  const th = 'h-10 px-4 text-left text-[11px] font-semibold text-gray-400 tracking-wider uppercase';
  const td = 'h-[48px] px-4 border-b border-stone-100';
  const cellText = 'text-[13px] text-gray-700 truncate leading-normal';
  const muted = 'text-sm text-gray-300';

  const cellCls = (id: string, field: string, extra?: string) => {
    const sel = isSelected(id, field) && !isEditing(id, field);
    const inRange = !sel && hasRange && isInRange(id, field);
    return [td, extra || '', sel ? 'ring-2 ring-inset ring-blue-400 bg-blue-50/20' : inRange ? 'bg-blue-50/40 ring-1 ring-inset ring-blue-200' : ''].filter(Boolean).join(' ');
  };

  const handlerColor = (v: string) => v === 'bot' ? 'bg-green-50 text-green-700 border-green-100' : v === 'op' ? 'bg-amber-50 text-amber-700 border-amber-100' : 'bg-red-50 text-red-700 border-red-100';
  const handlerLabel = (v: string) => v === 'bot' ? 'AI' : v === 'op' ? '운영' : '현장';

  const expandedId = editingCell?.field === 'question' ? editingCell.id : null;

  // 변수 패널: 마지막 포커스된 에디터에 삽입
  const answerHandleRef = useRef<ChipEditorHandle | null>(null);
  const guideHandleRef = useRef<ChipEditorHandle | null>(null);
  const lastFocusedEditor = useRef<'answer' | 'guide'>('answer');

  // 행 드래그 순서 변경
  const dragRowId = useRef<string | null>(null);
  const dragOverRowId = useRef<string | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null);

  const handleRowDragStart = useCallback((e: React.DragEvent, templateId: string) => {
    dragRowId.current = templateId;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', templateId);
    (e.currentTarget as HTMLElement).style.opacity = '0.4';
  }, []);

  const handleRowDragEnd = useCallback((e: React.DragEvent) => {
    (e.currentTarget as HTMLElement).style.opacity = '1';
    dragRowId.current = null;
    dragOverRowId.current = null;
    setDragOverTarget(null);
  }, []);

  const handleRowDragOver = useCallback((e: React.DragEvent, templateId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverRowId.current !== templateId) {
      dragOverRowId.current = templateId;
      setDragOverTarget(templateId);
    }
  }, []);

  const handleRowDrop = useCallback((e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const srcId = dragRowId.current;
    if (!srcId || srcId === targetId) return;
    const srcPkgId = ownerMap.get(srcId);
    const tgtPkgId = ownerMap.get(targetId);
    if (!srcPkgId || srcPkgId !== tgtPkgId) return; // 같은 패키지 내에서만
    setLocalPackages(prev => prev.map(pkg => {
      if (pkg.id !== srcPkgId) return pkg;
      const templates = [...pkg.faqTemplates];
      const srcIdx = templates.findIndex(t => t.id === srcId);
      const tgtIdx = templates.findIndex(t => t.id === targetId);
      if (srcIdx < 0 || tgtIdx < 0) return pkg;
      const [moved] = templates.splice(srcIdx, 1);
      templates.splice(tgtIdx, 0, moved);
      return { ...pkg, faqTemplates: templates };
    }));
    setDirtyPkgIds(prev => new Set(prev).add(srcPkgId));
    dragRowId.current = null;
    setDragOverTarget(null);
  }, [ownerMap]);
  const varLabels = useMemo(() => buildVarLabels(schemaData), [schemaData]);

  const hasDirty = dirtyPkgIds.size > 0;

  // 탭별 필터링
  const tabPackages = localPackages.filter(pkg => (pkg.provisionMode || 'manual') === activeTab);
  const manualCount = localPackages.filter(p => (p.provisionMode || 'manual') === 'manual').length;
  const autoCount = localPackages.filter(p => p.provisionMode === 'auto').length;

  // 그룹 옵션 (필터 드롭다운용) — 탭 기준
  const groupOptions = useMemo(() => {
    const keys = new Set<string>();
    for (const pkg of tabPackages) {
      const key = (pkg.requiredTags || []).length > 0 ? pkg.requiredTags.join(' · ') : '공통';
      keys.add(key);
    }
    return [...keys].sort((a, b) => {
      if (a === '공통') return 1;
      if (b[0] === '공통') return -1;
      return a.localeCompare(b);
    });
  }, [tabPackages]);

  // 필터 적용
  const filteredPackages = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    return tabPackages.filter(pkg => {
      // 공개/비공개 필터
      if (filterPublic === 'public' && !pkg.isPublic) return false;
      if (filterPublic === 'private' && pkg.isPublic) return false;
      // 그룹 필터
      if (filterGroup !== 'all') {
        const key = (pkg.requiredTags || []).length > 0 ? pkg.requiredTags.join(' · ') : '공통';
        if (key !== filterGroup) return false;
      }
      // 텍스트 검색
      if (q) {
        const nameMatch = pkg.name.toLowerCase().includes(q);
        const faqMatch = pkg.faqTemplates.some(t =>
          t.questions.some(qn => qn.toLowerCase().includes(q)) ||
          t.answer.toLowerCase().includes(q)
        );
        if (!nameMatch && !faqMatch) return false;
      }
      return true;
    });
  }, [tabPackages, filterText, filterGroup, filterPublic]);

  const totalFaqs = filteredPackages.reduce((sum, p) => sum + p.faqTemplates.length, 0);

  // requiredTags 기반 그룹핑
  const groupedPackages = useMemo(() => {
    const groups = new Map<string, PackageData[]>();
    for (const pkg of filteredPackages) {
      const key = (pkg.requiredTags || []).length > 0 ? pkg.requiredTags.join(' · ') : '공통';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(pkg);
    }
    return [...groups.entries()].sort((a, b) => {
      if (a[0] === '공통') return 1;
      if (b[0] === '공통') return -1;
      return a[0].localeCompare(b[0]);
    });
  }, [filteredPackages]);

  // 매장 관리 모달 대상 패키지
  const tenantModalPkg = tenantModalPkgId ? localPackages.find(p => p.id === tenantModalPkgId) : null;

  return (
    <div>
      {/* 탭 */}
      <div className="flex gap-1 mb-4">
        <button onClick={() => setActiveTab('manual')}
          className={`px-4 py-2 text-sm font-semibold rounded-xl transition-all ${
            activeTab === 'manual'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-400 hover:text-gray-600 hover:bg-white/50'
          }`}>
          FAQ 패키지 {manualCount > 0 && <span className="ml-1 text-xs text-gray-400">({manualCount})</span>}
        </button>
        <button onClick={() => setActiveTab('auto')}
          className={`px-4 py-2 text-sm font-semibold rounded-xl transition-all ${
            activeTab === 'auto'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-400 hover:text-gray-600 hover:bg-white/50'
          }`}>
          자동 FAQ 규칙 {autoCount > 0 && <span className="ml-1 text-xs text-gray-400">({autoCount})</span>}
        </button>
        <button onClick={() => setActiveTab('rules')}
          className={`px-4 py-2 text-sm font-semibold rounded-xl transition-all ${
            activeTab === 'rules'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-400 hover:text-gray-600 hover:bg-white/50'
          }`}>
          참조 데이터
        </button>
        <button onClick={() => setActiveTab('synonyms')}
          className={`px-4 py-2 text-sm font-semibold rounded-xl transition-all ${
            activeTab === 'synonyms'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-400 hover:text-gray-600 hover:bg-white/50'
          }`}>
          동의어 사전
        </button>
      </div>

      {/* 참조 데이터 탭 */}
      {activeTab === 'rules' && <RulesTab allTenants={allTenants} />}

      {/* 동의어 사전 탭 */}
      {activeTab === 'synonyms' && <SynonymTab />}

      {/* 테이블 wrapper */}
      {(activeTab === 'manual' || activeTab === 'auto') && <div className="overflow-visible">
        <div ref={tableRef} className="outline-none" tabIndex={0} onKeyDown={handleKeyDown}>

          {/* 필터 + 툴바 */}
          <div className="bg-white rounded-2xl shadow-sm mb-4">
            <div className="flex items-center gap-3 px-5 py-3">
              {/* 검색 */}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-300" />
                <input
                  value={filterText}
                  onChange={e => setFilterText(e.target.value)}
                  placeholder="패키지명, 질문 검색..."
                  className="w-48 pl-8 pr-3 py-1.5 text-xs rounded-lg bg-stone-100 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 placeholder:text-gray-400 transition-colors"
                />
                {filterText && (
                  <button onClick={() => setFilterText('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500">
                    <Xmark className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* 그룹 필터 */}
              <select
                value={filterGroup}
                onChange={e => setFilterGroup(e.target.value)}
                className="text-xs rounded-lg px-2.5 py-1.5 bg-stone-100 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 text-gray-600 min-w-[100px]"
              >
                <option value="all">전체 그룹</option>
                {groupOptions.map(g => <option key={g} value={g}>{g}</option>)}
              </select>

              {/* 공개 필터 */}
              <div className="flex items-center bg-stone-100 rounded-lg p-0.5">
                {([['all', '전체'], ['public', '공개'], ['private', '비공개']] as const).map(([val, label]) => (
                  <button key={val}
                    onClick={() => setFilterPublic(val)}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-all ${
                      filterPublic === val
                        ? 'bg-white text-gray-700 shadow-sm'
                        : 'text-gray-400 hover:text-gray-600'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* 필터 활성 표시 */}
              {(filterText || filterGroup !== 'all' || filterPublic !== 'all') && (
                <button
                  onClick={() => { setFilterText(''); setFilterGroup('all'); setFilterPublic('all'); }}
                  className="text-[11px] text-gray-400 hover:text-red-500 transition-colors flex items-center gap-1"
                >
                  <Xmark className="w-3 h-3" /> 초기화
                </button>
              )}

              {/* 우측: 상태 + 액션 */}
              <div className="ml-auto flex items-center gap-2.5">
                <span className="text-[11px] text-gray-400 tabular-nums">
                  {filteredPackages.length}개 패키지 · {totalFaqs}건
                </span>

                {sortField && (
                  <div className="flex items-center gap-1 text-[11px] text-gray-400">
                    <span className="font-medium text-gray-500">{FIELD_LABELS[sortField]}</span>
                    <span>{sortDir === 'asc' ? '↑' : '↓'}</span>
                    <button onClick={() => { setSortField(null); setSortDir('asc'); }} className="text-gray-300 hover:text-red-500">
                      <Xmark className="w-3 h-3" />
                    </button>
                  </div>
                )}

                {copyFeedback && <span className="text-[11px] text-green-600 font-medium animate-pulse">복사됨</span>}

                {hasRange && rangeRect && (
                  <span className="text-[11px] text-blue-500">
                    {(rangeRect.rowEnd - rangeRect.rowStart + 1) * (rangeRect.colEnd - rangeRect.colStart + 1)}셀
                  </span>
                )}

                {checkedRows.size > 0 && (
                  <div className="flex items-center gap-2 border-l border-gray-200 pl-2.5">
                    <span className="text-[11px] font-medium text-blue-600">{checkedRows.size}개 선택</span>
                    <button onClick={handleBulkDelete}
                      className="text-[11px] text-red-500 hover:text-red-700 font-medium">삭제</button>
                    <button onClick={() => setCheckedRows(new Set())}
                      className="text-[11px] text-gray-400 hover:text-gray-600">해제</button>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  {saving && <span className="text-[11px] text-gray-400 animate-pulse">저장 중...</span>}
                  {!saving && hasDirty && <span className="text-[11px] text-amber-500">수정됨</span>}
                  {!saving && !hasDirty && lastSavedAt && <span className="text-[11px] text-green-500">✓</span>}
                  <button onClick={() => handleCreatePkg([])}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors">
                    <Plus className="w-3.5 h-3.5" /> {activeTab === 'manual' ? '새 패키지' : '새 규칙'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* 그룹 아일랜드 */}
          {filteredPackages.length === 0 && (
            <div className="text-center py-20 text-sm text-gray-400">
              {activeTab === 'manual' ? '패키지가 없습니다. 새 패키지를 추가하세요.' : '자동 FAQ 규칙이 없습니다. 새 규칙을 추가하세요.'}
            </div>
          )}

          <div className="space-y-5">
            {groupedPackages.map(([groupKey, groupPkgs]) => {
              const isGroupCollapsed = collapsedGroups.has(groupKey);
              const groupFaqCount = groupPkgs.reduce((s, p) => s + p.faqTemplates.length, 0);
              return (
                <div key={groupKey} className="rounded-2xl bg-white shadow-sm overflow-visible">
                  {/* 그룹 헤더 */}
                  <div className="flex items-center w-full px-5 py-3 border-b border-stone-100 rounded-t-2xl">
                    <button
                      onClick={() => setCollapsedGroups(prev => { const n = new Set(prev); isGroupCollapsed ? n.delete(groupKey) : n.add(groupKey); return n; })}
                      className="flex items-center gap-3 flex-1 min-w-0 hover:opacity-70 transition-opacity"
                    >
                      {isGroupCollapsed
                        ? <NavArrowRight className="w-4 h-4 text-gray-400 shrink-0" />
                        : <NavArrowDown className="w-4 h-4 text-gray-400 shrink-0" />
                      }
                      <span className="text-[13px] font-bold text-gray-800 tracking-tight">{groupKey}</span>
                      <span className="text-[11px] text-gray-400 tabular-nums">{groupPkgs.length}개 패키지 · {groupFaqCount}건</span>
                    </button>
                    <button
                      onClick={() => {
                        const groupTags = groupKey === '공통' ? [] : groupKey.split(' · ');
                        handleCreatePkg(groupTags);
                      }}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] text-gray-400 hover:text-gray-700 hover:bg-stone-100 rounded-lg transition-colors shrink-0"
                    >
                      <Plus className="w-3 h-3" /> 패키지 추가
                    </button>
                  </div>

                  {/* 그룹 내 테이블 */}
                  {!isGroupCollapsed && (
                    <div className="px-4 pb-4">
                      <table className="border-collapse table-fixed" style={{ minWidth: tableMinWidth, width: '100%' }}>
                        <colgroup>
                          <col style={{ width: 24 }} />
                            <col style={{ width: NUM_WIDTH }} />
                          <col style={questionWidth ? { width: questionWidth } : undefined} />
                          <col style={{ width: columnWidths.topic }} />
                          <col style={{ width: columnWidths.handler }} />
                          <col style={{ width: columnWidths.tag }} />
                          <col style={{ width: columnWidths.keyDataRefs }} />
                        </colgroup>
                        <thead>
                          <tr className="border-b border-stone-200/60">
                            <th style={{ width: 24 }} />
                            <th className={`${th} text-center`}>
                              <span className="text-xs">#</span>
                            </th>
                            <ResizableHeader field="question" active={sortField} dir={sortDir} onSort={handleSort} onResizeStart={handleResizeStart} className={th}>질문</ResizableHeader>
                            <ResizableHeader field="topic" active={sortField} dir={sortDir} onSort={handleSort} onResizeStart={handleResizeStart} className={th}>topic</ResizableHeader>
                            <ResizableHeader field="handler" active={sortField} dir={sortDir} onSort={handleSort} onResizeStart={handleResizeStart} className={th}>처리</ResizableHeader>
                            <ResizableHeader field="tag" active={sortField} dir={sortDir} onSort={handleSort} onResizeStart={handleResizeStart} className={th}>태그</ResizableHeader>
                            <ResizableHeader field="keyDataRefs" active={sortField} dir={sortDir} onSort={handleSort} onResizeStart={handleResizeStart} className={th} isLast>규정 참조</ResizableHeader>
                          </tr>
                        </thead>
                        <tbody>
                  {groupPkgs.map(pkg => {
                const isCollapsed = collapsedPkgs.has(pkg.id);
                const sorted = sortTemplates(pkg.faqTemplates);
                const tenantCount = pkg.appliedTenants.length;
                const appliedStores = pkg.appliedTenants.map(t => t.brandName);

                return (
                  <Fragment key={pkg.id}>
                    {/* 패키지 헤더 */}
                    <tr className="bg-stone-50/60 border-b border-stone-200/60" style={{ borderLeft: '2px solid rgba(147, 197, 253, 0.5)' }}>
                      <td colSpan={COL_SPAN} className="px-4 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <button onClick={() => setCollapsedPkgs(prev => { const n = new Set(prev); isCollapsed ? n.delete(pkg.id) : n.add(pkg.id); return n; })}
                            className="flex items-center gap-1 shrink-0">
                            {isCollapsed ? <NavArrowRight className="w-4 h-4 text-gray-400" /> : <NavArrowDown className="w-4 h-4 text-gray-400" />}
                          </button>
                          <InlinePackageName name={pkg.name} onSave={name => handleUpdatePkgMeta(pkg.id, { name })} />
                          <span className="text-[11px] text-gray-400 tabular-nums">({pkg.faqTemplates.length}건)</span>
                          {dirtyPkgIds.has(pkg.id) && <span className="text-[11px] text-amber-600 font-medium">변경됨</span>}

                          {/* 대상 필터 (requiredTags) */}
                          <RequiredTagsSelector
                            tags={pkg.requiredTags}
                            tagOptions={tagOptions}
                            onChange={tags => handleUpdatePkgMeta(pkg.id, { requiredTags: tags })}
                          />

                          {/* 우측 정렬 영역 */}
                          <div className="flex items-center gap-1.5 ml-auto">
                            {activeTab === 'manual' ? (
                              <div className="flex items-center gap-0.5 bg-gray-50 rounded-lg px-1 py-0.5">
                                <button onClick={() => handleUpdatePkgMeta(pkg.id, { isPublic: !pkg.isPublic })}
                                  className={`flex items-center gap-1 px-2 py-1 text-[11px] rounded-md transition-all font-medium ${
                                    pkg.isPublic ? 'text-emerald-600 hover:bg-emerald-50' : 'text-gray-400 hover:bg-white hover:shadow-sm'
                                  }`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${pkg.isPublic ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                                  {pkg.isPublic ? '공개' : '비공개'}
                                </button>
                                <span className="w-px h-4 bg-gray-200" />
                                <button onClick={() => setTenantModalPkgId(pkg.id)}
                                  className="flex items-center gap-1 px-2 py-1 text-[11px] text-gray-600 hover:bg-white hover:shadow-sm rounded-md transition-all font-medium">
                                  <Shop className="w-3.5 h-3.5" />
                                  {tenantCount > 0 ? `${tenantCount}곳 적용` : '매장 관리'}
                                </button>
                                {tenantCount > 0 && (
                                  <button onClick={() => onSyncTenants(pkg.id)}
                                    className="flex items-center gap-1 px-1.5 py-1 text-[11px] text-blue-500 hover:bg-white hover:shadow-sm rounded-md transition-all"
                                    title="적용된 매장에 최신 FAQ 동기화">
                                    <RefreshDouble className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            ) : (
                              <span className="text-[11px] text-gray-400">
                                {tenantCount > 0 ? `자동 적용 ${tenantCount}곳` : '대기 중'}
                              </span>
                            )}

                          {/* ··· 메뉴 */}
                          <div className="relative">
                            <button onClick={() => setMenuPkgId(menuPkgId === pkg.id ? null : pkg.id)}
                              className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors">
                              <MoreHoriz className="w-4.5 h-4.5" />
                            </button>
                            {menuPkgId === pkg.id && (
                              <PackageMenu
                                pkg={pkg}
                                onUpdateMeta={updates => handleUpdatePkgMeta(pkg.id, updates)}
                                onDelete={() => { setMenuPkgId(null); handleDeletePkg(pkg.id); }}
                                onClose={() => setMenuPkgId(null)}
                              />
                            )}
                          </div>
                          </div>
                        </div>
                      </td>
                    </tr>

                    {/* FAQ 행들 */}
                    {!isCollapsed && sorted.map(t => (
                      <Fragment key={t.id}>
                        <tr className={`group transition-colors hover:bg-stone-50/80 ${dragOverTarget === t.id ? 'border-t-2 border-blue-400' : ''}`}
                          onDragOver={e => handleRowDragOver(e, t.id)}
                          onDrop={e => handleRowDrop(e, t.id)}>
                          {/* 드래그 핸들 */}
                          <td className="w-6 px-0 border-b border-stone-100 text-center align-middle"
                            draggable
                            onDragStart={e => handleRowDragStart(e, t.id)}
                            onDragEnd={handleRowDragEnd}>
                            <span className="cursor-grab opacity-0 group-hover:opacity-40 hover:!opacity-80 text-gray-400 text-[10px] select-none">⠿</span>
                          </td>
                          {/* # */}
                          <td className={`${td} text-center select-none group/numcell`}>
                            {checkedRows.has(t.id) ? (
                              <input type="checkbox" checked
                                onChange={e => { e.stopPropagation(); setCheckedRows(prev => { const n = new Set(prev); n.delete(t.id); return n; }); }}
                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-400 w-4 h-4" />
                            ) : (
                              <>
                                <span className="text-xs text-gray-300 group-hover/numcell:hidden cursor-grab">{globalNumbering.get(t.id) ?? ''}</span>
                                <input type="checkbox" checked={false}
                                  onChange={e => { e.stopPropagation(); setCheckedRows(prev => new Set(prev).add(t.id)); }}
                                  className="hidden group-hover/numcell:inline-block rounded border-gray-300 text-blue-600 focus:ring-blue-400 w-4 h-4" />
                              </>
                            )}
                          </td>

                          {/* 질문 */}
                          <td className={cellCls(t.id, 'question')} data-cell
                            onMouseDown={e => { if (!isEditing(t.id, 'question')) handleCellMouseDown(t.id, 'question', e); }}
                            onMouseEnter={() => handleCellMouseEnter(t.id, 'question')}
                            onDoubleClick={() => startEdit(t.id, 'question')}>
                            <div className="flex items-center h-full gap-1">
                              {!t.answer?.trim() && <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" title="답변 없음" />}
                              <div className={`${cellText} flex-1 min-w-0`}>{t.questions[0]?.trim() || <span className={muted}>질문 없음</span>}</div>
                              {t.questions.length > 1 && <span className="text-xs text-gray-400 shrink-0">+{t.questions.length - 1}개</span>}
                            </div>
                          </td>

                          {/* Topic — 클릭=선택, 더블클릭=드롭다운 */}
                          <td className={cellCls(t.id, 'topic')} data-cell
                            onMouseDown={e => { if (!isEditing(t.id, 'topic')) handleCellMouseDown(t.id, 'topic', e); }}
                            onMouseEnter={() => handleCellMouseEnter(t.id, 'topic')}
                            onDoubleClick={() => startEdit(t.id, 'topic')}>
                            <div className="flex items-center h-full">
                              {isEditing(t.id, 'topic') ? (
                                <TopicSelect value={t.topic} onChange={val => { editTemplate(t.id, 'topic', val, true); stopEdit(); }} onClose={stopEdit} />
                              ) : (
                                <div className="w-full flex items-center gap-0.5 cursor-pointer">
                                  {t.topic ? <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-violet-50 text-violet-700 border border-violet-100 truncate max-w-full">{t.topic}</span> : <span className={muted}>-</span>}
                                  <NavArrowDown className="w-3 h-3 text-gray-300 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                                </div>
                              )}
                            </div>
                          </td>

                          {/* Handler — 클릭=선택, 더블클릭=드롭다운 */}
                          <td className={cellCls(t.id, 'handler')} data-cell
                            onMouseDown={e => { if (!isEditing(t.id, 'handler')) handleCellMouseDown(t.id, 'handler', e); }}
                            onMouseEnter={() => handleCellMouseEnter(t.id, 'handler')}
                            onDoubleClick={() => startEdit(t.id, 'handler')}>
                            <div className="flex items-center h-full">
                              {isEditing(t.id, 'handler') ? (
                                <HandlerSelect value={t.handler}
                                  onChange={val => { editTemplate(t.id, 'handler', val, true); editTemplate(t.id, 'handlerType', val === 'bot' ? 'bot' : 'staff', true); stopEdit(); }}
                                  onClose={stopEdit} />
                              ) : (
                                <div className="w-full flex items-center gap-0.5 cursor-pointer">
                                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${handlerColor(t.handler)}`}>{handlerLabel(t.handler)}</span>
                                  <NavArrowDown className="w-3 h-3 text-gray-300 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                                </div>
                              )}
                            </div>
                          </td>

                          {/* 태그 (멀티셀렉트) */}
                          <td className={cellCls(t.id, 'tag')} data-cell
                            onMouseDown={e => { if (!isEditing(t.id, 'tag')) handleCellMouseDown(t.id, 'tag', e); }}
                            onMouseEnter={() => handleCellMouseEnter(t.id, 'tag')}
                            onDoubleClick={() => startEdit(t.id, 'tag')}>
                            <div className="relative flex items-center h-full">
                              <span className="cursor-pointer inline-flex items-center gap-0.5 py-0.5">
                                {(t.tags || []).length === 0 ? (
                                  <span className="text-sm text-gray-300">—</span>
                                ) : (
                                  <>
                                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TAG_COLORS[(t.tags || [])[0]] || 'bg-gray-100 text-gray-600'}`}>
                                      {(t.tags || [])[0]}
                                    </span>
                                    {(t.tags || []).length > 1 && (
                                      <span className="text-[11px] bg-gray-200 text-gray-600 rounded-full px-1.5">+{(t.tags || []).length - 1}</span>
                                    )}
                                  </>
                                )}
                              </span>
                              {isEditing(t.id, 'tag') && (
                                <div data-dropdown className="absolute left-0 top-full z-50 mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[130px]">
                                  {TAG_OPTIONS.map(tag => {
                                    const isActive = (t.tags || []).includes(tag);
                                    return (
                                      <button key={tag}
                                        onClick={() => {
                                          editTemplate(t.id, 'tags', isActive ? [] : [tag], true);
                                          stopEdit();
                                        }}
                                        className={`w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-gray-50 ${isActive ? 'bg-blue-50/40' : ''}`}>
                                        <span className={`px-2 py-0.5 text-[11px] font-medium rounded-full ${
                                          isActive ? (TAG_COLORS[tag] || 'bg-gray-900 text-white') : 'bg-gray-100 text-gray-500'
                                        }`}>
                                          {tag}
                                        </span>
                                        {isActive && <Check className="w-3 h-3 text-blue-500 ml-auto" />}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </td>

                          {/* 규정 참조 + 오버레이 */}
                          <td className={cellCls(t.id, 'keyDataRefs', 'relative overflow-visible')} data-cell
                            onMouseDown={e => { if (!isEditing(t.id, 'keyDataRefs')) handleCellMouseDown(t.id, 'keyDataRefs', e); }}
                            onMouseEnter={() => handleCellMouseEnter(t.id, 'keyDataRefs')}>
                            <div className="flex items-center h-full gap-0.5">
                              {(t.keyDataRefs || []).length === 0 ? <span className={muted}>-</span> : (
                                <>
                                  {(t.keyDataRefs || []).slice(0, 2).map(refId => {
                                    const r = rules.find(ru => ru.id === refId);
                                    return <span key={refId} className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-gray-100 text-gray-600 truncate max-w-[80px]">{r?.label || refId}</span>;
                                  })}
                                  {(t.keyDataRefs || []).length > 2 && <span className="text-xs text-gray-400">+{t.keyDataRefs.length - 2}</span>}
                                </>
                              )}
                            </div>
                            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity bg-white rounded-lg shadow-sm border border-stone-200 px-1 py-0.5 z-20">
                              <div className="relative" data-dropdown>
                                <button onClick={e => { e.stopPropagation(); setMoveMenu(prev => prev?.templateId === t.id ? null : { templateId: t.id, mode: 'move' }); }}
                                  className="p-1.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100" title="이동/복제"><NavArrowRight className="w-4 h-4" /></button>
                                {moveMenu?.templateId === t.id && (
                                  <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[180px] z-50" onClick={e => e.stopPropagation()}>
                                    <div className="px-3 py-1.5 flex gap-1 border-b border-gray-100 mb-1">
                                      <button onClick={() => setMoveMenu(prev => prev ? { ...prev, mode: 'move' } : null)}
                                        className={`px-2 py-0.5 text-[11px] font-medium rounded ${moveMenu.mode === 'move' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>이동</button>
                                      <button onClick={() => setMoveMenu(prev => prev ? { ...prev, mode: 'copy' } : null)}
                                        className={`px-2 py-0.5 text-[11px] font-medium rounded ${moveMenu.mode === 'copy' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>복제</button>
                                    </div>
                                    {localPackages.filter(p => p.id !== ownerMap.get(t.id)).map(p => (
                                      <button key={p.id} onClick={() => handleMoveFaq(t.id, p.id, moveMenu.mode)}
                                        className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 truncate">
                                        {p.name || '(이름 없음)'}
                                      </button>
                                    ))}
                                    {localPackages.filter(p => p.id !== ownerMap.get(t.id)).length === 0 && (
                                      <p className="px-3 py-2 text-xs text-gray-400">다른 패키지가 없습니다</p>
                                    )}
                                  </div>
                                )}
                              </div>
                              <button onClick={e => { e.stopPropagation(); handleDuplicateFaq(t.id); }}
                                className="p-1.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100" title="복제"><Copy className="w-4 h-4" /></button>
                              <button onClick={e => { e.stopPropagation(); handleDeleteFaq(t.id); }}
                                className="p-1.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50" title="삭제"><Trash className="w-4 h-4" /></button>
                            </div>
                          </td>
                        </tr>

                        {/* 확장 패널 */}
                        {expandedId === t.id && (
                          <tr>
                            <td colSpan={COL_SPAN} className="px-4 py-5 bg-stone-50 border-b border-stone-200/60" data-expand onClick={e => e.stopPropagation()}>
                              <div className="grid grid-cols-2 gap-6">
                                <div className="bg-white rounded-xl p-5 shadow-sm">
                                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 block">질문 ({t.questions.length}개)</label>
                                  <div className="space-y-2">
                                    {t.questions.map((q, qi) => (
                                      <div key={qi} className="flex items-center gap-1.5">
                                        <UndoableInput value={q} onChange={e => handleQuestionChange(t.id, qi, e.target.value)}
                                          onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleAddQuestion(t.id); } }}
                                          onClick={e => e.stopPropagation()} placeholder={`질문 ${qi + 1}`} autoFocus={qi === 0}
                                          className="flex-1 text-sm px-3 py-2.5 bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 focus:bg-white transition-colors" />
                                        {t.questions.length > 1 && (
                                          <button onClick={e => { e.stopPropagation(); handleRemoveQuestion(t.id, qi); }}
                                            className="p-1 text-gray-300 hover:text-red-500 rounded"><Xmark className="w-4 h-4" /></button>
                                        )}
                                      </div>
                                    ))}
                                    <button onClick={e => { e.stopPropagation(); handleAddQuestion(t.id); }}
                                      className="text-xs text-blue-500 hover:text-blue-700 font-medium mt-1">+ 질문 추가</button>
                                  </div>
                                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 mt-5 block">답변</label>
                                  <ChipEditor value={t.answer} onChange={val => editTemplate(t.id, 'answer', val)}
                                    minRows={7} placeholder="답변 내용을 입력하세요"
                                    onFocus={() => { lastFocusedEditor.current = 'answer'; }}
                                    editorHandleRef={answerHandleRef} varLabels={varLabels} />
                                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 mt-4 block">가이드</label>
                                  <ChipEditor value={t.guide} onChange={val => editTemplate(t.id, 'guide', val)}
                                    minRows={3} placeholder="내부 가이드를 입력하세요"
                                    onFocus={() => { lastFocusedEditor.current = 'guide'; }}
                                    editorHandleRef={guideHandleRef} varLabels={varLabels} />
                                  {/* 변수 삽입 패널 */}
                                  <VarInsertPanel template={t} schemaData={schemaData} onInsert={(key) => {
                                    const ref = lastFocusedEditor.current === 'guide' ? guideHandleRef : answerHandleRef;
                                    ref.current?.insertVar(key);
                                  }} />
                                </div>
                                <div className="space-y-4">
                                  {/* 태그 */}
                                  <div className="bg-white rounded-xl p-4 shadow-sm" onClick={e => e.stopPropagation()}>
                                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">태그</label>
                                    <div className="flex flex-wrap gap-1.5">
                                      {TAG_OPTIONS.map(tag => {
                                        const isActive = (t.tags || []).includes(tag);
                                        return (
                                          <button key={tag}
                                            onClick={() => {
                                              editTemplate(t.id, 'tags', isActive ? [] : [tag], true);
                                            }}
                                            className={`px-2.5 py-1 text-xs font-medium rounded-full border transition-colors ${
                                              isActive ? (TAG_COLORS[tag] || 'bg-gray-900 text-white') + ' border-transparent' : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300 hover:text-gray-600'
                                            }`}>
                                            {tag}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                  {/* Topic + Handler 가로 배치 */}
                                  <div className="bg-white rounded-xl p-4 shadow-sm" onClick={e => e.stopPropagation()}>
                                    <div>
                                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">토픽</label>
                                      <div className="flex flex-wrap gap-1.5">
                                        {TOPIC_OPTIONS.map(opt => (
                                          <button key={opt} onClick={() => editTemplate(t.id, 'topic', t.topic === opt ? '' : opt, true)}
                                            className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                                              t.topic === opt ? 'bg-violet-100 text-violet-800 border-violet-300' : 'bg-white text-gray-500 border-gray-200 hover:border-violet-200 hover:bg-violet-50/50'
                                            }`}>
                                            {opt}
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                    <div className="mt-3">
                                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">처리</label>
                                      <div className="flex flex-wrap gap-1.5">
                                        {HANDLER_OPTIONS.map(opt => {
                                          const hc = opt.value === 'bot' ? 'bg-green-100 text-green-800 border-green-300' : opt.value === 'op' ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-red-100 text-red-800 border-red-300';
                                          return (
                                            <button key={opt.value} onClick={() => {
                                              editTemplate(t.id, 'handler', opt.value, true);
                                              editTemplate(t.id, 'handlerType', opt.value === 'bot' ? 'bot' : (t.rule?.trim() ? 'conditional' : 'staff'), true);
                                            }}
                                              className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                                                t.handler === opt.value ? hc : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                                              }`}>
                                              {opt.label}
                                            </button>
                                          );
                                        })}
                                      </div>
                                    </div>
                                    {/* 전달 조건 (handler가 op/manager일 때) */}
                                    {(t.handler === 'op' || t.handler === 'manager') && (
                                      <div className="mt-3">
                                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 block">전달 조건 (rule)</label>
                                        <UndoableInput value={t.rule} onChange={e => {
                                          editTemplate(t.id, 'rule', e.target.value);
                                          editTemplate(t.id, 'handlerType', e.target.value.trim() ? 'conditional' : 'staff'), true;
                                        }} placeholder="조건 규칙..."
                                          className="w-full text-sm px-3 py-2.5 border border-stone-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 bg-stone-50 focus:bg-white transition-colors" />
                                      </div>
                                    )}
                                  </div>
                                  <div className="bg-white rounded-xl p-4 shadow-sm" onClick={e => e.stopPropagation()}>
                                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">참조 데이터</label>
                                    <RuleMultiSelect selected={t.keyDataRefs || []} options={rules}
                                      onChange={refs => editTemplate(t.id, 'keyDataRefs', refs, true)} appliedStores={appliedStores} />
                                    {(t.keyDataRefs || []).length > 0 && (
                                      <RulePreviewCollapsible refs={t.keyDataRefs || []} rules={rules} />
                                    )}
                                  </div>
                                  <div className="bg-white rounded-xl p-4 shadow-sm" onClick={e => e.stopPropagation()}>
                                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">
                                      데이터 소스
                                      {(t.keyDataSources || []).length > 0 && (
                                        <span className="ml-1 text-xs text-blue-500 font-normal">({t.keyDataSources!.length}개 연결)</span>
                                      )}
                                    </label>
                                    <KeyDataSourceEditor
                                      sources={t.keyDataSources || []}
                                      schemaData={schemaData}
                                      onChange={sources => editTemplate(t.id, 'keyDataSources', sources.length > 0 ? sources : undefined, true)}
                                    />
                                  </div>
                                </div>
                              </div>
                              <div className="flex justify-end mt-3">
                                <button onClick={stopEdit} className="flex items-center gap-1 px-2.5 py-1 text-xs text-gray-400 hover:text-gray-700 transition-colors">
                                  <NavArrowUp className="w-3.5 h-3.5" /> 접기
                                </button>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}

                    {/* 그룹 내 행 추가 */}
                    {!isCollapsed && (
                      <tr>
                        <td colSpan={COL_SPAN}>
                          <button onClick={() => handleAddFaq(pkg.id)}
                            className="w-full h-9 text-[11px] text-gray-300 hover:text-gray-500 hover:bg-stone-50 transition-colors flex items-center justify-center gap-1.5">
                            <Plus className="w-3.5 h-3.5" /> 행 추가
                          </button>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>}

      {/* 패키지 생성 모달 */}
      {createModal && (
        <CreatePackageModal
          tagOptions={tagOptions}
          defaultTags={createModal.defaultTags}
          onSubmit={handleCreatePkgSubmit}
          onClose={() => setCreateModal(null)}
        />
      )}

      {/* 매장 관리 모달 */}
      {tenantModalPkg && (
        <TenantManageModal
          packageName={tenantModalPkg.name}
          appliedTenants={tenantModalPkg.appliedTenants}
          allTenants={allTenants}
          packageUpdatedAt={tenantModalPkg.updatedAt}
          onApply={async (tenantIds) => { await onApplyTenants(tenantModalPkg.id, tenantIds); onRefresh(); }}
          onSync={async (tenantId) => { await onSyncTenants(tenantModalPkg.id, tenantId ? [tenantId] : undefined); onRefresh(); }}
          onRemove={async (tenantId, brandName, mode) => { await onRemoveTenant(tenantModalPkg.id, tenantId, brandName, mode); onRefresh(); }}
          onClose={() => setTenantModalPkgId(null)}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 참조 데이터 탭 (RulesTable 래핑)
// ═══════════════════════════════════════════════════════════

function RulesTab({ allTenants }: { allTenants: { tenantId: string; brandName: string }[] }) {
  const [rules, setRules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [packages, setPackages] = useState<any[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set());
  const [syncingDirty, setSyncingDirty] = useState(false);

  // 필터
  const [platformFilter, setPlatformFilter] = useState('');
  const [storeFilter, setStoreFilter] = useState('');
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');

  const undoStack = useRef<{ ruleId: string; field: string; oldValue: any; newValue: any }[]>([]);
  const redoStack = useRef<{ ruleId: string; field: string; oldValue: any; newValue: any }[]>([]);

  // 초기 로드
  useEffect(() => {
    (async () => {
      try {
        const [settingsRes, packagesRes, rulesRes] = await Promise.all([
          fetch('/api/admin/settings/cs-data'),
          fetch('/api/admin/cs-data/packages'),
          fetch('/api/admin/cs-data/rules'),
        ]);
        if (settingsRes.ok) {
          const s = await settingsRes.json();
          setPlatforms(s.platforms || []);
          setCategoryOptions(s.ruleCategories || []);
        }
        if (packagesRes.ok) {
          const p = await packagesRes.json();
          setPackages((p.packages || []).map((pkg: any) => ({
            id: pkg.id, name: pkg.name || '', description: pkg.description || '', faqCount: pkg.faqCount || 0,
          })));
        }
        if (rulesRes.ok) {
          const data = await rulesRes.json();
          setRules(data.rules || []);
        }
      } catch (err) {
        console.error('[rules tab] load error:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // 검색 디바운스
  useEffect(() => {
    const timer = setTimeout(() => setSearchDebounced(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // 클라이언트 필터링
  const filteredRules = useMemo(() => {
    let result = rules;
    if (platformFilter) result = result.filter((r: any) => r.platform === platformFilter);
    if (storeFilter) result = result.filter((r: any) => (r.store || []).includes(storeFilter));
    if (searchDebounced) {
      const q = searchDebounced.toLowerCase();
      result = result.filter((r: any) =>
        (r.label || '').toLowerCase().includes(q) ||
        (r.content || '').toLowerCase().includes(q) ||
        (r.platform || '').toLowerCase().includes(q) ||
        (r.store || []).some((s: string) => s.toLowerCase().includes(q)) ||
        (r.category || '').toLowerCase().includes(q)
      );
    }
    return result;
  }, [rules, platformFilter, storeFilter, searchDebounced]);

  const scopeOptions = useMemo(() => ({
    platforms,
    stores: allTenants.map(t => t.brandName),
  }), [platforms, allTenants]);

  const packagesMap = useMemo(() => {
    const map = new Map();
    packages.forEach(pkg => map.set(pkg.id, pkg));
    return map;
  }, [packages]);

  const tenantsMap = useMemo(() => {
    const map = new Map();
    allTenants.forEach(t => map.set(t.tenantId, t.brandName));
    return map;
  }, [allTenants]);

  const handleCellEdit = useCallback((ruleId: string, field: string, value: any) => {
    setRules(prev => {
      const oldRule = prev.find((r: any) => r.id === ruleId);
      if (!oldRule) return prev;
      const oldValue = oldRule[field];
      if (JSON.stringify(oldValue) === JSON.stringify(value)) return prev;
      undoStack.current.push({ ruleId, field, oldValue, newValue: value });
      redoStack.current = [];
      setDirtyIds(p => new Set(p).add(ruleId));
      return prev.map((r: any) => r.id === ruleId ? { ...r, [field]: value } : r);
    });
  }, []);

  const handleUndo = useCallback(() => {
    const entry = undoStack.current.pop();
    if (!entry) return;
    redoStack.current.push(entry);
    setRules(prev => prev.map((r: any) => r.id === entry.ruleId ? { ...r, [entry.field]: entry.oldValue } : r));
    setDirtyIds(prev => new Set(prev).add(entry.ruleId));
  }, []);

  const handleRedo = useCallback(() => {
    const entry = redoStack.current.pop();
    if (!entry) return;
    undoStack.current.push(entry);
    setRules(prev => prev.map((r: any) => r.id === entry.ruleId ? { ...r, [entry.field]: entry.newValue } : r));
    setDirtyIds(prev => new Set(prev).add(entry.ruleId));
  }, []);

  const handleSyncDirty = useCallback(async () => {
    if (dirtyIds.size === 0) return;
    setSyncingDirty(true);
    const dirtyRules = rules.filter((r: any) => dirtyIds.has(r.id));
    const syncLinkedFaqs = dirtyRules.length > 0 && confirm('참조 중인 FAQ의 keyData도 함께 업데이트하시겠습니까?');
    try {
      await Promise.all(dirtyRules.map(async (rule: any) => {
        await fetch(`/api/admin/cs-data/rules/${rule.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ label: rule.label, content: rule.content, platform: rule.platform, store: rule.store, category: rule.category, tags: rule.tags, syncLinkedFaqs }),
        });
      }));
      setDirtyIds(new Set());
    } catch { alert('저장 중 오류가 발생했습니다.'); }
    finally { setSyncingDirty(false); }
  }, [dirtyIds, rules]);

  const handleDelete = useCallback(async (ruleId: string) => {
    try {
      const res = await fetch(`/api/admin/cs-data/rules/${ruleId}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.status === 409 && data.linkedFaqCount) {
        if (!confirm(`이 규정을 ${data.linkedFaqCount}개 FAQ에서 참조 중입니다. 강제 삭제하시겠습니까?`)) return;
        await fetch(`/api/admin/cs-data/rules/${ruleId}?force=true`, { method: 'DELETE' });
      }
      setRules(prev => prev.filter((r: any) => r.id !== ruleId));
    } catch { alert('삭제 중 오류가 발생했습니다.'); }
  }, []);

  const handleBulkDelete = useCallback(async (ruleIds: string[]) => {
    try {
      const results = await Promise.allSettled(ruleIds.map(id => fetch(`/api/admin/cs-data/rules/${id}`, { method: 'DELETE' })));
      const deletedIds = new Set<string>();
      results.forEach((r, i) => { if (r.status === 'fulfilled' && r.value.ok) deletedIds.add(ruleIds[i]); });
      if (deletedIds.size > 0) setRules(prev => prev.filter((r: any) => !deletedIds.has(r.id)));
    } catch { alert('일괄 삭제 중 오류가 발생했습니다.'); }
  }, []);

  const handleAdd = useCallback(async (data: any) => {
    const res = await fetch('/api/admin/cs-data/rules', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('추가 실패');
    const result = await res.json();
    if (result.rule) setRules(prev => [...prev, result.rule]);
  }, []);

  const handleAddCategory = useCallback(async (cat: string) => {
    const newOptions = [...categoryOptions, cat];
    setCategoryOptions(newOptions);
    try { await fetch('/api/admin/settings/cs-data', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ruleCategories: newOptions }) }); }
    catch {}
  }, [categoryOptions]);

  // RulesTable 동적 임포트 (이미 로드됨)
  const [RulesTableComp, setRulesTableComp] = useState<any>(null);
  useEffect(() => {
    import('./RulesTable').then(mod => setRulesTableComp(() => mod.default));
  }, []);

  if (loading || !RulesTableComp) {
    return <div className="flex justify-center py-20 text-sm text-gray-400">불러오는 중...</div>;
  }

  return (
    <div>
      {/* 필터바 + 저장 버튼 */}
      <div className="flex items-center gap-3 mb-4">
        <select value={platformFilter} onChange={e => setPlatformFilter(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400">
          <option value="">전체 플랫폼</option>
          <option value="-">-</option>
          {platforms.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={storeFilter} onChange={e => setStoreFilter(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400">
          <option value="">전체 매장</option>
          <option value="공통">공통</option>
          {allTenants.map(t => <option key={t.tenantId} value={t.brandName}>{t.brandName}</option>)}
        </select>
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="검색..."
          className="flex-1 max-w-xs text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400" />
        <span className="text-xs text-gray-400 ml-auto">
          {filteredRules.length !== rules.length ? `${filteredRules.length} / ` : ''}전체 {rules.length}건
        </span>
        {dirtyIds.size > 0 && (
          <button onClick={handleSyncDirty} disabled={syncingDirty}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-colors">
            {syncingDirty ? '저장 중...' : `${dirtyIds.size}건 변경됨 — 저장`}
          </button>
        )}
      </div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-visible">
        <RulesTableComp
          rules={filteredRules}
          scopeOptions={scopeOptions}
          onCellEdit={handleCellEdit}
          onDelete={handleDelete}
          onBulkDelete={handleBulkDelete}
          onAdd={handleAdd}
          dirtyIds={dirtyIds}
          packagesMap={packagesMap}
          tenantsMap={tenantsMap}
          onRefClick={() => {}}
          categoryOptions={categoryOptions}
          onAddCategory={handleAddCategory}
          onUndo={handleUndo}
          onRedo={handleRedo}
        />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 동의어 사전 탭
// ═══════════════════════════════════════════════════════════

type SynonymDict = Record<string, string[]>;

function SynonymTab() {
  const [dict, setDict] = useState<SynonymDict>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const snapshotRef = useRef<string>('');

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editCanon, setEditCanon] = useState('');
  const [editVars, setEditVars] = useState('');
  const [addMode, setAddMode] = useState(false);
  const [newCanon, setNewCanon] = useState('');
  const [newVars, setNewVars] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/settings/synonyms');
        if (!res.ok) throw new Error();
        const data = await res.json();
        const d = data.dict || {};
        setDict(d);
        snapshotRef.current = JSON.stringify(d);
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, []);

  const update = (next: SynonymDict) => {
    setDict(next);
    setDirty(JSON.stringify(next) !== snapshotRef.current);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/settings/synonyms', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dict }),
      });
      if (!res.ok) throw new Error('저장 실패');
      snapshotRef.current = JSON.stringify(dict);
      setDirty(false);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (key: string) => {
    const next = { ...dict };
    delete next[key];
    update(next);
  };

  const handleStartEdit = (key: string) => {
    setEditingKey(key);
    setEditCanon(key);
    setEditVars(dict[key].join(', '));
  };

  const handleSaveEdit = () => {
    if (!editingKey) return;
    const canon = editCanon.trim();
    const vars = editVars.split(',').map(s => s.trim()).filter(Boolean);
    if (!canon || vars.length === 0) return;
    const next = { ...dict };
    if (canon !== editingKey) delete next[editingKey];
    next[canon] = vars;
    update(next);
    setEditingKey(null);
  };

  const handleAdd = () => {
    const canon = newCanon.trim();
    const vars = newVars.split(',').map(s => s.trim()).filter(Boolean);
    if (!canon || vars.length === 0) return;
    if (dict[canon]) {
      const merged = [...new Set([...(dict[canon] || []), ...vars])];
      update({ ...dict, [canon]: merged });
    } else {
      update({ ...dict, [canon]: vars });
    }
    setNewCanon('');
    setNewVars('');
    setAddMode(false);
  };

  const entries = Object.entries(dict).sort(([a], [b]) => a.localeCompare(b, 'ko'));

  if (loading) {
    return <div className="flex justify-center py-20 text-sm text-gray-400">불러오는 중...</div>;
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-stone-100">
        <div>
          <span className="text-sm font-semibold text-gray-900">동의어 사전</span>
          <span className="ml-2 text-xs text-gray-400">
            회원이 다양하게 표현하는 단어를 대표어로 치환하여 검색 정확도를 높입니다.
          </span>
        </div>
        <div className="flex items-center gap-2">
          {dirty && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-gray-900 hover:bg-gray-800 rounded-lg transition-colors disabled:bg-gray-300"
            >
              <Check className="w-3.5 h-3.5" />
              {saving ? '저장 중...' : '저장'}
            </button>
          )}
          {!dirty && !saving && entries.length > 0 && (
            <span className="text-[11px] text-green-500">✓</span>
          )}
          <button
            onClick={() => setAddMode(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> 추가
          </button>
        </div>
      </div>

      {/* 테이블 */}
      <div className="px-5 py-3">
        {entries.length === 0 && !addMode && (
          <div className="text-center py-16 text-sm text-gray-400">
            등록된 동의어가 없습니다. 추가 버튼으로 시작하세요.
          </div>
        )}

        {entries.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-gray-100">
                <th className="pb-2 text-xs font-medium text-gray-400 w-[160px]">대표어</th>
                <th className="pb-2 text-xs font-medium text-gray-400">동의어</th>
                <th className="pb-2 text-xs font-medium text-gray-400 w-[70px] text-right">작업</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(([key, vars]) => (
                <tr key={key} className="group border-b border-gray-50 hover:bg-stone-50/50">
                  {editingKey === key ? (
                    <>
                      <td className="py-2 pr-3">
                        <input
                          value={editCanon}
                          onChange={e => setEditCanon(e.target.value)}
                          className="w-full text-sm border border-blue-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
                          autoFocus
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <input
                          value={editVars}
                          onChange={e => setEditVars(e.target.value)}
                          className="w-full text-sm border border-blue-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
                          placeholder="동의어1, 동의어2, ..."
                          onKeyDown={e => {
                            if (e.nativeEvent.isComposing) return;
                            if (e.key === 'Enter') handleSaveEdit();
                            if (e.key === 'Escape') setEditingKey(null);
                          }}
                        />
                      </td>
                      <td className="py-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={handleSaveEdit} className="p-1 rounded text-blue-600 hover:bg-blue-50">
                            <Check className="w-4 h-4" />
                          </button>
                          <button onClick={() => setEditingKey(null)} className="p-1 rounded text-gray-400 hover:bg-gray-100">
                            <Xmark className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="py-2.5 pr-3">
                        <span className="font-medium text-gray-900">{key}</span>
                      </td>
                      <td className="py-2.5 pr-3">
                        <div className="flex flex-wrap gap-1">
                          {vars.map((v, i) => (
                            <span key={i} className="inline-block px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded-full">{v}</span>
                          ))}
                        </div>
                      </td>
                      <td className="py-2.5 text-right">
                        <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => handleStartEdit(key)} className="p-1 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50" title="편집">
                            <EditPencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => handleDelete(key)} className="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50" title="삭제">
                            <Trash className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* 추가 모드 */}
        {addMode && (
          <div className={`flex items-center gap-2 ${entries.length > 0 ? 'mt-3' : ''}`}>
            <input
              value={newCanon}
              onChange={e => setNewCanon(e.target.value)}
              placeholder="대표어"
              className="w-[160px] text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400"
              autoFocus
            />
            <input
              value={newVars}
              onChange={e => setNewVars(e.target.value)}
              placeholder="동의어1, 동의어2, 동의어3 (쉼표 구분)"
              className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400"
              onKeyDown={e => {
                if (e.nativeEvent.isComposing) return;
                if (e.key === 'Enter') handleAdd();
                if (e.key === 'Escape') { setAddMode(false); setNewCanon(''); setNewVars(''); }
              }}
            />
            <button
              onClick={handleAdd}
              disabled={!newCanon.trim() || !newVars.trim()}
              className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-40 disabled:bg-gray-300 shrink-0"
            >
              <Check className="w-4 h-4" /> 추가
            </button>
            <button
              onClick={() => { setAddMode(false); setNewCanon(''); setNewVars(''); }}
              className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 shrink-0"
            >
              <Xmark className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
