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
  linkedUserId?: string;
  active: boolean;
  tenants: ManagerTenantAccess[];
  createdByAdmin?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ManagerSession {
  sessionId: string;
  managerId: string;
  loginId: string;
  tenants: ManagerTenantAccess[];
  createdAt: Date;
  expiresAt: Date;
}

export interface ManagerInvitation {
  inviteToken: string;
  invitedBy: string;
  tenants: ManagerTenantAccess[];
  expiresAt: Date;
  acceptedBy?: string;
  acceptedAt?: Date;
  status: 'pending' | 'accepted' | 'expired';
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

function generateAdminPortalAccountId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = 'ad_';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function generateInviteToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = 'inv_';
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function docToManager(data: FirebaseFirestore.DocumentData): Manager {
  return {
    managerId: data.managerId,
    loginId: data.loginId,
    name: data.name,
    phone: data.phone,
    slackUserId: data.slackUserId,
    linkedUserId: data.linkedUserId,
    active: data.active,
    tenants: data.tenants || [],
    createdByAdmin: data.createdByAdmin || false,
    createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt),
    updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date(data.updatedAt),
  };
}

// -----------------------------------------------
// 매니저 자체 회원가입
// -----------------------------------------------
export async function registerManager(data: {
  loginId: string;
  password: string;
  name: string;
  phone?: string;
}): Promise<Manager> {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) throw new Error('Database unavailable');

  if (data.loginId.includes('@')) {
    throw new Error('loginId cannot contain @');
  }

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
    active: true,
    tenants: [],
    tenantIds: [],
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
    active: true,
    tenants: [],
    createdAt: now,
    updatedAt: now,
  };
}

// -----------------------------------------------
// 매니저 프로필 수정 (본인만)
// -----------------------------------------------
export async function updateManagerProfile(
  managerId: string,
  updates: { name?: string; phone?: string; password?: string }
): Promise<void> {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) throw new Error('Database unavailable');

  const doc = await db.collection('users_managers').doc(managerId).get();
  if (!doc.exists) throw new Error('Manager not found');

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (updates.name !== undefined) updateData.name = updates.name;
  if (updates.phone !== undefined) updateData.phone = updates.phone;
  if (updates.password) {
    updateData.passwordHash = bcrypt.hashSync(updates.password, SALT_ROUNDS);
  }

  await db.collection('users_managers').doc(managerId).update(updateData);
}

// -----------------------------------------------
// 매니저 계정 삭제 (본인/어드민)
// -----------------------------------------------
export async function deleteManagerAccount(managerId: string): Promise<void> {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) throw new Error('Database unavailable');

  const doc = await db.collection('users_managers').doc(managerId).get();
  if (!doc.exists) throw new Error('Manager not found');

  const sessions = await db.collection('manager_sessions')
    .where('managerId', '==', managerId)
    .get();

  const links = await db.collection('dashboard_manager_links')
    .where('managerId', '==', managerId)
    .get();

  const batch = db.batch();
  sessions.docs.forEach(s => batch.delete(s.ref));
  links.docs.forEach(l => batch.delete(l.ref));
  batch.delete(db.collection('users_managers').doc(managerId));

  const managerData = doc.data()!;
  if (managerData.linkedUserId) {
    const { FieldValue } = await import('firebase-admin/firestore');
    const usersSnapshot = await db.collection('users')
      .where('userId', '==', managerData.linkedUserId)
      .limit(1)
      .get();
    if (!usersSnapshot.empty) {
      batch.update(usersSnapshot.docs[0].ref, { linkedManagerId: FieldValue.delete() });
    }
  }

  await batch.commit();
}

// -----------------------------------------------
// tenantId 기반 매니저 조회
// -----------------------------------------------
export async function getMasterTenantIds(email: string): Promise<string[]> {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) return [];

  const snapshot = await db.collection('tenants')
    .where('email', '==', email.toLowerCase())
    .get();

  return snapshot.docs.map(doc => doc.id);
}

