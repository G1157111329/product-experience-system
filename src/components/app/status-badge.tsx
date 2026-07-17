import * as React from 'react';
import { AlertTriangle } from 'lucide-react';
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
    open: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
    整改中: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
    rectifying: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
    整改完成: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
    verified_closed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
    不整改: 'bg-muted text-muted-foreground',
    waived: 'bg-muted text-muted-foreground',
  },
  report: {
    草稿: 'bg-muted text-muted-foreground',
    draft: 'bg-muted text-muted-foreground',
    待审: 'bg-amber-100 text-amber-800 border-amber-500 dark:bg-amber-950/40 dark:text-amber-300',
    pending_review: 'bg-amber-100 text-amber-800 border-amber-500 dark:bg-amber-950/40 dark:text-amber-300',
    已发布: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
    published: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
    已归档: 'bg-slate-100 text-slate-700 dark:bg-slate-900/60 dark:text-slate-300',
    archived: 'bg-slate-100 text-slate-700 dark:bg-slate-900/60 dark:text-slate-300',
    已完成: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
    completed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
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
  const visibleLabel = kind === 'issueStatus'
    ? ({ open: '待整改', rectifying: '整改中', verified_closed: '整改完成', waived: '不整改' }[label] || label)
    : kind === 'report'
      ? ({ draft: '草稿', pending_review: '待审', published: '已发布', archived: '已归档', completed: '已完成' }[label] || label)
      : label;
  const isWarning = (kind === 'issueStatus' && (label === 'open' || label === '待整改'))
    || (kind === 'report' && (label === 'pending_review' || label === '待审'));
  return (
    <Badge
      variant={variant}
      className={cn('max-w-full text-xs', statusClass[kind][label], className)}
      {...props}
    >
      {isWarning && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden="true" />}
      <span className="truncate">{visibleLabel}</span>
    </Badge>
  );
}

