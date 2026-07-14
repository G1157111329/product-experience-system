'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronRight, Star } from 'lucide-react';
import { selectEffectEvaluationText } from '@/lib/report-content-rules';
import { ReportMediaGrid, type ReportMediaItem, type ReportMediaRole } from '@/components/reports/report-media-grid';

interface FunctionEffectRecipe {
  id: string;
  name: string;
  recipe_type?: string;
  ingredients?: string | null;
  effect_description?: string | null;
  effect_score?: string | null;
  effect_problem_point?: string | null;
  effect_ai_result?: { score?: number; summary?: string } | null;
  effect_status?: string | null;
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

function RecipeCard({ recipe }: { recipe: FunctionEffectRecipe }) {
  const [stepsExpanded, setStepsExpanded] = useState(false);
  const steps = recipe.recipe_steps || [];
  const effectScore = recipe.effect_score;
  const evaluationText = selectEffectEvaluationText(recipe);
  const totalProblems = Number(recipe.problem_count || 0)
    || (recipe.effect_status && recipe.effect_status !== 'qualified' && recipe.effect_status !== '合格' ? 1 : 0);

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
              <SemanticMediaGrid materials={recipe.effect_materials} role="primary" />
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
                  const stepProblemPoints = Array.isArray(step.problem_points)
                    ? step.problem_points.map((point) => String(point.text || '').trim()).filter(Boolean)
                    : step.problem_point?.trim() ? [step.problem_point.trim()] : [];
                  return (
                    <div key={step.id || idx} className="rounded border bg-background p-2">
                      <p className="text-xs font-medium">
                        步骤{step.step_number || idx + 1}：{step.operation || '—'}
                      </p>
                      {stepProblemPoints.length > 0 && <p className="mt-1 text-xs text-muted-foreground">步骤问题点：{stepProblemPoints.join('；')}</p>}
                      {step.materials && step.materials.length > 0 && (
                        <div className="mt-1">
                          <SemanticMediaGrid materials={step.materials} role="evidence" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

      </CardContent>
    </Card>
  );
}

function SemanticMediaGrid({ materials, role }: { materials: Array<Record<string, unknown>>; role: ReportMediaRole }) {
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
  return <ReportMediaGrid items={items} role={role} />;
}