export async function getManagersByTenantIds(tenantIds: string[]): Promise<Manager[]> {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) return [];

  if (tenantIds.length === 0) return [];

  const chunks: string[][] = [];
  for (let i = 0; i < tenantIds.length; i += 30) {
    chunks.push(tenantIds.slice(i, i + 30));
  }

  const allManagers: Manager[] = [];
  const seenIds = new Set<string>();

  for (const chunk of chunks) {
    const snapshot = await db.collection('users_managers')
      .where('tenantIds', 'array-contains-any', chunk)
      .get();

    for (const doc of snapshot.docs) {
      const data = doc.data();
      if (!seenIds.has(data.managerId)) {
        seenIds.add(data.managerId);
        allManagers.push(docToManager(data));
      }
    }
  }

  return allManagers;
}

// 매니저 상세 조회 (tenantIds 겹침 체크)
export async function getManagerById(managerId: string, tenantIds: string[]): Promise<Manager | null> {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) return null;

  try {
    const doc = await db.collection('users_managers').doc(managerId).get();
    if (!doc.exists) return null;

    const data = doc.data()!;
    const managerTenantIds = (data.tenantIds || []) as string[];
    const hasOverlap = managerTenantIds.some(tid => tenantIds.includes(tid));
    if (!hasOverlap && tenantIds.length > 0) return null;

    return docToManager(data);
  } catch (error) {
    console.error('Get manager by ID error:', error);
    return null;
  }
}

// -----------------------------------------------
// 초대 시스템
// -----------------------------------------------
export async function createInvitation(
  masterEmail: string,
  tenants: ManagerTenantAccess[]
): Promise<string> {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) throw new Error('Database unavailable');

  const inviteToken = generateInviteToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  await db.collection('manager_invitations').doc(inviteToken).set({
    inviteToken,
    invitedBy: masterEmail.toLowerCase(),
    tenants,
    expiresAt,
    status: 'pending',
    createdAt: now,
  });

  return inviteToken;
}

export async function acceptInvitation(
  inviteToken: string,
  managerId: string
): Promise<void> {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) throw new Error('Database unavailable');

  const inviteDoc = await db.collection('manager_invitations').doc(inviteToken).get();
  if (!inviteDoc.exists) throw new Error('Invitation not found');

  const invite = inviteDoc.data()!;

  if (invite.status !== 'pending') throw new Error('Invitation already used');

  const expiresAt = invite.expiresAt?.toDate ? invite.expiresAt.toDate() : new Date(invite.expiresAt);
  if (expiresAt < new Date()) throw new Error('Invitation expired');

  const managerDoc = await db.collection('users_managers').doc(managerId).get();
  if (!managerDoc.exists) throw new Error('Manager not found');

  const managerData = managerDoc.data()!;
  const existingTenants: ManagerTenantAccess[] = managerData.tenants || [];
  const existingTenantIds = new Set(existingTenants.map(t => t.tenantId));

  const newTenants = [...existingTenants];
  for (const t of invite.tenants) {
    if (!existingTenantIds.has(t.tenantId)) {
      newTenants.push(t);
    }
  }
  const newTenantIds = newTenants.map(t => t.tenantId);

  const batch = db.batch();

  batch.update(db.collection('users_managers').doc(managerId), {
    tenants: newTenants,
    tenantIds: newTenantIds,
    updatedAt: new Date(),
  });

  batch.update(db.collection('manager_invitations').doc(inviteToken), {
    acceptedBy: managerId,
    acceptedAt: new Date(),
    status: 'accepted',
  });

  await batch.commit();

  for (const t of invite.tenants) {
    if (!existingTenantIds.has(t.tenantId)) {
      await createDashboardLinkIfStoreExists(db, managerId, t.tenantId);
    }
  }
}

