'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Search, BookOpen, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
  const [form, setForm] = useState({
    standard_name: '',
    category: '通用标准',
    product_category: '',
    description: '',
  });

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

  return (
    <div className="p-4 lg:p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-semibold">标准管理</h1>
          <p className="text-sm text-muted-foreground mt-1">管理和维护体验标准库</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="shrink-0">
              <Plus className="h-4 w-4 mr-1.5" /> 新建标准
            </Button>
          </DialogTrigger>
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
            <p className="text-xs text-muted-foreground mt-1">创建第一个体验标准开始使用</p>
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
    </div>
  );
}
