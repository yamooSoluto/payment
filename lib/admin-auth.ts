import { adminDb, initializeFirebaseAdmin } from './firebase-admin';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';

const SALT_ROUNDS = 12;
const SESSION_EXPIRY_DAYS = 30; // 1개월
const SESSION_COOKIE_NAME = 'admin_session';

export interface Admin {
  id: string;
  loginId: string;
  name: string;
  role: 'owner' | 'super' | 'admin' | 'viewer';
  permissions: string[];
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt?: Date;
}

export interface AdminSession {
  adminId: string;
  loginId: string;
  name: string;
  role: 'owner' | 'super' | 'admin' | 'viewer';
  expiresAt: Date;
  createdAt: Date;
}

type AdminRole = 'owner' | 'super' | 'admin' | 'viewer';

// 권한 정의 (owner는 모든 권한 보유)
export const PERMISSIONS: Record<string, AdminRole[]> = {
  // 대시보드
  'dashboard:read': ['owner', 'super', 'admin', 'viewer'],

  // 회원 관리
  'members:read': ['owner', 'super', 'admin', 'viewer'],
  'members:write': ['owner', 'super', 'admin'],
  'members:delete': ['owner', 'super', 'admin'],

  // 운영진 관리
  'admins:read': ['owner', 'super'],
  'admins:write': ['owner', 'super'],
  'admins:delete': ['owner', 'super'],

  // 상품 관리
  'plans:read': ['owner', 'super', 'admin', 'viewer'],
  'plans:write': ['owner', 'super', 'admin'],
  'plans:delete': ['owner', 'super', 'admin'],

  // 주문 내역
  'orders:read': ['owner', 'super', 'admin', 'viewer'],
  'orders:write': ['owner', 'super', 'admin'],
  'orders:export': ['owner', 'super', 'admin'],

  // 구독 관리
  'subscriptions:read': ['owner', 'super', 'admin', 'viewer'],
  'subscriptions:write': ['owner', 'super', 'admin'],

  // 통계
  'stats:read': ['owner', 'super', 'admin', 'viewer'],

  // 알림톡
  'notifications:read': ['owner', 'super', 'admin', 'viewer'],
  'notifications:write': ['owner', 'super', 'admin'],
  'notifications:send': ['owner', 'super', 'admin'],

  // 설정
  'settings:read': ['owner', 'super', 'admin'],
  'settings:write': ['owner', 'super'],
};

export type Permission = keyof typeof PERMISSIONS;

// DB에서 가져온 권한 설정 캐시
let cachedRolePermissions: Record<string, string[]> | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL = 60 * 1000; // 1분 캐시

// DB에서 권한 설정 로드
export async function loadRolePermissions(): Promise<Record<string, string[]>> {
  const now = Date.now();

  // 캐시가 유효하면 캐시된 값 반환
  if (cachedRolePermissions && (now - cacheTimestamp) < CACHE_TTL) {
    return cachedRolePermissions;
  }

  const db = adminDb || initializeFirebaseAdmin();
  if (!db) {
    // DB 연결 실패 시 기본 권한 반환
    return getDefaultRolePermissions();
  }

  try {
    const settingsDoc = await db.collection('settings').doc('role_permissions').get();

    let permissions: Record<string, string[]>;
    if (settingsDoc.exists) {
      const data = settingsDoc.data();
      permissions = data?.permissions || getDefaultRolePermissions();
    } else {
      permissions = getDefaultRolePermissions();
    }

    cachedRolePermissions = permissions;
    cacheTimestamp = now;
    return permissions;
  } catch (error) {
    console.error('Failed to load role permissions:', error);
    return getDefaultRolePermissions();
  }
}

// 기본 권한 설정 (PERMISSIONS 객체 기반)
function getDefaultRolePermissions(): Record<string, string[]> {
  const permissions: Record<string, string[]> = {
    super: [],
    admin: [],
    viewer: [],
  };

  for (const [permission, roles] of Object.entries(PERMISSIONS)) {
    if (roles.includes('super')) permissions.super.push(permission);
    if (roles.includes('admin')) permissions.admin.push(permission);
    if (roles.includes('viewer')) permissions.viewer.push(permission);
  }

  return permissions;
}

// 권한 캐시 무효화
export function invalidatePermissionsCache(): void {
  cachedRolePermissions = null;
  cacheTimestamp = 0;
}

// 비밀번호 해싱
export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, SALT_ROUNDS);
}

// 비밀번호 검증
export function verifyPassword(password: string, hash: string): boolean {
  return bcrypt.compareSync(password, hash);
}

