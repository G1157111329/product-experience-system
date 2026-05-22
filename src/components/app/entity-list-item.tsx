import * as React from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';

type EntityListItemProps = {
  href?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  leading?: React.ReactNode;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  showChevron?: boolean;
  className?: string;
  onClick?: () => void;
};

export function EntityListItem({
  href,
  title,
  description,
  leading,
  meta,
  actions,
  showChevron = true,
  className,
  onClick,
}: EntityListItemProps) {
  const content = (
    <Card className={cn('min-w-0 transition-colors hover:border-primary/30 hover:bg-muted/20', className)}>
      <CardContent className="p-3 sm:p-4">
        <div className="flex min-w-0 items-start gap-3">
          {leading && <div className="shrink-0">{leading}</div>}
          <div className="min-w-0 flex-1">
            <div className="min-w-0 break-words text-sm font-medium leading-5 sm:text-base">{title}</div>
            {description && <div className="mt-1 break-words text-xs text-muted-foreground">{description}</div>}
            {meta && <div className="mt-2 flex flex-wrap gap-1.5">{meta}</div>}
          </div>
          {(actions || showChevron) && (
            <div className="flex shrink-0 items-center gap-1" onClick={(event) => event.stopPropagation()}>
              {actions}
              {showChevron && <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );

  if (href && !actions) {
    return (
      <Link href={href} className="block min-w-0" onClick={onClick}>
        {content}
      </Link>
    );
  }

  return (
    <div
      role={onClick || href ? 'button' : undefined}
      tabIndex={onClick || href ? 0 : undefined}
      className={cn('block w-full min-w-0 text-left', (onClick || href) && 'cursor-pointer')}
      onClick={() => {
        if (href) {
          window.location.href = href;
          return;
        }
        onClick?.();
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        if (href) {
          window.location.href = href;
          return;
        }
        onClick?.();
      }}
    >
      {content}
    </div>
  );
}
