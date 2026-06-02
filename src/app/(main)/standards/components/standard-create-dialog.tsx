'use client';

import { useState, useRef } from 'react';
import { Upload, FileUp, Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { CategoryWithProducts } from '../types';
import { categoryConfig } from '../types';

async function readApiJson<T = { code: number; message?: string }>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text.trim()) {
    throw new Error(response.ok ? '接口未返回数据' : `接口请求失败(${response.status})`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(response.ok ? '接口返回格式异常' : `接口请求失败(${response.status})`);
  }
}

type StandardCreateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: CategoryWithProducts[];
  onAdded?: () => void;
};

export function StandardCreateDialog({ open, onOpenChange, categories, onAdded }: StandardCreateDialogProps) {
  const [createCategory, setCreateCategory] = useState('通用标准');
  const [createProductCategory, setCreateProductCategory] = useState('');
  const [createProduct, setCreateProduct] = useState('');

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
    const data = await readApiJson<{ code: number; message?: string; data: { id: string } }>(res);
    if (data.code === 0) {
      onOpenChange(false);
      setCreateProductCategory('');
      setCreateProduct('');
      onAdded?.();
      window.location.href = `/standards/${data.data.id}`;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
                    <span className={cn('text-[10px] px-1.5 py-0.5 rounded', cfg.color)}>{cfg.label}</span>
                    {key === '食谱功能标准' && <span className="text-[10px] text-muted-foreground">开发中</span>}
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
            <Plus className="h-4 w-4 mr-1" /> 创建并编辑
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type StandardImportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: CategoryWithProducts[];
  onImported: () => void;
};

export function StandardImportDialog({ open, onOpenChange, categories, onImported }: StandardImportDialogProps) {
  const [importForm, setImportForm] = useState({ category: '通用标准', product_category: '', product: '', description: '' });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      const data = await readApiJson(res);
      if (data.code === 0) {
        toast.success(data.message || '导入成功');
        onOpenChange(false);
        setImportForm({ category: '通用标准', product_category: '', product: '', description: '' });
        setSelectedFile(null);
        onImported();
      } else {
        toast.error(data.message || '导入失败');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '导入失败');
    } finally { setImporting(false); }
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

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setSelectedFile(null); }}>
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
  );
}
