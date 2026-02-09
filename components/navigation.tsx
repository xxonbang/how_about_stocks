'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { LoginDialog } from '@/components/login-dialog';
import { Button } from '@/components/ui/button';

export function Navigation() {
  const { isAuthenticated, username, isAdmin, logout } = useAuth();
  const pathname = usePathname();
  const [loginDialogOpen, setLoginDialogOpen] = useState(false);
  const [highlightLogin, setHighlightLogin] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const loginButtonRef = useRef<HTMLButtonElement>(null);

  // 하이라이트 효과 제거 (로그인 버튼 클릭 시)
  useEffect(() => {
    if (loginDialogOpen) {
      setHighlightLogin(false);
    }
  }, [loginDialogOpen]);

  // 외부에서 하이라이트 트리거 (page.tsx에서 사용)
  useEffect(() => {
    const handleHighlightLogin = () => {
      setLoginDialogOpen(true);
      setHighlightLogin(true);
      setTimeout(() => {
        if (loginButtonRef.current) {
          loginButtonRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    };

    // 전역 이벤트 리스너 등록
    window.addEventListener('highlightLogin', handleHighlightLogin);
    return () => {
      window.removeEventListener('highlightLogin', handleHighlightLogin);
    };
  }, []);

  // 페이지 변경 시 모바일 메뉴 닫기
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  const handleLogout = () => {
    logout();
    setMobileMenuOpen(false);
  };

  const navLinks = [
    { href: '/', label: '분석' },
    { href: '/history', label: '히스토리' },
    { href: '/metrics', label: '메트릭' },
    { href: '/alerts', label: '알림' },
    ...(isAdmin ? [{ href: '/settings', label: '설정' }] : []),
  ];

  const showDualSource = username === 'xxonbang' && (pathname === '/report' || pathname === '/dual-source-validation');

  // 로그인/회원가입 페이지에서는 Navigation 숨김
  if (pathname === '/login' || pathname === '/signup') {
    return null;
  }

  return (
    <>
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="w-full px-3 sm:px-4 md:px-6 lg:px-8 xl:px-12 py-2 sm:py-3">
          <div className="flex items-center justify-between max-w-[1920px] mx-auto">
            {/* 로고 */}
            <Link
              href="/"
              className="text-lg sm:text-xl font-bold text-gray-900 flex-shrink-0"
            >
              📈 종목어때.ai
            </Link>

            {/* 데스크톱 네비게이션 (로그인 상태) */}
            {isAuthenticated && (
              <div className="hidden sm:flex items-center gap-4 lg:gap-6">
                {navLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`text-sm text-gray-600 hover:text-gray-900 transition-colors ${
                      pathname === link.href ? 'font-semibold text-gray-900' : ''
                    }`}
                  >
                    {link.label}
                  </Link>
                ))}
                {showDualSource && (
                  <Link
                    href="/dual-source-validation"
                    className={`text-sm transition-colors font-medium ${
                      pathname === '/dual-source-validation'
                        ? 'text-blue-800 underline underline-offset-4'
                        : 'text-blue-600 hover:text-blue-800'
                    }`}
                  >
                    듀얼소스 검증
                  </Link>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLogout}
                  className="text-sm px-3"
                >
                  로그아웃
                </Button>
              </div>
            )}

            {/* 로그인 버튼 (비로그인 상태 - 모바일/데스크톱 모두 표시) */}
            {!isAuthenticated && (
              <Button
                ref={loginButtonRef}
                variant="default"
                size="sm"
                onClick={() => setLoginDialogOpen(true)}
                className={`text-sm px-3 ${highlightLogin ? 'animate-bounce ring-4 ring-blue-500 ring-offset-2' : ''}`}
              >
                로그인
              </Button>
            )}

            {/* 모바일 햄버거 메뉴 버튼 (로그인 상태에서만 표시) */}
            {isAuthenticated && (
              <button
                className="sm:hidden p-2 rounded-md hover:bg-gray-100 transition-colors"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                aria-label="메뉴 열기"
              >
                {mobileMenuOpen ? (
                  <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : (
                  <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                )}
              </button>
            )}
          </div>

          {/* 모바일 메뉴 (로그인 상태에서만) - 터치 친화적 */}
          {isAuthenticated && mobileMenuOpen && (
            <div className="sm:hidden mt-3 pb-3 border-t border-gray-100 pt-3">
              <div className="flex flex-col gap-1">
                {navLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`min-h-[44px] flex items-center px-3 py-2.5 rounded-lg text-base transition-colors touch-manipulation ${
                      pathname === link.href
                        ? 'bg-gray-100 font-semibold text-gray-900'
                        : 'text-gray-600 hover:bg-gray-50 active:bg-gray-100 hover:text-gray-900'
                    }`}
                  >
                    {link.label}
                  </Link>
                ))}
                {showDualSource && (
                  <Link
                    href="/dual-source-validation"
                    className={`min-h-[44px] flex items-center px-3 py-2.5 rounded-lg text-base transition-colors font-medium touch-manipulation ${
                      pathname === '/dual-source-validation'
                        ? 'bg-blue-50 text-blue-800'
                        : 'text-blue-600 hover:bg-blue-50 active:bg-blue-100'
                    }`}
                  >
                    듀얼소스 검증
                  </Link>
                )}
                <div className="border-t border-gray-100 mt-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleLogout}
                    className="w-full min-h-[44px] text-base touch-manipulation"
                  >
                    로그아웃
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </nav>
      <LoginDialog
        open={loginDialogOpen}
        onOpenChange={setLoginDialogOpen}
        highlight={highlightLogin}
      />
    </>
  );
}