// 세션 토큰 생성
export async function createAdminSession(
  adminId: string,
  loginId: string,
  name: string,
  role: 'owner' | 'super' | 'admin' | 'viewer'
): Promise<string> {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) throw new Error('Database unavailable');

  const sessionToken = uuidv4();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  await db.collection('admin_sessions').doc(sessionToken).set({
    adminId,
    loginId,
    name,
    role,
    expiresAt,
    createdAt: now,
  });

  return sessionToken;
}

// 세션 검증
export async function verifyAdminSession(sessionToken: string): Promise<AdminSession | null> {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) return null;

  try {
    const sessionDoc = await db.collection('admin_sessions').doc(sessionToken).get();

    if (!sessionDoc.exists) {
      return null;
    }

    const session = sessionDoc.data();
    if (!session) return null;

    // 만료 확인
    const expiresAt = session.expiresAt?.toDate ? session.expiresAt.toDate() : new Date(session.expiresAt);
    if (expiresAt < new Date()) {
      // 만료된 세션 삭제
      await db.collection('admin_sessions').doc(sessionToken).delete();
      return null;
    }

    return {
      adminId: session.adminId,
      loginId: session.loginId,
      name: session.name,
      role: session.role,
      expiresAt,
      createdAt: session.createdAt?.toDate ? session.createdAt.toDate() : new Date(session.createdAt),
    };
  } catch (error) {
    console.error('Session verification error:', error);
    return null;
  }
}

// 세션 삭제
export async function deleteAdminSession(sessionToken: string): Promise<boolean> {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) return false;

  try {
    await db.collection('admin_sessions').doc(sessionToken).delete();
    return true;
  } catch (error) {
    console.error('Session deletion error:', error);
    return false;
  }
}

// Request에서 관리자 정보 가져오기 (API 라우트용)
export async function getAdminFromRequest(request: NextRequest): Promise<AdminSession | null> {
  const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionToken) {
    return null;
  }

  return verifyAdminSession(sessionToken);
}

// 서버 컴포넌트에서 관리자 정보 가져오기
export async function getAdminFromCookies(): Promise<AdminSession | null> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionToken) {
    return null;
  }

  return verifyAdminSession(sessionToken);
}

// 권한 확인 (기본 권한 - 동기적)
export function hasPermission(admin: AdminSession, permission: Permission): boolean {
  // owner는 항상 모든 권한 보유
  if (admin.role === 'owner') {
    return true;
  }

  const allowedRoles = PERMISSIONS[permission];
  if (!allowedRoles) {
    console.error(`Permission not defined: ${permission}`);
    return false;
  }
  return allowedRoles.includes(admin.role);
}

// 권한 확인 (DB 기반 - 비동기)
export async function hasPermissionAsync(admin: AdminSession, permission: string): Promise<boolean> {
  // owner는 항상 모든 권한 보유
  if (admin.role === 'owner') {
    return true;
  }

  try {
    const rolePermissions = await loadRolePermissions();
    const permissions = rolePermissions[admin.role] || [];
    return permissions.includes(permission);
  } catch (error) {
    console.error('Permission check error:', error);
    // 에러 시 기본 권한으로 폴백
    return hasPermission(admin, permission as Permission);
  }
}

// 로그인 ID로 관리자 찾기 (username 또는 loginId 필드 모두 지원)
export async function findAdminByLoginId(loginId: string): Promise<(Admin & { passwordHash: string }) | null> {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) return null;

  try {
    // username 필드로 먼저 검색
    let snapshot = await db.collection('admins')
      .where('username', '==', loginId)
      .limit(1)
      .get();

    // username으로 못 찾으면 loginId로 검색 (레거시 데이터 호환)
    if (snapshot.empty) {
      snapshot = await db.collection('admins')
        .where('loginId', '==', loginId)
        .limit(1)
        .get();
    }

    if (snapshot.empty) {
      return null;
    }

    const doc = snapshot.docs[0];
    const data = doc.data();

    return {
      id: doc.id,
      loginId: data.username || data.loginId,
      name: data.name,
      role: data.role,
      permissions: data.permissions || [],
      passwordHash: data.passwordHash,
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt),
      updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date(data.updatedAt),
      lastLoginAt: data.lastLoginAt?.toDate ? data.lastLoginAt.toDate() : undefined,
    };
  } catch (error) {
    console.error('Find admin error:', error);
    return null;
  }
}

// 마지막 로그인 시간 업데이트
export async function updateLastLogin(adminId: string): Promise<void> {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) return;

  try {
    await db.collection('admins').doc(adminId).update({
      lastLoginAt: new Date(),
    });
  } catch (error) {
    console.error('Update last login error:', error);
  }
}

// 세션 쿠키 이름 export
export { SESSION_COOKIE_NAME };
