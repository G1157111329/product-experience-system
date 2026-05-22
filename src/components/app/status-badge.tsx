import * as React from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

type StatusBadgeKind = 'task' | 'issueLevel' | 'issueStatus' | 'report' | 'standard' | 'recipe' | 'generic';

type StatusBadgeProps = React.ComponentProps<typeof Badge> & {
  kind?: StatusBadgeKind;
  value: string | null | undefined;
};

const statusClass: Record<StatusBadgeKind, Record<string, string>> = {
  task: {
    待执行: 'bg-muted text-muted-foreground',
    进行中: 'bg-primary/10 text-primary',
    已完成: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  },
  issueLevel: {
    一类: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300',
    二类: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
    三类: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  },
  issueStatus: {
    待整改: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
    整改中: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
    已验证: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
    不整改: 'bg-muted text-muted-foreground',
  },
  report: {
    草稿: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
    已完成: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  },
  standard: {
    通用标准: 'bg-primary/10 text-primary',
    品类标准: 'bg-primary/10 text-primary',
    感官评价标准: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
    食谱功能标准: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  },
  recipe: {
    食谱: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
    功能: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  },
  generic: {},
};

export function StatusBadge({ kind = 'generic', value, className, variant = 'secondary', ...props }: StatusBadgeProps) {
  const label = value || '-';
  return (
    <Badge
      variant={variant}
      className={cn('max-w-full text-[10px]', statusClass[kind][label], className)}
      {...props}
    >
      <span className="truncate">{kind === 'report' && label === '草稿' ? '已完成' : label}</span>
    </Badge>
  );
}

