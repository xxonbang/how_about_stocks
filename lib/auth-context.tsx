'use client';

import { createContext, useContext, useState, useEffect, ReactNode, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { SessionManager, type SessionExpiredReason } from '@/lib/session-manager';

type OAuthProvider = 'google' | 'github' | 'kakao';

interface AuthContextType {
  isAuthenticated: boolean;
  username: string | null;
  role: string | null;
  isAdmin: boolean;
  isLoading: boolean;
  sessionExpiredReason: SessionExpiredReason;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signup: (email: string, password: string, username: string) => Promise<{ success: boolean; error?: string }>;
  loginWithOAuth: (provider: OAuthProvider) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionExpiredReason, setSessionExpiredReason] = useState<SessionExpiredReason>(null);
  const router = useRouter();
  const supabaseRef = useRef(createClient());
  const sessionManagerRef = useRef(new SessionManager());

  const isAdminUser = (userRole: string | null, userName: string | null) =>
    userRole === 'admin' || userName === 'xxonbang';

  // 세션 만료 콜백
  const handleSessionExpired = useCallback(async (reason: SessionExpiredReason) => {
    setSessionExpiredReason(reason);
    sessionManagerRef.current.stop();
    try {
      await supabaseRef.current.auth.signOut();
    } catch (error) {
      console.error('Session expired signOut error:', error);
    }
    setIsAuthenticated(false);
    setUsername(null);
    setRole(null);
    router.push('/login');
  }, [router]);

  // 초기 인증 상태 확인 + onAuthStateChange 리스너
  useEffect(() => {
    const supabase = supabaseRef.current;
    const sm = sessionManagerRef.current;
    sm.onExpired = handleSessionExpired;

    const checkAuthStatus = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user) {
          const uName = (user.user_metadata?.username as string) ?? user.email ?? null;
          const uRole = (user.user_metadata?.role as string) ?? null;
          setIsAuthenticated(true);
          setUsername(uName);
          setRole(uRole);

          sm.isExempt = isAdminUser(uRole, uName);
          sm.restore();
        } else {
          setIsAuthenticated(false);
          setUsername(null);
          setRole(null);
        }
      } catch (error) {
        console.error('Auth status check error:', error);
        setIsAuthenticated(false);
      } finally {
        setIsLoading(false);
      }
    };

    checkAuthStatus();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        const uName = (session.user.user_metadata?.username as string) ?? session.user.email ?? null;
        const uRole = (session.user.user_metadata?.role as string) ?? null;
        setIsAuthenticated(true);
        setUsername(uName);
        setRole(uRole);

        sm.isExempt = isAdminUser(uRole, uName);
        if (event === 'SIGNED_IN') {
          sm.restore();
        }
      } else {
        setIsAuthenticated(false);
        setUsername(null);
        setRole(null);
        if (event === 'SIGNED_OUT') {
          sm.stop();
        }
      }
    });

    return () => {
      subscription.unsubscribe();
      sm.stop();
    };
  }, [handleSessionExpired]);

  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const { data, error } = await supabaseRef.current.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        return { success: false, error: error.message };
      }

      setSessionExpiredReason(null);

      const user = data.user;
      if (user) {
        const uName = (user.user_metadata?.username as string) ?? user.email ?? null;
        const uRole = (user.user_metadata?.role as string) ?? null;
        const sm = sessionManagerRef.current;
        sm.isExempt = isAdminUser(uRole, uName);
        sm.start();
      }

      return { success: true };
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: '서버 오류가 발생했습니다.' };
    }
  };

  const signup = async (email: string, password: string, usernameInput: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const { error } = await supabaseRef.current.auth.signUp({
        email,
        password,
        options: {
          data: {
            username: usernameInput,
            role: 'user',
          },
        },
      });

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error) {
      console.error('Signup error:', error);
      return { success: false, error: '서버 오류가 발생했습니다.' };
    }
  };

  const loginWithOAuth = async (provider: OAuthProvider): Promise<{ success: boolean; error?: string }> => {
    try {
      const { error } = await supabaseRef.current.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error) {
      console.error('OAuth login error:', error);
      return { success: false, error: '소셜 로그인 중 오류가 발생했습니다.' };
    }
  };

  const logout = async () => {
    sessionManagerRef.current.stop();
    setSessionExpiredReason(null);

    try {
      await supabaseRef.current.auth.signOut();
    } catch (error) {
      console.error('Logout error:', error);
    }

    setIsAuthenticated(false);
    setUsername(null);
    setRole(null);
    router.push('/login');
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, username, role, isAdmin: isAdminUser(role, username), isLoading, sessionExpiredReason, login, signup, loginWithOAuth, logout }}>
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
