'use client';

import { ArrowLeft, FileText, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type TaskAuthoringSection = 'senses' | 'functions' | 'matrix' | 'comparison' | 'info';

type TaskStatusCard = {
  label: string;
  value: string;
  section?: TaskAuthoringSection;
  available?: boolean;
  className?: string;
};

export type TaskAuthoringHeaderProps = {
  title: string;
  metadata: string;
  statusLabel: string;
  statusClassName?: string;
  issueCount: number;
  recipeCount: number;
  sensesCount: number;
  hasMatrixInstance: boolean;
  hasComparisonInstance: boolean;
  hasAiSummary: boolean;
  generatingReport: boolean;
  summarizing: boolean;
  onBack: () => void;
  onGenerateSummary: () => void;
  onGenerateReport: () => void;
  onOpenSection: (section: TaskAuthoringSection) => void;
  transferAction?: React.ReactNode;
};

export function TaskAuthoringHeader({
  title,
  metadata,
  statusLabel,
  statusClassName,
  issueCount,
  recipeCount,
  sensesCount,
  hasMatrixInstance,
  hasComparisonInstance,
  hasAiSummary,
  generatingReport,
  summarizing,
  onBack,
  onGenerateSummary,
  onGenerateReport,
  onOpenSection,
  transferAction,
}: TaskAuthoringHeaderProps) {
  const cards: TaskStatusCard[] = [
    { label: '五感体验', value: `${sensesCount} 条记录`, section: 'senses' },
    { label: '食谱/功能', value: `${recipeCount} 个功能`, section: 'functions' },
    { label: '数据矩阵', value: hasMatrixInstance ? '已创建' : '未创建', section: 'matrix', available: hasMatrixInstance },
    { label: '对比矩阵', value: hasComparisonInstance ? '已创建' : '未创建', section: 'comparison', available: hasComparisonInstance },
    { label: '报告信息', value: hasAiSummary ? '已有总结' : '待生成', section: 'info' },
  ];

  return (
    <section aria-label="任务上下文" className="rounded-lg border bg-card p-2 shadow-sm md:min-h-24 md:p-5">
      <div className="flex items-start gap-2 md:hidden" data-testid="mobile-task-context">
        <Button variant="ghost" size="icon" className="min-h-11 min-w-11 shrink-0" onClick={onBack} aria-label="返回任务列表">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <details className="md:hidden">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-md px-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">{title}</span>
            <Badge variant="secondary" className={cn('shrink-0', statusClassName)}>{statusLabel}</Badge>
            <span className="text-xs text-muted-foreground">任务导航</span>
          </summary>
          <div className="mt-2 space-y-3 border-t pt-3">
            <div>
              <p className="break-words text-xs text-muted-foreground">{metadata}</p>
              <p className="mt-1 text-xs text-muted-foreground">问题数：{issueCount}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" className="min-h-11 min-w-0" onClick={onGenerateSummary} disabled={summarizing}>
                <Sparkles className="mr-1.5 h-4 w-4" />
                {summarizing ? '总结中...' : '生成总结'}
              </Button>
              <Button className="min-h-11 min-w-0" onClick={onGenerateReport} disabled={generatingReport}>
                <FileText className="mr-1.5 h-4 w-4" />
                {generatingReport ? '生成中...' : '生成报告'}
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {cards.map((card) => (
                <button
                  key={card.label}
                  type="button"
                  onClick={() => card.section && onOpenSection(card.section)}
                  className={cn(
                    'min-h-11 min-w-0 rounded-md border bg-background p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    card.available === false && 'border-dashed text-muted-foreground',
                  )}
                >
                  <span className="block truncate text-xs font-medium text-muted-foreground">{card.label}</span>
                  <span className="mt-1 block truncate text-sm font-semibold">{card.value}</span>
                </button>
              ))}
            </div>
            {transferAction}
          </div>
        </details>
      </div>

      <div className="hidden md:block">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={onBack} aria-label="返回任务列表">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="break-words text-xl font-semibold sm:text-2xl">{title}</h1>
              <Badge variant="secondary" className={cn('shrink-0', statusClassName)}>{statusLabel}</Badge>
            </div>
            <p className="mt-1 break-words text-xs text-muted-foreground sm:text-sm">{metadata}</p>
            <p className="mt-1 text-xs text-muted-foreground">问题数：{issueCount}</p>
          </div>
        </div>

        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:justify-end">
          <Button variant="outline" className="min-w-0" onClick={onGenerateSummary} disabled={summarizing}>
            <Sparkles className="mr-1.5 h-4 w-4" />
            {summarizing ? '总结中...' : '生成总结'}
          </Button>
          <Button className="min-w-0" onClick={onGenerateReport} disabled={generatingReport}>
            <FileText className="mr-1.5 h-4 w-4" />
            {generatingReport ? '生成中...' : '生成报告'}
          </Button>
          {transferAction && <span className="col-span-2 sm:col-span-1">{transferAction}</span>}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
        {cards.map((card) => (
          <button
            key={card.label}
            type="button"
            onClick={() => card.section && onOpenSection(card.section)}
            className={cn(
              'min-w-0 rounded-md border bg-background p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              'hover:border-primary/50 hover:bg-muted/40',
              card.available === false && 'border-dashed text-muted-foreground',
              card.className,
            )}
          >
            <div className="truncate text-xs font-medium text-muted-foreground">{card.label}</div>
            <div className="mt-1 truncate text-sm font-semibold">{card.value}</div>
          </button>
        ))}
      </div>
      </div>
    </section>
  );
}
