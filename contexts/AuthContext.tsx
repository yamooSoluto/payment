'use client';

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  GoogleAuthProvider,
  signInWithPopup,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  hasTenants: boolean;
  refreshTenants: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<User>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// 캐시된 auth 상태 키
const AUTH_CACHE_KEY = 'yamoo_auth_cache';

interface CachedAuthState {
  isLoggedIn: boolean;
  email: string | null;
  hasTenants: boolean;
  timestamp: number;
}

function setCachedAuthState(user: User | null, hasTenants: boolean = false) {
  if (typeof window === 'undefined') return;
  try {
    const state: CachedAuthState = {
      isLoggedIn: !!user,
      email: user?.email || null,
      hasTenants,
      timestamp: Date.now(),
    };
    localStorage.setItem(AUTH_CACHE_KEY, JSON.stringify(state));
  } catch {
    // localStorage 사용 불가 시 무시
  }
}

function getCachedAuthState(): CachedAuthState | null {
  if (typeof window === 'undefined') return null;
  try {
    const cached = localStorage.getItem(AUTH_CACHE_KEY);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch {
    // 무시
  }
  return null;
}

function clearCachedAuthState() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(AUTH_CACHE_KEY);
  } catch {
    // 무시
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasTenants, setHasTenants] = useState(() => {
    // 초기값: 캐시에서 가져오기
    const cached = getCachedAuthState();
    return cached?.hasTenants ?? false;
  });

  // tenant 정보 가져오기
  const fetchTenants = useCallback(async (firebaseUser: User) => {
    try {
      const idToken = await firebaseUser.getIdToken();
      const res = await fetch(`/api/tenants?email=${encodeURIComponent(firebaseUser.email || '')}&skipSubscription=true`, {
        headers: { 'Authorization': `Bearer ${idToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        const result = data.tenants && data.tenants.length > 0;
        setHasTenants(result);
        setCachedAuthState(firebaseUser, result);
        return result;
      }
    } catch (error) {
      console.error('Failed to fetch tenants:', error);
    }
    return false;
  }, []);

  // 외부에서 tenant 정보 새로고침 (매장 생성 후 등)
  const refreshTenants = useCallback(async () => {
    if (user) {
      await fetchTenants(user);
    }
  }, [user, fetchTenants]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);

      if (firebaseUser) {
        // 캐시에서 먼저 hasTenants 설정 (즉시 UI 반영)
        const cached = getCachedAuthState();
        if (cached?.email === firebaseUser.email) {
          setHasTenants(cached.hasTenants);
        }
        // 백그라운드에서 최신 정보 가져오기
        fetchTenants(firebaseUser);
      } else {
        setHasTenants(false);
        setCachedAuthState(null);
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, [fetchTenants]);

  const signIn = useCallback(async (email: string, password: string) => {
    const result = await signInWithEmailAndPassword(auth, email, password);
    // 백그라운드에서 tenant 확인 (로그인 완료를 지연시키지 않음)
    fetchTenants(result.user);
  }, [fetchTenants]);

  const signUp = useCallback(async (email: string, password: string) => {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    setCachedAuthState(result.user, false); // 새 사용자는 매장 없음
  }, []);

  const signInWithGoogle = useCallback(async (): Promise<User> => {
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    // 백그라운드에서 tenant 확인
    fetchTenants(result.user);
    return result.user;
  }, [fetchTenants]);

  const signOut = useCallback(async () => {
    setUser(null); // 즉시 로그아웃 상태로 변경 (UI 즉시 반영)
    setHasTenants(false);
    clearCachedAuthState();
    await firebaseSignOut(auth);
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    await sendPasswordResetEmail(auth, email);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, hasTenants, refreshTenants, signIn, signUp, signInWithGoogle, signOut, resetPassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
