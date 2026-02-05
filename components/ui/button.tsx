import * as React from 'react';
import { cn } from '@/lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => {
    return (
      <button
        className={cn(
          // 기본 스타일 + 모바일 터치 최적화
          'inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 touch-manipulation',
          {
            // 변형별 스타일 + 모바일 active 상태
            'bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80': variant === 'default',
            'bg-destructive text-destructive-foreground hover:bg-destructive/90 active:bg-destructive/80': variant === 'destructive',
            'border border-input bg-background hover:bg-accent hover:text-accent-foreground active:bg-accent/80': variant === 'outline',
            'bg-secondary text-secondary-foreground hover:bg-secondary/80 active:bg-secondary/70': variant === 'secondary',
            'hover:bg-accent hover:text-accent-foreground active:bg-accent/80': variant === 'ghost',
            'text-primary underline-offset-4 hover:underline': variant === 'link',
            // 크기별 스타일 - 모바일에서 최소 44px 터치 타겟 보장
            'min-h-[44px] sm:min-h-0 h-auto sm:h-10 px-4 py-2.5 sm:py-2': size === 'default',
            'min-h-[40px] sm:min-h-0 h-auto sm:h-9 rounded-md px-3 py-2 sm:py-1.5': size === 'sm',
            'min-h-[48px] sm:min-h-0 h-auto sm:h-11 rounded-md px-8 py-3 sm:py-2': size === 'lg',
            'min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 h-10 w-10': size === 'icon',
          },
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button };
