'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import { Search, BookOpen, ChevronRight, Upload, FileUp, Loader2, Trash2, Plus, ChefHat } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
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

function RecipeLibrarySection({ categories, isAdmin }: { categories: CategoryWithProducts[]; isAdmin: boolean }) {
  const [recipes, setRecipes] = useState<RecipeLibItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState('');
  const [filterProduct, setFilterProduct] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ name: '', product_category: '', product: '', ingredients: '', recipe_type: '食谱' });

  const fetchRecipes = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterCategory) params.set('product_category', filterCategory);
    if (filterProduct) params.set('product', filterProduct);
    const res = await fetch(`/api/recipe-library?${params}`);
    const data = await res.json();
    if (data.code === 0) setRecipes(data.data || []);
    setLoading(false);
  };

  useEffect(() => { fetchRecipes(); }, [filterCategory, filterProduct]);

  const handleAdd = async () => {
    const res = await fetch('/api/recipe-library', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...addForm, steps: [] }),
    });
    const data = await res.json();
    if (data.code === 0) {
      setAddOpen(false);
      setAddForm({ name: '', product_category: '', product: '', ingredients: '', recipe_type: '食谱' });
      fetchRecipes();
      toast.success('食谱已添加');
    } else toast.error(data.message);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除此食谱？')) return;
    const res = await fetch(`/api/recipe-library/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.code === 0) { fetchRecipes(); toast.success('已删除'); }
    else toast.error(data.message);
  };

  const selectedCat = categories.find(c => c.name === filterCategory);

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

      {/* List */}
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
            <Card key={recipe.id} className="hover:bg-muted/30 transition-colors">
              <CardContent className="p-3 flex items-center gap-3">
                <Badge variant="secondary" className={cn('text-[9px] shrink-0', recipe.recipe_type === '食谱' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700')}>
                  {recipe.recipe_type}
                </Badge>
                <div className="flex-1 min-w-0">
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
                {isAdmin && (
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => handleDelete(recipe.id)}>
                    <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>添加食谱到库</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
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
                    {(categories.find(c => c.name === addForm.product_category)?.products || []).map(p => (
                      <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>
                    ))}
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
            <Button onClick={handleAdd} className="w-full" disabled={!addForm.name}>保存</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function StandardsPage() {
  const { isAdmin } = useAuth();
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
  const [categories, setCategories] = useState<CategoryWithProducts[]>([]);

  // Fetch categories for cascade
  const fetchCategories = useCallback(async () => {
    const res = await fetch('/api/categories');
    const data = await res.json();
    if (data.code === 0) setCategories(data.data || []);
  }, []);

  useEffect(() => { fetchCategories(); }, [fetchCategories]);

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
    <div className="p-4 lg:p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-semibold">标准管理</h1>
          <p className="text-sm text-muted-foreground mt-1">管理和维护体验标准库</p>
        </div>
        <div className="flex gap-2">
          {selectedIds.size > 0 && (
            <Button size="sm" variant="destructive" className="shrink-0" onClick={() => setDeleteDialogOpen(true)}>
              <Trash2 className="h-4 w-4 mr-1.5" /> 删除({selectedIds.size})
            </Button>
          )}
          {isAdmin && (
            <>
              <Button size="sm" variant="outline" className="shrink-0" onClick={() => setImportDialogOpen(true)}>
                <Upload className="h-4 w-4 mr-1.5" /> 批量导入
              </Button>
              <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
                <Button size="sm" className="shrink-0" onClick={() => setCreateDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-1.5" /> 新建标准
                </Button>
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
            </>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="搜索标准..." className="pl-9" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
        </div>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="全部分类" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部分类</SelectItem>
            {Object.entries(categoryConfig).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      {loading ? (
        <div className="grid gap-3">{[1,2,3].map(i => <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />)}</div>
      ) : standards.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center py-12 text-center">
          <BookOpen className="h-10 w-10 text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground">暂无标准</p>
        </CardContent></Card>
      ) : (
        <div className="grid gap-3">
          <div className="flex items-center gap-3 px-1">
            <Checkbox checked={selectedIds.size === standards.length && standards.length > 0} onCheckedChange={toggleSelectAll} className="h-4 w-4" />
            <span className="text-xs text-muted-foreground">{selectedIds.size > 0 ? `已选 ${selectedIds.size} 项` : '全选'}</span>
          </div>
          {standards.map((std) => (
            <div key={std.id} className="flex items-center gap-2">
              <Checkbox checked={selectedIds.has(std.id)} onCheckedChange={() => toggleSelect(std.id)} className="h-4 w-4 shrink-0" />
              <Link href={`/standards/${std.id}`} className="flex-1 min-w-0">
                <Card className="hover:bg-muted/30 transition-colors">
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-medium truncate">{std.standard_name}</h3>
                        <Badge variant="secondary" className={cn('text-[10px]', categoryConfig[std.category]?.color)}>
                          {categoryConfig[std.category]?.label || std.category}
                        </Badge>
                        {std.product_category && <span className="text-[10px] text-muted-foreground">{std.product_category}{std.product ? ` - ${std.product}` : ''}</span>}
                      </div>
                      <span className="text-xs text-muted-foreground">{std.standard_items?.[0]?.count || 0} 项检查项</span>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </CardContent>
                </Card>
              </Link>
            </div>
          ))}
        </div>
      )}

      {/* Recipe Library Section */}
      <RecipeLibrarySection categories={categories} isAdmin={isAdmin} />

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
