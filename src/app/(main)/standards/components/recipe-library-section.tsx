'use client';

/* eslint-disable @next/next/no-img-element */

import { useEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import { ChefHat, Loader2, Pencil, Trash2, Plus, X, ChevronDown, ChevronUp, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { usePresignedUrls } from '@/lib/use-presigned-url';
import { toast } from 'sonner';
import {
  FilterBar,
  StatusBadge,
  EmptyState,
  SkeletonList,
  pageFilterControlClass,
  pageListBodyClass,
  pageListCardClass,
  pageListContentClass,
  pageListDescriptionClass,
  pageListMetaClass,
  pageListTitleClass,
} from '@/components/app';
import type { CategoryWithProducts, RecipeLibItem, RecipeLibStep } from '../types';
import { RecipeAddDialog, RecipeEditDialog } from './recipe-library-dialogs';

export interface RecipeSectionRef {
  openAddDialog: () => void;
}

type RecipeLibrarySectionProps = {
  categories: CategoryWithProducts[];
  isAdmin: boolean;
};

export const RecipeLibrarySection = forwardRef<RecipeSectionRef, RecipeLibrarySectionProps>(
function RecipeLibrarySection({ categories, isAdmin }, ref) {
  const [recipes, setRecipes] = useState<RecipeLibItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState('');
  const [filterProduct, setFilterProduct] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<RecipeLibItem | null>(null);

  // Expanded recipe detail - steps management
  const [detailSteps, setDetailSteps] = useState<RecipeLibStep[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailStepOp, setDetailStepOp] = useState('');
  const [detailAddingStep, setDetailAddingStep] = useState(false);
  const [detailStepImage, setDetailStepImage] = useState<File | null>(null);
  const [editStepId, setEditStepId] = useState<string | null>(null);
  const [editStepOp, setEditStepOp] = useState('');

  // Drag state
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  // Step materials map
  const [stepMaterials, setStepMaterials] = useState<Record<string, Array<{ id: string; file_url: string; file_path?: string; material_type: string; file_name: string }>>>({});

  // Flatten all step materials for presigned URL resolution
  const flatStepMaterials = Object.values(stepMaterials).flat();
  const presignedUrls = usePresignedUrls(flatStepMaterials);

  useImperativeHandle(ref, () => ({
    openAddDialog: () => setAddOpen(true),
  }));

  const fetchRecipes = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: '100', include_steps: '1' });
    if (filterCategory) params.set('product_category', filterCategory);
    if (filterProduct) params.set('product', filterProduct);
    const res = await fetch(`/api/recipe-library?${params}`);
    const data = await res.json();
    if (data.code === 0) setRecipes(data.data || []);
    setLoading(false);
  }, [filterCategory, filterProduct]);

  useEffect(() => { fetchRecipes(); }, [fetchRecipes]);

  const fetchDetailSteps = async (recipeId: string) => {
    setDetailLoading(true);
    const res = await fetch(`/api/recipe-library-steps?recipe_library_id=${recipeId}`);
    const data = await res.json();
    if (data.code === 0) {
      setDetailSteps(data.data || []);
      const matMap: Record<string, Array<{ id: string; file_url: string; material_type: string; file_name: string }>> = {};
      for (const step of (data.data || [])) {
        if (step.id) {
          const mRes = await fetch(`/api/materials?recipe_library_step_id=${step.id}&limit=50`);
          const mData = await mRes.json();
          if (mData.code === 0) matMap[step.id] = mData.data || [];
        }
      }
      setStepMaterials(matMap);
    }
    setDetailLoading(false);
  };

  const handleExpand = (recipe: RecipeLibItem) => {
    if (expandedId === recipe.id) {
      setExpandedId(null);
    } else {
      setExpandedId(recipe.id);
      fetchDetailSteps(recipe.id);
      setDetailStepOp('');
      setDetailStepImage(null);
      setEditStepId(null);
    }
  };

  const handleOpenEdit = (recipe: RecipeLibItem) => {
    setEditingRecipe(recipe);
    setEditOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除此食谱？')) return;
    const res = await fetch(`/api/recipe-library/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.code === 0) { fetchRecipes(); toast.success('已删除'); if (expandedId === id) setExpandedId(null); }
    else toast.error(data.message);
  };

  // ── Detail step management ──
  const handleAddDetailStep = async () => {
    if (!detailStepOp.trim() || !expandedId) return;
    setDetailAddingStep(true);
    try {
      const res = await fetch('/api/recipe-library-steps', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipe_library_id: expandedId, step_number: detailSteps.length + 1, operation: detailStepOp.trim() }),
      });
      const data = await res.json();
      if (data.code === 0) {
        if (detailStepImage && data.data?.id) {
          const formData = new FormData();
          formData.append('file', detailStepImage);
          formData.append('recipe_library_step_id', data.data.id);
          await fetch('/api/materials/upload', { method: 'POST', body: formData });
        }
        setDetailStepOp('');
        setDetailStepImage(null);
        fetchDetailSteps(expandedId);
      } else toast.error(data.message);
    } finally { setDetailAddingStep(false); }
  };

  const handleDeleteDetailStep = async (stepId: string) => {
    if (!expandedId) return;
    await fetch(`/api/recipe-library-steps/${stepId}`, { method: 'DELETE' });
    fetchDetailSteps(expandedId);
  };

  const handleOpenEditStep = (step: RecipeLibStep) => {
    setEditStepId(step.id || null);
    setEditStepOp(step.operation);
  };

  const handleSaveEditStep = async () => {
    if (!editStepId || !expandedId) return;
    await fetch(`/api/recipe-library-steps/${editStepId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operation: editStepOp.trim() }),
    });
    setEditStepId(null);
    fetchDetailSteps(expandedId);
  };

  // ── Drag-and-drop reorder ──
  const handleDragStart = (idx: number) => { setDragIdx(idx); };
  const handleDragOver = (e: React.DragEvent, idx: number) => { e.preventDefault(); setDragOverIdx(idx); };
  const handleDragEnd = async () => {
    if (dragIdx === null || dragOverIdx === null || dragIdx === dragOverIdx || !expandedId) {
      setDragIdx(null); setDragOverIdx(null); return;
    }
    const newSteps = [...detailSteps];
    const [moved] = newSteps.splice(dragIdx, 1);
    newSteps.splice(dragOverIdx, 0, moved);
    const reordered = newSteps.map((s, i) => ({ ...s, step_number: i + 1 }));
    setDetailSteps(reordered);
    setDragIdx(null); setDragOverIdx(null);
    await fetch('/api/recipe-library-steps', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ steps: reordered.filter(s => s.id).map(s => ({ id: s.id, step_number: s.step_number })) }),
    });
  };

  // ── Material upload/delete ──
  const handleDetailStepUpload = async (file: File, stepId: string) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('recipe_library_step_id', stepId);
    const res = await fetch('/api/materials/upload', { method: 'POST', body: formData });
    const data = await res.json();
    if (data.code === 0) {
      toast.success('图片已上传');
      fetchDetailSteps(expandedId!);
    } else toast.error(data.message || '上传失败');
  };

  const handleDeleteMaterial = async (materialId: string) => {
    await fetch(`/api/materials?id=${materialId}`, { method: 'DELETE' });
    if (expandedId) fetchDetailSteps(expandedId);
  };

  const selectedCat = categories.find(c => c.name === filterCategory);

  return (
    <div className="space-y-3">
      <FilterBar sticky={false}>
        <Select value={filterCategory} onValueChange={(v) => { setFilterCategory(v === 'all' ? '' : v); setFilterProduct(''); }}>
          <SelectTrigger className={cn(pageFilterControlClass, 'w-full sm:w-32')}><SelectValue placeholder="全部品类" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部品类</SelectItem>
            {categories.map(c => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        {filterCategory && (
          <Select value={filterProduct} onValueChange={(v) => setFilterProduct(v === 'all' ? '' : v)}>
            <SelectTrigger className={cn(pageFilterControlClass, 'w-full sm:w-32')}><SelectValue placeholder="全部产品" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部产品</SelectItem>
              {(selectedCat?.products || []).map(p => <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </FilterBar>

      {loading ? (
        <SkeletonList rows={3} />
      ) : recipes.length === 0 ? (
        <EmptyState icon={ChefHat} title="暂无食谱" />
      ) : (
        <div className="grid gap-2">
          {recipes.map(recipe => (
            <div key={recipe.id} className={cn('rounded-lg border bg-card', pageListCardClass, expandedId === recipe.id && 'ring-1 ring-primary/30')}>
              <div className={pageListContentClass}>
                <div className={pageListBodyClass}>
                  <StatusBadge kind="recipe" value={recipe.recipe_type} className="mt-0.5 shrink-0 text-[9px]" />
                  <div className="min-w-0 flex-1 cursor-pointer" onClick={() => handleExpand(recipe)}>
                    <div className={pageListTitleClass}>{recipe.name}</div>
                    <div className={pageListDescriptionClass}>
                      {recipe.product_category || '通用'}{recipe.product ? ` - ${recipe.product}` : ''}
                    </div>
                    <div className={cn(pageListMetaClass, 'items-center')}>
                      <StatusBadge kind="generic" value={`${recipe.recipe_library_steps?.length || 0} 步骤`} className="text-[10px]" />
                      {recipe.ingredients && (
                        <span className="max-w-full truncate text-[10px] text-muted-foreground leading-none sm:max-w-[240px]">
                          {recipe.ingredients}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {isAdmin && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="编辑食谱" onClick={(e) => { e.stopPropagation(); handleOpenEdit(recipe); }}>
                        <Pencil className="h-3 w-3 text-muted-foreground" />
                      </Button>
                    )}
                    {isAdmin && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="删除食谱" onClick={(e) => { e.stopPropagation(); handleDelete(recipe.id); }}>
                        <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                      </Button>
                    )}
                    <button className="p-1" aria-label={expandedId === recipe.id ? '收起' : '展开'} onClick={() => handleExpand(recipe)}>
                      {expandedId === recipe.id ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </button>
                  </div>
                </div>

                {/* Expanded detail - steps */}
                {expandedId === recipe.id && (
                  <div className="mt-3 pt-3 border-t space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium">步骤列表</span>
                      <span className="text-[10px] text-muted-foreground">拖拽步骤可重新排序</span>
                      {recipe.ingredients && (
                        <span className="text-[10px] text-muted-foreground">食材/参数: {recipe.ingredients}</span>
                      )}
                    </div>

                    {detailLoading ? (
                      <div className="flex items-center justify-center py-4"><Loader2 className="h-4 w-4 animate-spin" /></div>
                    ) : detailSteps.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-2">暂无步骤，请添加</p>
                    ) : (
                      <div className="space-y-2">
                        {detailSteps.map((step, idx) => (
                          <div key={step.id || idx}
                            className={cn(
                              'border rounded-lg p-3 space-y-2 transition-all',
                              dragIdx === idx && 'opacity-50 scale-95',
                              dragOverIdx === idx && 'border-primary border-2',
                            )}
                            onDragOver={(e) => handleDragOver(e, idx)}
                            onDragLeave={() => setDragOverIdx(null)}
                          >
                            {editStepId === step.id ? (
                              <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="text-[10px] shrink-0">步骤{step.step_number}</Badge>
                                  <Input className="h-7 text-xs" value={editStepOp} onChange={e => setEditStepOp(e.target.value)} placeholder="操作描述" />
                                </div>
                                <div className="flex gap-2">
                                  <Button size="sm" className="h-6 text-xs" onClick={handleSaveEditStep}>保存</Button>
                                  <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setEditStepId(null)}>取消</Button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <div className="flex items-start gap-2">
                                  {isAdmin && (
                                    <div className="cursor-grab active:cursor-grabbing shrink-0 text-muted-foreground/40 hover:text-muted-foreground mt-0.5"
                                      draggable
                                      onDragStart={() => handleDragStart(idx)}
                                      onDragEnd={handleDragEnd}
                                    >
                                      <GripVertical className="h-4 w-4" />
                                    </div>
                                  )}
                                  <Badge variant="outline" className="text-[10px] shrink-0 mt-0.5">步骤{step.step_number}</Badge>
                                  <div className="flex-1 min-w-0 text-sm">{step.operation}</div>
                                  {isAdmin && (
                                    <div className="flex gap-1 shrink-0">
                                      <button className="p-0.5" aria-label="编辑步骤" onClick={() => handleOpenEditStep(step)}>
                                        <Pencil className="h-3 w-3 text-muted-foreground" />
                                      </button>
                                      <button className="p-0.5" aria-label="删除步骤" onClick={() => handleDeleteDetailStep(step.id!)}>
                                        <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                                      </button>
                                    </div>
                                  )}
                                </div>
                                {/* Step images */}
                                {step.id && stepMaterials[step.id] && stepMaterials[step.id].length > 0 && (
                                  <div className="flex gap-2 flex-wrap pl-8">
                                    {stepMaterials[step.id].map(mat => {
                                      const resolvedUrl = presignedUrls.get(mat.id) || mat.file_url;
                                      return (
                                      <div key={mat.id} className="relative group w-16 h-16 rounded border overflow-hidden">
                                        {mat.material_type === 'video' ? (
                                          <video src={resolvedUrl} className="w-full h-full object-cover" preload="metadata" />
                                        ) : (
                                          <img src={resolvedUrl} alt={mat.file_name} className="w-full h-full object-cover" />
                                        )}
                                        {isAdmin && (
                                          <button className="absolute top-0 right-0 bg-black/50 text-white rounded-bl p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                                            aria-label="删除图片" onClick={() => handleDeleteMaterial(mat.id)}>
                                            <X className="h-3 w-3" />
                                          </button>
                                        )}
                                      </div>
                                    );})}
                                  </div>
                                )}
                                {/* Upload image button */}
                                {isAdmin && step.id && (
                                  <div className="pl-8">
                                    <label className="inline-flex items-center gap-1 text-[10px] text-primary cursor-pointer hover:underline">
                                      <Plus className="h-3 w-3" /> 添加图片
                                      <input type="file" accept="image/*,video/*" className="hidden"
                                        onChange={e => { const f = e.target.files?.[0]; if (f) handleDetailStepUpload(f, step.id!); }} />
                                    </label>
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Add new step */}
                    {isAdmin && (
                      <div className="border rounded-lg p-3 space-y-2 bg-muted/30">
                        <span className="text-xs font-medium">添加步骤</span>
                        <Input className="h-7 text-xs" value={detailStepOp} onChange={e => setDetailStepOp(e.target.value)}
                          placeholder="操作描述 *" onKeyDown={e => { if (e.key === 'Enter' && detailStepOp.trim()) handleAddDetailStep(); }} />
                        <div className="flex items-center gap-2">
                          <label className="inline-flex items-center gap-1 text-[10px] text-primary cursor-pointer hover:underline shrink-0">
                            <Plus className="h-3 w-3" /> 上传图片
                            <input type="file" accept="image/*,video/*" className="hidden"
                              onChange={e => { const f = e.target.files?.[0]; if (f) setDetailStepImage(f); }} />
                          </label>
                          {detailStepImage && (
                            <div className="flex items-center gap-1">
                              <div className="w-8 h-8 rounded border overflow-hidden">
                                <img src={URL.createObjectURL(detailStepImage)} alt="" className="w-full h-full object-cover" />
                              </div>
                              <span className="text-[10px] text-muted-foreground max-w-[100px] truncate">{detailStepImage.name}</span>
                              <button className="p-0.5" aria-label="移除图片" onClick={() => setDetailStepImage(null)}>
                                <X className="h-3 w-3 text-muted-foreground" />
                              </button>
                            </div>
                          )}
                          <div className="flex-1" />
                          <Button size="sm" className="h-7 text-xs gap-1" onClick={handleAddDetailStep}
                            disabled={detailAddingStep || !detailStepOp.trim()}>
                            {detailAddingStep ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />} 添加
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <RecipeAddDialog open={addOpen} onOpenChange={setAddOpen} categories={categories} onAdded={fetchRecipes} />
      <RecipeEditDialog open={editOpen} onOpenChange={setEditOpen} recipe={editingRecipe} categories={categories} onSaved={fetchRecipes} />
    </div>
  );
});
