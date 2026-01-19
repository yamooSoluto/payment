'use client';

import { useState } from 'react';
import { NavArrowDown, NavArrowRight, Copy, Check, Code, List } from 'iconoir-react';
import { INDUSTRIES, IndustryCode } from '@/lib/constants';

// csTone 필드 매핑 (asst_* ID → 친숙한 라벨)
const CS_TONE_OPTIONS: Record<string, string> = {
  'asst_7fV8slbPgcscXGoiyzLCrOqG': 'cute',
  'asst_1Dz4DylCNTNnaVQbrW3WlmCH': 'basic',
  'asst_hKaWohoAZehPvV50iRyPGuRo': 'GPT',
  'asst_5pHyGmGCRrRQDtQeWh2LYRGq': 'sweet',
  'asst_HJHT1weZPZO1UZAuDryCBjhA': 'ajae',
  'asst_o0yi4J6uAJG8G9ZQhDF34rQu': 'brother',
  'asst_dRBKDqplI86xxUyExv6HnY4V': 'duck',
};

// 읽기 전용 필드 목록
const READ_ONLY_FIELDS = [
  'id', 'tenantId', 'email', 'userId',
  'deleted', 'deletedAt', 'deletedBy', 'permanentDeleteAt',
  'createdAt', 'createdBy', 'updatedAt', 'updatedBy',
  'isManualRegistration', 'onboardingCompletedAt',
  'widgetUrl', 'naverInboundUrl', 'webhook',
  // 구독 관련 (구독 페이지에서 관리)
  'plan', 'planId', 'subscription', 'subscriptionStatus', 'orderNo', 'totalPrice'
];

// 민감 필드 패턴 (마스킹 처리)
const SENSITIVE_FIELD_PATTERNS = [
  'secretKey', 'accessKey', 'apiKey', 'token', 'password', 'secret',
  'billingKey', 'privateKey', 'credential', 'auth'
];

// 필드명이 민감 필드인지 확인
function isSensitiveField(fieldName: string): boolean {
  const lowerName = fieldName.toLowerCase();
  return SENSITIVE_FIELD_PATTERNS.some(pattern => lowerName.includes(pattern.toLowerCase()));
}

// 민감 값 마스킹 (마지막 6자만 표시)
function maskSensitiveValue(value: string): string {
  if (!value || value.length <= 6) return '••••••';
  return '••••••••' + value.slice(-6);
}

// ISO 날짜 문자열 체크
function isISODateString(value: string): boolean {
  if (typeof value !== 'string') return false;
  const isoPattern = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?)?$/;
  if (!isoPattern.test(value)) return false;
  const date = new Date(value);
  return !isNaN(date.getTime());
}

// 항상 JSON 타입으로 처리해야 하는 필드 목록
// 주의: webhook, widgetUrl, naverInboundUrl, taskBoard 등 URL 문자열 필드는 제외
const JSON_TYPE_FIELDS = [
  'slack', 'channeltalk', 'naverAuthorization',
  'meta', 'storeInfo', 'addons', 'policy', 'qa',
  'criteria', 'items', 'library', 'trial', 'subscription'
];

// JSON 필드의 기본 스키마 (null이거나 빈 객체일 때 표시할 필드 구조)
const DEFAULT_JSON_SCHEMAS: Record<string, Record<string, unknown>> = {
  channeltalk: {
    secretKey: null,
    accessKey: null,
    botName: null,
    webhookToken: null,
    channelId: null,
    subChannels: null,
  },
  slack: {
    allowedUserIds: [],
    routeTable: null,
    signingSecretRef: null,
    teamId: null,
    defaultChannelId: null,
    opsChannelId: null,
    defaultTeam: null,
    botTokenSecretRef: null,
    routing: null,
    defaultMentions: null,
  },
  naverAuthorization: {
    accessToken: null,
    refreshToken: null,
    expiresAt: null,
  },
};

// JSON 필드 값에 기본 스키마 적용
function applyDefaultSchema(fieldName: string, value: unknown): unknown {
  const defaultSchema = DEFAULT_JSON_SCHEMAS[fieldName];
  if (!defaultSchema) return value;

  // 값이 null이거나 빈 객체면 기본 스키마 사용
  if (value === null || value === undefined) {
    return { ...defaultSchema };
  }

  // 값이 객체면 기본 스키마와 병합 (기존 값 우선)
  if (typeof value === 'object' && !Array.isArray(value)) {
    return { ...defaultSchema, ...(value as Record<string, unknown>) };
  }

  return value;
}

