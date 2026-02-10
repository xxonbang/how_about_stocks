'use client';

import { createContext, useContext, useState, useEffect, ReactNode, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type OAuthProvider = 'google' | 'github' | 'kakao';

interface AuthContextType {
  isAuthenticated: boolean;
  username: string | null;
  role: string | null;
  isAdmin: boolean;
  isLoading: boolean;
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
  const router = useRouter();
  const supabaseRef = useRef(createClient());

  // 초기 인증 상태 확인 + onAuthStateChange 리스너
  useEffect(() => {
    const supabase = supabaseRef.current;

    const checkAuthStatus = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user) {
          setIsAuthenticated(true);
          setUsername(
            (user.user_metadata?.username as string) ?? user.email ?? null
          );
          setRole((user.user_metadata?.role as string) ?? null);
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
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setIsAuthenticated(true);
        setUsername(
          (session.user.user_metadata?.username as string) ??
            session.user.email ??
            null
        );
        setRole((session.user.user_metadata?.role as string) ?? null);
      } else {
        setIsAuthenticated(false);
        setUsername(null);
        setRole(null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const { error } = await supabaseRef.current.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        return { success: false, error: error.message };
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
    <AuthContext.Provider value={{ isAuthenticated, username, role, isAdmin: role === 'admin' || username === 'xxonbang', isLoading, login, signup, loginWithOAuth, logout }}>
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
