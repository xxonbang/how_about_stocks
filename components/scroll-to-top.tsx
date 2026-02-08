'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';

export function ScrollToTop() {
  const [visible, setVisible] = useState(false);
  const pathname = usePathname();

  // 로그인/회원가입 페이지에서는 숨김
  const hiddenPages = ['/login', '/signup'];
  const isHidden = hiddenPages.includes(pathname);

  const handleScroll = useCallback(() => {
    setVisible(window.scrollY > 300);
  }, []);

  useEffect(() => {
    if (isHidden) return;

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [isHidden, handleScroll]);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (isHidden) return null;

  return (
    <button
      onClick={scrollToTop}
      aria-label="페이지 최상단으로 이동"
      className={`
        fixed bottom-6 right-6 z-50
        w-11 h-11 rounded-full
        bg-gray-900/70 backdrop-blur-sm
        text-white shadow-lg shadow-black/20
        flex items-center justify-center
        transition-all duration-300 ease-out
        hover:bg-gray-900/90 hover:scale-110 hover:shadow-xl
        active:scale-95
        ${visible
          ? 'opacity-100 translate-y-0 pointer-events-auto'
          : 'opacity-0 translate-y-4 pointer-events-none'
        }
      `}
    >
      <svg
        className="w-5 h-5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M18 15l-6-6-6 6" />
      </svg>
    </button>
  );
}
