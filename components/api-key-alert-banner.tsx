'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';

interface ApiKeyAlert {
  id: string;
  title: string;
  message: string;
  dataSource: string;
  timestamp: number;
}

export function ApiKeyAlertBanner() {
  const { isAdmin, isAuthenticated } = useAuth();
  const [alerts, setAlerts] = useState<ApiKeyAlert[]>([]);
  const [dismissed, setDismissed] = useState(false);

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await fetch('/api/api-key-alerts');
      if (!res.ok) return;
      const data = await res.json();
      if (data.alerts?.length > 0) {
        setAlerts(data.alerts);
        setDismissed(false);
      } else {
        setAlerts([]);
      }
    } catch {
      // 조용히 무시
    }
  }, []);

  useEffect(() => {
    if (!isAdmin || !isAuthenticated) return;

    fetchAlerts();
    const interval = setInterval(fetchAlerts, 60_000);
    return () => clearInterval(interval);
  }, [isAdmin, isAuthenticated, fetchAlerts]);

  if (!isAdmin || !isAuthenticated || alerts.length === 0 || dismissed) {
    return null;
  }

  return (
    <div className="bg-red-600 text-white px-4 py-2 text-sm flex items-center justify-between">
      <div className="flex-1">
        <span className="font-semibold mr-2">API 키 오류:</span>
        {alerts.map((a) => (
          <span key={a.id} className="mr-3">
            {a.dataSource} - {a.message.substring(0, 80)}
          </span>
        ))}
        <a href="/alerts" className="underline ml-2">
          상세 보기
        </a>
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="ml-4 text-white/80 hover:text-white shrink-0"
        aria-label="닫기"
      >
        ✕
      </button>
    </div>
  );
}
