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
  timestamp: number;
}

function setCachedAuthState(user: User | null) {
  if (typeof window === 'undefined') return;
  try {
    const state: CachedAuthState = {
      isLoggedIn: !!user,
      email: user?.email || null,
      timestamp: Date.now(),
    };
    localStorage.setItem(AUTH_CACHE_KEY, JSON.stringify(state));
  } catch {
    // localStorage 사용 불가 시 무시
  }
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
  const [loading, setLoading] = useState(true); // 항상 true로 시작 (hydration mismatch 방지)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
      // 캐시 업데이트
      setCachedAuthState(firebaseUser);
    });

    return () => unsubscribe();
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const result = await signInWithEmailAndPassword(auth, email, password);
    setCachedAuthState(result.user);
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    setCachedAuthState(result.user);
  }, []);

  const signInWithGoogle = useCallback(async (): Promise<User> => {
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    setCachedAuthState(result.user);
    return result.user;
  }, []);

  const signOut = useCallback(async () => {
    clearCachedAuthState();
    await firebaseSignOut(auth);
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    await sendPasswordResetEmail(auth, email);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signInWithGoogle, signOut, resetPassword }}>
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
