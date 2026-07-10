'use client';

import { useState, useMemo, useEffect, type ReactNode } from 'react';
import { ChefHat, ClipboardList, GripVertical, Pencil, Plus, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { EvidenceBindingTarget, Recipe, RecipeStep } from '../types';
import { toast } from 'sonner';
import { getRecipeStatistics } from '@/lib/recipe-statistics';

type FunctionsInputWorkspaceProps = {
  recipes: Recipe[];
  loading?: boolean;
  onCreateRecipe: () => void;
  onEditRecipe: (recipe: Recipe) => void;
  onDeleteRecipe: (recipe: Recipe) => void;
  onReorderRecipes: (recipes: Recipe[]) => void;
  onAddStep: (recipe: Recipe) => void;
  onEditStep: (step: RecipeStep, recipe: Recipe) => void;
  onDeleteStep: (step: RecipeStep, recipe: Recipe) => void;
  onReorderSteps: (recipe: Recipe, steps: RecipeStep[]) => void;
  onBindingTargetChange: (target: EvidenceBindingTarget | null) => void;
  onRefresh?: () => void;
  renderEffectEditor?: (recipe: Recipe) => ReactNode;
};

export function FunctionsInputWorkspace({
  recipes,
  loading = false,
  onCreateRecipe,
  onEditRecipe,
  onDeleteRecipe,
  onReorderRecipes,
  onAddStep,
  onEditStep,
  onDeleteStep,
  onReorderSteps,
  onBindingTargetChange,
  onRefresh,
  renderEffectEditor,
}: FunctionsInputWorkspaceProps) {
  const [selectedRecipeId, setSelectedRecipeId] = useState('');
  const selectedRecipe = useMemo(
    () => recipes.find((recipe) => recipe.id === selectedRecipeId) || recipes[0] || null,
    [recipes, selectedRecipeId]
  );

  // Drag state for recipe reorder
  const [dragRecipeIdx, setDragRecipeIdx] = useState<number | null>(null);
  const [dragRecipeOverIdx, setDragRecipeOverIdx] = useState<number | null>(null);

  // Drag state for step reorder
  const [dragStepIdx, setDragStepIdx] = useState<number | null>(null);
  const [dragStepOverIdx, setDragStepOverIdx] = useState<number | null>(null);

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

  const bindDroppedMaterial = async (
    event: React.DragEvent<HTMLElement>,
    target: { recipe_step_id?: string | null; recipe_id?: string | null },
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const materialId = event.dataTransfer.getData('application/x-material-id') || event.dataTransfer.getData('text/plain');
    if (!materialId) return;

    const response = await fetch('/api/materials', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: materialId,
        record_id: null,
        recipe_step_id: target.recipe_step_id ?? null,
        recipe_id: target.recipe_id ?? null,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (data.code === 0) {
      onRefresh?.();
      toast.success(target.recipe_step_id ? '素材已绑定到功能步骤' : '素材已绑定到效果评价');
    } else {
      toast.error(data.message || '素材绑定失败');
    }
  };

  const handleStepDragEnd = (recipe: Recipe) => {
    if (dragStepIdx !== null && dragStepOverIdx !== null && dragStepIdx !== dragStepOverIdx) {
      const steps = recipe.recipe_steps || [];
      const newSteps = [...steps];
      const [moved] = newSteps.splice(dragStepIdx, 1);
      newSteps.splice(dragStepOverIdx, 0, moved);
      onReorderSteps(recipe, newSteps);
    }
    setDragStepIdx(null);
    setDragStepOverIdx(null);
  };

  return (
    <section className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
      {/* Left panel: Recipe list */}
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

        <div className="mt-2 mb-1">
          <span className="text-[10px] text-muted-foreground">拖拽食谱可重新排序</span>
        </div>

        <div className="mt-1 space-y-2">
          {loading && recipes.length === 0 ? (
            [1, 2, 3].map((item) => (
              <div key={item} className="h-20 animate-pulse rounded-md bg-muted" />
            ))
          ) : recipes.length === 0 ? (
            <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
              暂无功能/食谱
            </div>
          ) : recipes.map((recipe, recipeIdx) => (
            <div
              key={recipe.id}
              className={cn(
                'w-full rounded-md border p-3 text-left transition-all group focus-within:ring-2 focus-within:ring-ring/30',
                selectedRecipe?.id === recipe.id ? 'border-primary bg-primary/5' : 'bg-background hover:bg-muted/50',
                dragRecipeIdx === recipeIdx && 'opacity-50 scale-95',
                dragRecipeOverIdx === recipeIdx && 'border-primary border-2',
              )}
              onClick={() => selectRecipe(recipe)}
              onDragOver={(e) => { e.preventDefault(); setDragRecipeOverIdx(recipeIdx); }}
              onDragLeave={() => setDragRecipeOverIdx(null)}
            >
              <div className="flex items-start gap-2">
                {/* Drag handle */}
                <div
                  role="button"
                  tabIndex={0}
                  aria-label={`拖拽排序 ${recipe.name}`}
                  className="mt-0.5 flex h-8 w-8 shrink-0 cursor-grab items-center justify-center rounded text-muted-foreground/40 hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
                  draggable
                  onDragStart={() => setDragRecipeIdx(recipeIdx)}
                  onDragEnd={() => {
                    if (dragRecipeIdx !== null && dragRecipeOverIdx !== null && dragRecipeIdx !== dragRecipeOverIdx) {
                      const newRecipes = [...recipes];
                      const [moved] = newRecipes.splice(dragRecipeIdx, 1);
                      newRecipes.splice(dragRecipeOverIdx, 0, moved);
                      onReorderRecipes(newRecipes);
                    }
                    setDragRecipeIdx(null);
                    setDragRecipeOverIdx(null);
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <GripVertical className="h-4 w-4" />
                </div>

                <ChefHat className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{recipe.name}</div>
                  <div className="mt-1 grid grid-cols-2 gap-1">
                    <Badge variant="outline" className="justify-center text-[10px]">{getRecipeStatistics(recipe).stepCount} 步</Badge>
                    <Badge variant={recipe.effect_description ? 'secondary' : 'outline'} className="text-[10px]">
                      {recipe.effect_description ? '有效果评价' : '缺效果评价'}
                    </Badge>
                    <Badge
                      variant={getRecipeStatistics(recipe).problemCount > 0 ? 'destructive' : 'outline'}
                      className="justify-center text-[10px]"
                    >
                      {getRecipeStatistics(recipe).problemCount} 问题
                    </Badge>
                    {recipe.effect_score && <Badge className="justify-center text-[10px]">{recipe.effect_score} 分</Badge>}
                  </div>
                </div>

                {/* Edit & Delete buttons */}
                <div className="flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                  <Button variant="ghost" size="icon" className="h-8 w-8"
                    onClick={(e) => { e.stopPropagation(); onEditRecipe(recipe); }}>
                    <Pencil className="h-3 w-3 text-muted-foreground" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8"
                    onClick={(e) => { e.stopPropagation(); onDeleteRecipe(recipe); }}>
                    <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel: Selected recipe detail */}
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
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold">步骤时间线</h3>
                <Button variant="outline" size="sm" onClick={() => onAddStep(selectedRecipe)}>
                  <Plus className="mr-1.5 h-4 w-4" />新增步骤
                </Button>
              </div>
              <div className="mb-2">
                <span className="text-[10px] text-muted-foreground">拖拽步骤可重新排序</span>
              </div>
              <div className="space-y-2">
                {(selectedRecipe.recipe_steps || []).map((step, stepIdx) => (
                  <div
                    key={step.id}
                    className={cn(
                      'w-full rounded-md border bg-background p-3 text-left transition-all group/step',
                      dragStepIdx === stepIdx && 'opacity-50 scale-95',
                      dragStepOverIdx === stepIdx && 'border-primary border-2',
                    )}
                    onDragOver={(e) => { e.preventDefault(); setDragStepOverIdx(stepIdx); }}
                    onDragLeave={() => setDragStepOverIdx(null)}
                    onDrop={(event) => void bindDroppedMaterial(event, { recipe_step_id: step.id })}
                  >
                    <div className="flex items-center gap-3">
                      {/* Step drag handle */}
                      <div
                        role="button"
                        tabIndex={0}
                        aria-label={`拖拽排序步骤 ${step.step_number}`}
                        className="flex h-8 w-8 shrink-0 cursor-grab items-center justify-center rounded text-muted-foreground/40 hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
                        draggable
                        onDragStart={() => setDragStepIdx(stepIdx)}
                        onDragEnd={() => handleStepDragEnd(selectedRecipe)}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <GripVertical className="h-4 w-4" />
                      </div>
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
                        {step.step_number}
                      </div>
                      <button
                        type="button"
                        className="min-w-0 flex-1 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() => onBindingTargetChange({ type: 'recipe_step', id: step.id, label: `步骤 ${step.step_number}` })}
                      >
                        <div className="text-sm cursor-pointer">{step.operation || '暂无操作说明'}</div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          <Badge variant="outline" className="text-[10px]">{step.materials?.length || 0} 个素材</Badge>
                          {step.problem_point && <Badge variant="destructive" className="text-[10px]">有问题点</Badge>}
                        </div>
                      </button>
                      <div className="flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover/step:opacity-100">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEditStep(step, selectedRecipe)}>
                          <Pencil className="h-3 w-3 text-muted-foreground" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onDeleteStep(step, selectedRecipe)}>
                          <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
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
