'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import { Search, BookOpen, ChevronRight, Upload, FileUp, Loader2, Trash2, Plus, ChefHat, Pencil, X, ChevronDown, ChevronUp, GripVertical } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth-context';

interface CategoryWithProducts {
  id: string; name: string; sort_order: number;
  products: Array<{ id: string; name: string; category_id: string; sort_order: number }>;
}

interface Standard {
  id: string;
  standard_name: string;
  category: string;
  product_category: string | null;
  product: string | null;
  version: string;
  description: string | null;
  standard_items: Array<{ count: number }>;
}

const categoryConfig: Record<string, { label: string; color: string; desc: string }> = {
  '通用标准': { label: '通用标准', color: 'bg-blue-100 text-blue-700', desc: '产品全流程体验通用标准' },
  '品类标准': { label: '品类标准', color: 'bg-primary/10 text-primary', desc: '品类专用检查标准' },
  '感官评价标准': { label: '感官评价', color: 'bg-amber-100 text-amber-700', desc: '感官主观评价标准' },
  '食谱功能标准': { label: '食谱功能', color: 'bg-emerald-100 text-emerald-700', desc: '食谱功能体验标准' },
};

interface RecipeLibItem {
  id: string; name: string; product_category: string | null; product: string | null;
  ingredients: string | null; recipe_type: string;
  recipe_library_steps: Array<{ id: string; step_number: number; operation: string; problem_point: string | null }>;
}

interface RecipeLibStep {
  id?: string; step_number: number; operation: string; problem_point: string | null; problem_points: Array<{ text: string }>;
  material_ids?: string[];
}

