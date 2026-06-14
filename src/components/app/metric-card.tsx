import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';

type MetricCardProps = {
  label: React.ReactNode;
  value: React.ReactNode;
  icon?: LucideIcon;
  helper?: React.ReactNode;
  tone?: 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'muted';
  className?: string;
};

const toneClass = {
  primary: 'bg-primary/10 text-primary',
  success: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  warning: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  danger: 'bg-destructive/10 text-destructive',
  info: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  muted: 'bg-muted text-muted-foreground',
};

export function MetricCard({ label, value, icon: Icon, helper, tone = 'primary', className }: MetricCardProps) {
  return (
    <Card className={cn('min-w-0 transition-colors hover:border-primary/30', className)}>
      <CardContent className="p-3 sm:p-4">
        <div className="flex min-w-0 items-center gap-3">
          {Icon && (
            <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', toneClass[tone])}>
              <Icon className="h-5 w-5" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-2xl font-semibold leading-tight tabular-nums">{value}</div>
            <div className="truncate text-xs text-muted-foreground">{label}</div>
            {helper && <div className="mt-1 truncate text-xs text-muted-foreground">{helper}</div>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

