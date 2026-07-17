'use client';

/* eslint-disable @next/next/no-img-element */

import { useState } from 'react';
import { Loader2, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import type { CategoryWithProducts, RecipeLibItem } from '../types';

/* ── Add Dialog ── */
type RecipeAddDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: CategoryWithProducts[];
  onAdded: () => void;
};

export function RecipeAddDialog({ open, onOpenChange, categories, onAdded }: RecipeAddDialogProps) {
  const [addForm, setAddForm] = useState({ name: '', product_category: '', product: '', ingredients: '', recipe_type: '食谱' });
  const [addSteps, setAddSteps] = useState<Array<{ step_number: number; operation: string; imageFiles: File[] }>>([]);
  const [addStepOp, setAddStepOp] = useState('');
  const [addingRecipe, setAddingRecipe] = useState(false);

  const addSelectedCat = categories.find(c => c.name === addForm.product_category);

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
      const res = await fetch('/api/recipe-library', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...addForm, name: addForm.name.trim() }),
      });
      const data = await res.json();
      if (data.code !== 0) { toast.error(data.message); return; }

      const recipeId = data.data.id;
      for (const step of addSteps) {
        const stepRes = await fetch('/api/recipe-library-steps', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recipe_library_id: recipeId, step_number: step.step_number, operation: step.operation }),
        });
        const stepData = await stepRes.json();
        if (stepData.code === 0 && stepData.data?.id) {
          for (const file of step.imageFiles) {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('recipe_library_step_id', stepData.data.id);
            await fetch('/api/materials/upload', { method: 'POST', body: formData });
          }
        }
      }

      onOpenChange(false);
      setAddForm({ name: '', product_category: '', product: '', ingredients: '', recipe_type: '食谱' });
      setAddSteps([]);
      setAddStepOp('');
      onAdded();
      toast.success('食谱已添加');
    } finally { setAddingRecipe(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { setAddSteps([]); setAddStepOp(''); } }}>
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

            <div className="space-y-2">
              <Label className="text-sm font-medium">步骤</Label>
              {addSteps.length > 0 && (
                <div className="space-y-2">
                  {addSteps.map((step, idx) => (
                    <div key={idx} className="border rounded-lg p-2 space-y-1">
                      <div className="flex items-center justify-between">
                        <Badge variant="outline" className="text-xs">步骤{step.step_number}</Badge>
                        <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => handleRemoveAddStep(idx)}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                      <div className="text-xs">{step.operation}</div>
                      {step.imageFiles.length > 0 && (
                        <div className="flex gap-1 flex-wrap">
                          {step.imageFiles.map((f, fi) => (
                            <div key={fi} className="w-10 h-10 rounded border overflow-hidden">
                              <img src={URL.createObjectURL(f)} alt={f.name} className="w-full h-full object-cover" />
                            </div>
                          ))}
                        </div>
                      )}
                      <label className="inline-flex items-center gap-1 text-xs text-primary cursor-pointer hover:underline">
                        <Plus className="h-3 w-3" /> 添加图片
                        <input type="file" accept="image/*,video/*" className="hidden"
                          onChange={e => { const f = e.target.files?.[0]; if (f) handleAddStepImage(idx, f); }} />
                      </label>
                    </div>
                  ))}
                </div>
              )}
              <div className="border rounded-lg p-2 space-y-2 bg-muted/30">
                <Input className="h-7 text-xs" value={addStepOp} onChange={e => setAddStepOp(e.target.value)}
                  placeholder="操作描述 *" onKeyDown={e => { if (e.key === 'Enter' && addStepOp.trim()) handleAddStepInDialog(); }} />
                <div className="flex items-center gap-2">
                  <label className="inline-flex items-center gap-1 text-xs text-primary cursor-pointer hover:underline shrink-0">
                    <Plus className="h-3 w-3" /> 上传图片
                    <input type="file" accept="image/*,video/*" className="hidden"
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
  );
}

/* ── Edit Dialog ── */
type RecipeEditDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipe: RecipeLibItem | null;
  categories: CategoryWithProducts[];
  onSaved: () => void;
};

export function RecipeEditDialog({ open, onOpenChange, recipe, categories, onSaved }: RecipeEditDialogProps) {
  const [editForm, setEditForm] = useState({ name: '', product_category: '', product: '', ingredients: '', recipe_type: '食谱' });

  // Sync form when recipe changes
  if (recipe && editForm.name !== recipe.name && open) {
    setEditForm({
      name: recipe.name,
      product_category: recipe.product_category || '',
      product: recipe.product || '',
      ingredients: recipe.ingredients || '',
      recipe_type: recipe.recipe_type || '食谱',
    });
  }

  const editSelectedCat = categories.find(c => c.name === editForm.product_category);

  const handleSaveEdit = async () => {
    if (!recipe) return;
    const res = await fetch(`/api/recipe-library/${recipe.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    });
    const data = await res.json();
    if (data.code === 0) {
      onOpenChange(false);
      onSaved();
      toast.success('已更新');
    } else toast.error(data.message);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
  );
}
