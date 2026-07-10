'use client';

/* eslint-disable @next/next/no-img-element */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Wrench, Plus, Pencil, Trash2, Play, GripVertical, Sparkles, Star, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { isPendingMediaUrl, usePresignedUrls } from '@/lib/use-presigned-url';
import { toast } from 'sonner';
import { getRecipeStatistics } from '@/lib/recipe-statistics';
import { useImagePreview } from '@/components/image-preview';
import { MaterialPicker } from '@/components/material-picker';
import { InlineEditable } from '@/components/inline-editable';
import { patchInlineValue } from '@/lib/inline-save-helpers';
import type { Recipe, RecipeStep, Material, RecipeLibRef } from '../types';

function getMaterialDisplayUrl(material: Material, presignedUrls: Map<string, string>) {
  return presignedUrls.get(material.id) || material.file_url || material.file_path || '';
}

function getMaterialPreviewUrl(material: Material, displayUrl: string) {
  return isPendingMediaUrl(displayUrl) ? (material.file_path || material.file_url || '') : displayUrl;
}

export function FunctionsTab({ taskId, onStatusUpdate }: { taskId: string; onStatusUpdate: () => void }) {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingRecipe, setSavingRecipe] = useState(false);
  const [savingStep, setSavingStep] = useState(false);
  const [savingEditStep, setSavingEditStep] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addStepDialogOpen, setAddStepDialogOpen] = useState(false);
  const [editStepDialogOpen, setEditStepDialogOpen] = useState(false);
  const [editRecipeDialogOpen, setEditRecipeDialogOpen] = useState(false);
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [editingStep, setEditingStep] = useState<RecipeStep | null>(null);
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);
  const [newRecipe, setNewRecipe] = useState({ name: '', ingredients: '', recipe_type: '食谱' });
  const [editRecipeForm, setEditRecipeForm] = useState({ name: '', ingredients: '', recipe_type: '食谱' });
  const [newStep, setNewStep] = useState({ operation: '', step_material_ids: [] as string[], problem_points: [{ text: '', material_ids: [] as string[] }] });
  const [stepMaterialIds, setStepMaterialIds] = useState<string[]>([]);
  const [, setStepMaterials] = useState<Material[]>([]);
  const [editStepForm, setEditStepForm] = useState({ operation: '', step_material_ids: [] as string[], problem_points: [{ text: '', material_ids: [] as string[] }] });
  const [, setEditStepMaterialIds] = useState<string[]>([]);
  const [, setEditStepMaterials] = useState<Material[]>([]);
  // Drag state for step reorder
  const [dragStepIdx, setDragStepIdx] = useState<number | null>(null);
  const [dragStepOverIdx, setDragStepOverIdx] = useState<number | null>(null);
  // Drag state for recipe reorder
  const [dragRecipeIdx, setDragRecipeIdx] = useState<number | null>(null);
  const [dragRecipeOverIdx, setDragRecipeOverIdx] = useState<number | null>(null);
  const { open, PreviewComponent } = useImagePreview();

  // Collect all materials from all recipes for presigned URL resolution
  const allMaterials = useMemo(() => {
    const result: { id: string; file_url: string | null; file_path?: string | null }[] = [];
    for (const recipe of recipes) {
      for (const step of recipe.recipe_steps || []) {
        for (const mat of step.materials || []) {
          result.push({ id: mat.id, file_url: mat.file_url, file_path: mat.file_path });
        }
      }
    }
    return result;
  }, [recipes]);
  const presignedUrls = usePresignedUrls(allMaterials);

  // ── Effect evaluation states ──
  // effect_description / effect_problem_point 已改为 InlineEditable 自动保存，
  // 这里仅保留附件素材选择状态与 AI 评价状态。
  const [effectMaterialIds, setEffectMaterialIds] = useState<Record<string, string[]>>({});
  const [effectSaving, setEffectSaving] = useState<Record<string, boolean>>({});
  const [aiEvaluating, setAiEvaluating] = useState<Record<string, boolean>>({});
  const [aiResult, setAiResult] = useState<Record<string, {
    result?: {
      score: number;
      summary: string;
    };
    score: string;
  }>>({});

  // ── Recipe library search (Feature 7) ──
  const [recipeSearch, setRecipeSearch] = useState('');
  const [recipeSearchResults, setRecipeSearchResults] = useState<RecipeLibRef[]>([]);
  const [recipeSearchLoading, setRecipeSearchLoading] = useState(false);

  // ── Step reference search (Feature 7) ──
  const [stepRefSearch, setStepRefSearch] = useState('');
  const [stepRefResults, setStepRefResults] = useState<RecipeLibRef[]>([]);
  const [stepRefLoading, setStepRefLoading] = useState(false);

  const fetchRecipes = useCallback(async () => {
    const res = await fetch(`/api/recipes?task_id=${taskId}`);
    const data = await res.json();
    if (data.code === 0) {
      const recipesData: Recipe[] = (data.data || []);
      const seen = new Set<string>();
      const deduped = recipesData.filter(r => {
        if (seen.has(r.id)) return false;
        seen.add(r.id);
        return true;
      });
      const enriched = await Promise.all(
        deduped.map(async (recipe: Recipe) => {
          const stepsWithMats = await Promise.all(
            (recipe.recipe_steps || []).map(async (step) => {
              const matRes = await fetch(`/api/materials?recipe_step_id=${step.id}`);
              const matData = await matRes.json();
              return { ...step, materials: matData.data || [] };
            })
          );
          // Fetch effect materials
          const effectMatRes = await fetch(`/api/materials?recipe_id=${recipe.id}`);
          const effectMatData = await effectMatRes.json();
          return { ...recipe, recipe_steps: stepsWithMats, effect_materials: effectMatData.data || [] };
        })
      );
      setRecipes(enriched);
    }
    setLoading(false);
  }, [taskId]);

  useEffect(() => { fetchRecipes(); }, [fetchRecipes]);

  // ── Recipe library fuzzy search ──
  useEffect(() => {
    if (!recipeSearch.trim()) { setRecipeSearchResults([]); return; }
    setRecipeSearchLoading(true);
    const timer = setTimeout(async () => {
      const res = await fetch(`/api/recipe-library?keyword=${encodeURIComponent(recipeSearch.trim())}`);
      const data = await res.json();
      if (data.code === 0) setRecipeSearchResults(data.data || []);
      else setRecipeSearchResults([]);
      setRecipeSearchLoading(false);
    }, 300);
    return () => { clearTimeout(timer); setRecipeSearchLoading(false); };
  }, [recipeSearch]);

  // ── Step reference fuzzy search ──
  useEffect(() => {
    if (!stepRefSearch.trim()) { setStepRefResults([]); return; }
    setStepRefLoading(true);
    const timer = setTimeout(async () => {
      const res = await fetch(`/api/recipe-library?keyword=${encodeURIComponent(stepRefSearch.trim())}`);
      const data = await res.json();
      if (data.code === 0) setStepRefResults(data.data || []);
      else setStepRefResults([]);
      setStepRefLoading(false);
    }, 300);
    return () => { clearTimeout(timer); setStepRefLoading(false); };
  }, [stepRefSearch]);

  const handleAddRecipe = async () => {
    if (savingRecipe) return;
    setSavingRecipe(true);
    try {
      const res = await fetch('/api/recipes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: taskId, ...newRecipe }),
      });
      const data = await res.json();
      if (data.code === 0) {
        setAddDialogOpen(false);
        setNewRecipe({ name: '', ingredients: '', recipe_type: '食谱' });
        setRecipeSearch('');
        setRecipeSearchResults([]);
        fetchRecipes();
        onStatusUpdate();
        toast.success('食谱/功能已添加');
      }
    } finally {
      setSavingRecipe(false);
    }
  };

  // ── Edit recipe (Feature 3) ──
  const handleEditRecipe = (recipe: Recipe) => {
    setEditingRecipe(recipe);
    setEditRecipeForm({ name: recipe.name, ingredients: recipe.ingredients || '', recipe_type: recipe.recipe_type || '食谱' });
    setEditRecipeDialogOpen(true);
  };

  const handleSaveEditRecipe = async () => {
    if (!editingRecipe || savingRecipe) return;
    setSavingRecipe(true);
    try {
      const res = await fetch(`/api/recipes/${editingRecipe.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editRecipeForm),
      });
      const data = await res.json();
      if (data.code === 0) {
        setEditRecipeDialogOpen(false);
        setEditingRecipe(null);
        fetchRecipes();
        toast.success('食谱/功能已更新');
      } else toast.error(data.message);
    } finally { setSavingRecipe(false); }
  };

  // ── Reference recipe from library (Feature 7) ──
  const handleReferenceRecipe = async (refRecipe: RecipeLibRef) => {
    if (savingRecipe) return;
    setSavingRecipe(true);
    try {
      const res = await fetch('/api/recipes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: taskId, name: refRecipe.name, ingredients: refRecipe.ingredients, recipe_type: refRecipe.recipe_type }),
      });
      const data = await res.json();
      if (data.code === 0) {
        const newRecipeId = data.data?.id;
        // Copy steps from referenced library recipe
        if (refRecipe.recipe_library_steps && refRecipe.recipe_library_steps.length > 0 && newRecipeId) {
          for (let i = 0; i < refRecipe.recipe_library_steps.length; i++) {
            const srcStep = refRecipe.recipe_library_steps[i];
            await fetch('/api/recipe-steps', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                recipe_id: newRecipeId,
                step_number: i + 1,
                operation: srcStep.operation,
                problem_point: srcStep.problem_point || null,
                problem_points: (srcStep as Record<string, unknown>).problem_points || [],
              }),
            });
          }
        }
        setAddDialogOpen(false);
        setNewRecipe({ name: '', ingredients: '', recipe_type: '食谱' });
        setRecipeSearch('');
        setRecipeSearchResults([]);
        fetchRecipes();
        onStatusUpdate();
        toast.success('已引用食谱/功能');
      }
    } finally { setSavingRecipe(false); }
  };

  // ── Reference step from another recipe (Feature 7) ──
  const handleReferenceStep = (srcStep: RecipeStep) => {
    setNewStep(prev => ({
      ...prev,
      operation: prev.operation ? prev.operation + '\n' + srcStep.operation : srcStep.operation,
      problem_points: srcStep.problem_points && srcStep.problem_points.length > 0
        ? [...prev.problem_points, ...srcStep.problem_points.map(p => ({ text: p.text || '', material_ids: [] as string[] }))]
        : srcStep.problem_point
          ? [...prev.problem_points, { text: srcStep.problem_point, material_ids: [] as string[] }]
          : prev.problem_points,
    }));
    setStepRefSearch('');
    setStepRefResults([]);
  };

  const handleAddStep = async () => {
    if (!selectedRecipe || savingStep) return;
    setSavingStep(true);
    try {
      const countRes = await fetch(`/api/recipe-steps?recipe_id=${selectedRecipe.id}`);
      const countData = await countRes.json();
      const currentSteps = countData.data || [];
      const stepNum = currentSteps.length + 1;
      // Build legacy problem_point from first non-empty problem point
      const validPPs = newStep.problem_points.filter(p => p.text.trim());
      const legacyPP = validPPs.length > 0 ? validPPs.map(p => p.text).join('；') : null;
      const res = await fetch('/api/recipe-steps', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipe_id: selectedRecipe.id,
          step_number: stepNum,
          operation: newStep.operation,
          problem_point: legacyPP,
          problem_points: validPPs.map(p => ({ text: p.text, material_ids: p.material_ids || [] })),
          step_material_ids: newStep.step_material_ids || [],
        }),
      });
      const data = await res.json();
      if (data.code === 0) {
        const stepId = data.data?.id;
        if (stepId && stepMaterialIds.length > 0) {
          for (const matId of stepMaterialIds) {
            await fetch('/api/materials', {
              method: 'PUT', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: matId, recipe_step_id: stepId }),
            });
          }
        }
        // Link per-problem-point materials
        if (stepId) {
          // Link step-level materials
          for (const matId of (newStep.step_material_ids || [])) {
            await fetch('/api/materials', {
              method: 'PUT', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: matId, recipe_step_id: stepId }),
            });
          }
          // Link per-problem-point materials
          for (const pp of validPPs) {
            if (pp.material_ids && pp.material_ids.length > 0) {
              for (const matId of pp.material_ids) {
                await fetch('/api/materials', {
                  method: 'PUT', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ id: matId, recipe_step_id: stepId }),
                });
              }
            }
          }
        }
        setAddStepDialogOpen(false);
        setNewStep({ operation: '', step_material_ids: [], problem_points: [{ text: '', material_ids: [] }] });
        setStepMaterialIds([]);
        setStepMaterials([]);
        fetchRecipes();
        onStatusUpdate();
        toast.success('步骤已添加');
      }
    } finally {
      setSavingStep(false);
    }
  };

  const handleEditStep = (step: RecipeStep) => {
    setEditingStep(step);
    // Convert problem_points to form state, or fallback from legacy problem_point
    const pps = step.problem_points && step.problem_points.length > 0
      ? step.problem_points.map(p => ({ text: p.text || '', material_ids: p.material_ids || [] }))
      : step.problem_point
        ? [{ text: step.problem_point, material_ids: [] as string[] }]
        : [{ text: '', material_ids: [] as string[] }];
    // Collect step-level material IDs (materials linked to this step but not to any problem_point)
    const ppMaterialIds = new Set(pps.flatMap(p => p.material_ids || []));
    const stepMats = (step as unknown as Record<string, unknown>).materials as Material[] | undefined;
    const stepMatIds = stepMats ? stepMats.filter(m => !ppMaterialIds.has(m.id)).map(m => m.id) : [];
    setEditStepForm({ operation: step.operation, step_material_ids: stepMatIds, problem_points: pps });
    setEditStepMaterialIds([]);
    setEditStepMaterials([]);
    setEditStepDialogOpen(true);
  };

  const handleSaveEditStep = async () => {
    if (!editingStep || savingEditStep) return;
    setSavingEditStep(true);
    try {
      const validPPs = editStepForm.problem_points.filter(p => p.text.trim());
      const legacyPP = validPPs.length > 0 ? validPPs.map(p => p.text).join('；') : null;
      const res = await fetch(`/api/recipe-steps/${editingStep.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: editStepForm.operation,
          problem_point: legacyPP,
          problem_points: validPPs.map(p => ({ text: p.text, material_ids: p.material_ids || [] })),
          step_material_ids: editStepForm.step_material_ids || [],
        }),
      });
      const data = await res.json();
      if (data.code === 0) {
        // Link step-level materials
        if (editStepForm.step_material_ids && editStepForm.step_material_ids.length > 0) {
          for (const matId of editStepForm.step_material_ids) {
            await fetch('/api/materials', {
              method: 'PUT', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: matId, recipe_step_id: editingStep.id }),
            });
          }
        }
        // Link per-problem-point materials
        for (const pp of validPPs) {
          if (pp.material_ids && pp.material_ids.length > 0) {
            for (const matId of pp.material_ids) {
              await fetch('/api/materials', {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: matId, recipe_step_id: editingStep.id }),
              });
            }
          }
        }
        setEditStepDialogOpen(false);
        setEditingStep(null);
        setEditStepMaterialIds([]);
        setEditStepMaterials([]);
        fetchRecipes();
        toast.success('步骤已更新');
      }
    } finally {
      setSavingEditStep(false);
    }
  };

  const handleDeleteStep = async (step: RecipeStep) => {
    const res = await fetch(`/api/recipe-steps/${step.id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.code === 0) {
      fetchRecipes();
      toast.success('步骤已删除');
    }
  };

  const handleDeleteRecipe = async (recipe: Recipe) => {
    // Delete all steps first
    for (const step of (recipe.recipe_steps || [])) {
      await fetch(`/api/recipe-steps/${step.id}`, { method: 'DELETE' });
    }
    const res = await fetch(`/api/recipes/${recipe.id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.code === 0) {
      if (selectedRecipe?.id === recipe.id) setSelectedRecipe(null);
      fetchRecipes();
      toast.success('食谱/功能已删除');
    }
  };

  // ── Save effect evaluation (materials only) ──
  // 效果描述 / 问题点已由 InlineEditable 自动保存；此处仅持久化附件素材。
  const handleSaveEffect = async (recipe: Recipe) => {
    setEffectSaving(prev => ({ ...prev, [recipe.id]: true }));
    try {
      const matIds = effectMaterialIds[recipe.id] ?? (recipe.effect_materials || []).map(m => m.id);
      const res = await fetch(`/api/recipes/${recipe.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: recipe.name, ingredients: recipe.ingredients,
          recipe_type: recipe.recipe_type, problem_count: recipe.problem_count,
          effect_material_ids: matIds,
        }),
      });
      const data = await res.json();
      if (data.code === 0) {
        fetchRecipes();
        toast.success('素材已保存');
      } else toast.error(data.message);
    } finally {
      setEffectSaving(prev => ({ ...prev, [recipe.id]: false }));
    }
  };

  // ── AI evaluate effect ──
  const handleAiEvaluate = async (recipe: Recipe) => {
    // 先保存附件素材（文本字段已自动保存）
    await handleSaveEffect(recipe);
    setAiEvaluating(prev => ({ ...prev, [recipe.id]: true }));
    try {
      const res = await fetch(`/api/recipes/${recipe.id}/ai-evaluate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (data.code === 0) {
        setAiResult(prev => ({ ...prev, [recipe.id]: data.data }));
        fetchRecipes();
        toast.success(`AI评价完成：综合${data.data.score}分`);
      } else toast.error(data.message);
    } finally {
      setAiEvaluating(prev => ({ ...prev, [recipe.id]: false }));
    }
  };

  // Delete AI evaluation
  const handleDeleteAiEval = async (recipe: Recipe) => {
    try {
      const res = await fetch(`/api/recipes/${recipe.id}/ai-evaluate`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.code === 0) {
        setAiResult(prev => { const next = { ...prev }; delete next[recipe.id]; return next; });
        fetchRecipes();
        toast.success('AI评价已删除');
      } else toast.error(data.message);
    } catch {
      toast.error('删除失败');
    }
  };

  return (
    <div className="space-y-4">
      <PreviewComponent />

      {loading ? (
        <div className="space-y-2">{[1,2].map(i => <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />)}</div>
      ) : recipes.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center py-12 text-center">
          <Wrench className="h-10 w-10 text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground">暂无食谱/功能</p>
          <p className="text-xs text-muted-foreground mt-1">点击下方按钮新增</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          <span className="text-[10px] text-muted-foreground">拖拽食谱可重新排序</span>
          {recipes.map((recipe, recipeIdx) => (
            <Card key={recipe.id}
              className={cn(
                'cursor-pointer hover:bg-muted/30 transition-all',
                dragRecipeIdx === recipeIdx && 'opacity-50 scale-95',
                dragRecipeOverIdx === recipeIdx && 'border-primary border-2',
              )}
              onClick={() => setSelectedRecipe(selectedRecipe?.id === recipe.id ? null : recipe)}
              onDragOver={(e) => { e.preventDefault(); setDragRecipeOverIdx(recipeIdx); }}
              onDragLeave={() => setDragRecipeOverIdx(null)}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="cursor-grab active:cursor-grabbing shrink-0"
                    draggable
                    onDragStart={() => setDragRecipeIdx(recipeIdx)}
                    onDragEnd={async () => {
                      if (dragRecipeIdx !== null && dragRecipeOverIdx !== null && dragRecipeIdx !== dragRecipeOverIdx) {
                        const newRecipes = [...recipes];
                        const [moved] = newRecipes.splice(dragRecipeIdx, 1);
                        newRecipes.splice(dragRecipeOverIdx, 0, moved);
                        setRecipes(newRecipes);
                        await fetch('/api/recipes', {
                          method: 'PUT', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ recipes: newRecipes.map((r, i) => ({ id: r.id, sort_order: i })) }),
                        });
                      }
                      setDragRecipeIdx(null);
                      setDragRecipeOverIdx(null);
                    }}
                  >
                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <Badge variant="secondary" className="text-[10px] shrink-0">{recipe.recipe_type}</Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{recipe.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{recipe.ingredients || '-'}</p>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                    <span>{getRecipeStatistics(recipe).stepCount} 步骤</span>
                    <span>{getRecipeStatistics(recipe).problemCount} 问题</span>
                  </div>
                  <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={(e) => { e.stopPropagation(); handleEditRecipe(recipe); }}>
                    <Pencil className="h-3 w-3 text-muted-foreground" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={(e) => { e.stopPropagation(); handleDeleteRecipe(recipe); }}>
                    <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                  </Button>
                </div>
              </CardContent>

              {/* Expanded detail */}
              {selectedRecipe?.id === recipe.id && (
                <div className="px-4 pb-4 space-y-2 border-t border-border pt-3" onClick={(e) => e.stopPropagation()}>
                  <span className="text-[10px] text-muted-foreground">拖拽步骤可重新排序</span>
                  {recipe.recipe_steps?.map((step, stepIdx) => (
                    <div key={step.id}
                      className={cn(
                        'p-3 rounded-lg bg-muted/30 space-y-1.5 transition-all',
                        dragStepIdx === stepIdx && 'opacity-50 scale-95',
                        dragStepOverIdx === stepIdx && 'border-primary border-2',
                      )}
                      onDragOver={(e) => { e.preventDefault(); setDragStepOverIdx(stepIdx); }}
                      onDragLeave={() => setDragStepOverIdx(null)}
                    >
                      <div className="flex items-center gap-2">
                        <div className="cursor-grab active:cursor-grabbing shrink-0 text-muted-foreground/40 hover:text-muted-foreground"
                          draggable
                          onDragStart={() => setDragStepIdx(stepIdx)}
                          onDragEnd={async () => {
                            if (dragStepIdx !== null && dragStepOverIdx !== null && dragStepIdx !== dragStepOverIdx) {
                              const steps = recipe.recipe_steps || [];
                              const newSteps = [...steps];
                              const [moved] = newSteps.splice(dragStepIdx, 1);
                              newSteps.splice(dragStepOverIdx, 0, moved);
                              const updatedRecipes = recipes.map(r => {
                                if (r.id !== recipe.id) return r;
                                return { ...r, recipe_steps: newSteps };
                              });
                              setRecipes(updatedRecipes);
                              const reorderData = newSteps.map((s, i) => ({ id: s.id, step_number: i + 1 }));
                              await fetch('/api/recipe-steps', {
                                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ steps: reorderData }),
                              });
                            }
                            setDragStepIdx(null);
                            setDragStepOverIdx(null);
                          }}
                        >
                          <GripVertical className="h-4 w-4" />
                        </div>
                        <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] flex items-center justify-center font-medium">
                          {stepIdx + 1}
                        </span>
                        <span className="text-sm flex-1 min-w-0 break-all">{step.operation}</span>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => handleEditStep(step)}>
                            <Pencil className="h-3 w-3 text-muted-foreground" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => handleDeleteStep(step)}>
                            <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                          </Button>
                        </div>
                      </div>
                      {/* Problem points display */}
                      {(() => {
                        const pps = step.problem_points && step.problem_points.length > 0
                          ? step.problem_points.filter(p => p.text && p.text.trim())
                          : step.problem_point
                            ? [{ text: step.problem_point, material_ids: [] as string[] }]
                            : [];
                        if (pps.length === 0) return null;
                        return (
                          <div className="ml-7 space-y-1">
                            {pps.map((pp, ppIdx) => (
                              <div key={ppIdx} className="flex items-start gap-1.5">
                                {pps.length > 1 && <span className="text-[10px] text-amber-600 font-medium shrink-0">问题{ppIdx + 1}:</span>}
                                <p className="text-xs text-amber-600">{pp.text}</p>
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                      {step.materials && step.materials.length > 0 && (
                        <div className="flex gap-1.5 ml-7 flex-wrap">
                          {step.materials.map((mat) => {
                            const displayUrl = getMaterialDisplayUrl(mat, presignedUrls);
                            const previewUrl = getMaterialPreviewUrl(mat, displayUrl);
                            const isPendingVideo = mat.material_type === 'video' && isPendingMediaUrl(displayUrl);
                            return (
                              <div key={mat.id} className="w-14 h-14 rounded-md overflow-hidden border border-border cursor-pointer"
                                onClick={(e) => { e.stopPropagation(); if (previewUrl) open(previewUrl); }}>
                                {mat.material_type === 'image' ? (
                                  <img src={displayUrl} alt={mat.file_name} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center bg-muted relative">
                                    {isPendingVideo ? (
                                      <span className="text-[10px] text-muted-foreground">加载中</span>
                                    ) : (
                                      <video src={displayUrl} className="w-full h-full object-cover" muted preload="metadata" />
                                    )}
                                    <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                                      <Play className="h-4 w-4 text-white fill-white" />
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                  <Button variant="outline" size="sm" className="w-full"
                    onClick={() => { setSelectedRecipe(recipe); setAddStepDialogOpen(true); }}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> 新增步骤
                  </Button>

                  {/* Effect Evaluation Section */}
                  <div className="mt-3 p-3 rounded-lg border border-primary/20 bg-primary/5 space-y-3">
                    <div className="flex items-center gap-2">
                      <Star className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium">效果/出品效果评价</span>
                      {recipe.effect_score && (
                        <Badge className="text-[10px] bg-primary text-primary-foreground ml-auto">
                          {recipe.effect_score}分
                        </Badge>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">评价描述</Label>
                      <InlineEditable.Textarea
                        value={recipe.effect_description ?? ''}
                        placeholder="描述该食谱/功能的效果和出品表现..."
                        rows={3}
                        onSave={async (v) => patchInlineValue('function_effect_record', recipe.id, 'effect_description', v)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">问题点</Label>
                      <InlineEditable.Textarea
                        value={recipe.effect_problem_point ?? ''}
                        placeholder="记录效果评价中发现的问题..."
                        rows={2}
                        onSave={async (v) => patchInlineValue('function_effect_record', recipe.id, 'effect_problem_point', v)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">附件素材</Label>
                      <p className="text-[11px] text-muted-foreground">上传效果图片或视频，AI将结合文字和图片进行评价</p>
                      <MaterialPicker
                        taskId={taskId}
                        selectedIds={effectMaterialIds[recipe.id] ?? (recipe.effect_materials || []).map(m => m.id)}
                        initialMaterials={recipe.effect_materials || []}
                        onSelectionChange={(ids) => {
                          setEffectMaterialIds(prev => ({ ...prev, [recipe.id]: ids }));
                        }}
                      />
                    </div>
                    {/* AI result display */}
                    {(() => {
                      const aiData = aiResult[recipe.id]?.result || recipe.effect_ai_result;
                      const aiScore = aiResult[recipe.id]?.score || recipe.effect_score;
                      if (!aiData && !aiScore) return null;
                      return (
                        <div className="p-2.5 rounded-lg bg-muted/50 border border-border space-y-1.5">
                          <div className="flex items-center gap-2">
                            <Sparkles className="h-3.5 w-3.5 text-primary" />
                            <span className="text-xs font-medium">AI评价结果</span>
                            <Button variant="ghost" size="icon" className="h-6 w-6 ml-auto text-muted-foreground hover:text-destructive" onClick={() => handleDeleteAiEval(recipe)} title="删除AI评价">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                            {aiScore && (
                              <Badge className={`text-[10px] ${Number(aiScore) >= 8 ? 'bg-emerald-600' : Number(aiScore) >= 6 ? 'bg-blue-600' : Number(aiScore) >= 4 ? 'bg-amber-600' : 'bg-red-600'} text-white`}>
                                {aiScore}分/10分
                              </Badge>
                            )}
                          </div>
                          {aiData?.summary && (
                            <p className="text-[11px] text-muted-foreground">{aiData.summary}</p>
                          )}
                        </div>
                      );
                    })()}
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1"
                        onClick={() => handleSaveEffect(recipe)}
                        disabled={effectSaving[recipe.id]}>
                        <Sparkles className="h-3.5 w-3.5 mr-1" />
                        {effectSaving[recipe.id] ? '保存中...' : '保存素材'}
                      </Button>
                      <Button size="sm" className="flex-1"
                        onClick={() => handleAiEvaluate(recipe)}
                        disabled={aiEvaluating[recipe.id] || (!recipe.effect_description && (!effectMaterialIds[recipe.id]?.length && !recipe.effect_materials?.length))}>
                        <Sparkles className="h-3.5 w-3.5 mr-1" />
                        {aiEvaluating[recipe.id] ? 'AI评价中...' : 'AI总结评分'}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <div className="sticky bottom-4">
        <Button className="w-full" onClick={() => setAddDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" /> 新增食谱/功能
        </Button>
      </div>

      {/* Add recipe dialog */}
      <Dialog open={addDialogOpen} onOpenChange={(open) => { setAddDialogOpen(open); if (!open) { setRecipeSearch(''); setRecipeSearchResults([]); } }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>新增食谱/功能</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            {/* Recipe library search (Feature 7) */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">从食谱库引用</Label>
              <Input placeholder="搜索已有食谱名称..." value={recipeSearch}
                onChange={(e) => setRecipeSearch(e.target.value)} />
              {recipeSearchLoading && <p className="text-[11px] text-muted-foreground animate-pulse">搜索中...</p>}
              {recipeSearchResults.length > 0 && (
                <div className="max-h-40 overflow-y-auto space-y-1 border rounded-lg p-2">
                  {recipeSearchResults.map((refRecipe) => (
                    <div key={refRecipe.id} className="p-2 rounded-md cursor-pointer text-xs transition-colors border border-transparent hover:bg-muted/50"
                      onClick={() => handleReferenceRecipe(refRecipe)}>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-[9px] h-4 shrink-0">{refRecipe.recipe_type}</Badge>
                        <span className="font-medium">{refRecipe.name}</span>
                        <span className="text-muted-foreground">{refRecipe.recipe_library_steps?.length || 0}步</span>
                      </div>
                      <div className="text-muted-foreground mt-0.5">
                        <span className="text-[10px]">{refRecipe.product_category || '通用'}{refRecipe.product ? ` - ${refRecipe.product}` : ''}</span>
                        {refRecipe.ingredients && <span className="line-clamp-1 ml-1">{refRecipe.ingredients}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {recipeSearch.trim() && !recipeSearchLoading && recipeSearchResults.length === 0 && (
                <p className="text-[11px] text-muted-foreground">未找到匹配的食谱</p>
              )}
            </div>

            <Separator />

            <div className="space-y-1.5">
              <Label>类型</Label>
              <Select value={newRecipe.recipe_type} onValueChange={(v) => setNewRecipe({ ...newRecipe, recipe_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="食谱">食谱</SelectItem>
                  <SelectItem value="功能">功能</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{newRecipe.recipe_type === '食谱' ? '食谱名称' : '功能名称'} *</Label>
              <Input placeholder={newRecipe.recipe_type === '食谱' ? '如：豆浆食谱' : '如：搅拌功能'}
                value={newRecipe.name} onChange={(e) => setNewRecipe({ ...newRecipe, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>食材/参数</Label>
              <Textarea placeholder={newRecipe.recipe_type === '食谱' ? '填写食材' : '填写功能参数'}
                value={newRecipe.ingredients} onChange={(e) => setNewRecipe({ ...newRecipe, ingredients: e.target.value })} rows={2} />
            </div>
            <Button onClick={handleAddRecipe} className="w-full" disabled={!newRecipe.name || savingRecipe}>{savingRecipe ? '保存中...' : '保存'}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add step dialog */}
      <Dialog open={addStepDialogOpen} onOpenChange={(open) => { setAddStepDialogOpen(open); if (!open) { setStepMaterialIds([]); setStepMaterials([]); setNewStep({ operation: '', step_material_ids: [], problem_points: [{ text: '', material_ids: [] }] }); setStepRefSearch(''); setStepRefResults([]); } }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>新增步骤 - {selectedRecipe?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            {/* Step reference search (Feature 7) */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">引用已有步骤</Label>
              <Input placeholder="搜索食谱名称以引用步骤..." value={stepRefSearch}
                onChange={(e) => setStepRefSearch(e.target.value)} />
              {stepRefLoading && <p className="text-[11px] text-muted-foreground animate-pulse">搜索中...</p>}
              {stepRefResults.length > 0 && (
                <div className="max-h-40 overflow-y-auto space-y-1 border rounded-lg p-2">
                  {stepRefResults.map((refRecipe) => (
                    <div key={refRecipe.id} className="space-y-1">
                      <div className="text-xs font-medium text-primary">{refRecipe.name}</div>
                      {(refRecipe.recipe_library_steps || []).map((s) => (
                        <div key={s.id} className="p-1.5 rounded cursor-pointer text-xs hover:bg-muted/50 border border-transparent"
                          onClick={() => handleReferenceStep(s as unknown as RecipeStep)}>
                          <span className="text-muted-foreground">步骤{s.step_number}:</span> <span className="line-clamp-1">{s.operation}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
              {stepRefSearch.trim() && !stepRefLoading && stepRefResults.length === 0 && (
                <p className="text-[11px] text-muted-foreground">未找到匹配的食谱</p>
              )}
            </div>

            <Separator />

            <div className="space-y-1.5">
              <Label>具体操作 *</Label>
              <Textarea placeholder="描述该步骤的操作" value={newStep.operation}
                onChange={(e) => setNewStep({ ...newStep, operation: e.target.value })} rows={3} />
            </div>
            <div className="space-y-1.5">
              <Label>步骤素材</Label>
              <p className="text-[11px] text-muted-foreground">附录该步骤的效果图片或视频（如食物成品效果），与问题点素材独立</p>
              <MaterialPicker
                taskId={taskId}
                selectedIds={newStep.step_material_ids || []}
                onSelectionChange={(ids, mats) => {
                  setNewStep({ ...newStep, step_material_ids: ids });
                  setStepMaterialIds(prev => [...new Set([...prev, ...ids])]);
                  setStepMaterials(mats);
                }}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>问题点</Label>
                <Button type="button" variant="ghost" size="sm" className="h-6 text-xs text-primary"
                  onClick={() => setNewStep({ ...newStep, problem_points: [...newStep.problem_points, { text: '', material_ids: [] }] })}>
                  <Plus className="h-3 w-3 mr-1" /> 添加问题点
                </Button>
              </div>
              {newStep.problem_points.map((pp, idx) => (
                <div key={idx} className="p-2 rounded-lg border bg-muted/20 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground font-medium shrink-0">问题{idx + 1}</span>
                    {newStep.problem_points.length > 1 && (
                      <Button type="button" variant="ghost" size="icon" className="h-5 w-5 ml-auto"
                        onClick={() => setNewStep({ ...newStep, problem_points: newStep.problem_points.filter((_, i) => i !== idx) })}>
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                  <Textarea placeholder="描述问题点..." value={pp.text}
                    onChange={(e) => {
                      const updated = [...newStep.problem_points];
                      updated[idx] = { ...updated[idx], text: e.target.value };
                      setNewStep({ ...newStep, problem_points: updated });
                    }} rows={2} />
                  <MaterialPicker
                    taskId={taskId}
                    selectedIds={pp.material_ids || []}
                    onSelectionChange={(ids, mats) => {
                      const updated = [...newStep.problem_points];
                      updated[idx] = { ...updated[idx], material_ids: ids };
                      setNewStep({ ...newStep, problem_points: updated });
                      // Also update global step materials
                      const allIds = newStep.problem_points.flatMap((p, i) => i === idx ? ids : (p.material_ids || []));
                      setStepMaterialIds(allIds);
                      setStepMaterials(mats);
                    }}
                  />
                </div>
              ))}
            </div>
            <Button onClick={handleAddStep} className="w-full" disabled={!newStep.operation || savingStep}>{savingStep ? '保存中...' : '保存步骤'}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit step dialog */}
      <Dialog open={editStepDialogOpen} onOpenChange={(open) => { setEditStepDialogOpen(open); if (!open) { setEditingStep(null); setEditStepMaterialIds([]); setEditStepMaterials([]); } }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>编辑步骤</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="space-y-1.5">
              <Label>具体操作 *</Label>
              <Textarea placeholder="描述该步骤的操作" value={editStepForm.operation}
                onChange={(e) => setEditStepForm({ ...editStepForm, operation: e.target.value })} rows={3} />
            </div>
            <div className="space-y-1.5">
              <Label>步骤素材</Label>
              <p className="text-[11px] text-muted-foreground">附录该步骤的效果图片或视频（如食物成品效果），与问题点素材独立</p>
              <MaterialPicker
                taskId={taskId}
                selectedIds={editStepForm.step_material_ids || []}
                onSelectionChange={(ids, mats) => {
                  setEditStepForm({ ...editStepForm, step_material_ids: ids });
                  setEditStepMaterialIds(ids);
                  setEditStepMaterials(mats);
                }}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>问题点</Label>
                <Button type="button" variant="ghost" size="sm" className="h-6 text-xs text-primary"
                  onClick={() => setEditStepForm({ ...editStepForm, problem_points: [...editStepForm.problem_points, { text: '', material_ids: [] }] })}>
                  <Plus className="h-3 w-3 mr-1" /> 添加问题点
                </Button>
              </div>
              {editStepForm.problem_points.map((pp, idx) => (
                <div key={idx} className="p-2 rounded-lg border bg-muted/20 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground font-medium shrink-0">问题{idx + 1}</span>
                    {editStepForm.problem_points.length > 1 && (
                      <Button type="button" variant="ghost" size="icon" className="h-5 w-5 ml-auto"
                        onClick={() => setEditStepForm({ ...editStepForm, problem_points: editStepForm.problem_points.filter((_, i) => i !== idx) })}>
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                  <Textarea placeholder="描述问题点..." value={pp.text}
                    onChange={(e) => {
                      const updated = [...editStepForm.problem_points];
                      updated[idx] = { ...updated[idx], text: e.target.value };
                      setEditStepForm({ ...editStepForm, problem_points: updated });
                    }} rows={2} />
                  <MaterialPicker
                    taskId={taskId}
                    selectedIds={pp.material_ids || []}
                    onSelectionChange={(ids, mats) => {
                      const updated = [...editStepForm.problem_points];
                      updated[idx] = { ...updated[idx], material_ids: ids };
                      setEditStepForm({ ...editStepForm, problem_points: updated });
                      setEditStepMaterialIds(ids);
                      setEditStepMaterials(mats);
                    }}
                  />
                </div>
              ))}
            </div>
            {/* Existing materials preview */}
            {editingStep?.materials && editingStep.materials.length > 0 && (
              <div className="space-y-1.5">
                <Label>当前关联素材</Label>
                <div className="flex gap-1.5 flex-wrap">
                  {editingStep.materials.map((mat) => {
                    const displayUrl = getMaterialDisplayUrl(mat, presignedUrls);
                    const previewUrl = getMaterialPreviewUrl(mat, displayUrl);
                    const isPendingVideo = mat.material_type === 'video' && isPendingMediaUrl(displayUrl);
                    return (
                      <div key={mat.id} className="w-14 h-14 rounded-md overflow-hidden border border-border cursor-pointer"
                        onClick={() => { if (previewUrl) open(previewUrl); }}>
                        {mat.material_type === 'image' ? (
                          <img src={displayUrl} alt={mat.file_name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-muted relative">
                            {isPendingVideo ? (
                              <span className="text-[10px] text-muted-foreground">加载中</span>
                            ) : (
                              <video src={displayUrl} className="w-full h-full object-cover" muted preload="metadata" />
                            )}
                            <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                              <Play className="h-4 w-4 text-white fill-white" />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <Button onClick={handleSaveEditStep} className="w-full" disabled={!editStepForm.operation || savingEditStep}>{savingEditStep ? '保存中...' : '保存修改'}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit recipe dialog (Feature 3) */}
      <Dialog open={editRecipeDialogOpen} onOpenChange={setEditRecipeDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>编辑食谱/功能</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="space-y-1.5">
              <Label>类型</Label>
              <Select value={editRecipeForm.recipe_type} onValueChange={(v) => setEditRecipeForm({ ...editRecipeForm, recipe_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="食谱">食谱</SelectItem>
                  <SelectItem value="功能">功能</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{editRecipeForm.recipe_type === '食谱' ? '食谱名称' : '功能名称'} *</Label>
              <Input value={editRecipeForm.name} onChange={(e) => setEditRecipeForm({ ...editRecipeForm, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>食材/参数</Label>
              <Textarea value={editRecipeForm.ingredients} onChange={(e) => setEditRecipeForm({ ...editRecipeForm, ingredients: e.target.value })} rows={2} />
            </div>
            <Button onClick={handleSaveEditRecipe} className="w-full" disabled={!editRecipeForm.name || savingRecipe}>{savingRecipe ? '保存中...' : '保存修改'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
