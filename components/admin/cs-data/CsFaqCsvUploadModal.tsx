'use client';

import { useState, useRef } from 'react';
import { Xmark, Upload, WarningTriangle } from 'iconoir-react';

// ═══════════════════════════════════════════════════════════
// 타입
// ═══════════════════════════════════════════════════════════

interface TenantOption {
  tenantId: string;
  brandName: string;
  branchNo?: string | null;
}

interface CsvRow {
  tenantIds: string[];
  questions: string[];
  answer: string;
  guide: string;
  topic: string;
  tags: string[];
  handlerType: 'bot' | 'staff';
  handler: string;
  rule: string;
  action_product: string;
  action: string;
}

interface ParsedResult {
  rows: CsvRow[];
  errors: { row: number; message: string }[];
}

interface CsFaqCsvUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpload: (rows: CsvRow[]) => Promise<void>;
  tenants: TenantOption[];
}

// ═══════════════════════════════════════════════════════════
// 상수
// ═══════════════════════════════════════════════════════════

const REQUIRED_HEADERS = ['questions', 'answer'];
const ALL_HEADERS = [
  'tenantIds', 'questions', 'answer', 'guide', 'topic', 'tags',
  'handlerType', 'handler', 'rule', 'action_product', 'action',
];

const VALID_TOPICS = [
  '매장/운영', '시설/환경', '상품/서비스', '예약/주문', '결제/환불',
  '회원/혜택', '기술/접속', '제보/신고', '기타',
];
const VALID_TAGS = ['문의', '칭찬', '건의', '불만', '요청', '긴급'];
const VALID_HANDLER_TYPES = ['bot', 'staff'];
const VALID_HANDLERS = ['bot', 'op', 'manager'];
const VALID_ACTION_PRODUCTS = ['ticket', 'room', 'locker', 'seat', 'shop', 'reservation'];
const VALID_ACTION_TYPES = ['change', 'cancel', 'refund', 'extend', 'transfer', 'check', 'issue'];

// ═══════════════════════════════════════════════════════════
// CSV 파서
// ═══════════════════════════════════════════════════════════

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let current = '';
  let inQuotes = false;
  let row: string[] = [];

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(current.trim());
        current = '';
      } else if (ch === '\n' || (ch === '\r' && next === '\n')) {
        row.push(current.trim());
        if (row.some(c => c !== '')) rows.push(row);
        row = [];
        current = '';
        if (ch === '\r') i++;
      } else {
        current += ch;
      }
    }
  }

  // 마지막 행
  row.push(current.trim());
  if (row.some(c => c !== '')) rows.push(row);

  return rows;
}

function parseAndValidate(text: string, tenants: TenantOption[]): ParsedResult {
  const rawRows = parseCSV(text);
  if (rawRows.length < 2) {
    return { rows: [], errors: [{ row: 0, message: '헤더와 최소 1행의 데이터가 필요합니다.' }] };
  }

  const headers = rawRows[0].map(h => h.toLowerCase().trim());

  // 필수 헤더 확인
  for (const req of REQUIRED_HEADERS) {
    if (!headers.includes(req)) {
      return { rows: [], errors: [{ row: 0, message: `필수 컬럼 "${req}"가 없습니다.` }] };
    }
  }

  const tenantIdSet = new Set(tenants.map(t => t.tenantId));
  const rows: CsvRow[] = [];
  const errors: { row: number; message: string }[] = [];

  for (let i = 1; i < rawRows.length; i++) {
    const cells = rawRows[i];
    const get = (name: string) => {
      const idx = headers.indexOf(name);
      return idx >= 0 && idx < cells.length ? cells[idx] : '';
    };

    const rowNum = i + 1; // 사용자에게 보이는 행 번호

    // questions (필수)
    const questionsRaw = get('questions');
    if (!questionsRaw) {
      errors.push({ row: rowNum, message: 'questions가 비어있습니다.' });
      continue;
    }
    const questions = questionsRaw.split(';').map(q => q.trim()).filter(Boolean);
    if (questions.length === 0) {
      errors.push({ row: rowNum, message: 'questions가 비어있습니다.' });
      continue;
    }

    // answer (필수)
    const answer = get('answer');
    if (!answer) {
      errors.push({ row: rowNum, message: 'answer가 비어있습니다.' });
      continue;
    }

    // tenantIds
    const tenantIdsRaw = get('tenantids');
    let tenantIds: string[] = [];
    if (!tenantIdsRaw || tenantIdsRaw.toLowerCase() === 'all') {
      tenantIds = tenants.map(t => t.tenantId);
    } else {
      tenantIds = tenantIdsRaw.split(';').map(id => id.trim()).filter(Boolean);
      const invalid = tenantIds.filter(id => !tenantIdSet.has(id));
      if (invalid.length > 0) {
        errors.push({ row: rowNum, message: `존재하지 않는 tenantId: ${invalid.join(', ')}` });
        continue;
      }
    }
    if (tenantIds.length === 0) {
      tenantIds = tenants.map(t => t.tenantId);
    }

    // topic
    const topic = get('topic');
    if (topic && !VALID_TOPICS.includes(topic)) {
      errors.push({ row: rowNum, message: `유효하지 않은 topic: "${topic}"` });
      continue;
    }

    // tags
    const tagsRaw = get('tags');
    const tags = tagsRaw ? tagsRaw.split(';').map(t => t.trim()).filter(Boolean) : [];
    const invalidTags = tags.filter(t => !VALID_TAGS.includes(t));
    if (invalidTags.length > 0) {
      errors.push({ row: rowNum, message: `유효하지 않은 tag: ${invalidTags.join(', ')}` });
      continue;
    }

    // handlerType
    const handlerType = (get('handlertype') || 'bot') as 'bot' | 'staff';
    if (!VALID_HANDLER_TYPES.includes(handlerType)) {
      errors.push({ row: rowNum, message: `유효하지 않은 handlerType: "${handlerType}"` });
      continue;
    }

    // handler
    const handler = get('handler') || (handlerType === 'staff' ? 'op' : 'bot');
    if (handler && !VALID_HANDLERS.includes(handler)) {
      errors.push({ row: rowNum, message: `유효하지 않은 handler: "${handler}"` });
      continue;
    }

    // action_product
    const action_product = get('action_product');
    if (action_product && !VALID_ACTION_PRODUCTS.includes(action_product)) {
      errors.push({ row: rowNum, message: `유효하지 않은 action_product: "${action_product}"` });
      continue;
    }

    // action
    const action = get('action');
    if (action && !VALID_ACTION_TYPES.includes(action)) {
      errors.push({ row: rowNum, message: `유효하지 않은 action: "${action}"` });
      continue;
    }

    rows.push({
      tenantIds,
      questions,
      answer,
      guide: get('guide'),
      topic,
      tags,
      handlerType,
      handler,
      rule: get('rule'),
      action_product,
      action,
    });
  }

  return { rows, errors };
}