// 필드 타입 추론
type FieldType = 'text' | 'textarea' | 'json' | 'boolean' | 'date' | 'number' | 'url';

// 특수 필드에서 URL 추출 (예: taskBoard.viewUrl)
function extractUrlFromField(fieldName: string, value: unknown): string | null {
  if (fieldName === 'taskBoard' && typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>;
    if (typeof obj.viewUrl === 'string' && obj.viewUrl.startsWith('http')) {
      return obj.viewUrl;
    }
  }
  return null;
}

function inferFieldType(value: unknown, fieldName: string): FieldType {
  // JSON 타입 필드는 값이 null이어도 json으로 처리
  if (JSON_TYPE_FIELDS.includes(fieldName)) return 'json';

  // taskBoard는 viewUrl이 있으면 URL로 처리
  if (fieldName === 'taskBoard' && extractUrlFromField(fieldName, value)) {
    return 'url';
  }

  if (value === null || value === undefined) return 'text';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'string') {
    if (isISODateString(value)) return 'date';
    if (value.startsWith('http://') || value.startsWith('https://')) return 'url';
    if (value.length > 100) return 'textarea';
    return 'text';
  }
  if (typeof value === 'object') return 'json';
  return 'text';
}

// 필드별 아이콘 맵
const FIELD_ICONS: Record<string, string> = {
  slack: '/slack.png',
  channeltalk: '/channeltalk.png',
  webhook: '/n8n.png',
  widgetUrl: '/chatwoot.png',
  naverInboundUrl: '/naver_talktalk.png',
};

// 업종 코드를 한글 라벨로 변환
function getIndustryLabel(value: string): string {
  // 코드인 경우 라벨로 변환
  if (value in INDUSTRIES) {
    return INDUSTRIES[value as IndustryCode];
  }
  // 이미 한글 라벨이면 그대로 반환
  return value;
}

// csTone 코드를 라벨로 변환
function getCsToneLabel(value: string): string {
  return CS_TONE_OPTIONS[value] || value;
}

// 특수 필드 값 포맷팅
function formatFieldValue(fieldName: string, value: unknown): unknown {
  if (fieldName === 'industry' && typeof value === 'string') {
    return getIndustryLabel(value);
  }
  if (fieldName === 'csTone' && typeof value === 'string') {
    return getCsToneLabel(value);
  }
  return value;
}

// 필드 라벨 변환 (camelCase -> 읽기 쉬운 형태)
function formatFieldLabel(fieldName: string): string {
  const labelMap: Record<string, string> = {
    tenantId: 'Tenant ID',
    brandName: '매장명',
    brandCode: '브랜드 코드',
    branchNo: '지점 번호',
    email: '이메일',
    phone: '연락처',
    name: '회원',
    userId: '사용자 ID',
    industry: '업종',
    address: '주소',
    ai_stop: 'AI 정지',
    deleted: '삭제 여부',
    deletedAt: '삭제일',
    deletedBy: '삭제자',
    permanentDeleteAt: '영구 삭제 예정일',
    createdAt: '생성일',
    createdBy: '생성자',
    updatedAt: '수정일',
    updatedBy: '수정자',
    onboardingCompleted: '온보딩 완료',
    onboardingCompletedAt: '온보딩 완료일',
    storeInfo: '매장 정보',
    storeInfoCompleted: '매장 정보 완료',
    locale: '언어',
    timezone: '타임존',
    opsTimeStart: '운영 시작 시간',
    opsTimeEnd: '운영 종료 시간',
    csTone: 'AI 톤',
    avatar_url: '아바타 URL',
    tenantPrompt: '테넌트 프롬프트',
    tenantItem: '테넌트 아이템',
    criteria: 'AI 기준',
    items: '아이템',
    library: '라이브러리',
    meta: '메타 정보',
    slack: 'Slack 연동',
    channeltalk: '채널톡 연동',
    naverAuthorization: '네이버 인증',
    taskBoard: '태스크 보드',
    addons: '부가 기능',
    policy: '정책',
    qa: 'QA 설정',
    widgetUrl: '위젯 URL',
    naverInboundUrl: '네이버 인바운드 URL',
    webhook: '웹훅 URL',
    isManualRegistration: '수동 등록',
    plan: '플랜',
    planId: '플랜 ID',
    subscription: '구독',
    subscriptionStatus: '구독 상태',
    orderNo: '주문 번호',
    totalPrice: '총 가격',
    hasBillingKey: '빌링키 등록',
    billingKey: '빌링키',
    trial: '트라이얼',
  };

  return labelMap[fieldName] || fieldName
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, str => str.toUpperCase())
    .trim();
}

