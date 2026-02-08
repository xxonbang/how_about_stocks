'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';

export function OAuthButtons() {
  const { loginWithOAuth } = useAuth();
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null);
  const [error, setError] = useState('');

  const handleOAuth = async (provider: 'google' | 'github' | 'kakao') => {
    setError('');
    setLoadingProvider(provider);
    const result = await loginWithOAuth(provider);
    if (!result.success) {
      setError(result.error || '소셜 로그인에 실패했습니다.');
    }
    setLoadingProvider(null);
  };

  return (
    <div className="space-y-3">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={() => handleOAuth('google')}
        disabled={!!loadingProvider}
        className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24">
          <path
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
            fill="#4285F4"
          />
          <path
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            fill="#34A853"
          />
          <path
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            fill="#FBBC05"
          />
          <path
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            fill="#EA4335"
          />
        </svg>
        <span className="text-sm font-medium text-gray-700">
          {loadingProvider === 'google' ? '연결 중...' : 'Google로 계속하기'}
        </span>
      </button>

      <button
        type="button"
        onClick={() => handleOAuth('github')}
        disabled={!!loadingProvider}
        className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="#24292f">
          <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
        </svg>
        <span className="text-sm font-medium text-gray-700">
          {loadingProvider === 'github' ? '연결 중...' : 'GitHub로 계속하기'}
        </span>
      </button>

      <button
        type="button"
        onClick={() => handleOAuth('kakao')}
        disabled={!!loadingProvider}
        className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-gray-300 rounded-lg bg-[#FEE500] hover:bg-[#FDD800] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="#191919">
          <path d="M12 3C6.477 3 2 6.463 2 10.691c0 2.72 1.8 5.108 4.516 6.467-.147.529-.946 3.407-.978 3.622 0 0-.02.166.088.23.108.063.235.014.235.014.31-.043 3.59-2.357 4.155-2.76.636.094 1.296.144 1.984.144 5.523 0 10-3.463 10-7.717S17.523 3 12 3z" />
        </svg>
        <span className="text-sm font-medium text-[#191919]">
          {loadingProvider === 'kakao' ? '연결 중...' : '카카오로 계속하기'}
        </span>
      </button>
    </div>
  );
}

export function OAuthDivider() {
  return (
    <div className="relative my-6">
      <div className="absolute inset-0 flex items-center">
        <div className="w-full border-t border-gray-300" />
      </div>
      <div className="relative flex justify-center text-sm">
        <span className="bg-white px-4 text-gray-500">또는</span>
      </div>
    </div>
  );
}