// ═════════════════��═════════════════════════════════════════
// 컴포넌트
// ═══════════════════════════════════════════════════════════

export default function CsFaqCsvUploadModal({ isOpen, onClose, onUpload, tenants }: CsFaqCsvUploadModalProps) {
  const [step, setStep] = useState<'upload' | 'preview'>('upload');
  const [parsed, setParsed] = useState<ParsedResult | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const result = parseAndValidate(text, tenants);
      setParsed(result);
      setStep('preview');
    };
    reader.readAsText(file, 'UTF-8');
  };

  const handleUpload = async () => {
    if (!parsed || parsed.rows.length === 0) return;
    setUploading(true);
    try {
      await onUpload(parsed.rows);
      handleClose();
    } catch {
      alert('CSV 업로드 중 오류가 발생했습니다.');
    } finally {
      setUploading(false);
    }
  };

  const handleClose = () => {
    setStep('upload');
    setParsed(null);
    if (fileRef.current) fileRef.current.value = '';
    onClose();
  };

  const tenantName = (id: string) => tenants.find(t => t.tenantId === id)?.brandName || id;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">CSV 업로드</h2>
          <button onClick={handleClose} className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
            <Xmark className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="px-6 py-4">
          {step === 'upload' && (
            <div className="space-y-4">
              {/* 필드 안내 */}
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm font-medium text-gray-700 mb-2">CSV 컬럼 형식</p>
                <div className="space-y-1 text-xs text-gray-500">
                  <p><span className="font-mono bg-gray-200 px-1 rounded text-red-600">questions*</span> 세미콜론 구분 (예: Q1;Q2;Q3)</p>
                  <p><span className="font-mono bg-gray-200 px-1 rounded text-red-600">answer*</span> 답변 텍스트</p>
                  <p><span className="font-mono bg-gray-200 px-1 rounded">tenantIds</span> 매장 ID 세미콜론 구분 (비우면 전체 매장)</p>
                  <p><span className="font-mono bg-gray-200 px-1 rounded">guide</span> 답변 참고</p>
                  <p><span className="font-mono bg-gray-200 px-1 rounded">topic</span> {VALID_TOPICS.join(' | ')}</p>
                  <p><span className="font-mono bg-gray-200 px-1 rounded">tags</span> 세미콜론 구분 ({VALID_TAGS.join(', ')})</p>
                  <p><span className="font-mono bg-gray-200 px-1 rounded">handlerType</span> bot | staff (기본: bot)</p>
                  <p><span className="font-mono bg-gray-200 px-1 rounded">handler</span> bot | op | manager</p>
                  <p><span className="font-mono bg-gray-200 px-1 rounded">rule</span> 사전 안내</p>
                  <p><span className="font-mono bg-gray-200 px-1 rounded">action_product</span> {VALID_ACTION_PRODUCTS.join(' | ')}</p>
                  <p><span className="font-mono bg-gray-200 px-1 rounded">action</span> {VALID_ACTION_TYPES.join(' | ')}</p>
                </div>
                <p className="text-xs text-gray-400 mt-2">* 필수 컬럼. 나머지는 선택.</p>
              </div>

              {/* 파일 선택 */}
              <div
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-gray-400 hover:bg-gray-50 transition-colors"
              >
                <Upload className="w-8 h-8 mx-auto text-gray-400 mb-3" />
                <p className="text-sm text-gray-600 font-medium">CSV 파일을 선택하세요</p>
                <p className="text-xs text-gray-400 mt-1">UTF-8 인코딩</p>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>
          )}

          {step === 'preview' && parsed && (
            <div className="space-y-4">
              {/* 요약 */}
              <div className="flex items-center gap-4">
                <div className="px-3 py-2 bg-blue-50 rounded-lg">
                  <span className="text-sm font-medium text-blue-700">{parsed.rows.length}건</span>
                  <span className="text-xs text-blue-500 ml-1">등록 가능</span>
                </div>
                {parsed.errors.length > 0 && (
                  <div className="px-3 py-2 bg-red-50 rounded-lg">
                    <span className="text-sm font-medium text-red-700">{parsed.errors.length}건</span>
                    <span className="text-xs text-red-500 ml-1">오류</span>
                  </div>
                )}
              </div>

              {/* 에러 목록 */}
              {parsed.errors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <div className="flex items-center gap-1.5 mb-2">
                    <WarningTriangle className="w-4 h-4 text-red-500" />
                    <span className="text-sm font-medium text-red-700">오류 행 (건너뜀)</span>
                  </div>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {parsed.errors.map((err, idx) => (
                      <p key={idx} className="text-xs text-red-600">
                        <span className="font-mono font-medium">행 {err.row}:</span> {err.message}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {/* 미리보기 테이블 */}
              {parsed.rows.length > 0 && (
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                        <tr>
                          <th className="text-left px-3 py-2 text-gray-500 font-medium">#</th>
                          <th className="text-left px-3 py-2 text-gray-500 font-medium min-w-[100px]">매장</th>
                          <th className="text-left px-3 py-2 text-gray-500 font-medium min-w-[160px]">질문</th>
                          <th className="text-left px-3 py-2 text-gray-500 font-medium min-w-[120px]">답변</th>
                          <th className="text-left px-3 py-2 text-gray-500 font-medium">처리</th>
                          <th className="text-left px-3 py-2 text-gray-500 font-medium">topic</th>
                          <th className="text-left px-3 py-2 text-gray-500 font-medium">tags</th>
                          <th className="text-left px-3 py-2 text-gray-500 font-medium">action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {parsed.rows.slice(0, 50).map((row, idx) => (
                          <tr key={idx} className="hover:bg-gray-50">
                            <td className="px-3 py-2 text-gray-400">{idx + 1}</td>
                            <td className="px-3 py-2">
                              {row.tenantIds.length === tenants.length ? (
                                <span className="text-gray-500">전체 ({tenants.length})</span>
                              ) : (
                                <span className="text-gray-700">
                                  {row.tenantIds.slice(0, 2).map(id => tenantName(id)).join(', ')}
                                  {row.tenantIds.length > 2 && ` +${row.tenantIds.length - 2}`}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-gray-700 max-w-[200px] truncate">
                              {row.questions[0]}
                              {row.questions.length > 1 && (
                                <span className="text-gray-400 ml-1">+{row.questions.length - 1}</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-gray-600 max-w-[160px] truncate">{row.answer}</td>
                            <td className="px-3 py-2">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                row.handlerType === 'staff' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                              }`}>
                                {row.handlerType === 'staff' ? '담당자' : 'AI'}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-gray-600">{row.topic || '—'}</td>
                            <td className="px-3 py-2 text-gray-600">{row.tags.join(', ') || '—'}</td>
                            <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                              {row.action_product || row.action
                                ? `${row.action_product || ''} ${row.action || ''}`.trim()
                                : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {parsed.rows.length > 50 && (
                    <div className="px-3 py-2 bg-gray-50 border-t border-gray-200 text-xs text-gray-400 text-center">
                      상위 50건만 표시 (전체 {parsed.rows.length}건)
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
          {step === 'preview' && (
            <button
              onClick={() => { setStep('upload'); setParsed(null); if (fileRef.current) fileRef.current.value = ''; }}
              className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              다시 선택
            </button>
          )}
          {step === 'upload' && <div />}
          <div className="flex items-center gap-3">
            <button
              onClick={handleClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              취소
            </button>
            {step === 'preview' && parsed && parsed.rows.length > 0 && (
              <button
                onClick={handleUpload}
                disabled={uploading}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {uploading ? '등록 중...' : `${parsed.rows.length}건 등록`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export type { CsvRow };