export async function removeManagerFromTenant(
  managerId: string,
  tenantId: string
): Promise<void> {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) throw new Error('Database unavailable');

  const doc = await db.collection('users_managers').doc(managerId).get();
  if (!doc.exists) throw new Error('Manager not found');

  const data = doc.data()!;
  const tenants: ManagerTenantAccess[] = (data.tenants || []).filter(
    (t: ManagerTenantAccess) => t.tenantId !== tenantId
  );
  const tenantIds = tenants.map(t => t.tenantId);

  const batch = db.batch();
  batch.update(db.collection('users_managers').doc(managerId), {
    tenants,
    tenantIds,
    updatedAt: new Date(),
  });

  const storeSnapshot = await db.collection('dashboard_stores')
    .where('tenantId', '==', tenantId)
    .limit(1)
    .get();

  if (!storeSnapshot.empty) {
    const storeId = storeSnapshot.docs[0].id;
    const linkId = managerId + '_' + storeId;
    const linkRef = db.collection('dashboard_manager_links').doc(linkId);
    const linkDoc = await linkRef.get();
    if (linkDoc.exists) {
      batch.delete(linkRef);
    }
  }

  await batch.commit();
}

export async function updateManagerTenantPermissions(
  managerId: string,
  tenantId: string,
  permissions: ManagerPermissions
): Promise<void> {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) throw new Error('Database unavailable');

  const doc = await db.collection('users_managers').doc(managerId).get();
  if (!doc.exists) throw new Error('Manager not found');

  const data = doc.data()!;
  const tenants: ManagerTenantAccess[] = data.tenants || [];
  const idx = tenants.findIndex(t => t.tenantId === tenantId);
  if (idx === -1) throw new Error('Manager not linked to this tenant');

  tenants[idx] = { tenantId, permissions };

  await db.collection('users_managers').doc(managerId).update({
    tenants,
    updatedAt: new Date(),
  });
}

// -----------------------------------------------
// 계정 연동 (매니저 <-> 마스터)
// -----------------------------------------------
export async function linkManagerToUser(managerId: string, userId: string): Promise<void> {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) throw new Error('Database unavailable');

  const batch = db.batch();

  batch.update(db.collection('users_managers').doc(managerId), {
    linkedUserId: userId,
    updatedAt: new Date(),
  });

  const usersSnapshot = await db.collection('users')
    .where('userId', '==', userId)
    .limit(1)
    .get();

  if (!usersSnapshot.empty) {
    batch.update(usersSnapshot.docs[0].ref, { linkedManagerId: managerId });
  }

  await batch.commit();
}

export async function unlinkManagerFromUser(managerId: string): Promise<void> {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) throw new Error('Database unavailable');

  const doc = await db.collection('users_managers').doc(managerId).get();
  if (!doc.exists) throw new Error('Manager not found');

  const data = doc.data()!;
  const { FieldValue } = await import('firebase-admin/firestore');

  const batch = db.batch();
  batch.update(db.collection('users_managers').doc(managerId), {
    linkedUserId: FieldValue.delete(),
    updatedAt: new Date(),
  });

  if (data.linkedUserId) {
    const usersSnapshot = await db.collection('users')
      .where('userId', '==', data.linkedUserId)
      .limit(1)
      .get();
    if (!usersSnapshot.empty) {
      batch.update(usersSnapshot.docs[0].ref, { linkedManagerId: FieldValue.delete() });
    }
  }

  await batch.commit();
}

export async function getLinkedManagerByUserId(userId: string): Promise<Manager | null> {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) return null;

  const snapshot = await db.collection('users_managers')
    .where('linkedUserId', '==', userId)
    .limit(1)
    .get();

  if (snapshot.empty) return null;
  return docToManager(snapshot.docs[0].data());
}

// -----------------------------------------------
// 대시보드 자동 연동 헬퍼
// -----------------------------------------------
async function createDashboardLinkIfStoreExists(
  db: FirebaseFirestore.Firestore,
  managerId: string,
  tenantId: string
): Promise<void> {
  const storeSnapshot = await db.collection('dashboard_stores')
    .where('tenantId', '==', tenantId)
    .limit(1)
    .get();

  if (storeSnapshot.empty) return;

  const storeId = storeSnapshot.docs[0].id;
  const linkId = managerId + '_' + storeId;

  const existingLink = await db.collection('dashboard_manager_links').doc(linkId).get();
  if (existingLink.exists) return;

  await db.collection('dashboard_manager_links').doc(linkId).set({
    managerId,
    storeId,
    staffPermissions: {},
    createdAt: new Date(),
  });
}

