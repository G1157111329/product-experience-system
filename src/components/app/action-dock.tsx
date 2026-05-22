import * as React from 'react';
import { cn } from '@/lib/utils';

type ActionDockProps = React.ComponentProps<'div'> & {
  mobileOnly?: boolean;
};

export function ActionDock({ className, mobileOnly = true, ...props }: ActionDockProps) {
  return (
    <div
      className={cn(
        'fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-40 rounded-lg border bg-card/95 p-2 shadow-lg backdrop-blur',
        mobileOnly && 'sm:hidden',
        className
      )}
      {...props}
    />
  );
}

