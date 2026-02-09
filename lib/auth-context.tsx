'use client';

import { createContext, useContext, useState, useEffect, ReactNode, useRef, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { INACTIVITY_TIMEOUT_MS, ONE_MINUTE_MS } from './constants';
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
  updateLastActivity: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const INACTIVITY_TIMEOUT = INACTIVITY_TIMEOUT_MS;
const CHECK_INTERVAL = ONE_MINUTE_MS;
const LAST_ACTIVITY_KEY = 'lastActivityTime';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showTimeoutDialog, setShowTimeoutDialog] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const activityListenersRef = useRef<boolean>(false);
  const supabaseRef = useRef(createClient());

  const updateLastActivity = useCallback(() => {
    if (typeof window !== 'undefined' && isAuthenticated) {
      localStorage.setItem(LAST_ACTIVITY_KEY, Date.now().toString());
    }
  }, [isAuthenticated]);

  const handleAutoLogout = useCallback(async () => {
    try {
      await supabaseRef.current.auth.signOut();
    } catch (error) {
      console.error('Logout error:', error);
    }

    setIsAuthenticated(false);
    setUsername(null);
    setRole(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem(LAST_ACTIVITY_KEY);
    }

    if (pathname !== '/login') {
      router.push('/login');
    }
    setShowTimeoutDialog(true);
  }, [router, pathname]);

  const checkInactivity = useCallback(() => {
    if (!isAuthenticated || typeof window === 'undefined') return;

    const lastActivity = localStorage.getItem(LAST_ACTIVITY_KEY);
    if (!lastActivity) {
      updateLastActivity();
      return;
    }

    const lastActivityTime = parseInt(lastActivity, 10);
    const now = Date.now();
    const timeSinceLastActivity = now - lastActivityTime;

    if (timeSinceLastActivity >= INACTIVITY_TIMEOUT) {
      console.log('[Auth] 비활성 시간 초과, 자동 로그아웃 처리');
      handleAutoLogout();
    }
  }, [isAuthenticated, updateLastActivity, handleAutoLogout]);

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
          updateLastActivity();
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
  }, [updateLastActivity]);

  // 사용자 활동 감지 이벤트 리스너
  useEffect(() => {
    if (!isAuthenticated || activityListenersRef.current) return;

    const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];

    const handleActivity = () => {
      updateLastActivity();
    };

    activityEvents.forEach(event => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    activityListenersRef.current = true;

    return () => {
      activityEvents.forEach(event => {
        window.removeEventListener(event, handleActivity);
      });
      activityListenersRef.current = false;
    };
  }, [isAuthenticated, updateLastActivity]);

  // 주기적으로 활동 시간 체크
  useEffect(() => {
    if (!isAuthenticated) {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
        checkIntervalRef.current = null;
      }
      return;
    }

    checkInactivity();

    checkIntervalRef.current = setInterval(() => {
      checkInactivity();
    }, CHECK_INTERVAL);

    return () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
        checkIntervalRef.current = null;
      }
    };
  }, [isAuthenticated, checkInactivity]);

  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const { error } = await supabaseRef.current.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        return { success: false, error: error.message };
      }

      updateLastActivity();
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

      updateLastActivity();
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
    if (typeof window !== 'undefined') {
      localStorage.removeItem(LAST_ACTIVITY_KEY);
    }
    router.push('/login');
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, username, role, isAdmin: role === 'admin' || username === 'xxonbang', isLoading, login, signup, loginWithOAuth, logout, updateLastActivity }}>
      {children}
      {showTimeoutDialog && (
        <AutoLogoutDialog
          open={showTimeoutDialog}
          onClose={() => setShowTimeoutDialog(false)}
        />
      )}
    </AuthContext.Provider>
  );
}

function AutoLogoutDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-[calc(100%-2rem)] sm:w-full sm:max-w-md mx-4 sm:mx-0">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <span
              className="flex-shrink-0"
              style={{ fontSize: '2rem', lineHeight: '1' }}
            >
              🔓
            </span>
            <DialogTitle className="mb-0 text-xl font-semibold">자동 로그아웃</DialogTitle>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            10분간 활동이 없어 자동으로 로그아웃되었습니다
          </p>
        </DialogHeader>
        <div className="px-6 pb-6 space-y-4">
          <div className="flex items-start gap-3 p-4 bg-orange-50 border border-orange-200 rounded-lg">
            <svg
              className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p className="text-sm text-orange-800 font-medium flex-1 leading-relaxed">
              보안을 위해 10분간 활동이 없으면 자동으로 로그아웃됩니다.
              <br />
              다시 로그인해주세요.
            </p>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button
              onClick={onClose}
              className="min-w-[100px] bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 shadow-md"
            >
              확인
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
