import { adminDb, initializeFirebaseAdmin } from './firebase-admin';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';
import type { ManagerPermissions } from './manager-permissions';

const SALT_ROUNDS = 12;
const SESSION_EXPIRY_HOURS = 24;
export const MANAGER_SESSION_COOKIE = 'manager_session';

const JWT_SECRET = process.env.JWT_SECRET;

export interface ManagerTenantAccess {
  tenantId: string;
  permissions: ManagerPermissions;
}

export interface Manager {
  managerId: string;
  loginId: string;
  name: string;
  phone?: string;
  slackUserId?: string;
  masterEmail: string;
  active: boolean;
  tenants: ManagerTenantAccess[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ManagerSession {
  sessionId: string;
  managerId: string;
  loginId: string;
  masterEmail: string;
  tenants: ManagerTenantAccess[];
  createdAt: Date;
  expiresAt: Date;
}

function generateManagerId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = 'mg_';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function generateSessionId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = 'ms_';
  for (let i = 0; i < 24; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// 매니저 생성
export async function createManager(
  masterEmail: string,
  data: {
    loginId: string;
    password: string;
    name: string;
    phone?: string;
    tenants?: ManagerTenantAccess[];
  }
): Promise<Manager> {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) throw new Error('Database unavailable');

  if (data.loginId.includes('@')) {
    throw new Error('loginId cannot contain @');
  }

  // 전체 loginId 중복 확인
  const existing = await db.collection('users_managers')
    .where('loginId', '==', data.loginId)
    .limit(1)
    .get();

  if (!existing.empty) {
    throw new Error('loginId already exists');
  }

  const managerId = generateManagerId();
  const passwordHash = bcrypt.hashSync(data.password, SALT_ROUNDS);
  const now = new Date();

  const managerData: Record<string, unknown> = {
    managerId,
    loginId: data.loginId,
    passwordHash,
    name: data.name,
    masterEmail: masterEmail.toLowerCase(),
    active: true,
    tenants: data.tenants || [],
    createdAt: now,
    updatedAt: now,
  };
  if (data.phone) managerData.phone = data.phone;

  await db.collection('users_managers').doc(managerId).set(managerData);

  return {
    managerId,
    loginId: data.loginId,
    name: data.name,
    phone: data.phone,
    masterEmail: masterEmail.toLowerCase(),
    active: true,
    tenants: data.tenants || [],
    createdAt: now,
    updatedAt: now,
  };
}

// 매니저 수정
export async function updateManager(
  managerId: string,
  masterEmail: string,
  updates: {
    name?: string;
    phone?: string;
    password?: string;
    active?: boolean;
    tenants?: ManagerTenantAccess[];
  }
): Promise<void> {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) throw new Error('Database unavailable');

  const doc = await db.collection('users_managers').doc(managerId).get();
  if (!doc.exists) throw new Error('Manager not found');

  const data = doc.data()!;
  if (data.masterEmail !== masterEmail.toLowerCase()) {
    throw new Error('Unauthorized');
  }

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (updates.name !== undefined) updateData.name = updates.name;
  if (updates.phone !== undefined) updateData.phone = updates.phone;
  if (updates.active !== undefined) updateData.active = updates.active;
  if (updates.tenants !== undefined) updateData.tenants = updates.tenants;
  if (updates.password) {
    updateData.passwordHash = bcrypt.hashSync(updates.password, SALT_ROUNDS);
  }

  await db.collection('users_managers').doc(managerId).update(updateData);
}

// 매니저 삭제
export async function deleteManager(managerId: string, masterEmail: string): Promise<void> {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) throw new Error('Database unavailable');

  const doc = await db.collection('users_managers').doc(managerId).get();
  if (!doc.exists) throw new Error('Manager not found');

  const data = doc.data()!;
  if (data.masterEmail !== masterEmail.toLowerCase()) {
    throw new Error('Unauthorized');
  }

  // 해당 매니저의 모든 세션 삭제
  const sessions = await db.collection('manager_sessions')
    .where('managerId', '==', managerId)
    .get();

  const batch = db.batch();
  sessions.docs.forEach(sessionDoc => batch.delete(sessionDoc.ref));
  batch.delete(db.collection('users_managers').doc(managerId));
  await batch.commit();
}

// 매니저 로그인 (포탈 서버 호출용 — 쿠키 없음)
export async function loginManager(
  loginId: string,
  password: string
): Promise<{ managerId: string; loginId: string; masterEmail: string; tenants: ManagerTenantAccess[]; sessionId: string }> {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) throw new Error('Database unavailable');

  const snapshot = await db.collection('users_managers')
    .where('loginId', '==', loginId)
    .limit(1)
    .get();

  if (snapshot.empty) {
    throw new Error('Invalid credentials');
  }

  const doc = snapshot.docs[0];
  const data = doc.data();

  if (!data.active) {
    throw new Error('Account disabled');
  }

  const valid = bcrypt.compareSync(password, data.passwordHash);
  if (!valid) {
    throw new Error('Invalid credentials');
  }

  const sessionId = generateSessionId();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_EXPIRY_HOURS * 60 * 60 * 1000);

  await db.collection('manager_sessions').doc(sessionId).set({
    sessionId,
    managerId: data.managerId,
    loginId: data.loginId,
    masterEmail: data.masterEmail,
    tenants: data.tenants || [],
    createdAt: now,
    expiresAt,
  });

  return {
    managerId: data.managerId,
    loginId: data.loginId,
    masterEmail: data.masterEmail,
    tenants: data.tenants || [],
    sessionId,
  };
}