// -----------------------------------------------
// 아이디 찾기 (이름 + 전화번호)
// -----------------------------------------------
export async function findManagerLoginId(name: string, phone: string) {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) throw new Error('Database unavailable');

  const snapshot = await db.collection('users_managers')
    .where('name', '==', name)
    .where('phone', '==', phone)
    .where('active', '==', true)
    .get();

  if (snapshot.empty) return null;

  return snapshot.docs.map(doc => {
    const data = doc.data();
    const loginId = data.loginId;
    // 아이디 일부 마스킹: 앞 2자 + ***
    const masked = loginId.length > 2
      ? loginId.substring(0, 2) + '*'.repeat(loginId.length - 2)
      : loginId;
    return { loginId, maskedLoginId: masked };
  });
}

// -----------------------------------------------
// 비밀번호 재설정 (loginId + 이름 + 전화번호 확인)
// -----------------------------------------------
export async function resetManagerPassword(loginId: string, name: string, phone: string, newPassword: string) {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) throw new Error('Database unavailable');

  const snapshot = await db.collection('users_managers')
    .where('loginId', '==', loginId)
    .where('name', '==', name)
    .where('phone', '==', phone)
    .where('active', '==', true)
    .limit(1)
    .get();

  if (snapshot.empty) throw new Error('No matching account');

  const doc = snapshot.docs[0];
  const passwordHash = bcrypt.hashSync(newPassword, SALT_ROUNDS);

  await db.collection('users_managers').doc(doc.id).update({
    passwordHash,
    updatedAt: new Date(),
  });
}

