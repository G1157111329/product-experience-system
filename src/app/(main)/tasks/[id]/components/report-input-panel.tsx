'use client';

import { AlertTriangle, CheckCircle2, CircleDot, FileText, Image as ImageIcon, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import type { ReportReadinessItem, ReportReadinessResult } from '@/lib/report-readiness';

type TaskTabKey = 'info' | 'materials' | 'senses' | 'functions';

type ReportInputPanelProps = {
  readiness: ReportReadinessResult;
  activeTab: TaskTabKey;
  generatingReport: boolean;
  aiSummaryExists: boolean;
  aiSummarizing: boolean;
  onTabChange: (tab: TaskTabKey) => void;
  onGenerateReport: () => void;
  onOpenAiSummary: () => void;
  onGenerateAiSummary: () => void;
};

const itemTabMap: Record<string, TaskTabKey> = {
  'basic-info': 'info',
  records: 'senses',
  'record-problem-description': 'senses',
  'record-evidence': 'senses',
  recipes: 'functions',
  'recipe-effect-description': 'functions',
  'recipe-step-evidence': 'functions',
  'raw-json-problem-points': 'functions',
  'ai-summary': 'info',
};

function getScoreLabel(readiness: ReportReadinessResult) {
  if (readiness.status === 'ready') return '可生成';
  if (readiness.status === 'attention') return '需确认';
  return '待补充';
}

function getItemIcon(item: ReportReadinessItem) {
  if (item.status === 'ok') return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
  if (item.severity === 'critical') return <AlertTriangle className="h-4 w-4 text-destructive" />;
  return <CircleDot className="h-4 w-4 text-amber-600" />;
}

export function ReportInputPanel({
  readiness,
  activeTab,
  generatingReport,
  aiSummaryExists,
  aiSummarizing,
  onTabChange,
  onGenerateReport,
  onOpenAiSummary,
  onGenerateAiSummary,
}: ReportInputPanelProps) {
  const attentionItems = readiness.items.filter((item) => item.status !== 'ok');
  const primaryItems = attentionItems.length > 0 ? attentionItems : readiness.items.slice(0, 4);
  const criticalCount = readiness.items.filter((item) => item.status === 'missing' && item.severity === 'critical').length;

  return (
    <aside className="rounded-lg border bg-card p-4 shadow-sm lg:sticky lg:top-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">报告输入检查</p>
          <h2 className="mt-1 text-lg font-semibold">生成前质量确认</h2>
        </div>
        <Badge
          variant={readiness.status === 'ready' ? 'default' : readiness.status === 'attention' ? 'secondary' : 'destructive'}
          className="shrink-0"
        >
          {getScoreLabel(readiness)}
        </Badge>
      </div>

      <div className="mt-4">
        <div className="flex items-end justify-between">
          <div>
            <div className="text-3xl font-semibold tracking-normal">{readiness.score}</div>
            <p className="text-xs text-muted-foreground">输入完整度</p>
          </div>
          <p className="text-xs text-muted-foreground">
            {criticalCount > 0 ? `${criticalCount} 项关键缺口` : '关键项已完整'}
          </p>
        </div>
        <Progress value={readiness.score} className="mt-3" />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-md bg-muted/40 p-2">
          <div className="font-medium">{readiness.stats.records}</div>
          <div className="text-muted-foreground">检查记录</div>
        </div>
        <div className="rounded-md bg-muted/40 p-2">
          <div className="font-medium">{readiness.stats.failedRecords}</div>
          <div className="text-muted-foreground">不合格项</div>
        </div>
        <div className="rounded-md bg-muted/40 p-2">
          <div className="font-medium">{readiness.stats.recipes}</div>
          <div className="text-muted-foreground">功能/食谱</div>
        </div>
        <div className="rounded-md bg-muted/40 p-2">
          <div className="flex items-center gap-1 font-medium">
            <ImageIcon className="h-3.5 w-3.5" />
            {readiness.stats.media}
          </div>
          <div className="text-muted-foreground">图片/视频</div>
        </div>
      </div>

      <div className="mt-4 rounded-md border bg-background p-2">
        <p className="mb-2 text-xs font-medium text-muted-foreground">报告大纲</p>
        <div className="grid grid-cols-2 gap-1.5">
          {[
            ['info', '基础信息'],
            ['senses', '五感记录'],
            ['materials', '素材证据'],
            ['functions', '功能效果'],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => onTabChange(key as TaskTabKey)}
              className={cn(
                'rounded px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted',
                activeTab === key ? 'bg-primary text-primary-foreground' : 'bg-muted/40'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {primaryItems.map((item) => {
          const targetTab = itemTabMap[item.id] || activeTab;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onTabChange(targetTab)}
              className={cn(
                'w-full rounded-md border p-2 text-left transition-colors hover:bg-muted/50',
                item.status === 'ok' ? 'border-border bg-background' : 'border-amber-200 bg-amber-50/60 dark:bg-amber-950/20'
              )}
            >
              <div className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0">{getItemIcon(item)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium leading-tight">{item.label}</span>
                  <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{item.description}</span>
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-4 grid gap-2">
        <Button onClick={onGenerateReport} disabled={generatingReport}>
          <FileText className="mr-1.5 h-4 w-4" />
          {generatingReport ? '生成中...' : '生成报告'}
        </Button>
        <Button
          variant="outline"
          onClick={aiSummaryExists ? onOpenAiSummary : onGenerateAiSummary}
          disabled={aiSummarizing}
        >
          <Sparkles className="mr-1.5 h-4 w-4" />
          {aiSummarizing ? '总结中...' : aiSummaryExists ? '查看 AI总结' : '生成 AI总结'}
        </Button>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        这里不阻断生成，只把报告输入质量提前暴露，减少生成后再回任务页补材料的往返。
      </p>
    </aside>
  );
}
