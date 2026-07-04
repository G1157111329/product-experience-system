'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PresignedImage, PresignedVideo } from '@/components/presigned-media';
import type { IssueForRectification } from '@/components/issues/issue-rectification-dialog';

const LEVEL_COLORS: Record<string, string> = {
  '一类': 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
  '二类': 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
  '三类': 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
};

const STATUS_LABELS: Record<string, string> = {
  open: '待整改',
  triaged: '待整改',
  assigned: '整改中',
  rectifying: '整改中',
  pending_verification: '待验证',
  verified_closed: '已整改',
  waived: '不整改',
  reopened: '待整改',
  '待整改': '待整改',
  '整改中': '整改中',
  '已验证': '已整改',
  '已整改': '已整改',
  '不整改': '不整改',
};

interface IssueRowProps {
  issue: IssueForRectification & {
    occurrenceCount?: number;
    historyCount?: number;
    occurrenceTimeline?: Array<Record<string, unknown>>;
    rectificationHistory?: Array<Record<string, unknown>>;
    materials?: Array<Record<string, unknown>>;
    reEvaluationCount?: number;
    latestReEvaluation?: Record<string, unknown> | null;
    // 矩阵溯源字段
    source_assembly_id?: string | null;
    source_item_node_id?: string | null;
    source_object_id?: string | null;
    description?: string | null;
  };
  onStatusClick: (issue: IssueForRectification) => void;
}

function sourceLabel(issue: Record<string, unknown>): string {
  const st = String(issue.source_type || '');
  if (st === 'recipe_problem') return issue.source_assembly_id ? '对比项' : '食谱/功能';
  if (st === 'record_fail') return '五感体验';
  return '其他';
}

export function IssueRow({ issue, onStatusClick }: IssueRowProps) {
  const [expanded, setExpanded] = useState(false);
  const status = String(issue.status || 'open');
  const statusLabel = STATUS_LABELS[status] || status;
  const isRectified = status === 'verified_closed' || status === '已验证' || status === '已整改';
  const iss = issue as Record<string, unknown>;
  const materials = issue.materials || [];
  const reEvalCount = issue.reEvaluationCount || 0;
  const latestReEval = issue.latestReEvaluation;

  // 解析描述（对比矩阵问题的 description 含"对象：xxx\n项目：xxx\n问题：xxx"）
  const descLines = String(issue.description || '').split('\n').filter(Boolean);
  const descMap: Record<string, string> = {};
  for (const line of descLines) {
    const idx = line.indexOf('：');
    if (idx > 0) descMap[line.slice(0, idx)] = line.slice(idx + 1);
  }

  return (
    <div className="rounded-lg border bg-background">
      <button
        type="button"
        className="flex w-full items-center gap-2 p-3 text-left transition-colors hover:bg-muted/30"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        <Badge className={cn('text-[10px] shrink-0', LEVEL_COLORS[issue.level || '三类'] || LEVEL_COLORS['三类'])}>
          {issue.level || '三类'}
        </Badge>
        <Badge variant="outline" className="text-[10px] shrink-0">{sourceLabel(iss)}</Badge>
        <span className="min-w-0 flex-1 text-sm truncate">{issue.title}</span>
        <Button
          variant="ghost"
          size="sm"
          className={cn('h-6 px-2 text-[11px] shrink-0', isRectified ? 'text-emerald-600' : 'text-amber-600')}
          onClick={(e) => {
            e.stopPropagation();
            onStatusClick(issue);
          }}
        >
          {statusLabel}
        </Button>
      </button>

      {expanded && (
        <div className="border-t px-3 py-3 space-y-2 text-xs">
          {/* 分行呈现：对象/项目/细项/问题/素材 */}
          {descMap['对象'] && <div><span className="text-muted-foreground">对象：</span>{descMap['对象']}</div>}
          {descMap['项目'] && <div><span className="text-muted-foreground">项目：</span>{descMap['项目']}</div>}
          {descMap['细项'] && <div><span className="text-muted-foreground">细项：</span>{descMap['细项']}</div>}
          {/* 问题描述：如果有 descMap['问题'] 用它，否则用 issue.description 或 title */}
          <div>
            <span className="text-muted-foreground">问题：</span>
            {descMap['问题'] || issue.title}
          </div>
          {/* 非矩阵问题的补充描述 */}
          {!descMap['对象'] && issue.description && issue.description !== issue.title && (
            <div className="text-muted-foreground">{issue.description}</div>
          )}

          {/* 素材 */}
          {materials.length > 0 && (
            <div className="space-y-1">
              <span className="text-muted-foreground">素材：</span>
              <div className="flex flex-wrap gap-2">
                {materials.map((mat) => (
                  <div key={String(mat.id)} className="h-16 w-16 overflow-hidden rounded border bg-muted">
                    {String(mat.material_type || 'image') === 'image' ? (
                      <PresignedImage filePath={String(mat.file_path || mat.file_url || '')} alt={String(mat.file_name || '')} className="h-full w-full object-cover" />
                    ) : (
                      <PresignedVideo filePath={String(mat.file_path || mat.file_url || '')} className="h-full w-full object-cover" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 已整改状态：显示整改评价/整改素材/复测记录数 */}
          {isRectified && (
            <div className="mt-3 space-y-2 rounded-md border border-emerald-200 bg-emerald-50/40 p-2">
              <div className="text-[11px] font-medium text-emerald-700">整改效果评价</div>
              {latestReEval ? (
                <>
                  {String(latestReEval.description || '') && (
                    <div className="text-muted-foreground">{String(latestReEval.description)}</div>
                  )}
                  {latestReEval.ai_result && (
                    <div className="text-muted-foreground">
                      {(() => {
                        const ar = latestReEval.ai_result as Record<string, unknown> | null;
                        if (!ar) return null;
                        const scoreStr = ar.score !== undefined && ar.score !== null ? String(ar.score) : '—';
                        const summaryStr = ar.summary ? `｜${String(ar.summary)}` : '';
                        return `评分：${scoreStr}${summaryStr}`;
                      })()}
                    </div>
                  )}
                  {Array.isArray(latestReEval.materials) && (latestReEval.materials as Array<Record<string, unknown>>).length > 0 && (
                    <div>
                      <span className="text-muted-foreground">整改素材：</span>
                      <div className="mt-1 flex flex-wrap gap-2">
                        {(latestReEval.materials as Array<Record<string, unknown>>).map((m) => (
                          <div key={String(m.id)} className="h-14 w-14 overflow-hidden rounded border bg-muted">
                            {String(m.material_type || 'image') === 'image' ? (
                              <PresignedImage filePath={String(m.file_path || m.file_url || '')} alt={String(m.file_name || '')} className="h-full w-full object-cover" />
                            ) : (
                              <PresignedVideo filePath={String(m.file_path || m.file_url || '')} className="h-full w-full object-cover" />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-muted-foreground">暂无整改评价记录</div>
              )}
              {reEvalCount > 0 && (
                <div className="text-[11px] text-muted-foreground">整改复测记录数：{reEvalCount}</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
