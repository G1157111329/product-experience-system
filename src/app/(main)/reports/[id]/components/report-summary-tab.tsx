'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AiSummaryLike } from '@/lib/report-review-overrides';

export interface ReportSummaryData {
  aiSummary?: Record<string, unknown> | null;
  summaryText?: string | null;
  taskInfo?: Record<string, unknown> | null;
  stats?: {
    totalCheckItems?: number;
    passCount?: number;
    failCount?: number;
    issueCount?: number;
    recipeCount?: number;
    sensoryIssueCount?: number;
    functionIssueCount?: number;
    comparisonIssueCount?: number;
    rectificationRate?: number;
  };
  conclusion?: {
    level: string;
    text: string;
  };
  generatedAt?: string | null;
}

function fmtDate(value: unknown): string {
  if (!value) return '—';
  const s = String(value);
  if (!s || s.startsWith('0001-01-01')) return '—';
  // 支持 ISO 字符串与 date 字段，格式化为 YYYY/MM/DD/HH/MM/SS
  const d = new Date(s);
  if (isNaN(d.getTime())) return s.length >= 10 ? s.slice(0, 10) : s;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '00';
  return `${part('year')}/${part('month')}/${part('day')}/${part('hour')}/${part('minute')}/${part('second')}`;
}

export function ReportSummaryTab({ data }: { data: ReportSummaryData | null }) {
  if (!data) return null;
  const stats = data.stats || { totalCheckItems: 0, passCount: 0, failCount: 0, issueCount: 0, recipeCount: 0 };
  const aiSummary = (data.aiSummary ?? (data.summaryText ? { summary: data.summaryText } : null)) as AiSummaryLike | undefined;
  const task = (data.taskInfo || {}) as Record<string, unknown>;

  const productInfoItems: Array<{ label: string; value: unknown }> = [
    { label: '单号', value: task.project_number },
    { label: '产品型号', value: task.product_model },
    { label: '产品', value: task.product },
    { label: '品类', value: task.product_category },
    { label: '项目类型', value: task.project_type },
    { label: '项目阶段', value: task.project_phase },
    { label: '体验人', value: task.organizer },
    { label: '体验时间', value: fmtDate(task.test_date) },
    { label: '创建时间', value: fmtDate(task.created_at) },
  ].filter((item) => item.value !== null && item.value !== undefined && String(item.value).trim() !== '' && String(item.value) !== '—');
  const testPurpose = task.test_purpose ? String(task.test_purpose) : '';

  // 概览统计 5 项（按问题点维度）
  const overviewStats = [
    { label: '问题点总数', value: stats.issueCount ?? 0, color: 'text-foreground' },
    { label: '五感体验问题点', value: stats.sensoryIssueCount ?? 0, color: 'text-amber-600' },
    { label: '功能效果问题点', value: stats.functionIssueCount ?? 0, color: 'text-orange-600' },
    { label: '对比问题点', value: stats.comparisonIssueCount ?? 0, color: 'text-purple-600' },
    { label: '整改率', value: `${stats.rectificationRate ?? 0}%`, color: 'text-emerald-600' },
  ];

  const hasAiSummary = aiSummary && (aiSummary.summary || aiSummary.tag || (Array.isArray(aiSummary.strengths) && aiSummary.strengths.length));

  return (
    <div className="space-y-4 p-4">
      {/* 1. 产品信息栏 */}
      {productInfoItems.length > 0 ? (
        <Card>
          <CardContent className="p-4">
            <div className="mb-3 flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">产品信息</span>
            </div>
            <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
              {productInfoItems.map((item) => (
                <div key={item.label} className="min-w-0">
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                  <p className="break-words text-sm font-medium">{String(item.value)}</p>
                </div>
              ))}
            </div>
            {testPurpose && (
              <div className="mt-3 border-t pt-3">
                <p className="text-xs text-muted-foreground">体验目的</p>
                <p className="break-words text-sm font-medium leading-relaxed">{testPurpose}</p>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {/* 2. 总结模块（无内容时缩小空间） */}
      {hasAiSummary ? (
        <div className="rounded-lg border bg-background p-4 space-y-3">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">总结</span>
            {aiSummary.tag && <Badge variant="outline" className="text-xs">{aiSummary.tag}</Badge>}
          </div>
          {aiSummary.summary && (
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">{aiSummary.summary}</p>
          )}
          {Array.isArray(aiSummary.strengths) && aiSummary.strengths.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-emerald-700">主要优势</p>
              <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                {(aiSummary.strengths as string[]).map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            </div>
          )}
          {Array.isArray(aiSummary.risks) && aiSummary.risks.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-amber-700">主要风险</p>
              <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                {(aiSummary.risks as string[]).map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            </div>
          )}
          {Array.isArray(aiSummary.suggestions) && aiSummary.suggestions.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium">后续建议</p>
              <ol className="list-decimal space-y-1 pl-4 text-xs text-muted-foreground">
                {(aiSummary.suggestions as string[]).map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ol>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed bg-muted/20 px-4 py-2 text-xs text-muted-foreground">
          暂无总结内容
        </div>
      )}

      {/* 3. 概览统计（5 项） */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {overviewStats.map((s) => (
          <Card key={s.label}>
            <CardContent className="p-3 text-center">
              <p className={cn('text-xl font-bold sm:text-2xl', s.color)}>{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
