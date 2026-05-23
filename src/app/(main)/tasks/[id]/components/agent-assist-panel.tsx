'use client';

import { AlertTriangle, Bot, CheckCircle2, CircleDot, Link2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import type { ReportReadinessItem, ReportReadinessResult } from '@/lib/report-readiness';

type TaskTabKey = 'info' | 'materials' | 'senses' | 'functions';

type AgentAssistPanelProps = {
  readiness: ReportReadinessResult | null;
  activeTab: TaskTabKey;
  onTabChange: (tab: TaskTabKey) => void;
  onClose: () => void;
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

function getItemIcon(item: ReportReadinessItem) {
  if (item.status === 'ok') return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
  if (item.severity === 'critical') return <AlertTriangle className="h-4 w-4 text-destructive" />;
  return <CircleDot className="h-4 w-4 text-amber-600" />;
}

export function AgentAssistPanel({ readiness, activeTab, onTabChange, onClose }: AgentAssistPanelProps) {
  const attentionItems = readiness?.items.filter((item) => item.status !== 'ok') || [];

  return (
    <aside className="rounded-lg border bg-card shadow-sm lg:sticky lg:top-4 lg:w-[280px]">
      <div className="flex items-start justify-between gap-3 border-b p-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Agent 辅助</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">按需检查缺口、定位素材、辅助总结。</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>关闭</Button>
      </div>

      <ScrollArea className="h-[min(560px,calc(100dvh-12rem))]">
        <div className="space-y-3 p-3">
          {readiness && (
            <div className="rounded-md border bg-muted/30 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">输入完整度</span>
                <Badge variant={readiness.status === 'ready' ? 'default' : readiness.status === 'attention' ? 'secondary' : 'destructive'}>
                  {readiness.score}/100
                </Badge>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {attentionItems.length > 0 ? `还有 ${attentionItems.length} 项建议确认。` : '关键输入已经完整。'}
              </p>
            </div>
          )}

          {attentionItems.slice(0, 6).map((item) => {
            const targetTab = itemTabMap[item.id] || activeTab;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onTabChange(targetTab)}
                className={cn(
                  'w-full rounded-md border p-2 text-left transition-colors hover:bg-muted/50',
                  item.status === 'ok' ? 'bg-background' : 'border-amber-200 bg-amber-50/60 dark:bg-amber-950/20'
                )}
              >
                <div className="flex items-start gap-2">
                  <span className="mt-0.5">{getItemIcon(item)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium leading-tight">{item.label}</span>
                    <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{item.description}</span>
                  </span>
                </div>
              </button>
            );
          })}

          <div className="rounded-md border bg-background p-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Link2 className="h-4 w-4" /> 素材建议
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              优先处理未关联素材。选择一条五感记录、步骤或效果评价后，可从顶部素材证据栏直接绑定图片/视频。
            </p>
          </div>
        </div>
      </ScrollArea>
    </aside>
  );
}
