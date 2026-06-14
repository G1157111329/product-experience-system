'use client';

import { ArrowRightLeft, FileText, Sparkles, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/app';
import type { TaskDetail, AiTaskSummary } from '../types';
import { statusConfig } from '../types';

type TaskDetailHeaderProps = {
  task: TaskDetail;
  aiSummary: AiTaskSummary | null;
  aiSummarizing: boolean;
  generatingReport: boolean;
  isAdmin: boolean;
  onBack: () => void;
  onOpenAiSummary: () => void;
  onGenerateAiSummary: () => void;
  onTransfer: () => void;
  onGenerateReport: () => void;
};

export function TaskDetailHeader({
  task, aiSummary, aiSummarizing, generatingReport, isAdmin,
  onBack, onOpenAiSummary, onGenerateAiSummary, onTransfer, onGenerateReport,
}: TaskDetailHeaderProps) {
  const actions = (
    <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:justify-end">
      <Button variant="outline" size="sm" className="min-w-0 sm:flex-none" onClick={aiSummary ? onOpenAiSummary : onGenerateAiSummary} disabled={aiSummarizing}>
        <Sparkles className="h-4 w-4 mr-1.5" /> {aiSummarizing ? '总结中...' : aiSummary ? 'AI总结' : '生成AI总结'}
      </Button>
      {isAdmin && (
        <Button variant="outline" size="sm" className="min-w-0 sm:flex-none" onClick={onTransfer}>
          <ArrowRightLeft className="h-4 w-4 mr-1.5" /> 转移
        </Button>
      )}
      <Button size="sm" className="col-span-2 min-w-0 sm:col-span-1 sm:flex-none" onClick={onGenerateReport} disabled={generatingReport}>
        <FileText className="h-4 w-4 mr-1.5" /> {generatingReport ? '生成中...' : '报告生成'}
      </Button>
    </div>
  );

  return (
    <>
      <PageHeader
        title={task.task_name}
        description={`${task.product_model}${task.project_number ? ` | ${task.project_number}` : ''} | ${task.product_category}${task.product ? ` - ${task.product}` : ''}${task.project_type ? ` | ${task.project_type}` : ''}${task.project_phase ? ` | ${task.project_phase}` : ''}`}
        backAction={onBack}
        meta={
          <Badge variant="secondary" className={statusConfig[task.status]?.color}>
            {statusConfig[task.status]?.label || task.status}
          </Badge>
        }
        actions={actions}
      />

      {aiSummary && (
        <button
          type="button"
          onClick={onOpenAiSummary}
          className="w-full text-left rounded-lg border bg-primary/5 border-primary/20 p-3 shadow-sm transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <Badge className="shrink-0 text-[10px]">{aiSummary.tag || 'AI总结'}</Badge>
            <span className="text-sm font-medium shrink-0">{aiSummary.satisfaction_score}/10</span>
            <span className="basis-full text-xs text-muted-foreground line-clamp-2 min-w-0 sm:basis-auto sm:truncate">{aiSummary.summary || '点击查看和编辑AI总结'}</span>
            <Pencil className="h-3.5 w-3.5 text-muted-foreground shrink-0 ml-auto" />
          </div>
        </button>
      )}
    </>
  );
}
