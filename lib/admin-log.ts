import { Firestore } from 'firebase-admin/firestore';

// 액션 타입
export type AdminLogAction =
  // 회원 관리
  | 'member_create'
  | 'member_update'
  | 'member_delete'
  | 'member_export'
  // 매장 관리
  | 'tenant_create'
  | 'tenant_update'
  | 'tenant_delete'
  | 'tenant_restore'
  | 'tenant_export'
  | 'tenant_faq_sync'
  | 'tenant_faq_update'
  | 'tenant_faq_delete'
  // 구독 관리
  | 'subscription_start'
  | 'subscription_update'
  | 'subscription_change_plan'
  | 'subscription_cancel'
  | 'subscription_export'
  // 결제 관리
  | 'payment_refund'
  | 'payment_export'
  // 관리자 관리
  | 'admin_create'
  | 'admin_update'
  | 'admin_delete'
  // 상품 관리
  | 'plan_create'
  | 'plan_update'
  | 'plan_delete'
  // FAQ
  | 'faq_create'
  | 'faq_update'
  | 'faq_delete'
  // 설정
  | 'settings_site_update'
  | 'settings_terms_update'
  | 'settings_terms_publish'
  | 'settings_privacy_update'
  | 'settings_privacy_publish';

export type AdminLogCategory =
  | 'member'
  | 'tenant'
  | 'subscription'
  | 'payment'
  | 'admin'
  | 'plan'
  | 'faq'
  | 'settings';

// 액션 → 카테고리 매핑
const ACTION_CATEGORY_MAP: Record<string, AdminLogCategory> = {
  member_create: 'member',
  member_update: 'member',
  member_delete: 'member',
  member_export: 'member',
  tenant_create: 'tenant',
  tenant_update: 'tenant',
  tenant_delete: 'tenant',
  tenant_restore: 'tenant',
  tenant_export: 'tenant',
  tenant_faq_sync: 'tenant',
  tenant_faq_update: 'tenant',
  tenant_faq_delete: 'tenant',
  subscription_start: 'subscription',
  subscription_update: 'subscription',
  subscription_change_plan: 'subscription',
  subscription_cancel: 'subscription',
  subscription_export: 'subscription',
  payment_refund: 'payment',
  payment_export: 'payment',
  admin_create: 'admin',
  admin_update: 'admin',
  admin_delete: 'admin',
  plan_create: 'plan',
  plan_update: 'plan',
  plan_delete: 'plan',
  faq_create: 'faq',
  faq_update: 'faq',
  faq_delete: 'faq',
  settings_site_update: 'settings',
  settings_terms_update: 'settings',
  settings_terms_publish: 'settings',
  settings_privacy_update: 'settings',
  settings_privacy_publish: 'settings',
};

// 한글 라벨
export const ACTION_LABELS: Record<string, string> = {
  // 회원 관리
  member_create: '회원 수동 등록',
  member_update: '회원 정보 수정',
  member_delete: '회원 삭제',
  member_export: '회원 목록 다운로드',
  // 매장 관리
  tenant_create: '매장 생성',
  tenant_update: '매장 정보 수정',
  tenant_delete: '매장 삭제',
  tenant_restore: '매장 복구',
  tenant_export: '매장 목록 다운로드',
  tenant_faq_sync: '매장 FAQ 동기화',
  tenant_faq_update: '매장 FAQ 수정',
  tenant_faq_delete: '매장 FAQ 삭제',
  // 구독 관리
  subscription_start: '구독 시작',
  subscription_update: '구독 정보 수정',
  subscription_change_plan: '플랜 변경',
  subscription_cancel: '구독 해지',
  subscription_export: '구독 목록 다운로드',
  // 결제 관리
  payment_refund: '환불 처리',
  payment_export: '결제 내역 다운로드',
  // 관리자 관리
  admin_create: '관리자 생성',
  admin_update: '관리자 정보 수정',
  admin_delete: '관리자 삭제',
  // 상품 관리
  plan_create: '플랜 생성',
  plan_update: '플랜 수정',
  plan_delete: '플랜 삭제',
  // FAQ
  faq_create: 'FAQ 생성',
  faq_update: 'FAQ 수정',
  faq_delete: 'FAQ 삭제',
  // 설정
  settings_site_update: '사이트 설정 수정',
  settings_terms_update: '이용약관 임시저장',
  settings_terms_publish: '이용약관 배포',
  settings_privacy_update: '개인정보처리방침 임시저장',
  settings_privacy_publish: '개인정보처리방침 배포',
};

