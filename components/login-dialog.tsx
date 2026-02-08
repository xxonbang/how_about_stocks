'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth-context';

interface LoginDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  highlight?: boolean;
}

export function LoginDialog({ open, onOpenChange, highlight = false }: LoginDialogProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { login } = useAuth();
  const router = useRouter();
  const emailInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // 하이라이트 효과
  useEffect(() => {
    if (highlight && open && dialogRef.current) {
      dialogRef.current.classList.add('animate-pulse');
      const timer = setTimeout(() => {
        if (dialogRef.current) {
          dialogRef.current.classList.remove('animate-pulse');
        }
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [highlight, open]);

  // 다이얼로그가 열릴 때 포커스
  useEffect(() => {
    if (open && emailInputRef.current) {
      setTimeout(() => {
        emailInputRef.current?.focus();
      }, 100);
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const result = await login(email, password);
      if (result.success) {
        onOpenChange(false);
        setEmail('');
        setPassword('');
        router.refresh();
      } else {
        setError(result.error || '아이디 또는 비밀번호가 올바르지 않습니다.');
      }
    } catch {
      setError('로그인 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        ref={dialogRef}
        className={`w-[calc(100%-2rem)] sm:w-full sm:max-w-md mx-4 sm:mx-0 ${highlight ? 'ring-4 ring-blue-500 ring-offset-2' : ''}`}
      >
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-md">
              <svg
                className="w-6 h-6 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
            </div>
            <DialogTitle className="mb-0">로그인</DialogTitle>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            종목어때.ai에 오신 것을 환영합니다
          </p>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="px-6 pb-6 space-y-5">
          <div className="space-y-2">
            <label
              htmlFor="email"
              className="text-sm font-semibold text-gray-700 block"
            >
              이메일
            </label>
            <Input
              ref={emailInputRef}
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="이메일을 입력하세요"
              required
              disabled={isSubmitting}
              className="h-11 transition-all focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="space-y-2">
            <label 
              htmlFor="password" 
              className="text-sm font-semibold text-gray-700 block"
            >
              비밀번호
            </label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="비밀번호를 입력하세요"
              required
              disabled={isSubmitting}
              className="h-11 transition-all focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <svg
                className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <p className="text-sm text-red-700 font-medium flex-1">
                {error}
              </p>
            </div>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
              className="min-w-[80px] min-h-[44px] sm:min-h-0 touch-manipulation"
            >
              취소
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="min-w-[100px] min-h-[44px] sm:min-h-0 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 active:from-blue-700 active:to-blue-800 shadow-md touch-manipulation"
            >
              {isSubmitting ? (
                <span className="flex items-center gap-2">
                  <svg
                    className="animate-spin h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  로그인 중...
                </span>
              ) : (
                '로그인'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