// 세션 유효성 확인 (항상 최신 매니저 데이터를 반환)
export async function verifyManagerSession(sessionId: string): Promise<ManagerSession | null> {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) return null;

  try {
    const sessionDoc = await db.collection('manager_sessions').doc(sessionId).get();
    if (!sessionDoc.exists) return null;

    const session = sessionDoc.data()!;
    const expiresAt = session.expiresAt?.toDate ? session.expiresAt.toDate() : new Date(session.expiresAt);

    if (expiresAt < new Date()) {
      db.collection('manager_sessions').doc(sessionId).delete()
        .catch(err => console.error('Failed to delete expired manager session:', err));
      return null;
    }

    // 매니저 원본 데이터에서 최신 정보 조회 (권한 변경 즉시 반영)
    const managerDoc = await db.collection('users_managers').doc(session.managerId).get();
    if (!managerDoc.exists) {
      db.collection('manager_sessions').doc(sessionId).delete().catch(() => {});
      return null;
    }

    const manager = managerDoc.data()!;

    // 비활성화된 매니저 → 세션 무효
    if (!manager.active) {
      db.collection('manager_sessions').doc(sessionId).delete().catch(() => {});
      return null;
    }

    return {
      sessionId,
      managerId: manager.managerId,
      loginId: manager.loginId,
      masterEmail: manager.masterEmail,
      tenants: manager.tenants || [],
      createdAt: session.createdAt?.toDate ? session.createdAt.toDate() : new Date(session.createdAt),
      expiresAt,
    };
  } catch (error) {
    console.error('Manager session verification error:', error);
    return null;
  }
}

// 세션 삭제
export async function deleteManagerSession(sessionId: string): Promise<void> {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) return;
  await db.collection('manager_sessions').doc(sessionId).delete();
}

// 포탈 → 홈페이지 SSO용 단기 JWT 생성 (10분)
export function generateManagerBillingToken(session: ManagerSession): string {
  if (!JWT_SECRET) throw new Error('JWT_SECRET not configured');

  return jwt.sign(
    {
      purpose: 'manager_billing',
      managerId: session.managerId,
      loginId: session.loginId,
      masterEmail: session.masterEmail,
      tenants: session.tenants,
      nonce: crypto.randomUUID(),
    },
    JWT_SECRET,
    { expiresIn: '10m' } as jwt.SignOptions
  );
}

// JWT 검증
export function verifyManagerBillingToken(token: string): {
  managerId: string;
  loginId: string;
  masterEmail: string;
  tenants: ManagerTenantAccess[];
} | null {
  if (!JWT_SECRET) return null;

  try {
    const payload = jwt.verify(token, JWT_SECRET) as {
      purpose: string;
      managerId: string;
      loginId: string;
      masterEmail: string;
      tenants: ManagerTenantAccess[];
    };

    if (payload.purpose !== 'manager_billing') return null;

    return {
      managerId: payload.managerId,
      loginId: payload.loginId,
      masterEmail: payload.masterEmail,
      tenants: payload.tenants,
    };
  } catch {
    return null;
  }
}

// 마스터 이메일 기준 매니저 목록 조회
export async function getManagersByMaster(masterEmail: string): Promise<Manager[]> {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) return [];

  try {
    const snapshot = await db.collection('users_managers')
      .where('masterEmail', '==', masterEmail.toLowerCase())
      .get();

    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        managerId: data.managerId,
        loginId: data.loginId,
        name: data.name,
        phone: data.phone,
        slackUserId: data.slackUserId,
        masterEmail: data.masterEmail,
        active: data.active,
        tenants: data.tenants || [],
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt),
        updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date(data.updatedAt),
      };
    });
  } catch (error) {
    console.error('Get managers error:', error);
    return [];
  }
}

// 매니저 상세 조회 (소유권 확인)
export async function getManagerById(managerId: string, masterEmail: string): Promise<Manager | null> {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) return null;

  try {
    const doc = await db.collection('users_managers').doc(managerId).get();
    if (!doc.exists) return null;

    const data = doc.data()!;
    if (data.masterEmail !== masterEmail.toLowerCase()) return null;

    return {
      managerId: data.managerId,
      loginId: data.loginId,
      name: data.name,
      phone: data.phone,
      slackUserId: data.slackUserId,
      masterEmail: data.masterEmail,
      active: data.active,
      tenants: data.tenants || [],
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt),
      updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date(data.updatedAt),
    };
  } catch (error) {
    console.error('Get manager by ID error:', error);
    return null;
  }
}

export const MANAGER_SESSION_MAX_AGE = SESSION_EXPIRY_HOURS * 60 * 60;

// 쿠키 헬퍼
export async function getManagerSessionIdFromCookie(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(MANAGER_SESSION_COOKIE)?.value || null;
}

export async function getManagerFromCookie(): Promise<ManagerSession | null> {
  const sessionId = await getManagerSessionIdFromCookie();
  if (!sessionId) return null;
  return verifyManagerSession(sessionId);
}