/* ── Recipe Library Section ── */
function RecipeLibrarySection({ categories, isAdmin }: { categories: CategoryWithProducts[]; isAdmin: boolean }) {
  const [recipes, setRecipes] = useState<RecipeLibItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState('');
  const [filterProduct, setFilterProduct] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<RecipeLibItem | null>(null);
  const [editForm, setEditForm] = useState({ name: '', product_category: '', product: '', ingredients: '', recipe_type: '食谱' });

  // Add dialog form with steps
  const [addForm, setAddForm] = useState({ name: '', product_category: '', product: '', ingredients: '', recipe_type: '食谱' });
  const [addSteps, setAddSteps] = useState<Array<{ step_number: number; operation: string; imageFiles: File[] }>>([]);
  const [addStepOp, setAddStepOp] = useState('');
  const [addingRecipe, setAddingRecipe] = useState(false);

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
  const [stepMaterials, setStepMaterials] = useState<Record<string, Array<{ id: string; file_url: string; material_type: string; file_name: string }>>>({});

  const fetchRecipes = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
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
      // Fetch materials for each step
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

  // ── Add recipe with steps ──
  const handleAddStepInDialog = () => {
    if (!addStepOp.trim()) return;
    setAddSteps([...addSteps, { step_number: addSteps.length + 1, operation: addStepOp.trim(), imageFiles: [] }]);
    setAddStepOp('');
  };

  const handleAddStepWithImage = (file: File) => {
    if (!addStepOp.trim()) return;
    setAddSteps([...addSteps, { step_number: addSteps.length + 1, operation: addStepOp.trim(), imageFiles: [file] }]);
    setAddStepOp('');
  };

  const handleRemoveAddStep = (idx: number) => {
    const newSteps = addSteps.filter((_, i) => i !== idx).map((s, i) => ({ ...s, step_number: i + 1 }));
    setAddSteps(newSteps);
  };

  const handleAddStepImage = (idx: number, file: File) => {
    setAddSteps(prev => {
      const newSteps = [...prev];
      newSteps[idx] = { ...newSteps[idx], imageFiles: [...newSteps[idx].imageFiles, file] };
      return newSteps;
    });
  };

  const handleAddRecipe = async () => {
    if (!addForm.name.trim()) return;
    setAddingRecipe(true);
    try {
      // 1. Create the recipe library item
      const res = await fetch('/api/recipe-library', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...addForm, name: addForm.name.trim() }),
      });
      const data = await res.json();
      if (data.code !== 0) { toast.error(data.message); return; }

      const recipeId = data.data.id;

      // 2. Create steps and upload images
      for (const step of addSteps) {
        const stepRes = await fetch('/api/recipe-library-steps', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recipe_library_id: recipeId, step_number: step.step_number, operation: step.operation }),
        });
        const stepData = await stepRes.json();
        if (stepData.code === 0 && stepData.data?.id) {
          // Upload images for this step
          for (const file of step.imageFiles) {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('recipe_library_step_id', stepData.data.id);
            await fetch('/api/materials/upload', { method: 'POST', body: formData });
          }
        }
      }

      setAddOpen(false);
      setAddForm({ name: '', product_category: '', product: '', ingredients: '', recipe_type: '食谱' });
      setAddSteps([]);
      setAddStepOp('');
      fetchRecipes();
      toast.success('食谱已添加');
    } finally { setAddingRecipe(false); }
  };

  // ── Edit recipe info ──
  const handleOpenEdit = (recipe: RecipeLibItem) => {
    setEditingRecipe(recipe);
    setEditForm({
      name: recipe.name,
      product_category: recipe.product_category || '',
      product: recipe.product || '',
      ingredients: recipe.ingredients || '',
      recipe_type: recipe.recipe_type || '食谱',
    });
    setEditOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editingRecipe) return;
    const res = await fetch(`/api/recipe-library/${editingRecipe.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    });
    const data = await res.json();
    if (data.code === 0) {
      setEditOpen(false);
      setEditingRecipe(null);
      fetchRecipes();
      toast.success('已更新');
    } else toast.error(data.message);
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
        // Upload image if provided
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

  // ── Material upload for detail step ──
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

  // ── Delete material ──
  const handleDeleteMaterial = async (materialId: string) => {
    await fetch(`/api/materials?id=${materialId}`, { method: 'DELETE' });
    if (expandedId) fetchDetailSteps(expandedId);
  };

  const selectedCat = categories.find(c => c.name === filterCategory);
  const addSelectedCat = categories.find(c => c.name === addForm.product_category);
  const editSelectedCat = categories.find(c => c.name === editForm.product_category);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ChefHat className="h-5 w-5 text-emerald-600" />
          <h2 className="text-base font-semibold">食谱库</h2>
          <Badge variant="secondary" className="text-[10px]">{recipes.length}</Badge>
        </div>
        {isAdmin && (
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setAddOpen(true)}>
            <Plus className="h-3 w-3" /> 添加食谱
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        <Select value={filterCategory} onValueChange={(v) => { setFilterCategory(v === 'all' ? '' : v); setFilterProduct(''); }}>
          <SelectTrigger className="w-32 h-8 text-xs"><SelectValue placeholder="全部品类" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部品类</SelectItem>
            {categories.map(c => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        {filterCategory && (
          <Select value={filterProduct} onValueChange={(v) => setFilterProduct(v === 'all' ? '' : v)}>
            <SelectTrigger className="w-32 h-8 text-xs"><SelectValue placeholder="全部产品" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部产品</SelectItem>
              {(selectedCat?.products || []).map(p => <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Recipe List */}
      {loading ? (
        <div className="grid gap-2">{[1,2,3].map(i => <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />)}</div>
      ) : recipes.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center py-8 text-center">
          <ChefHat className="h-8 w-8 text-muted-foreground/50 mb-2" />
          <p className="text-xs text-muted-foreground">暂无食谱</p>
        </CardContent></Card>
      ) : (
        <div className="grid gap-2">
          {recipes.map(recipe => (
            <Card key={recipe.id} className={cn('transition-colors', expandedId === recipe.id && 'ring-1 ring-primary/30')}>
              <CardContent className="p-3">
                <div className="flex items-center gap-3">
                  <Badge variant="secondary" className={cn('text-[9px] shrink-0', recipe.recipe_type === '食谱' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700')}>
                    {recipe.recipe_type}
                  </Badge>
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => handleExpand(recipe)}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium truncate">{recipe.name}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {recipe.product_category || '通用'}{recipe.product ? ` - ${recipe.product}` : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-muted-foreground">{recipe.recipe_library_steps?.length || 0} 步骤</span>
                      {recipe.ingredients && <span className="text-[10px] text-muted-foreground truncate max-w-[200px]">{recipe.ingredients}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {isAdmin && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); handleOpenEdit(recipe); }}>
                        <Pencil className="h-3 w-3 text-muted-foreground" />
                      </Button>
                    )}
                    {isAdmin && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); handleDelete(recipe.id); }}>
                        <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                      </Button>
                    )}
                    <button className="p-1" onClick={() => handleExpand(recipe)}>
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
                              /* Edit step mode */
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
                              /* View step mode */
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
                                      <button className="p-0.5" onClick={() => handleOpenEditStep(step)}>
                                        <Pencil className="h-3 w-3 text-muted-foreground" />
                                      </button>
                                      <button className="p-0.5" onClick={() => handleDeleteDetailStep(step.id!)}>
                                        <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                                      </button>
                                    </div>
                                  )}
                                </div>
                                {/* Step images */}
                                {step.id && stepMaterials[step.id] && stepMaterials[step.id].length > 0 && (
                                  <div className="flex gap-2 flex-wrap pl-8">
                                    {stepMaterials[step.id].map(mat => (
                                      <div key={mat.id} className="relative group w-16 h-16 rounded border overflow-hidden">
                                        {mat.material_type === 'video' ? (
                                          <video src={mat.file_url} className="w-full h-full object-cover" preload="metadata" />
                                        ) : (
                                          <img src={mat.file_url} alt={mat.file_name} className="w-full h-full object-cover" />
                                        )}
                                        {isAdmin && (
                                          <button className="absolute top-0 right-0 bg-black/50 text-white rounded-bl p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                                            onClick={() => handleDeleteMaterial(mat.id)}>
                                            <X className="h-3 w-3" />
                                          </button>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                                {/* Upload image/video buttons */}
                                {isAdmin && step.id && (
                                  <div className="pl-8 flex items-center gap-3">
                                    <label className="inline-flex items-center gap-1 text-[10px] text-primary cursor-pointer hover:underline">
                                      <Plus className="h-3 w-3" /> 添加图片
                                      <input type="file" className="absolute opacity-0 w-0 h-0 pointer-events-none"
                                        onChange={e => { const f = e.target.files?.[0]; if (f) handleDetailStepUpload(f, step.id!); }} />
                                    </label>
                                    <label className="inline-flex items-center gap-1 text-[10px] text-primary cursor-pointer hover:underline">
                                      <Plus className="h-3 w-3" /> 添加视频
                                      <input type="file" className="absolute opacity-0 w-0 h-0 pointer-events-none"
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
                            <input type="file" className="absolute opacity-0 w-0 h-0 pointer-events-none"
                              onChange={e => { const f = e.target.files?.[0]; if (f) setDetailStepImage(f); }} />
                          </label>
                          <label className="inline-flex items-center gap-1 text-[10px] text-primary cursor-pointer hover:underline shrink-0">
                            <Plus className="h-3 w-3" /> 上传视频
                            <input type="file" className="absolute opacity-0 w-0 h-0 pointer-events-none"
                              onChange={e => { const f = e.target.files?.[0]; if (f) setDetailStepImage(f); }} />
                          </label>
                          {detailStepImage && (
                            <div className="flex items-center gap-1">
                              <div className="w-8 h-8 rounded border overflow-hidden">
                                <img src={URL.createObjectURL(detailStepImage)} alt="" className="w-full h-full object-cover" />
                              </div>
                              <span className="text-[10px] text-muted-foreground max-w-[100px] truncate">{detailStepImage.name}</span>
                              <button className="p-0.5" onClick={() => setDetailStepImage(null)}>
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
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add Dialog */}
      <Dialog open={addOpen} onOpenChange={(v) => { setAddOpen(v); if (!v) { setAddSteps([]); setAddStepOp(''); } }}>
        <DialogContent className="max-w-lg max-h-[85vh]">
          <DialogHeader><DialogTitle>添加食谱到库</DialogTitle></DialogHeader>
          <ScrollArea className="max-h-[70vh]">
            <div className="space-y-3 pr-3">
              <div className="space-y-1.5">
                <Label>类型</Label>
                <Select value={addForm.recipe_type} onValueChange={(v) => setAddForm({ ...addForm, recipe_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="食谱">食谱</SelectItem>
                    <SelectItem value="功能">功能</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>品类</Label>
                  <Select value={addForm.product_category} onValueChange={(v) => setAddForm({ ...addForm, product_category: v, product: '' })}>
                    <SelectTrigger><SelectValue placeholder="选择品类" /></SelectTrigger>
                    <SelectContent>
                      {categories.map(c => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>产品</Label>
                  <Select value={addForm.product} onValueChange={(v) => setAddForm({ ...addForm, product: v })}>
                    <SelectTrigger><SelectValue placeholder={addForm.product_category ? '选择产品' : '请先选择品类'} /></SelectTrigger>
                    <SelectContent>
                      {(addSelectedCat?.products || []).map(p => <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>{addForm.recipe_type === '食谱' ? '食谱名称' : '功能名称'} *</Label>
                <Input value={addForm.name} onChange={(e) => setAddForm({ ...addForm, name: e.target.value })} placeholder="名称需唯一" />
              </div>
              <div className="space-y-1.5">
                <Label>食材/参数</Label>
                <Textarea value={addForm.ingredients} onChange={(e) => setAddForm({ ...addForm, ingredients: e.target.value })} rows={2} />
              </div>

              <Separator />

              {/* Steps */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">步骤</Label>
                {addSteps.length > 0 && (
                  <div className="space-y-2">
                    {addSteps.map((step, idx) => (
                      <div key={idx} className="border rounded-lg p-2 space-y-1">
                        <div className="flex items-center justify-between">
                          <Badge variant="outline" className="text-[10px]">步骤{step.step_number}</Badge>
                          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => handleRemoveAddStep(idx)}>
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                        <div className="text-xs">{step.operation}</div>
                        {/* Image thumbnails */}
                        {step.imageFiles.length > 0 && (
                          <div className="flex gap-1 flex-wrap">
                            {step.imageFiles.map((f, fi) => (
                              <div key={fi} className="w-10 h-10 rounded border overflow-hidden">
                                <img src={URL.createObjectURL(f)} alt={f.name} className="w-full h-full object-cover" />
                              </div>
                            ))}
                          </div>
                        )}
                        {/* Upload image/video */}
                        <div className="flex items-center gap-3">
                          <label className="inline-flex items-center gap-1 text-[10px] text-primary cursor-pointer hover:underline">
                            <Plus className="h-3 w-3" /> 添加图片
                            <input type="file" className="absolute opacity-0 w-0 h-0 pointer-events-none"
                              onChange={e => { const f = e.target.files?.[0]; if (f) handleAddStepImage(idx, f); }} />
                          </label>
                          <label className="inline-flex items-center gap-1 text-[10px] text-primary cursor-pointer hover:underline">
                            <Plus className="h-3 w-3" /> 添加视频
                            <input type="file" className="absolute opacity-0 w-0 h-0 pointer-events-none"
                              onChange={e => { const f = e.target.files?.[0]; if (f) handleAddStepImage(idx, f); }} />
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="border rounded-lg p-2 space-y-2 bg-muted/30">
                  <Input className="h-7 text-xs" value={addStepOp} onChange={e => setAddStepOp(e.target.value)}
                    placeholder="操作描述 *" onKeyDown={e => { if (e.key === 'Enter' && addStepOp.trim()) handleAddStepInDialog(); }} />
                  <div className="flex items-center gap-2">
                    <label className="inline-flex items-center gap-1 text-[10px] text-primary cursor-pointer hover:underline shrink-0">
                      <Plus className="h-3 w-3" /> 上传图片
                      <input type="file" className="absolute opacity-0 w-0 h-0 pointer-events-none"
                        onChange={e => { const f = e.target.files?.[0]; if (f && addStepOp.trim()) handleAddStepWithImage(f); }} />
                    </label>
                    <div className="flex-1" />
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={handleAddStepInDialog} disabled={!addStepOp.trim()}>
                      <Plus className="h-3 w-3" /> 添加步骤
                    </Button>
                  </div>
                </div>
              </div>

              <Button onClick={handleAddRecipe} className="w-full" disabled={addingRecipe || !addForm.name.trim()}>
                {addingRecipe ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null} 保存食谱
              </Button>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>编辑食谱</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="space-y-1.5">
              <Label>类型</Label>
              <Select value={editForm.recipe_type} onValueChange={(v) => setEditForm({ ...editForm, recipe_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="食谱">食谱</SelectItem>
                  <SelectItem value="功能">功能</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>品类</Label>
                <Select value={editForm.product_category} onValueChange={(v) => setEditForm({ ...editForm, product_category: v, product: '' })}>
                  <SelectTrigger><SelectValue placeholder="选择品类" /></SelectTrigger>
                  <SelectContent>
                    {categories.map(c => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>产品</Label>
                <Select value={editForm.product} onValueChange={(v) => setEditForm({ ...editForm, product: v })}>
                  <SelectTrigger><SelectValue placeholder={editForm.product_category ? '选择产品' : '请先选择品类'} /></SelectTrigger>
                  <SelectContent>
                    {(editSelectedCat?.products || []).map(p => <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{editForm.recipe_type === '食谱' ? '食谱名称' : '功能名称'} *</Label>
              <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>食材/参数</Label>
              <Textarea value={editForm.ingredients} onChange={(e) => setEditForm({ ...editForm, ingredients: e.target.value })} rows={2} />
            </div>
            <Button onClick={handleSaveEdit} className="w-full">保存</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── Experience Standards Section ── */
function ExperienceStandardsSection({ categories, isAdmin }: { categories: CategoryWithProducts[]; isAdmin: boolean }) {
  const [standards, setStandards] = useState<Standard[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [createCategory, setCreateCategory] = useState('通用标准');
  const [createProductCategory, setCreateProductCategory] = useState('');
  const [createProduct, setCreateProduct] = useState('');
  const [importForm, setImportForm] = useState({ category: '通用标准', product_category: '', product: '', description: '' });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const fetchStandards = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (keyword) params.set('keyword', keyword);
    if (filterCategory) params.set('category', filterCategory);
    const res = await fetch(`/api/standards?${params}`);
    const data = await res.json();
    if (data.code === 0) setStandards(data.data || []);
    setLoading(false);
  };

  useEffect(() => { fetchStandards(); }, [keyword, filterCategory]);

  const handleCreate = async () => {
    const name = categoryConfig[createCategory]?.label || createCategory;
    const body: Record<string, string> = { standard_name: name, category: createCategory };
    if (createCategory === '品类标准' && createProductCategory) body.product_category = createProductCategory;
    if (createCategory === '品类标准' && createProduct) body.product = createProduct;
    const res = await fetch('/api/standards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.code === 0) {
      setCreateDialogOpen(false);
      setCreateProductCategory('');
      setCreateProduct('');
      window.location.href = `/standards/${data.data.id}`;
    }
  };

  const handleImport = async () => {
    if (!selectedFile) return;
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('standard_name', categoryConfig[importForm.category]?.label || importForm.category);
      formData.append('category', importForm.category);
      if (importForm.product_category) formData.append('product_category', importForm.product_category);
      if (importForm.product) formData.append('product', importForm.product);
      if (importForm.description) formData.append('description', importForm.description);
      const res = await fetch('/api/standards/import', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.code === 0) {
        toast.success(data.message || '导入成功');
        setImportDialogOpen(false);
        setImportForm({ category: '通用标准', product_category: '', product: '', description: '' });
        setSelectedFile(null);
        fetchStandards();
      } else {
        toast.error(data.message || '导入失败');
      }
    } catch { toast.error('导入失败'); } finally { setImporting(false); }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const ext = file.name.toLowerCase();
      if (!ext.endsWith('.pdf') && !ext.endsWith('.xlsx') && !ext.endsWith('.xls') && !ext.endsWith('.csv')) {
        toast.error('仅支持PDF或Excel文件'); return;
      }
      setSelectedFile(file);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  };
  const toggleSelectAll = () => {
    setSelectedIds(prev => prev.size === standards.length ? new Set() : new Set(standards.map(s => s.id)));
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    setDeleting(true);
    try {
      await Promise.all(Array.from(selectedIds).map(id => fetch(`/api/standards/${id}`, { method: 'DELETE' }).then(r => r.json())));
      toast.success(`已删除 ${selectedIds.size} 项标准`);
      setSelectedIds(new Set());
      setDeleteDialogOpen(false);
      fetchStandards();
    } catch { toast.error('批量删除失败'); } finally { setDeleting(false); }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold">体验标准</h2>
          <Badge variant="secondary" className="text-[10px]">{standards.length}</Badge>
        </div>
        <div className="flex gap-2">
          {selectedIds.size > 0 && (
            <Button size="sm" variant="destructive" className="h-7 text-xs shrink-0" onClick={() => setDeleteDialogOpen(true)}>
              <Trash2 className="h-3 w-3 mr-1" /> 删除({selectedIds.size})
            </Button>
          )}
          {isAdmin && (
            <>
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1 shrink-0" onClick={() => setImportDialogOpen(true)}>
                <Upload className="h-3 w-3" /> 批量导入
              </Button>
              <Button size="sm" className="h-7 text-xs gap-1 shrink-0" onClick={() => setCreateDialogOpen(true)}>
                <Plus className="h-3 w-3" /> 新建标准
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="搜索标准..." className="pl-9 h-8 text-xs" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
        </div>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-28 h-8 text-xs"><SelectValue placeholder="全部分类" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部分类</SelectItem>
            {Object.entries(categoryConfig).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* List - card style matching RecipeLibrarySection */}
      {loading ? (
        <div className="grid gap-2">{[1,2,3].map(i => <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />)}</div>
      ) : standards.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center py-8 text-center">
          <BookOpen className="h-8 w-8 text-muted-foreground/50 mb-2" />
          <p className="text-xs text-muted-foreground">暂无标准</p>
        </CardContent></Card>
      ) : (
        <div className="grid gap-2">
          {isAdmin && (
            <div className="flex items-center gap-3 px-1">
              <Checkbox checked={selectedIds.size === standards.length && standards.length > 0} onCheckedChange={toggleSelectAll} className="h-4 w-4" />
              <span className="text-xs text-muted-foreground">{selectedIds.size > 0 ? `已选 ${selectedIds.size} 项` : '全选'}</span>
            </div>
          )}
          {standards.map((std) => (
            <div key={std.id} className="flex items-center gap-2">
              {isAdmin && (
                <Checkbox checked={selectedIds.has(std.id)} onCheckedChange={() => toggleSelect(std.id)} className="h-4 w-4 shrink-0" />
              )}
              <Link href={`/standards/${std.id}`} className="flex-1 min-w-0">
                <Card className="hover:bg-muted/30 transition-colors">
                  <CardContent className="p-3 flex items-center gap-3">
                    <Badge variant="secondary" className={cn('text-[9px] shrink-0', categoryConfig[std.category]?.color)}>
                      {categoryConfig[std.category]?.label || std.category}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium truncate">{std.standard_name}</span>
                        {std.product_category && <span className="text-[10px] text-muted-foreground">{std.product_category}{std.product ? ` - ${std.product}` : ''}</span>}
                      </div>
                      <span className="text-[10px] text-muted-foreground">{std.standard_items?.[0]?.count || 0} 项检查项</span>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </CardContent>
                </Card>
              </Link>
            </div>
          ))}
        </div>
      )}

      {/* Create Standard Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>新建标准</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label>选择标准分类</Label>
              <div className="grid gap-2">
                {Object.entries(categoryConfig).map(([key, cfg]) => (
                  <div
                    key={key}
                    className={cn(
                      'p-3 rounded-lg border-2 cursor-pointer transition-colors',
                      createCategory === key ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30'
                    )}
                    onClick={() => { setCreateCategory(key); setCreateProductCategory(''); setCreateProduct(''); }}
                  >
                    <div className="flex items-center gap-2">
                      <Badge className={cn('text-[10px]', cfg.color)}>{cfg.label}</Badge>
                      {key === '食谱功能标准' && <Badge variant="secondary" className="text-[10px]">开发中</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{cfg.desc}</p>
                  </div>
                ))}
              </div>
            </div>
            {createCategory === '品类标准' && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>品类 *</Label>
                  <Select value={createProductCategory} onValueChange={(v) => { setCreateProductCategory(v); setCreateProduct(''); }}>
                    <SelectTrigger><SelectValue placeholder="选择品类" /></SelectTrigger>
                    <SelectContent>
                      {categories.map(cat => <SelectItem key={cat.id} value={cat.name}>{cat.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>产品 *</Label>
                  <Select value={createProduct} onValueChange={setCreateProduct} disabled={!createProductCategory}>
                    <SelectTrigger><SelectValue placeholder={createProductCategory ? '选择产品' : '请先选择品类'} /></SelectTrigger>
                    <SelectContent>
                      {(categories.find(c => c.name === createProductCategory)?.products || []).map(p => (
                        <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
            <Button onClick={handleCreate} className="w-full" disabled={createCategory === '食谱功能标准' || (createCategory === '品类标准' && (!createProductCategory || !createProduct))}>
              创建并编辑
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Import Dialog */}
      <Dialog open={importDialogOpen} onOpenChange={(open) => { setImportDialogOpen(open); if (!open) setSelectedFile(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>批量导入标准</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label>标准分类</Label>
              <Select value={importForm.category} onValueChange={(v) => setImportForm({ ...importForm, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="通用标准">通用标准</SelectItem>
                  <SelectItem value="品类标准">品类标准</SelectItem>
                  <SelectItem value="感官评价标准">感官评价标准</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {importForm.category === '品类标准' && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>品类</Label>
                  <Select value={importForm.product_category} onValueChange={(v) => setImportForm({ ...importForm, product_category: v, product: '' })}>
                    <SelectTrigger><SelectValue placeholder="选择品类" /></SelectTrigger>
                    <SelectContent>
                      {categories.map(cat => <SelectItem key={cat.id} value={cat.name}>{cat.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>产品</Label>
                  <Select value={importForm.product} onValueChange={(v) => setImportForm({ ...importForm, product: v })} disabled={!importForm.product_category}>
                    <SelectTrigger><SelectValue placeholder={importForm.product_category ? '选择产品' : '请先选择品类'} /></SelectTrigger>
                    <SelectContent>
                      {(categories.find(c => c.name === importForm.product_category)?.products || []).map(p => (
                        <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>选择文件 *</Label>
              <div
                className={cn('border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors', selectedFile ? 'border-primary/50 bg-primary/5' : 'border-border hover:border-primary/30')}
                onClick={() => fileInputRef.current?.click()}
              >
                {selectedFile ? (
                  <div className="flex items-center justify-center gap-2"><FileUp className="h-5 w-5 text-primary" /><span className="text-sm font-medium">{selectedFile.name}</span></div>
                ) : (
                  <div><Upload className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" /><p className="text-sm text-muted-foreground">点击上传</p><p className="text-xs text-muted-foreground mt-1">PDF / Excel</p></div>
                )}
              </div>
              <input ref={fileInputRef} type="file" className="hidden" accept=".pdf,.xlsx,.xls,.csv" onChange={handleFileChange} />
            </div>
            {importing && <div className="flex items-center justify-center gap-2 py-2"><Loader2 className="h-4 w-4 animate-spin" /><span className="text-sm text-muted-foreground">正在解析导入...</span></div>}
            <Button onClick={handleImport} className="w-full" disabled={!selectedFile || importing}>{importing ? '导入中...' : '开始导入'}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Batch Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>确认删除</DialogTitle><DialogDescription>确定要删除选中的 {selectedIds.size} 项标准吗？此操作不可撤销。</DialogDescription></DialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={deleting}>取消</Button>
            <Button variant="destructive" onClick={handleBatchDelete} disabled={deleting}>
              {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Trash2 className="h-4 w-4 mr-1" />}确认删除
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── Main Page ── */
export default function StandardsPage() {
  const { isAdmin } = useAuth();
  const [categories, setCategories] = useState<CategoryWithProducts[]>([]);
  const [activeSection, setActiveSection] = useState<'standards' | 'recipes'>('standards');

  const fetchCategories = useCallback(async () => {
    const res = await fetch('/api/categories');
    const data = await res.json();
    if (data.code === 0) setCategories(data.data || []);
  }, []);

  useEffect(() => { fetchCategories(); }, [fetchCategories]);

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div>
        <h1 className="text-xl lg:text-2xl font-semibold">标准管理</h1>
        <p className="text-sm text-muted-foreground mt-1">管理和维护体验标准库与食谱库</p>
      </div>

      {/* Section Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveSection('standards')}
          className={cn(
            'flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
            activeSection === 'standards' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
          )}
        >
          <BookOpen className="h-4 w-4" /> 体验标准
        </button>
        <button
          onClick={() => setActiveSection('recipes')}
          className={cn(
            'flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
            activeSection === 'recipes' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
          )}
        >
          <ChefHat className="h-4 w-4" /> 食谱库
        </button>
      </div>

      {/* Section Content */}
      {activeSection === 'standards' && (
        <ExperienceStandardsSection categories={categories} isAdmin={isAdmin} />
      )}
      {activeSection === 'recipes' && (
        <RecipeLibrarySection categories={categories} isAdmin={isAdmin} />
      )}
    </div>
  );
}
