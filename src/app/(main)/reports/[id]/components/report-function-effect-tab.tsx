'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronRight, Star } from 'lucide-react';
import { PresignedImage, PresignedVideo } from '@/components/presigned-media';
import { selectEffectEvaluationText } from '@/lib/report-content-rules';

interface FunctionEffectRecipe {
  id: string;
  name: string;
  recipe_type?: string;
  ingredients?: string | null;
  effect_description?: string | null;
  effect_score?: string | null;
  effect_problem_point?: string | null;
  effect_ai_result?: { score?: number; summary?: string } | null;
  problem_count?: number;
  recipe_steps?: Array<{
    id: string;
    step_number: number;
    operation: string;
    problem_point?: string | null;
    problem_points?: Array<{ text: string; material_ids?: string[] }>;
    materials?: Array<Record<string, unknown>>;
  }>;
  effect_materials?: Array<Record<string, unknown>>;
}

export function ReportFunctionEffectTab({ recipes }: { recipes: FunctionEffectRecipe[] | null }) {
  if (!recipes) {
    return <div className="p-8 text-center text-sm text-muted-foreground">加载中...</div>;
  }
  if (recipes.length === 0) {
    return <div className="p-8 text-center text-sm text-muted-foreground">暂无功能效果数据</div>;
  }
  return (
    <div className="space-y-3 p-4">
      {recipes.map((recipe) => (
        <RecipeCard key={recipe.id} recipe={recipe} />
      ))}
    </div>
  );
}

function parseProblemPoints(raw: string | null | undefined): Array<{ text: string; material_ids?: string[] }> {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .map((p) => (typeof p === 'string' ? { text: p } : { text: String(p?.text ?? ''), material_ids: p?.material_ids }))
        .filter((p) => p.text.trim());
    }
  } catch {
    // 非 JSON，按换行分割
    return raw.split('\n').map((t) => t.trim()).filter(Boolean).map((text) => ({ text }));
  }
  return [];
}

function RecipeCard({ recipe }: { recipe: FunctionEffectRecipe }) {
  const [stepsExpanded, setStepsExpanded] = useState(false);
  const steps = recipe.recipe_steps || [];
  const effectPps = parseProblemPoints(recipe.effect_problem_point);
  const effectScore = recipe.effect_score;
  const evaluationText = selectEffectEvaluationText(recipe);
  // 实时计算步骤问题点 + 效果问题点（不依赖可能不准的 problem_count 字段）
  const stepProblemCount = steps.reduce((sum, step) => {
    const pps = step.problem_points;
    if (Array.isArray(pps) && pps.length > 0) return sum + pps.filter((p) => p.text?.trim()).length;
    return sum + (step.problem_point?.trim() ? 1 : 0);
  }, 0);
  const totalProblems = stepProblemCount + effectPps.length;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center gap-2">
          {recipe.recipe_type && (
            <Badge variant="secondary" className="text-[10px]">{recipe.recipe_type}</Badge>
          )}
          <span className="text-sm font-semibold">{recipe.name}</span>
          <div className="ml-auto flex flex-wrap items-center gap-1">
            <Badge variant="outline" className="text-[10px]">{steps.length} 步骤</Badge>
            {effectScore && (
              <Badge className="text-[10px]"><Star className="mr-1 h-3 w-3" />{effectScore}分</Badge>
            )}
            <Badge variant={totalProblems > 0 ? 'destructive' : 'outline'} className="text-[10px]">
              {totalProblems} 问题
            </Badge>
          </div>
        </div>
        {recipe.ingredients && (
          <p className="text-xs text-muted-foreground">食材/参数：{recipe.ingredients}</p>
        )}
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {/* 效果评价 */}
        {(evaluationText || (recipe.effect_materials && recipe.effect_materials.length > 0) || effectScore) && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-primary">效果/出品评价</p>
            {evaluationText && (
              <p className="whitespace-pre-wrap text-xs text-muted-foreground">{evaluationText}</p>
            )}
            {recipe.effect_materials && recipe.effect_materials.length > 0 && (
              <EffectMediaGrid materials={recipe.effect_materials} />
            )}
          </div>
        )}

        {/* 食谱步骤（默认折叠） */}
        {steps.length > 0 && (
          <div className="rounded-lg border">
            <button
              type="button"
              onClick={() => setStepsExpanded((v) => !v)}
              className="flex w-full items-center gap-2 p-2 text-left text-xs font-medium hover:bg-muted/30"
            >
              {stepsExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              <span>食谱步骤：{steps.length}步</span>
            </button>
            {stepsExpanded && (
              <div className="space-y-2 border-t p-2">
                {steps.map((step, idx) => {
                  const stepPps = step.problem_points && step.problem_points.length > 0
                    ? step.problem_points.filter((p) => p.text.trim())
                    : step.problem_point
                      ? [{ text: step.problem_point }]
                      : [];
                  return (
                    <div key={step.id || idx} className="rounded border bg-background p-2">
                      <p className="text-xs font-medium">
                        步骤{step.step_number || idx + 1}：{step.operation || '—'}
                      </p>
                      {stepPps.length > 0 && (
                        <div className="mt-1 space-y-1">
                          {stepPps.map((pp, pIdx) => (
                            <p key={pIdx} className="text-xs text-amber-600">问题点：{pp.text}</p>
                          ))}
                        </div>
                      )}
                      {step.materials && step.materials.length > 0 && (
                        <div className="mt-1">
                          <StepMediaGrid materials={step.materials} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* 问题点（效果评价问题点） */}
        {effectPps.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-amber-600">问题点（{effectPps.length}条）</p>
            {effectPps.map((pp, idx) => (
              <div key={idx} className="rounded border border-amber-200/60 bg-amber-50/30 p-2">
                <p className="text-xs">{pp.text}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EffectMediaGrid({ materials }: { materials: Array<Record<string, unknown>> }) {
  return (
    <div className="flex flex-wrap gap-2">
      {materials.map((mat) => (
        <MediaThumb key={String(mat.id)} material={mat} />
      ))}
    </div>
  );
}

function StepMediaGrid({ materials }: { materials: Array<Record<string, unknown>> }) {
  return (
    <div className="flex flex-wrap gap-2">
      {materials.map((mat) => (
        <MediaThumb key={String(mat.id)} material={mat} />
      ))}
    </div>
  );
}

function MediaThumb({ material }: { material: Record<string, unknown> }) {
  const filePath = String(material.file_path || material.file_url || '');
  const name = String(material.file_name || '');
  const type = String(material.material_type || 'image');
  return (
    <div className="h-16 w-16 overflow-hidden rounded-md border bg-muted">
      {type === 'image' ? (
        <PresignedImage filePath={filePath} alt={name} className="h-full w-full object-cover" />
      ) : (
        <PresignedVideo filePath={filePath} className="h-full w-full object-cover" />
      )}
    </div>
  );
}