export const CATEGORY_LABELS: Record<string, string> = {
  member: '회원 관리',
  tenant: '매장 관리',
  subscription: '구독 관리',
  payment: '결제 관리',
  admin: '관리자 관리',
  plan: '상품 관리',
  faq: 'FAQ',
  settings: '설정',
};

// 관리자 정보 인터페이스
interface AdminInfo {
  adminId: string;
  loginId: string;
  name: string;
}

// 로그 데이터 인터페이스
export interface AdminLogData {
  action: AdminLogAction;

  // 대상 식별
  userId?: string | null;
  email?: string | null;
  phone?: string | null;
  tenantId?: string | null;
  brandName?: string | null;
  targetAdminId?: string | null;
  targetAdminName?: string | null;
  planId?: string | null;
  planName?: string | null;
  faqId?: string | null;

  // 변경 내역
  changes?: Record<string, { from: unknown; to: unknown }>;

  // 상세 데이터
  details?: {
    deletedData?: Record<string, unknown>;
    restoredData?: Record<string, unknown>;
    refundAmount?: number;
    refundReason?: string;
    originalPaymentId?: string;
    previousPlan?: string;
    newPlan?: string;
    cancelMode?: 'scheduled' | 'immediate';
    applyMode?: 'immediate' | 'scheduled';
    version?: number;
    note?: string;
    [key: string]: unknown;
  };
}

/**
 * 관리자 로그 기록
 */
export async function addAdminLog(
  db: Firestore,
  admin: AdminInfo,
  data: AdminLogData
): Promise<string> {
  const category = ACTION_CATEGORY_MAP[data.action];

  const logData: Record<string, unknown> = {
    action: data.action,
    category,
    adminId: admin.adminId,
    adminLoginId: admin.loginId,
    adminName: admin.name,
    createdAt: new Date(),
  };

  // 대상 식별 필드 (값이 있는 경우만)
  if (data.userId !== undefined) logData.userId = data.userId;
  if (data.email !== undefined) logData.email = data.email;
  if (data.phone !== undefined) logData.phone = data.phone;
  if (data.tenantId !== undefined) logData.tenantId = data.tenantId;
  if (data.brandName !== undefined) logData.brandName = data.brandName;
  if (data.targetAdminId !== undefined) logData.targetAdminId = data.targetAdminId;
  if (data.targetAdminName !== undefined) logData.targetAdminName = data.targetAdminName;
  if (data.planId !== undefined) logData.planId = data.planId;
  if (data.planName !== undefined) logData.planName = data.planName;
  if (data.faqId !== undefined) logData.faqId = data.faqId;

  // 변경 내역
  if (data.changes && Object.keys(data.changes).length > 0) {
    logData.changes = data.changes;
  }

  // 상세 데이터
  if (data.details && Object.keys(data.details).length > 0) {
    logData.details = data.details;
  }

  const docRef = await db.collection('admin_task_logs').add(logData);
  return docRef.id;
}

/**
 * 관리자 접속 로그 기록
 */
export async function addAdminAccessLog(
  db: Firestore,
  admin: AdminInfo,
  options?: {
    ip?: string;
    userAgent?: string;
  }
): Promise<string> {
  const logData: Record<string, unknown> = {
    adminId: admin.adminId,
    adminLoginId: admin.loginId,
    adminName: admin.name,
    accessedAt: new Date(),
  };

  if (options?.ip) logData.ip = options.ip;
  if (options?.userAgent) logData.userAgent = options.userAgent;

  const docRef = await db.collection('admin_access_logs').add(logData);
  return docRef.id;
}

/**
 * 변경 내역 객체 생성 헬퍼
 */
export function buildChanges(
  previous: Record<string, unknown>,
  current: Record<string, unknown>,
  fields: string[]
): Record<string, { from: unknown; to: unknown }> {
  const changes: Record<string, { from: unknown; to: unknown }> = {};

  for (const field of fields) {
    const prevValue = previous[field];
    const currValue = current[field];

    if (prevValue !== currValue) {
      changes[field] = { from: prevValue ?? null, to: currValue ?? null };
    }
  }

  return changes;
}
