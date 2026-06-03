import * as React from 'react';
import { cn } from '@/lib/utils';

type PageShellProps = React.ComponentProps<'div'> & {
  size?: 'default' | 'wide' | 'full';
};

const sizeClass: Record<NonNullable<PageShellProps['size']>, string> = {
  default: 'mx-auto max-w-7xl',
  wide: 'mx-auto max-w-[96rem]',
  full: '',
};

export function PageShell({ className, size = 'default', ...props }: PageShellProps) {
  return (
    <div
      className={cn(
        'w-full px-3 py-4 sm:px-4 lg:px-6 lg:py-6',
        'pb-[calc(5.75rem+env(safe-area-inset-bottom))] lg:pb-6',
        sizeClass[size],
        className
      )}
      {...props}
    />
  );
}

