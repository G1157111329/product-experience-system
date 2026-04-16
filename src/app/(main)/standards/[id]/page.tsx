'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Trash2, Edit2, Save, Shield, Lock } from 'lucide-react';
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
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth-context';

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

const emptyItemForm = {
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
};

export default function StandardDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { isAdmin } = useAuth();
  const [standard, setStandard] = useState<Standard | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ ...emptyItemForm });
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ ...emptyItemForm });

  // Standard header edit
  const [editingHeader, setEditingHeader] = useState(false);
  const [headerForm, setHeaderForm] = useState({
    standard_name: '',
    category: '',
    product_category: '',
    description: '',
  });

  const fetchStandard = async () => {
    const res = await fetch(`/api/standards/${id}`);
    const data = await res.json();
    if (data.code === 0) {
      setStandard(data.data);
      setHeaderForm({
        standard_name: data.data.standard_name || '',
        category: data.data.category || '',
        product_category: data.data.product_category || '',
        description: data.data.description || '',
      });
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchStandard();
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
      setForm({ ...emptyItemForm });
      toast.success('检查项已添加');
      fetchStandard();
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    await fetch(`/api/standard-items/${itemId}`, { method: 'DELETE' });
    toast.success('检查项已删除');
    fetchStandard();
  };

  const handleUpdateItem = async (itemId: string) => {
    const res = await fetch(`/api/standard-items/${itemId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    });
    const data = await res.json();
    if (data.code === 0) {
      setEditingItemId(null);
      toast.success('检查项已更新');
      fetchStandard();
    }
  };

  const handleSaveHeader = async () => {
    const res = await fetch(`/api/standards/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(headerForm),
    });
    const data = await res.json();
    if (data.code === 0) {
      setEditingHeader(false);
      toast.success('标准信息已更新');
      fetchStandard();
    }
  };

  const startEditItem = (item: StandardItem) => {
    setEditingItemId(item.id);
    setEditForm({
      sensory_dimension: item.sensory_dimension || '',
      test_phase: item.test_phase || '',
      check_dimension: item.check_dimension || '',
      check_item: item.check_item || '',
      check_requirement: item.check_requirement || '',
      measurement_position: item.measurement_position || '',
      check_tool: item.check_tool || '',
      standard_a: item.standard_a || '',
      standard_b: item.standard_b || '',
      standard_c: item.standard_c || '',
      problem_level: item.problem_level || '一般',
    });
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
          {editingHeader && isAdmin ? (
            <div className="space-y-3">
              <Input
                value={headerForm.standard_name}
                onChange={(e) => setHeaderForm({ ...headerForm, standard_name: e.target.value })}
                className="text-lg font-semibold"
              />
              <div className="grid grid-cols-2 gap-3">
                <Select value={headerForm.category} onValueChange={(v) => setHeaderForm({ ...headerForm, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="通用标准">通用标准</SelectItem>
                    <SelectItem value="品类专用标准">品类专用标准</SelectItem>
                    <SelectItem value="感官评价标准">感官评价标准</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  placeholder="关联品类"
                  value={headerForm.product_category}
                  onChange={(e) => setHeaderForm({ ...headerForm, product_category: e.target.value })}
                />
              </div>
              <Textarea
                placeholder="标准描述"
                value={headerForm.description}
                onChange={(e) => setHeaderForm({ ...headerForm, description: e.target.value })}
                rows={2}
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSaveHeader}><Save className="h-3.5 w-3.5 mr-1" /> 保存</Button>
                <Button size="sm" variant="outline" onClick={() => setEditingHeader(false)}>取消</Button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-semibold truncate">{standard.standard_name}</h1>
                {isAdmin && (
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setEditingHeader(true)}>
                    <Edit2 className="h-3.5 w-3.5" />
                  </Button>
                )}
                {!isAdmin && (
                  <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                )}
              </div>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <Badge variant="secondary">{standard.category}</Badge>
                <span className="text-xs text-muted-foreground">{standard.version}</span>
                {standard.product_category && (
                  <span className="text-xs text-muted-foreground">品类: {standard.product_category}</span>
                )}
                <span className="text-xs text-muted-foreground">{standard.standard_items?.length || 0} 检查项</span>
                {!isAdmin && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1"><Shield className="h-3 w-3" /> 只读</span>
                )}
              </div>
            </>
          )}
        </div>
        {isAdmin && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" /> 添加检查项
            </Button>
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
        )}
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
                {editingItemId === item.id && isAdmin ? (
                  /* Edit mode */
                  <div className="flex-1 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <Select value={editForm.sensory_dimension} onValueChange={(v) => setEditForm({ ...editForm, sensory_dimension: v })}>
                        <SelectTrigger><SelectValue placeholder="感官维度" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="视觉">视觉</SelectItem>
                          <SelectItem value="听觉">听觉</SelectItem>
                          <SelectItem value="触觉">触觉</SelectItem>
                          <SelectItem value="嗅觉">嗅觉</SelectItem>
                          <SelectItem value="味觉">味觉</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input placeholder="体验阶段" value={editForm.test_phase} onChange={(e) => setEditForm({ ...editForm, test_phase: e.target.value })} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <Input placeholder="检查维度" value={editForm.check_dimension} onChange={(e) => setEditForm({ ...editForm, check_dimension: e.target.value })} />
                      <Select value={editForm.problem_level} onValueChange={(v) => setEditForm({ ...editForm, problem_level: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="致命">致命</SelectItem>
                          <SelectItem value="严重">严重</SelectItem>
                          <SelectItem value="一般">一般</SelectItem>
                          <SelectItem value="轻微">轻微</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Input placeholder="检查条目" value={editForm.check_item} onChange={(e) => setEditForm({ ...editForm, check_item: e.target.value })} />
                    <Textarea placeholder="检查要求" value={editForm.check_requirement} onChange={(e) => setEditForm({ ...editForm, check_requirement: e.target.value })} rows={2} />
                    <div className="grid grid-cols-2 gap-3">
                      <Input placeholder="测量位置" value={editForm.measurement_position} onChange={(e) => setEditForm({ ...editForm, measurement_position: e.target.value })} />
                      <Input placeholder="检查工具" value={editForm.check_tool} onChange={(e) => setEditForm({ ...editForm, check_tool: e.target.value })} />
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <Input placeholder="A面标准" value={editForm.standard_a} onChange={(e) => setEditForm({ ...editForm, standard_a: e.target.value })} />
                      <Input placeholder="B面标准" value={editForm.standard_b} onChange={(e) => setEditForm({ ...editForm, standard_b: e.target.value })} />
                      <Input placeholder="C面标准" value={editForm.standard_c} onChange={(e) => setEditForm({ ...editForm, standard_c: e.target.value })} />
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => handleUpdateItem(item.id)}><Save className="h-3.5 w-3.5 mr-1" /> 保存</Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingItemId(null)}>取消</Button>
                    </div>
                  </div>
                ) : (
                  /* View mode */
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{item.check_item}</span>
                      {item.test_phase && (
                        <span className="text-[10px] text-muted-foreground bg-background px-1.5 py-0.5 rounded">{item.test_phase}</span>
                      )}
                      {item.check_dimension && (
                        <span className="text-[10px] text-muted-foreground bg-background px-1.5 py-0.5 rounded">{item.check_dimension}</span>
                      )}
                    </div>
                    {item.check_requirement && (
                      <p className="text-xs text-muted-foreground">{item.check_requirement}</p>
                    )}
                    {item.measurement_position && (
                      <p className="text-xs text-muted-foreground">位置: {item.measurement_position}</p>
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
                )}
                {isAdmin && editingItemId !== item.id && (
                  <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEditItem(item)}>
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDeleteItem(item.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      {Object.keys(grouped).length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center py-12 text-center">
            <p className="text-sm text-muted-foreground">暂无检查项</p>
            <p className="text-xs text-muted-foreground mt-1">
              {isAdmin ? '点击"添加检查项"开始定义标准' : '标准暂无检查项'}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
