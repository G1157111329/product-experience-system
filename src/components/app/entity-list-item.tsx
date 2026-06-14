import * as React from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import {
  pageListBodyClass,
  pageListCardClass,
  pageListContentClass,
  pageListDescriptionClass,
  pageListMetaClass,
  pageListTitleClass,
} from './control-styles';

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
    <Card className={cn(pageListCardClass, 'group-focus-visible:border-ring group-focus-visible:ring-2 group-focus-visible:ring-ring/30', className)}>
      <CardContent className={pageListContentClass}>
        <div className={pageListBodyClass}>
          {leading && <div className="shrink-0">{leading}</div>}
          <div className="min-w-0 flex-1">
            <div className={pageListTitleClass}>{title}</div>
            {description && <div className={pageListDescriptionClass}>{description}</div>}
            {meta && <div className={pageListMetaClass}>{meta}</div>}
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
      <Link href={href} className="group block min-w-0 rounded-lg focus-visible:outline-none" onClick={onClick}>
        {content}
      </Link>
    );
  }

  return (
    <div
      role={onClick || href ? 'button' : undefined}
      tabIndex={onClick || href ? 0 : undefined}
      className={cn(
        'group block w-full min-w-0 rounded-lg text-left focus-visible:outline-none',
        (onClick || href) && 'cursor-pointer'
      )}
      onClick={() => {
        if (href) {
          window.location.href = href;
          return;
        }
        onClick?.();
      }}
      onKeyDown={(event) => {
        if (event.key === ' ') {
          event.preventDefault();
          return;
        }
        if (event.key !== 'Enter') return;
        if (href) {
          window.location.href = href;
          return;
        }
        onClick?.();
      }}
      onKeyUp={(event) => {
        if (event.key !== ' ') return;
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