// -----------------------------------------------
// 매니저 로그인 (포탈 서버 호출용)
// -----------------------------------------------
export async function loginManager(
  loginId: string,
  password: string
): Promise<{ managerId: string; loginId: string; tenants: ManagerTenantAccess[]; sessionId: string }> {
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
    tenants: data.tenants || [],
    createdAt: now,
    expiresAt,
  });

  return {
    managerId: data.managerId,
    loginId: data.loginId,
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

    const managerDoc = await db.collection('users_managers').doc(session.managerId).get();
    if (!managerDoc.exists) {
      db.collection('manager_sessions').doc(sessionId).delete().catch(() => {});
      return null;
    }

    const manager = managerDoc.data()!;

    if (!manager.active) {
      db.collection('manager_sessions').doc(sessionId).delete().catch(() => {});
      return null;
    }

    return {
      sessionId,
      managerId: manager.managerId,
      loginId: manager.loginId,
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

// 포탈 -> 홈페이지 SSO용 단기 JWT 생성 (10분)
export function generateManagerBillingToken(session: ManagerSession): string {
  if (!JWT_SECRET) throw new Error('JWT_SECRET not configured');

  return jwt.sign(
    {
      purpose: 'manager_billing',
      managerId: session.managerId,
      loginId: session.loginId,
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
  tenants: ManagerTenantAccess[];
} | null {
  if (!JWT_SECRET) return null;

  try {
    const payload = jwt.verify(token, JWT_SECRET) as {
      purpose: string;
      managerId: string;
      loginId: string;
      tenants: ManagerTenantAccess[];
    };

    if (payload.purpose !== 'manager_billing') return null;

    return {
      managerId: payload.managerId,
      loginId: payload.loginId,
      tenants: payload.tenants,
    };
  } catch {
    return null;
  }
}

// 매니저 loginId 검색 (초대용)
export async function searchManagerByLoginId(loginId: string): Promise<{
  managerId: string;
  loginId: string;
  name: string;
} | null> {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) return null;

  const snapshot = await db.collection('users_managers')
    .where('loginId', '==', loginId)
    .limit(1)
    .get();

  if (snapshot.empty) return null;

  const data = snapshot.docs[0].data();
  return {
    managerId: data.managerId,
    loginId: data.loginId,
    name: data.name,
  };
}

export const MANAGER_SESSION_MAX_AGE = SESSION_EXPIRY_HOURS * 60 * 60;

// -----------------------------------------------
// 어드민 포탈 계정 (ad_ prefix)
// -----------------------------------------------

export interface AdminPortalAccount {
  managerId: string;
  loginId: string;
  name: string;
  active: boolean;
  adminId: string;
  tenants: ManagerTenantAccess[];
  createdAt: Date;
  updatedAt: Date;
}

export async function createAdminPortalAccount(
  adminId: string,
  adminDocRef: FirebaseFirestore.DocumentReference,
  data: {
    loginId: string;
    passwordHash: string;
    name: string;
    tenants?: ManagerTenantAccess[];
  }
): Promise<AdminPortalAccount> {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) throw new Error('Database unavailable');

  if (data.loginId.includes('@')) {
    throw new Error('loginId cannot contain @');
  }

  const existing = await db.collection('users_managers')
    .where('loginId', '==', data.loginId)
    .limit(1)
    .get();
  if (!existing.empty) {
    throw new Error('loginId already exists');
  }

  const managerId = generateAdminPortalAccountId();
  const now = new Date();

  const batch = db.batch();

  batch.set(db.collection('users_managers').doc(managerId), {
    managerId,
    loginId: data.loginId,
    passwordHash: data.passwordHash,
    name: data.name,
    active: true,
    createdByAdmin: true,
    adminId,
    tenants: data.tenants || [],
    createdAt: now,
    updatedAt: now,
  });

  batch.update(adminDocRef, { portalAccountId: managerId });

  await batch.commit();

  return {
    managerId,
    loginId: data.loginId,
    name: data.name,
    active: true,
    adminId,
    tenants: data.tenants || [],
    createdAt: now,
    updatedAt: now,
  };
}

export async function updateAdminPortalAccount(
  managerId: string,
  updates: {
    name?: string;
    password?: string;
    active?: boolean;
    tenants?: ManagerTenantAccess[];
  }
): Promise<void> {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) throw new Error('Database unavailable');

  const doc = await db.collection('users_managers').doc(managerId).get();
  if (!doc.exists) throw new Error('Portal account not found');
  if (!doc.data()!.createdByAdmin) throw new Error('Not an admin portal account');

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (updates.name !== undefined) updateData.name = updates.name;
  if (updates.active !== undefined) updateData.active = updates.active;
  if (updates.tenants !== undefined) updateData.tenants = updates.tenants;
  if (updates.password) {
    updateData.passwordHash = bcrypt.hashSync(updates.password, SALT_ROUNDS);
  }

  await db.collection('users_managers').doc(managerId).update(updateData);
}

export async function deleteAdminPortalAccount(
  managerId: string,
  adminDocRef: FirebaseFirestore.DocumentReference
): Promise<void> {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) throw new Error('Database unavailable');

  const doc = await db.collection('users_managers').doc(managerId).get();
  if (!doc.exists) throw new Error('Portal account not found');
  if (!doc.data()!.createdByAdmin) throw new Error('Not an admin portal account');

  const sessions = await db.collection('manager_sessions')
    .where('managerId', '==', managerId)
    .get();

  const batch = db.batch();
  sessions.docs.forEach(s => batch.delete(s.ref));
  batch.delete(db.collection('users_managers').doc(managerId));
  batch.update(adminDocRef, { portalAccountId: null });
  await batch.commit();
}

export async function getAdminPortalAccount(managerId: string): Promise<AdminPortalAccount | null> {
  const db = adminDb || initializeFirebaseAdmin();
  if (!db) return null;

  try {
    const doc = await db.collection('users_managers').doc(managerId).get();
    if (!doc.exists) return null;
    const data = doc.data()!;
    if (!data.createdByAdmin) return null;

    return {
      managerId: data.managerId,
      loginId: data.loginId,
      name: data.name,
      active: data.active,
      adminId: data.adminId,
      tenants: data.tenants || [],
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt),
      updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date(data.updatedAt),
    };
  } catch (error) {
    console.error('Get admin portal account error:', error);
    return null;
  }
}

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
