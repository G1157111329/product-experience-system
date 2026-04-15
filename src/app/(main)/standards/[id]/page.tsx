'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Trash2, Edit2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

interface StandardItem {
  id: string;
  sort_order: number;
  sensory_dimension: string | null;
  test_phase: string | null;
  check_dimension: string | null;
  check_item: string;
  check_requirement: string | null;
  measurement_position: string | null;
  check_tool: string | null;
  standard_a: string | null;
  standard_b: string | null;
  standard_c: string | null;
  problem_level: string | null;
}

interface Standard {
  id: string;
  standard_name: string;
  category: string;
  product_category: string | null;
  version: string;
  description: string | null;
  standard_items: StandardItem[];
}

const sensoryColors: Record<string, string> = {
  '视觉': 'bg-blue-100 text-blue-700',
  '听觉': 'bg-purple-100 text-purple-700',
  '触觉': 'bg-amber-100 text-amber-700',
  '嗅觉': 'bg-emerald-100 text-emerald-700',
  '味觉': 'bg-rose-100 text-rose-700',
};

export default function StandardDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [standard, setStandard] = useState<Standard | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    sensory_dimension: '',
    test_phase: '',
    check_dimension: '',
    check_item: '',
    check_requirement: '',
    measurement_position: '',
    check_tool: '',
    standard_a: '',
    standard_b: '',
    standard_c: '',
    problem_level: '一般',
  });

  useEffect(() => {
    fetch(`/api/standards/${id}`)
      .then((r) => r.json())
      .then((res) => {
        if (res.code === 0) setStandard(res.data);
      })
      .finally(() => setLoading(false));
  }, [id]);

  const handleAddItem = async () => {
    const res = await fetch('/api/standard-items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        standard_id: id,
        sort_order: (standard?.standard_items?.length || 0) + 1,
        ...form,
      }),
    });
    const data = await res.json();
    if (data.code === 0) {
      setDialogOpen(false);
      // Refresh
      const refresh = await fetch(`/api/standards/${id}`);
      const refreshData = await refresh.json();
      if (refreshData.code === 0) setStandard(refreshData.data);
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    await fetch(`/api/standard-items/${itemId}`, { method: 'DELETE' });
    const refresh = await fetch(`/api/standards/${id}`);
    const refreshData = await refresh.json();
    if (refreshData.code === 0) setStandard(refreshData.data);
  };

  if (loading) {
    return <div className="p-6 animate-pulse space-y-4"><div className="h-8 bg-muted rounded w-64" /><div className="h-40 bg-muted rounded" /></div>;
  }

  if (!standard) return <div className="p-6">标准不存在</div>;

  // Group items by sensory dimension
  const grouped = (standard.standard_items || []).reduce<Record<string, StandardItem[]>>((acc, item) => {
    const key = item.sensory_dimension || '未分类';
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  return (
    <div className="p-4 lg:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" className="shrink-0" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-semibold truncate">{standard.standard_name}</h1>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <Badge variant="secondary">{standard.category}</Badge>
            <span className="text-xs text-muted-foreground">{standard.version}</span>
            {standard.product_category && (
              <span className="text-xs text-muted-foreground">品类: {standard.product_category}</span>
            )}
            <span className="text-xs text-muted-foreground">{standard.standard_items?.length || 0} 检查项</span>
          </div>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1.5" /> 添加检查项</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>添加检查项</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 mt-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>感官维度</Label>
                  <Select value={form.sensory_dimension} onValueChange={(v) => setForm({ ...form, sensory_dimension: v })}>
                    <SelectTrigger><SelectValue placeholder="选择" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="视觉">视觉</SelectItem>
                      <SelectItem value="听觉">听觉</SelectItem>
                      <SelectItem value="触觉">触觉</SelectItem>
                      <SelectItem value="嗅觉">嗅觉</SelectItem>
                      <SelectItem value="味觉">味觉</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>体验阶段</Label>
                  <Input placeholder="如：开箱" value={form.test_phase} onChange={(e) => setForm({ ...form, test_phase: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>检查维度</Label>
                  <Input placeholder="如：间隙" value={form.check_dimension} onChange={(e) => setForm({ ...form, check_dimension: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>问题等级</Label>
                  <Select value={form.problem_level} onValueChange={(v) => setForm({ ...form, problem_level: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="致命">致命</SelectItem>
                      <SelectItem value="严重">严重</SelectItem>
                      <SelectItem value="一般">一般</SelectItem>
                      <SelectItem value="轻微">轻微</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>检查条目 *</Label>
                <Input placeholder="具体检查内容" value={form.check_item} onChange={(e) => setForm({ ...form, check_item: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>检查要求</Label>
                <Textarea placeholder="合格判定标准" value={form.check_requirement} onChange={(e) => setForm({ ...form, check_requirement: e.target.value })} rows={2} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>测量位置</Label>
                  <Input placeholder="如：产品外包装" value={form.measurement_position} onChange={(e) => setForm({ ...form, measurement_position: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>检查工具</Label>
                  <Input placeholder="如：目视、卡尺" value={form.check_tool} onChange={(e) => setForm({ ...form, check_tool: e.target.value })} />
                </div>
              </div>
              <Separator />
              <p className="text-xs text-muted-foreground">面标准（可选）</p>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>A面标准</Label>
                  <Input value={form.standard_a} onChange={(e) => setForm({ ...form, standard_a: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>B面标准</Label>
                  <Input value={form.standard_b} onChange={(e) => setForm({ ...form, standard_b: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>C面标准</Label>
                  <Input value={form.standard_c} onChange={(e) => setForm({ ...form, standard_c: e.target.value })} />
                </div>
              </div>
              <Button onClick={handleAddItem} className="w-full" disabled={!form.check_item}>
                添加检查项
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Items grouped by sensory dimension */}
      {Object.entries(grouped).map(([dimension, items]) => (
        <Card key={dimension}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Badge className={cn('text-[10px]', sensoryColors[dimension] || 'bg-muted text-muted-foreground')}>
                {dimension}
              </Badge>
              <span className="text-muted-foreground">{items.length} 项</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors group"
              >
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{item.check_item}</span>
                    {item.test_phase && (
                      <span className="text-[10px] text-muted-foreground bg-background px-1.5 py-0.5 rounded">
                        {item.test_phase}
                      </span>
                    )}
                    {item.check_dimension && (
                      <span className="text-[10px] text-muted-foreground bg-background px-1.5 py-0.5 rounded">
                        {item.check_dimension}
                      </span>
                    )}
                  </div>
                  {item.check_requirement && (
                    <p className="text-xs text-muted-foreground">{item.check_requirement}</p>
                  )}
                  <div className="flex items-center gap-2 flex-wrap">
                    {item.check_tool && (
                      <span className="text-[10px] text-muted-foreground">工具: {item.check_tool}</span>
                    )}
                    {item.problem_level && (
                      <Badge variant="secondary" className="text-[10px] h-4">{item.problem_level}</Badge>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                  onClick={() => handleDeleteItem(item.id)}
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      {Object.keys(grouped).length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center py-12 text-center">
            <p className="text-sm text-muted-foreground">暂无检查项</p>
            <p className="text-xs text-muted-foreground mt-1">点击&quot;添加检查项&quot;开始定义标准</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
