export type PermissionLevel = 'hidden' | 'read' | 'write';

export interface PermissionSection {
  key: string;
  label: string;
  description: string;
}

// 포탈에 새 섹션이 추가되면 이 배열에만 추가하면 홈페이지 UI에 자동 반영됨
export const PERMISSION_SECTIONS: PermissionSection[] = [
  { key: 'conversations', label: '대화',       description: '고객 대화 조회 및 상담 참여' },
  { key: 'data',          label: '데이터',     description: 'FAQ 및 데이터 조회/편집' },
  { key: 'statistics',    label: '통계',       description: '통계 조회 및 데이터 추출' },
  { key: 'tasks',         label: '업무',       description: '업무 조회 및 처리 기록' },
];

// 매니저 관리 권한 (별도 섹션 — hidden/read/write, 기본 hidden)
export const MANAGER_ADMIN_PERMISSION: PermissionSection = {
  key: 'managers', label: '매니저 관리', description: '매니저 목록 조회, 초대 및 권한 수정',
};

export type ManagerPermissions = Record<string, PermissionLevel>;

// 신규 매니저 생성 시 기본값 (콘텐츠 섹션: read, 매니저 관리: hidden)
export const DEFAULT_PERMISSIONS: ManagerPermissions = {
  ...Object.fromEntries(PERMISSION_SECTIONS.map(s => [s.key, 'read' as PermissionLevel])),
  [MANAGER_ADMIN_PERMISSION.key]: 'hidden' as PermissionLevel,
};
