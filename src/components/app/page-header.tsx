import * as React from 'react';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

type PageHeaderProps = {
  title: React.ReactNode;
  description?: React.ReactNode;
  eyebrow?: React.ReactNode;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  backAction?: () => void;
  backLabel?: string;
  className?: string;
};

export function PageHeader({
  title,
  description,
  eyebrow,
  meta,
  actions,
  backAction,
  backLabel = '返回',
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        'flex flex-col gap-3 rounded-lg border bg-card p-3 shadow-sm sm:flex-row sm:items-start sm:justify-between sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none',
        className
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        {backAction && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-10 w-10 shrink-0"
            aria-label={backLabel}
            onClick={backAction}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}
        <div className="min-w-0">
          {eyebrow && <div className="mb-1 text-xs font-medium text-muted-foreground">{eyebrow}</div>}
          <h1 className="break-words text-xl font-semibold leading-tight tracking-normal sm:text-2xl">
            {title}
          </h1>
          {description && (
            <p className="mt-1 break-words text-sm text-muted-foreground">{description}</p>
          )}
          {meta && <div className="mt-2 flex flex-wrap gap-1.5">{meta}</div>}
        </div>
      </div>
      {actions && <div className="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto sm:justify-end">{actions}</div>}
    </header>
  );
}

