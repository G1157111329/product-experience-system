'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { Plus, Search, BookOpen, ChevronRight, Upload, FileUp, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface Standard {
  id: string;
  standard_name: string;
  category: string;
  product_category: string | null;
  version: string;
  is_active: boolean;
  description: string | null;
  created_at: string;
  standard_items: Array<{ count: number }>;
}

const categoryMap: Record<string, { label: string; color: string }> = {
  '通用标准': { label: '通用', color: 'bg-blue-100 text-blue-700' },
  '品类专用标准': { label: '品类专用', color: 'bg-primary/10 text-primary' },
  '感官评价标准': { label: '感官评价', color: 'bg-amber-100 text-amber-700' },
};

export default function StandardsPage() {
  const [standards, setStandards] = useState<Standard[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    standard_name: '',
    category: '通用标准',
    product_category: '',
    description: '',
  });
  const [importForm, setImportForm] = useState({
    standard_name: '',
    category: '通用标准',
    product_category: '',
    description: '',
  });
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

  useEffect(() => {
    fetchStandards();
  }, [keyword, filterCategory]);

  const handleCreate = async () => {
    const res = await fetch('/api/standards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (data.code === 0) {
      setDialogOpen(false);
      setForm({ standard_name: '', category: '通用标准', product_category: '', description: '' });
      fetchStandards();
    }
  };

  const handleImport = async () => {
    if (!selectedFile || !importForm.standard_name) return;
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('standard_name', importForm.standard_name);
      formData.append('category', importForm.category);
      if (importForm.product_category) formData.append('product_category', importForm.product_category);
      if (importForm.description) formData.append('description', importForm.description);

      const res = await fetch('/api/standards/import', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.code === 0) {
        toast.success(data.message || '导入成功');
        setImportDialogOpen(false);
        setImportForm({ standard_name: '', category: '通用标准', product_category: '', description: '' });
        setSelectedFile(null);
        fetchStandards();
      } else {
        toast.error(data.message || '导入失败');
      }
    } catch {
      toast.error('导入失败，请重试');
    } finally {
      setImporting(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const ext = file.name.toLowerCase();
      if (!ext.endsWith('.pdf') && !ext.endsWith('.xlsx') && !ext.endsWith('.xls') && !ext.endsWith('.csv')) {
        toast.error('仅支持PDF或Excel文件');
        return;
      }
      setSelectedFile(file);
    }
  };

  return (
    <div className="p-4 lg:p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-semibold">标准管理</h1>
          <p className="text-sm text-muted-foreground mt-1">管理和维护体验标准库</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="shrink-0" onClick={() => setImportDialogOpen(true)}>
            <Upload className="h-4 w-4 mr-1.5" /> 批量导入
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <Button size="sm" className="shrink-0" onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" /> 新建标准
            </Button>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>新建体验标准</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <div className="space-y-1.5">
                  <Label>标准名称</Label>
                  <Input
                    placeholder="请输入标准名称"
                    value={form.standard_name}
                    onChange={(e) => setForm({ ...form, standard_name: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>标准分类</Label>
                  <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="通用标准">通用标准</SelectItem>
                      <SelectItem value="品类专用标准">品类专用标准</SelectItem>
                      <SelectItem value="感官评价标准">感官评价标准</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {form.category === '品类专用标准' && (
                  <div className="space-y-1.5">
                    <Label>关联品类</Label>
                    <Input
                      placeholder="如：破壁机、电饭煲"
                      value={form.product_category}
                      onChange={(e) => setForm({ ...form, product_category: e.target.value })}
                    />
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label>描述</Label>
                  <Textarea
                    placeholder="标准说明"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    rows={3}
                  />
                </div>
                <Button onClick={handleCreate} className="w-full" disabled={!form.standard_name}>
                  创建标准
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="搜索标准名称..."
            className="pl-9"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        </div>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="全部分类" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部分类</SelectItem>
            <SelectItem value="通用标准">通用标准</SelectItem>
            <SelectItem value="品类专用标准">品类专用标准</SelectItem>
            <SelectItem value="感官评价标准">感官评价标准</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Standards List */}
      {loading ? (
        <div className="grid gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      ) : standards.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <BookOpen className="h-10 w-10 text-muted-foreground/50 mb-3" />
            <p className="text-sm text-muted-foreground">暂无标准</p>
            <p className="text-xs text-muted-foreground mt-1">创建第一个体验标准或批量导入开始使用</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {standards.map((std) => (
            <Link key={std.id} href={`/standards/${std.id}`}>
              <Card className="hover:bg-muted/30 transition-colors">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-medium truncate">{std.standard_name}</h3>
                      <Badge
                        variant="secondary"
                        className={cn('text-[10px]', categoryMap[std.category]?.color)}
                      >
                        {categoryMap[std.category]?.label || std.category}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">{std.version}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                      {std.product_category && <span>品类: {std.product_category}</span>}
                      <span>{std.standard_items?.[0]?.count || 0} 项检查项</span>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* Import Dialog */}
      <Dialog open={importDialogOpen} onOpenChange={(open) => { setImportDialogOpen(open); if (!open) setSelectedFile(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>批量导入标准</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label>标准名称 *</Label>
              <Input
                placeholder="请输入标准名称"
                value={importForm.standard_name}
                onChange={(e) => setImportForm({ ...importForm, standard_name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>标准分类</Label>
              <Select value={importForm.category} onValueChange={(v) => setImportForm({ ...importForm, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="通用标准">通用标准</SelectItem>
                  <SelectItem value="品类专用标准">品类专用标准</SelectItem>
                  <SelectItem value="感官评价标准">感官评价标准</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {importForm.category === '品类专用标准' && (
              <div className="space-y-1.5">
                <Label>关联品类</Label>
                <Input
                  placeholder="如：破壁机、电饭煲"
                  value={importForm.product_category}
                  onChange={(e) => setImportForm({ ...importForm, product_category: e.target.value })}
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>描述</Label>
              <Textarea
                placeholder="标准说明（可选）"
                value={importForm.description}
                onChange={(e) => setImportForm({ ...importForm, description: e.target.value })}
                rows={2}
              />
            </div>
            <div className="space-y-1.5">
              <Label>选择文件 *</Label>
              <div
                className={cn(
                  'border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors',
                  selectedFile ? 'border-primary/50 bg-primary/5' : 'border-border hover:border-primary/30 hover:bg-muted/30'
                )}
                onClick={() => fileInputRef.current?.click()}
              >
                {selectedFile ? (
                  <div className="flex items-center justify-center gap-2">
                    <FileUp className="h-5 w-5 text-primary" />
                    <span className="text-sm font-medium">{selectedFile.name}</span>
                    <span className="text-xs text-muted-foreground">({(selectedFile.size / 1024).toFixed(1)} KB)</span>
                  </div>
                ) : (
                  <div>
                    <Upload className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">点击上传文件</p>
                    <p className="text-xs text-muted-foreground mt-1">支持 PDF、Excel (.xlsx/.xls)、CSV 格式</p>
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".pdf,.xlsx,.xls,.csv"
                onChange={handleFileChange}
              />
            </div>
            {importing && (
              <div className="flex items-center justify-center gap-2 py-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm text-muted-foreground">正在解析并导入标准...</span>
              </div>
            )}
            <Button onClick={handleImport} className="w-full" disabled={!selectedFile || !importForm.standard_name || importing}>
              {importing ? '导入中...' : '开始导入'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
