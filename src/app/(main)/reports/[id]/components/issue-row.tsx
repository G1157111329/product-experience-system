'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getIssueStatusPresentation } from '@/lib/server/issue-state-machine';
import type { IssueForRectification } from '@/components/issues/issue-rectification-dialog';
import { ReportMediaGrid, type ReportMediaItem, type ReportMediaRole } from '@/components/reports/report-media-grid';

type Row = Record<string, unknown>;

const LEVEL_COLORS: Record<string, string> = {
  '一类': 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
  '二类': 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
  '三类': 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
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
    recipeContext?: Record<string, unknown> | null;
    recordContext?: Record<string, unknown> | null;
    // 矩阵溯源字段
    source_assembly_id?: string | null;
    source_item_node_id?: string | null;
    source_object_id?: string | null;
    description?: string | null;
  };
  onStatusClick: (issue: IssueForRectification) => void;
}

function sourceLabelV2(issue: Record<string, unknown>): string {
  const sourceType = String(issue.source_type || '');
  if (String(issue.source_assembly_id || '') || sourceType === 'matrix_problem') return '对比项';
  if (sourceType === 'recipe_problem') return '食谱/功能';
  if (sourceType === 'record_fail') return '五感体验';
  return '其他';
}

function RecipeIssueDetails({
  recipe,
  stepsExpanded,
  onToggleSteps,
}: {
  recipe: Row;
  stepsExpanded: boolean;
  onToggleSteps: () => void;
}) {
  const steps = (Array.isArray(recipe.recipe_steps) ? recipe.recipe_steps : []) as Row[];
  const effectMaterials = (Array.isArray(recipe.effect_materials) ? recipe.effect_materials : []) as Row[];

  return (
    <div className="space-y-2">
      <div><span className="text-muted-foreground">食谱名称：</span>{String(recipe.name || '-')}</div>
      <div><span className="text-muted-foreground">食谱配方/参数：</span>{String(recipe.ingredients || '-')}</div>
      <div className="rounded-md border">
        <button
          type="button"
          className="flex w-full items-center gap-2 px-2 py-1.5 text-left font-medium hover:bg-muted/30"
          onClick={onToggleSteps}
        >
          {stepsExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          <span>食谱步骤：{steps.length}步</span>
        </button>
        {stepsExpanded && (
          <div className="space-y-2 border-t p-2">
            {steps.map((step, index) => {
              const stepMaterials = (Array.isArray(step.materials) ? step.materials : []) as Row[];
              const stepProblemPoints = Array.isArray(step.problem_points)
                ? step.problem_points.map((point) => typeof point === 'string' ? point : String((point as Row)?.text || '')).filter(Boolean)
                : typeof step.problem_point === 'string' && step.problem_point.trim()
                  ? [step.problem_point.trim()]
                  : [];
              return (
                <div key={String(step.id || index)} className="rounded border bg-background p-2">
                  <div><span className="font-medium">步骤{String(step.step_number || index + 1)}：</span>{String(step.operation || '-')}</div>
                  {stepProblemPoints.length > 0 && <div className="mt-1 text-muted-foreground">步骤问题点：{stepProblemPoints.join('；')}</div>}
                  <MaterialGrid materials={stepMaterials} role="evidence" />
                </div>
              );
            })}
          </div>
        )}
      </div>
      {(Boolean(recipe.effect_description) || Boolean(recipe.effect_score) || Boolean(recipe.effect_ai_result) || effectMaterials.length > 0) && (
        <div>
          <div className="font-medium text-primary">食谱效果评价</div>
          {Boolean(recipe.effect_description) && <div className="whitespace-pre-wrap text-muted-foreground">{String(recipe.effect_description)}</div>}
          {Boolean(recipe.effect_score) && <div className="text-muted-foreground">评分：{String(recipe.effect_score)}</div>}
          <MaterialGrid materials={effectMaterials} role="primary" />
        </div>
      )}
    </div>
  );
}

function MaterialGrid({ materials, role = 'appendix' }: { materials?: Row[]; role?: ReportMediaRole }) {
  if (!materials?.length) return null;
  const items = materials.flatMap((material, index): ReportMediaItem[] => {
    const url = String(material.file_path || material.file_url || '');
    if (!url) return [];
    return [{
      id: String(material.id || `${url}:${index}`),
      url,
      name: String(material.file_name || '素材'),
      type: String(material.material_type || 'image'),
    }];
  });
  return <ReportMediaGrid items={items} role={role} className="mt-1" />;
}

export function IssueRow({ issue, onStatusClick }: IssueRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [stepsExpanded, setStepsExpanded] = useState(false);
  const statusPresentation = getIssueStatusPresentation(String(issue.status || 'open'));
  const isRectified = statusPresentation.key === 'rectified';
  const iss = issue as Record<string, unknown>;
  const materials = issue.materials || [];
  const reEvalCount = issue.reEvaluationCount || 0;
  const latestReEval = issue.latestReEvaluation;
  const recipeContext = issue.recipeContext || null;

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
        <Badge variant="outline" className="text-[10px] shrink-0">{sourceLabelV2(iss)}</Badge>
        <span className="min-w-0 flex-1 text-sm truncate">{issue.title}</span>
        <Button
          variant="ghost"
          size="sm"
          className={cn('h-6 px-2 text-[11px] shrink-0', statusPresentation.className)}
          onClick={(e) => {
            e.stopPropagation();
            onStatusClick(issue);
          }}
        >
          {statusPresentation.label}
        </Button>
      </button>

      {expanded && (
        <div className="border-t px-3 py-3 space-y-2 text-xs">
          {recipeContext ? (
            <RecipeIssueDetails
              recipe={recipeContext}
              stepsExpanded={stepsExpanded}
              onToggleSteps={() => setStepsExpanded((v) => !v)}
            />
          ) : (
            <>
          {/* 分行呈现：对象/项目/细项/问题/素材 */}
          {descMap['对象'] && <div><span className="text-muted-foreground">对象：</span>{descMap['对象']}</div>}
          {descMap['项目'] && <div><span className="text-muted-foreground">项目：</span>{descMap['项目']}</div>}
          {descMap['细项'] && <div><span className="text-muted-foreground">细项：</span>{descMap['细项']}</div>}
            </>
          )}

          <div>
            <span className="text-muted-foreground">问题：</span>
            {descMap['问题'] || issue.description || issue.title}
          </div>

          {materials.length > 0 && (
            <div className="space-y-1">
              <div className="font-medium text-foreground">素材</div>
              <MaterialGrid materials={materials} role="appendix" />
            </div>
          )}

          <div className={cn('mt-3 space-y-2 rounded-md border p-2', isRectified ? 'border-emerald-200 bg-emerald-50/40' : 'bg-muted/20')}>
              <div className={cn('text-[11px] font-medium', isRectified && 'text-emerald-700')}>整改</div>
              {!isRectified && <div className="text-muted-foreground">{statusPresentation.label}</div>}
              {isRectified && (
                <>
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
                      <MaterialGrid materials={latestReEval.materials as Array<Record<string, unknown>>} role="appendix" />
                    </div>
                  )}
                </>
              ) : (
                <div className="text-muted-foreground">暂无整改评价记录</div>
              )}
              {reEvalCount > 0 && (
                <div className="text-[11px] text-muted-foreground">整改复测记录数：{reEvalCount}</div>
              )}
                </>
              )}
          </div>
        </div>
      )}
    </div>
  );
}