interface DynamicFieldProps {
  fieldName: string;
  value: unknown;
  onChange?: (fieldName: string, value: unknown) => void;
  disabled?: boolean;
}

export function DynamicField({ fieldName, value, onChange, disabled }: DynamicFieldProps) {
  const [copied, setCopied] = useState(false);
  const [jsonEditMode, setJsonEditMode] = useState<'fields' | 'json'>('fields');
  const isReadOnly = READ_ONLY_FIELDS.includes(fieldName) || disabled;
  const fieldType = inferFieldType(value, fieldName);
  const label = formatFieldLabel(fieldName);

  // JSON 타입 필드는 기본 스키마 적용 (null이어도 필드 구조 표시)
  const processedValue = fieldType === 'json' ? applyDefaultSchema(fieldName, value) : value;

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      console.error('Copy failed');
    }
  };

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleString('ko-KR');
    } catch {
      return dateString;
    }
  };

  const formatDateForInput = (dateString: string) => {
    try {
      return new Date(dateString).toISOString().split('T')[0];
    } catch {
      return '';
    }
  };

  // 읽기 전용 필드 렌더링
  const renderReadOnlyValue = () => {
    if (value === null || value === undefined) {
      return <span className="text-gray-400">-</span>;
    }

    if (typeof value === 'boolean') {
      return (
        <span className={`px-2 py-1 text-xs font-medium rounded-full ${value ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
          {value ? '예' : '아니오'}
        </span>
      );
    }

    if (fieldType === 'date' && typeof value === 'string') {
      return <span className="text-gray-900">{formatDate(value)}</span>;
    }

    if (fieldType === 'url') {
      // taskBoard 등 특수 필드에서 URL 추출, 또는 문자열 값 직접 사용
      const urlValue = extractUrlFromField(fieldName, value) || (typeof value === 'string' ? value : null);
      if (urlValue) {
        return (
          <div className="flex items-start gap-2">
            <a href={urlValue} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all">
              {urlValue}
            </a>
            <button
              onClick={() => handleCopy(urlValue)}
              className="p-1 hover:bg-gray-100 rounded flex-shrink-0"
              title="복사"
            >
              {copied ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3 text-gray-400" />}
            </button>
          </div>
        );
      }
    }

    if (fieldType === 'json') {
      const jsonObj = typeof processedValue === 'object' && processedValue !== null ? processedValue : {};
      const isArray = Array.isArray(processedValue);

      // 필드 뷰로 펼쳐서 보여줌
      return (
        <div className="w-full">
          <div className="space-y-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
            {isArray ? (
              // 배열인 경우
              (processedValue as unknown[]).length > 0 ? (
                (processedValue as unknown[]).map((item, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 w-8">[{index}]</span>
                    <span className="flex-1 text-sm text-gray-900">{String(item ?? '-')}</span>
                  </div>
                ))
              ) : (
                <p className="text-xs text-gray-400 text-center py-2">빈 배열입니다</p>
              )
            ) : (
              // 객체인 경우
              Object.entries(jsonObj as Record<string, unknown>).length > 0 ? (
                Object.entries(jsonObj as Record<string, unknown>).map(([key, val]) => {
                  const isNestedObject = typeof val === 'object' && val !== null;
                  const isSensitive = isSensitiveField(key);
                  const strVal = val === null ? '' : String(val);

                  return (
                    <div key={key} className="flex items-start gap-2">
                      <span className="text-xs text-gray-600 w-28 pt-1 truncate" title={key}>
                        {key}
                      </span>
                      {isNestedObject ? (
                        <pre className="flex-1 px-2 py-1.5 text-xs bg-white border border-gray-200 rounded overflow-x-auto">
                          {JSON.stringify(val, null, 2)}
                        </pre>
                      ) : val === null ? (
                        <span className="flex-1 text-sm text-gray-400">null</span>
                      ) : isSensitive && typeof val === 'string' && val ? (
                        <span className="flex-1 text-sm text-gray-900 font-mono">
                          {maskSensitiveValue(strVal)}
                        </span>
                      ) : typeof val === 'string' && val.includes('\n') ? (
                        <pre className="flex-1 text-sm text-gray-900 whitespace-pre-wrap break-words">{strVal}</pre>
                      ) : (
                        <span className="flex-1 text-sm text-gray-900">{strVal || '-'}</span>
                      )}
                    </div>
                  );
                })
              ) : (
                <p className="text-xs text-gray-400 text-center py-2">값이 없습니다</p>
              )
            )}
          </div>
        </div>
      );
    }

    // 특수 필드 값 포맷팅 (예: industry 코드를 한글로 변환)
    const displayValue = formatFieldValue(fieldName, value);
    return <span className="text-gray-900">{String(displayValue)}</span>;
  };

  // 편집 가능 필드 렌더링
  const renderEditableField = () => {
    if (fieldType === 'boolean') {
      return (
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={!!value}
            onChange={(e) => onChange?.(fieldName, e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
        </label>
      );
    }

    if (fieldType === 'date' && typeof value === 'string') {
      return (
        <input
          type="date"
          value={formatDateForInput(value)}
          onChange={(e) => onChange?.(fieldName, e.target.value ? new Date(e.target.value).toISOString() : null)}
          className="px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
        />
      );
    }

    if (fieldType === 'number') {
      return (
        <input
          type="number"
          value={value as number ?? ''}
          onChange={(e) => onChange?.(fieldName, e.target.value ? parseFloat(e.target.value) : null)}
          className="px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm w-40"
        />
      );
    }

    if (fieldType === 'textarea') {
      return (
        <textarea
          value={String(value ?? '')}
          onChange={(e) => onChange?.(fieldName, e.target.value)}
          rows={3}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm resize-y"
        />
      );
    }

    if (fieldType === 'json') {
      const jsonObj = typeof processedValue === 'object' && processedValue !== null ? processedValue : {};
      const jsonString = typeof processedValue === 'string' ? processedValue : JSON.stringify(processedValue, null, 2);
      const isArray = Array.isArray(processedValue);

      // 필드별 값 변경 핸들러
      const handleFieldValueChange = (key: string, newValue: string) => {
        if (isArray) {
          const newArray = [...(processedValue as unknown[])];
          const index = parseInt(key);
          newArray[index] = newValue;
          onChange?.(fieldName, newArray);
        } else {
          const currentObj = processedValue as Record<string, unknown>;
          // 원래 값의 타입에 맞게 변환 시도
          const originalValue = currentObj[key];
          let parsedValue: unknown = newValue;

          if (typeof originalValue === 'number') {
            const num = parseFloat(newValue);
            parsedValue = isNaN(num) ? newValue : num;
          } else if (typeof originalValue === 'boolean') {
            parsedValue = newValue === 'true';
          } else if (originalValue === null && newValue === '') {
            parsedValue = null;
          }

          onChange?.(fieldName, { ...currentObj, [key]: parsedValue });
        }
      };

      return (
        <div className="w-full">
          {/* 모드 토글 */}
          <div className="flex items-center gap-1 mb-2">
            <button
              type="button"
              onClick={() => setJsonEditMode('fields')}
              className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${
                jsonEditMode === 'fields'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <List className="w-3 h-3" />
              필드
            </button>
            <button
              type="button"
              onClick={() => setJsonEditMode('json')}
              className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${
                jsonEditMode === 'json'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <Code className="w-3 h-3" />
              JSON
            </button>
          </div>

          {/* 필드 모드 */}
          {jsonEditMode === 'fields' && (
            <div className="space-y-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
              {isArray ? (
                // 배열인 경우
                (value as unknown[]).map((item, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 w-8">[{index}]</span>
                    <input
                      type="text"
                      value={String(item ?? '')}
                      onChange={(e) => handleFieldValueChange(String(index), e.target.value)}
                      className="flex-1 px-2 py-1.5 text-sm border border-gray-200 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                ))
              ) : (
                // 객체인 경우
                Object.entries(jsonObj as Record<string, unknown>).map(([key, val]) => {
                  const isNestedObject = typeof val === 'object' && val !== null;
                  const strVal = val === null ? '' : String(val);

                  return (
                    <div key={key} className="flex items-start gap-2">
                      <span className="text-xs text-gray-600 w-28 pt-2 truncate" title={key}>
                        {key}
                      </span>
                      {isNestedObject ? (
                        <pre className="flex-1 px-2 py-1.5 text-xs bg-white border border-gray-200 rounded overflow-x-auto">
                          {JSON.stringify(val, null, 2)}
                        </pre>
                      ) : typeof val === 'string' && (val.includes('\n') || val.length > 80) ? (
                        <textarea
                          value={val}
                          onChange={(e) => handleFieldValueChange(key, e.target.value)}
                          rows={Math.min(10, Math.max(3, val.split('\n').length + 1))}
                          className="flex-1 px-2 py-1.5 text-sm border border-gray-200 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y"
                        />
                      ) : (
                        <input
                          type="text"
                          value={strVal}
                          onChange={(e) => handleFieldValueChange(key, e.target.value)}
                          placeholder={val === null ? 'null' : ''}
                          className="flex-1 px-2 py-1.5 text-sm border border-gray-200 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      )}
                    </div>
                  );
                })
              )}
              {Object.keys(jsonObj).length === 0 && !isArray && (
                <div className="text-center py-3">
                  <p className="text-xs text-gray-400 mb-2">값이 없습니다</p>
                  <button
                    type="button"
                    onClick={() => setJsonEditMode('json')}
                    className="text-xs text-blue-600 hover:text-blue-800 underline"
                  >
                    JSON 모드에서 값 추가하기
                  </button>
                </div>
              )}
            </div>
          )}

          {/* JSON 모드 */}
          {jsonEditMode === 'json' && (
            <textarea
              value={jsonString}
              onChange={(e) => {
                try {
                  const parsed = JSON.parse(e.target.value);
                  onChange?.(fieldName, parsed);
                } catch {
                  // JSON 파싱 실패 시 문자열로 저장
                  onChange?.(fieldName, e.target.value);
                }
              }}
              rows={5}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-xs font-mono resize-y"
            />
          )}
        </div>
      );
    }

    // 업종 필드는 select로 표시
    if (fieldName === 'industry') {
      // 한글 라벨로 저장된 경우 코드로 변환
      const currentValue = String(value ?? '');
      const industryCode = currentValue in INDUSTRIES
        ? currentValue
        : Object.entries(INDUSTRIES).find(([, label]) => label === currentValue)?.[0] || currentValue;

      return (
        <select
          value={industryCode}
          onChange={(e) => onChange?.(fieldName, e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm w-full max-w-md"
        >
          <option value="">선택...</option>
          {Object.entries(INDUSTRIES).map(([code, label]) => (
            <option key={code} value={code}>{label}</option>
          ))}
        </select>
      );
    }

    // csTone 필드는 select로 표시 (asst_* 값으로 저장)
    if (fieldName === 'csTone') {
      const currentValue = String(value ?? '');

      return (
        <select
          value={currentValue}
          onChange={(e) => onChange?.(fieldName, e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm w-full max-w-md"
        >
          <option value="">선택...</option>
          {Object.entries(CS_TONE_OPTIONS).map(([code, label]) => (
            <option key={code} value={code}>{label}</option>
          ))}
        </select>
      );
    }

    // taskBoard 등 특수 필드에서 URL 추출해서 편집
    if (fieldType === 'url' && fieldName === 'taskBoard') {
      const urlValue = extractUrlFromField(fieldName, value) || '';
      return (
        <input
          type="url"
          value={urlValue}
          onChange={(e) => onChange?.(fieldName, { viewUrl: e.target.value })}
          placeholder="https://airtable.com/..."
          className="px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm w-full max-w-md"
        />
      );
    }

    return (
      <input
        type={fieldType === 'url' ? 'url' : 'text'}
        value={String(value ?? '')}
        onChange={(e) => onChange?.(fieldName, e.target.value)}
        className="px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm w-full max-w-md"
      />
    );
  };

  const iconSrc = FIELD_ICONS[fieldName];

  return (
    <div className="py-3 border-b border-gray-100 last:border-0">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <label className="text-sm font-medium text-gray-600 w-40 flex-shrink-0 flex items-center gap-1.5">
          {iconSrc && (
            <img src={iconSrc} alt="" className="w-4 h-4 object-contain" />
          )}
          {label}
        </label>
        <div className="flex-1">
          {isReadOnly ? renderReadOnlyValue() : renderEditableField()}
        </div>
      </div>
    </div>
  );
}

interface DynamicFieldGroupProps {
  title: string;
  fields: Record<string, unknown>;
  onChange?: (fieldName: string, value: unknown) => void;
  disabled?: boolean;
}

export function DynamicFieldGroup({ title, fields, onChange, disabled }: DynamicFieldGroupProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const fieldEntries = Object.entries(fields);

  if (fieldEntries.length === 0) return null;

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">{fieldEntries.length}개 필드</span>
          {isCollapsed ? <NavArrowRight className="w-4 h-4 text-gray-400" /> : <NavArrowDown className="w-4 h-4 text-gray-400" />}
        </div>
      </button>
      {!isCollapsed && (
        <div className="px-4 divide-y divide-gray-100">
          {fieldEntries.map(([key, value]) => (
            <DynamicField
              key={key}
              fieldName={key}
              value={value}
              onChange={onChange}
              disabled={disabled}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default DynamicField;
