'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { logActivity } from '@/lib/activity-logger';

/**
 * 페이지 이동 시 자동으로 page_view 이벤트를 로깅하는 hook
 */
export function usePageTracker() {
  const pathname = usePathname();
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    if (isAuthenticated) {
      logActivity('page_view', { page: pathname });
    }
  }, [pathname, isAuthenticated]);
}
