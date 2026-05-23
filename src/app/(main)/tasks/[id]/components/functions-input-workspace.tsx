'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ChefHat, ClipboardList, Pencil, Plus, Star } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { EvidenceBindingTarget, Recipe, RecipeStep } from '../types';

type FunctionsInputWorkspaceProps = {
  recipes: Recipe[];
  loading?: boolean;
  onCreateRecipe: () => void;
  onEditRecipe: (recipe: Recipe) => void;
  onAddStep: (recipe: Recipe) => void;
  onEditStep: (step: RecipeStep, recipe: Recipe) => void;
  onBindingTargetChange: (target: EvidenceBindingTarget | null) => void;
  onRefresh?: () => void;
  renderEffectEditor?: (recipe: Recipe) => ReactNode;
};

export function FunctionsInputWorkspace({
  recipes,
  loading = false,
  onCreateRecipe,
  onEditRecipe,
  onAddStep,
  onEditStep,
  onBindingTargetChange,
  onRefresh,
  renderEffectEditor,
}: FunctionsInputWorkspaceProps) {
  const [selectedRecipeId, setSelectedRecipeId] = useState('');
  const selectedRecipe = useMemo(
    () => recipes.find((recipe) => recipe.id === selectedRecipeId) || recipes[0] || null,
    [recipes, selectedRecipeId]
  );

  useEffect(() => {
    if (recipes.length === 0) {
      if (selectedRecipeId) setSelectedRecipeId('');
      return;
    }

    const currentRecipeStillExists = recipes.some((recipe) => recipe.id === selectedRecipeId);
    if (!selectedRecipeId || !currentRecipeStillExists) {
      const firstRecipe = recipes[0];
      setSelectedRecipeId(firstRecipe.id);
      onBindingTargetChange({ type: 'recipe_effect', id: firstRecipe.id, label: '当前效果评价' });
    }
  }, [onBindingTargetChange, recipes, selectedRecipeId]);

  const selectRecipe = (recipe: Recipe) => {
    setSelectedRecipeId(recipe.id);
    onBindingTargetChange({ type: 'recipe_effect', id: recipe.id, label: '当前效果评价' });
  };

  return (
    <section className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
      <div className="rounded-lg border bg-card p-3 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">功能/食谱</h2>
            <p className="mt-1 text-xs text-muted-foreground">{recipes.length} 个功能项</p>
          </div>
          <Button size="sm" onClick={onCreateRecipe}>
            <Plus className="mr-1.5 h-4 w-4" />新增
          </Button>
        </div>

        <div className="mt-3 space-y-2">
          {loading && recipes.length === 0 ? (
            [1, 2, 3].map((item) => (
              <div key={item} className="h-20 animate-pulse rounded-md bg-muted" />
            ))
          ) : recipes.length === 0 ? (
            <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
              暂无功能/食谱
            </div>
          ) : recipes.map((recipe) => (
            <button
              key={recipe.id}
              type="button"
              onClick={() => selectRecipe(recipe)}
              className={cn(
                'w-full rounded-md border p-3 text-left transition-colors hover:bg-muted/50',
                selectedRecipe?.id === recipe.id ? 'border-primary bg-primary/5' : 'bg-background'
              )}
            >
              <div className="flex items-start gap-2">
                <ChefHat className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{recipe.name}</div>
                  <div className="mt-1 grid grid-cols-2 gap-1">
                    <Badge variant="outline" className="justify-center text-[10px]">{recipe.recipe_steps?.length || 0} 步</Badge>
                    <Badge variant={recipe.effect_description ? 'secondary' : 'outline'} className="text-[10px]">
                      {recipe.effect_description ? '有效果评价' : '缺效果评价'}
                    </Badge>
                    <Badge variant={(recipe.problem_count || 0) > 0 ? 'destructive' : 'outline'} className="justify-center text-[10px]">
                      {recipe.problem_count || 0} 问题
                    </Badge>
                    {recipe.effect_score && <Badge className="justify-center text-[10px]">{recipe.effect_score} 分</Badge>}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        {selectedRecipe ? (
          <>
            <div className="rounded-lg border bg-card p-3 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-base font-semibold">{selectedRecipe.name}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">{selectedRecipe.ingredients || '暂无参数/食材'}</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => onEditRecipe(selectedRecipe)}>
                  <Pencil className="mr-1.5 h-3.5 w-3.5" />编辑
                </Button>
              </div>
            </div>

            <div className="rounded-lg border bg-card p-3 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold">步骤时间线</h3>
                <Button variant="outline" size="sm" onClick={() => onAddStep(selectedRecipe)}>
                  <Plus className="mr-1.5 h-4 w-4" />新增步骤
                </Button>
              </div>
              <div className="space-y-2">
                {(selectedRecipe.recipe_steps || []).map((step) => (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => onBindingTargetChange({ type: 'recipe_step', id: step.id, label: `步骤 ${step.step_number}` })}
                    onDoubleClick={() => onEditStep(step, selectedRecipe)}
                    className="w-full rounded-md border bg-background p-3 text-left hover:bg-muted/50"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
                        {step.step_number}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm">{step.operation || '暂无操作说明'}</div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          <Badge variant="outline" className="text-[10px]">{step.materials?.length || 0} 个素材</Badge>
                          {step.problem_point && <Badge variant="destructive" className="text-[10px]">有问题点</Badge>}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-lg border bg-card p-3 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <Star className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold">效果/出品评价</h3>
              </div>
              <button
                type="button"
                onClick={() => onBindingTargetChange({ type: 'recipe_effect', id: selectedRecipe.id, label: '当前效果评价' })}
                className="w-full rounded-md border bg-background p-3 text-left hover:bg-muted/50"
              >
                <div className="whitespace-pre-wrap text-sm">{selectedRecipe.effect_description || '暂无效果描述'}</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge variant="outline">{selectedRecipe.effect_materials?.length || 0} 个效果素材</Badge>
                  {selectedRecipe.effect_score && <Badge>{selectedRecipe.effect_score} 分</Badge>}
                </div>
              </button>
            </div>

            {renderEffectEditor?.(selectedRecipe)}
          </>
        ) : (
          <div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-lg border border-dashed text-sm text-muted-foreground">
            <div className="flex items-center">
              <ClipboardList className="mr-2 h-4 w-4" />{loading ? '正在加载功能/食谱...' : '选择或新增一个功能'}
            </div>
            {onRefresh && (
              <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading}>
                刷新列表
              </Button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
