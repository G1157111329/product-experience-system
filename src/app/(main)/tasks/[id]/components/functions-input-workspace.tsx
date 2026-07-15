'use client';

import { useState, useMemo, useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { ChefHat, ClipboardList, GripVertical, Pencil, Plus, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { EvidenceBindingTarget, Recipe, RecipeStep } from '../types';
import { toast } from 'sonner';
import { getRecipeStatistics } from '@/lib/recipe-statistics';
import type { IngredientItem } from '@/lib/task-context-contract';
import { shouldShowIngredientEditor } from './recipe-ingredient-editor';
import { RecipeIngredientSummary } from './recipe-ingredient-summary';
import { KEYBOARD_SORT_KEY_SHORTCUTS, moveByKeyboard, type KeyboardSortKey } from '@/lib/keyboard-sort';

type KeyboardSortTarget = { kind: 'recipe' | 'step'; id: string } | null;

const KEYBOARD_SORT_KEYS: readonly KeyboardSortKey[] = ['ArrowUp', 'ArrowDown', 'Home', 'End'];

function isKeyboardSortKey(key: string): key is KeyboardSortKey {
  return KEYBOARD_SORT_KEYS.includes(key as KeyboardSortKey);
}

type FunctionsInputWorkspaceProps = {
  recipes: Recipe[];
  focusedRecipeId?: string;
  focusedRecipeStepId?: string;
  loading?: boolean;
  onCreateRecipe: () => void;
  onEditRecipe: (recipe: Recipe) => void;
  onDeleteRecipe: (recipe: Recipe) => void;
  deletionBusy?: boolean;
  onReorderRecipes: (recipes: Recipe[]) => Promise<void>;
  onAddStep: (recipe: Recipe) => void;
  onEditStep: (step: RecipeStep, recipe: Recipe) => void;
  onDeleteStep: (step: RecipeStep, recipe: Recipe) => void;
  onReorderSteps: (recipe: Recipe, steps: RecipeStep[]) => Promise<void>;
  onBindingTargetChange: (target: EvidenceBindingTarget | null) => void;
  onRefresh?: () => void;
  onSaveIngredients: (recipe: Recipe, items: IngredientItem[]) => Promise<void>;
  attemptNavigation: (next: () => void) => Promise<void>;
  renderEffectEditor?: (recipe: Recipe) => ReactNode;
};

export function FunctionsInputWorkspace({
  recipes,
  focusedRecipeId,
  focusedRecipeStepId,
  loading = false,
  onCreateRecipe,
  onEditRecipe,
  onDeleteRecipe,
  deletionBusy = false,
  onReorderRecipes,
  onAddStep,
  onEditStep,
  onDeleteStep,
  onReorderSteps,
  onBindingTargetChange,
  onRefresh,
  onSaveIngredients,
  attemptNavigation,
  renderEffectEditor,
}: FunctionsInputWorkspaceProps) {
  const [selectedRecipeId, setSelectedRecipeId] = useState('');
  const lastFocusKey = useRef('');
  const selectedRecipe = useMemo(
    () => recipes.find((recipe) => recipe.id === selectedRecipeId) || recipes[0] || null,
    [recipes, selectedRecipeId]
  );
  const selectedRecipeStats = useMemo(
    () => selectedRecipe ? getRecipeStatistics(selectedRecipe) : { stepCount: 0, problemCount: 0 },
    [selectedRecipe],
  );
  const selectedIngredientCount = useMemo(() => {
    if (!selectedRecipe) return 0;
    if (selectedRecipe.ingredient_items?.length) return selectedRecipe.ingredient_items.length;
    return (selectedRecipe.ingredients || '').split(/\r?\n/).filter((item) => item.trim()).length;
  }, [selectedRecipe]);

  // Drag state for recipe reorder
  const [dragRecipeIdx, setDragRecipeIdx] = useState<number | null>(null);
  const [dragRecipeOverIdx, setDragRecipeOverIdx] = useState<number | null>(null);

  // Drag state for step reorder
  const [dragStepIdx, setDragStepIdx] = useState<number | null>(null);
  const [dragStepOverIdx, setDragStepOverIdx] = useState<number | null>(null);
  const [keyboardSortTarget, setKeyboardSortTarget] = useState<KeyboardSortTarget>(null);
  const [sortAnnouncement, setSortAnnouncement] = useState('');
  const recipeSortHandleRefs = useRef(new Map<string, HTMLDivElement>());
  const stepSortHandleRefs = useRef(new Map<string, HTMLDivElement>());

  const restoreSortFocus = (kind: 'recipe' | 'step', id: string) => {
    window.requestAnimationFrame(() => {
      const refs = kind === 'recipe' ? recipeSortHandleRefs : stepSortHandleRefs;
      refs.current.get(id)?.focus();
    });
  };

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

  useEffect(() => {
    const focusKey = `${focusedRecipeId || ''}:${focusedRecipeStepId || ''}`;
    if (focusKey === ':') {
      lastFocusKey.current = '';
      return;
    }
    if (lastFocusKey.current === focusKey) return;
    const targetRecipe = recipes.find((recipe) => recipe.id === focusedRecipeId)
      || recipes.find((recipe) => recipe.recipe_steps?.some((step) => step.id === focusedRecipeStepId));
    if (!targetRecipe) return;
    lastFocusKey.current = focusKey;
    let frame: number | null = null;
    void attemptNavigation(() => {
      setSelectedRecipeId(targetRecipe.id);
      if (focusedRecipeStepId) {
        onBindingTargetChange({ type: 'recipe_step', id: focusedRecipeStepId, label: '来源步骤' });
      } else {
        onBindingTargetChange({ type: 'recipe_effect', id: targetRecipe.id, label: '来源食谱/功能' });
      }
      frame = window.requestAnimationFrame(() => {
        const targetId = focusedRecipeStepId ? `recipe-step-${focusedRecipeStepId}` : `recipe-${targetRecipe.id}`;
        document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    });
    return () => { if (frame !== null) window.cancelAnimationFrame(frame); };
  }, [attemptNavigation, focusedRecipeId, focusedRecipeStepId, onBindingTargetChange, recipes]);

  const selectRecipe = (recipe: Recipe) => {
    void attemptNavigation(() => {
      setSelectedRecipeId(recipe.id);
      onBindingTargetChange({ type: 'recipe_effect', id: recipe.id, label: '当前效果评价' });
    });
  };

  const handleRecipeSortKeyDown = (
    event: KeyboardEvent<HTMLDivElement>,
    recipe: Recipe,
    recipeIdx: number,
  ) => {
    event.stopPropagation();
    const isSorting = keyboardSortTarget?.kind === 'recipe' && keyboardSortTarget.id === recipe.id;

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (isSorting) {
        setKeyboardSortTarget(null);
        setSortAnnouncement(`${recipe.name} 排序完成，当前第 ${recipeIdx + 1} 项`);
      } else {
        setKeyboardSortTarget({ kind: 'recipe', id: recipe.id });
        setSortAnnouncement(`${recipe.name} 已进入排序模式，使用方向键、Home 或 End 移动，按 Escape 退出`);
      }
      return;
    }

    if (event.key === 'Escape' && isSorting) {
      event.preventDefault();
      setKeyboardSortTarget(null);
      setSortAnnouncement(`${recipe.name} 已退出排序模式`);
      return;
    }

    if (!isSorting || !isKeyboardSortKey(event.key)) return;
    event.preventDefault();
    const result = moveByKeyboard(recipes, recipeIdx, event.key);
    if (result.nextIndex === recipeIdx) {
      setSortAnnouncement(`${recipe.name} 已在第 ${recipeIdx + 1} 项，无法继续移动`);
      return;
    }

    void attemptNavigation(async () => {
      try {
        await onReorderRecipes(result.items);
        setSortAnnouncement(`已移动到第 ${result.nextIndex + 1} 项：${recipe.name}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : '排序保存失败，请重试';
        setSortAnnouncement(`${message}，已恢复原顺序，可重试`);
        toast.error(message);
      } finally {
        restoreSortFocus('recipe', recipe.id);
      }
    });
  };

  const handleStepSortKeyDown = (
    event: KeyboardEvent<HTMLDivElement>,
    recipe: Recipe,
    step: RecipeStep,
    stepIdx: number,
  ) => {
    event.stopPropagation();
    const isSorting = keyboardSortTarget?.kind === 'step' && keyboardSortTarget.id === step.id;

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (isSorting) {
        setKeyboardSortTarget(null);
        setSortAnnouncement(`步骤 ${step.step_number} 排序完成，当前第 ${stepIdx + 1} 项`);
      } else {
        setKeyboardSortTarget({ kind: 'step', id: step.id });
        setSortAnnouncement(`步骤 ${step.step_number} 已进入排序模式，使用方向键、Home 或 End 移动，按 Escape 退出`);
      }
      return;
    }

    if (event.key === 'Escape' && isSorting) {
      event.preventDefault();
      setKeyboardSortTarget(null);
      setSortAnnouncement(`步骤 ${step.step_number} 已退出排序模式`);
      return;
    }

    if (!isSorting || !isKeyboardSortKey(event.key)) return;
    event.preventDefault();
    const steps = recipe.recipe_steps || [];
    const result = moveByKeyboard(steps, stepIdx, event.key);
    if (result.nextIndex === stepIdx) {
      setSortAnnouncement(`步骤 ${step.step_number} 已在第 ${stepIdx + 1} 项，无法继续移动`);
      return;
    }

    void attemptNavigation(async () => {
      try {
        await onReorderSteps(recipe, result.items);
        setSortAnnouncement(`已移动到第 ${result.nextIndex + 1} 项：步骤 ${step.step_number}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : '排序保存失败，请重试';
        setSortAnnouncement(`${message}，已恢复原顺序，可重试`);
        toast.error(message);
      } finally {
        restoreSortFocus('step', step.id);
      }
    });
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
        ...(target.recipe_step_id ? { recipe_step_id: target.recipe_step_id } : { recipe_id: target.recipe_id }),
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
      void attemptNavigation(async () => {
        try {
          await onReorderSteps(recipe, newSteps);
        } catch (error) {
          toast.error(error instanceof Error ? error.message : '排序保存失败，请重试');
        }
      });
    }
    setDragStepIdx(null);
    setDragStepOverIdx(null);
  };

  return (
    <section className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
      <span id="keyboard-sort-instructions" className="sr-only">
        按空格或回车进入排序模式，然后使用上、下方向键、Home 或 End 移动；按 Escape 退出排序模式，不会撤销已保存的移动。
      </span>
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {sortAnnouncement}
      </span>
      {/* Left panel: Recipe list */}
      <div className="rounded-lg border bg-card p-3 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">食谱/功能</h2>
            <p className="mt-1 text-xs text-muted-foreground">{recipes.length} 个功能项</p>
          </div>
          <Button size="sm" onClick={onCreateRecipe}>
            <Plus className="mr-1.5 h-4 w-4" />新增
          </Button>
        </div>

        <div className="mt-2 mb-1">
          <span className="text-xs text-muted-foreground">拖拽食谱，或聚焦排序把手后使用键盘重新排序</span>
        </div>

        <div className="mt-1 space-y-2">
          {loading && recipes.length === 0 ? (
            [1, 2, 3].map((item) => (
              <div key={item} className="h-20 animate-pulse rounded-md bg-muted" />
            ))
          ) : recipes.length === 0 ? (
            <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
              暂无食谱/功能
            </div>
          ) : recipes.map((recipe, recipeIdx) => (
            <div
              id={`recipe-${recipe.id}`}
              key={recipe.id}
              role="button"
              tabIndex={0}
              aria-label={`打开食谱/功能 ${recipe.name}`}
              className={cn(
                'w-full rounded-md border p-3 text-left transition-all group focus-within:ring-2 focus-within:ring-ring/30',
                selectedRecipe?.id === recipe.id ? 'border-primary bg-primary/5' : 'bg-background hover:bg-muted/50',
                dragRecipeIdx === recipeIdx && 'opacity-50 scale-95',
                dragRecipeOverIdx === recipeIdx && 'border-primary border-2',
                focusedRecipeId === recipe.id && 'ring-2 ring-primary ring-offset-2',
              )}
              onClick={() => selectRecipe(recipe)}
              onKeyDown={(event) => {
                if (event.target !== event.currentTarget) return;
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  selectRecipe(recipe);
                }
              }}
              onDragOver={(e) => { e.preventDefault(); setDragRecipeOverIdx(recipeIdx); }}
              onDragLeave={() => setDragRecipeOverIdx(null)}
            >
              <div className="flex items-start gap-2">
                {/* Drag handle */}
                <div
                  ref={(node) => {
                    if (node) recipeSortHandleRefs.current.set(recipe.id, node);
                    else recipeSortHandleRefs.current.delete(recipe.id);
                  }}
                  data-sort-handle="recipe"
                  role="button"
                  tabIndex={0}
                  aria-label={`排序食谱/功能 ${recipe.name}，第 ${recipeIdx + 1} 项，共 ${recipes.length} 项`}
                  aria-describedby="keyboard-sort-instructions"
                  aria-keyshortcuts={KEYBOARD_SORT_KEY_SHORTCUTS}
                  aria-grabbed={keyboardSortTarget?.kind === 'recipe' && keyboardSortTarget.id === recipe.id}
                  className={cn(
                    'mt-0.5 flex min-h-11 min-w-11 shrink-0 cursor-grab items-center justify-center rounded text-muted-foreground/40 hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing',
                    keyboardSortTarget?.kind === 'recipe' && keyboardSortTarget.id === recipe.id && 'bg-primary/10 text-foreground ring-2 ring-primary',
                  )}
                  draggable
                  onKeyDown={(event) => handleRecipeSortKeyDown(event, recipe, recipeIdx)}
                  onDragStart={() => {
                    setKeyboardSortTarget(null);
                    setDragRecipeIdx(recipeIdx);
                  }}
                  onDragEnd={() => {
                    if (dragRecipeIdx !== null && dragRecipeOverIdx !== null && dragRecipeIdx !== dragRecipeOverIdx) {
                      const newRecipes = [...recipes];
                      const [moved] = newRecipes.splice(dragRecipeIdx, 1);
                      newRecipes.splice(dragRecipeOverIdx, 0, moved);
                      void attemptNavigation(async () => {
                        try {
                          await onReorderRecipes(newRecipes);
                        } catch (error) {
                          toast.error(error instanceof Error ? error.message : '排序保存失败，请重试');
                        }
                      });
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
                  {shouldShowIngredientEditor(recipe.recipe_type) && (
                    <RecipeIngredientSummary
                      items={recipe.ingredient_items || []}
                      legacyText={recipe.ingredients}
                      onSave={(items) => onSaveIngredients(recipe, items)}
                    />
                  )}
                  <div className="mt-1 grid grid-cols-2 gap-1">
                    <Badge variant="outline" className="justify-center text-xs">{getRecipeStatistics(recipe).stepCount} 步</Badge>
                    <Badge variant={recipe.effect_description ? 'secondary' : 'outline'} className="text-xs">
                      {recipe.effect_description ? '有效果评价' : '缺效果评价'}
                    </Badge>
                  </div>
                </div>

                {/* Edit & Delete buttons */}
                <div className="flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                  <Button variant="ghost" size="icon" className="min-h-11 min-w-11" aria-label={`编辑 ${recipe.name}`}
                    onClick={(e) => { e.stopPropagation(); onEditRecipe(recipe); }}>
                    <Pencil className="h-3 w-3 text-muted-foreground" />
                  </Button>
                  <Button variant="ghost" size="icon" className="min-h-11 min-w-11" aria-label={`删除 ${recipe.name}`}
                    disabled={deletionBusy}
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
                  <div className="mt-2 flex flex-wrap gap-1.5" aria-label="当前食谱摘要">
                    <Badge variant="outline">食材 {selectedIngredientCount}</Badge>
                    <Badge variant="outline">步骤 {selectedRecipeStats.stepCount}</Badge>
                    <Badge variant={selectedRecipeStats.problemCount > 0 ? 'destructive' : 'outline'}>
                      问题 {selectedRecipeStats.problemCount}
                    </Badge>
                  </div>
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
                <span className="text-xs text-muted-foreground">拖拽步骤，或聚焦排序把手后使用键盘重新排序</span>
              </div>
              <div className="max-h-[30rem] space-y-2 overflow-y-auto pr-1">
                {(selectedRecipe.recipe_steps || []).map((step, stepIdx) => (
                  <div
                    id={`recipe-step-${step.id}`}
                    key={step.id}
                    className={cn(
                      'w-full rounded-md border bg-background p-3 text-left transition-all group/step',
                      dragStepIdx === stepIdx && 'opacity-50 scale-95',
                      dragStepOverIdx === stepIdx && 'border-primary border-2',
                      focusedRecipeStepId === step.id && 'ring-2 ring-primary ring-offset-2',
                    )}
                    onDragOver={(e) => { e.preventDefault(); setDragStepOverIdx(stepIdx); }}
                    onDragLeave={() => setDragStepOverIdx(null)}
                    onDrop={(event) => void bindDroppedMaterial(event, { recipe_step_id: step.id })}
                  >
                    <div className="flex items-center gap-3">
                      {/* Step drag handle */}
                      <div
                        ref={(node) => {
                          if (node) stepSortHandleRefs.current.set(step.id, node);
                          else stepSortHandleRefs.current.delete(step.id);
                        }}
                        data-sort-handle="step"
                        role="button"
                        tabIndex={0}
                        aria-label={`排序步骤 ${step.step_number}，第 ${stepIdx + 1} 项，共 ${selectedRecipe.recipe_steps?.length || 0} 项`}
                        aria-describedby="keyboard-sort-instructions"
                        aria-keyshortcuts={KEYBOARD_SORT_KEY_SHORTCUTS}
                        aria-grabbed={keyboardSortTarget?.kind === 'step' && keyboardSortTarget.id === step.id}
                        className={cn(
                          'flex min-h-11 min-w-11 shrink-0 cursor-grab items-center justify-center rounded text-muted-foreground/40 hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing',
                          keyboardSortTarget?.kind === 'step' && keyboardSortTarget.id === step.id && 'bg-primary/10 text-foreground ring-2 ring-primary',
                        )}
                        draggable
                        onKeyDown={(event) => handleStepSortKeyDown(event, selectedRecipe, step, stepIdx)}
                        onDragStart={() => {
                          setKeyboardSortTarget(null);
                          setDragStepIdx(stepIdx);
                        }}
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
                          <Badge variant="outline" className="text-xs">{step.materials?.length || 0} 个素材</Badge>
                        </div>
                      </button>
                      <div className="flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover/step:opacity-100">
                        <Button variant="ghost" size="icon" className="min-h-11 min-w-11" aria-label={`编辑步骤 ${step.step_number}`} onClick={() => onEditStep(step, selectedRecipe)}>
                          <Pencil className="h-3 w-3 text-muted-foreground" />
                        </Button>
                        <Button variant="ghost" size="icon" className="min-h-11 min-w-11" aria-label={`删除步骤 ${step.step_number}`} onClick={() => onDeleteStep(step, selectedRecipe)}>
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
              <ClipboardList className="mr-2 h-4 w-4" />{loading ? '正在加载食谱/功能...' : '选择或新增一个功能'}
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
