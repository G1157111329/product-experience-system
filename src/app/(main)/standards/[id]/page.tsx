'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Trash2, Edit2, Save, Shield, Lock, ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth-context';
import { ImagePreview, useImagePreview } from '@/components/image-preview';

// ── Types ──────────────────────────────────────────────────────────
interface StandardItem {
  id: string;
  sort_order: number;
  sensory_dimension: string | null;
  test_phase: string | null;
  experience_flow: string | null;
  touch_point: string | null;
  check_dimension: string | null;
  sub_check_dimension: string | null;
  check_item: string;
  check_requirement: string | null;
  experience_standard: string | null;
  check_standard: string | null;
  measurement_position: string | null;
  check_tool: string | null;
  problem_level: string | null;
  evaluation_prep: string | null;
  subjective_score: number | null;
  subjective_rating: string | null;
  reference_images: string[] | null;
}

interface Standard { id: string; standard_name: string; category: string; product_category: string | null; version: string; description: string | null; standard_items: StandardItem[]; }

// ── Constants ──────────────────────────────────────────────────────
const defaultSensoryOptions = ['视觉', '听觉', '触觉', '嗅觉', '味觉'];
const defaultPhaseOptions = ['开箱', '首次安装', '产品使用', '清洁收纳', '其他'];
const defaultFlowByPhase: Record<string, string[]> = {
  '开箱': ['拿取外包装', '拆开内包装'],
  '首次安装': ['配件梳理', '外观美观', '外观缺陷', '标识文字', '首次安装'],
  '产品使用': ['放置及组装', '操作交互', '产品运行'],
  '清洁收纳': ['冲水', '擦拭', '晾干', '收纳'],
  '其他': ['其他'],
};
const levelOptions = ['一类', '二类', '三类'];
const sensoryColors: Record<string, string> = {
  '视觉': 'bg-blue-100 text-blue-700', '听觉': 'bg-purple-100 text-purple-700',
  '触觉': 'bg-amber-100 text-amber-700', '嗅觉': 'bg-emerald-100 text-emerald-700',
  '味觉': 'bg-rose-100 text-rose-700',
};

const emptyGeneral = { test_phase: '', experience_flow: '', sensory_dimension: '', touch_point: '', check_requirement: '', experience_standard: '', check_tool: '', problem_level: '一类' };
const emptyCategory = { sensory_dimension: '', check_dimension: '', sub_check_dimension: '', check_item: '', check_requirement: '', check_standard: '' };
const emptySensory = { sensory_dimension: '', evaluation_prep: '', subjective_score: '', subjective_rating: '' };

// ── Component ──────────────────────────────────────────────────────
export default function StandardDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { isAdmin } = useAuth();
  const [standard, setStandard] = useState<Standard | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { previewUrl: _, open: openPreview, PreviewComponent } = useImagePreview();

  // General standard form
  const [generalForm, setGeneralForm] = useState({ ...emptyGeneral });
  // Category standard form
  const [categoryForm, setCategoryForm] = useState({ ...emptyCategory });
  // Sensory standard form
  const [sensoryForm, setSensoryForm] = useState({ ...emptySensory });

  // Editing item
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Record<string, unknown>>({});

  // Dynamic options from platform_settings
  const [phaseOptions, setPhaseOptions] = useState<string[]>(defaultPhaseOptions);
  const [flowByPhase, setFlowByPhase] = useState<Record<string, string[]>>(defaultFlowByPhase);
  const [sensoryOptions, setSensoryOptions] = useState<string[]>(defaultSensoryOptions);

  useEffect(() => {
    fetch('/api/settings?key=standard_options').then(r => r.json()).then(d => {
      if (d.code === 0 && d.data && (d.data.test_phases?.length > 0 || d.data.sensory_dimensions?.length > 0)) {
        setPhaseOptions(d.data.test_phases || defaultPhaseOptions);
        setFlowByPhase(d.data.experience_flows || defaultFlowByPhase);
        setSensoryOptions(d.data.sensory_dimensions || defaultSensoryOptions);
      }
    }).catch(() => {});
  }, []);

  const fetchStandard = async () => {
    const res = await fetch(`/api/standards/${id}`);
    const data = await res.json();
    if (data.code === 0) setStandard(data.data);
    setLoading(false);
  };

  useEffect(() => { fetchStandard(); }, [id]);

  if (loading) return <div className="p-6 animate-pulse space-y-4"><div className="h-8 bg-muted rounded w-64" /><div className="h-40 bg-muted rounded" /></div>;
  if (!standard) return <div className="p-6">标准不存在</div>;

  const category = standard.category;

  // ── Add handlers ───────────────────────────────────────────────
  const handleAddGeneral = async () => {
    const body = { standard_id: id, sort_order: (standard.standard_items?.length || 0) + 1, ...generalForm, check_item: generalForm.touch_point };
    const res = await fetch('/api/standard-items', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if ((await res.json()).code === 0) { setDialogOpen(false); setGeneralForm({ ...emptyGeneral }); toast.success('检查项已添加'); fetchStandard(); }
  };

  const handleAddCategory = async () => {
    const body = { standard_id: id, sort_order: (standard.standard_items?.length || 0) + 1, ...categoryForm };
    const res = await fetch('/api/standard-items', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if ((await res.json()).code === 0) { setDialogOpen(false); setCategoryForm({ ...emptyCategory }); toast.success('检查项已添加'); fetchStandard(); }
  };

  const handleAddSensory = async () => {
    const body = { standard_id: id, sort_order: (standard.standard_items?.length || 0) + 1, ...sensoryForm, check_item: `${sensoryForm.sensory_dimension}评价`, subjective_score: sensoryForm.subjective_score ? parseInt(sensoryForm.subjective_score) : null };
    const res = await fetch('/api/standard-items', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if ((await res.json()).code === 0) { setDialogOpen(false); setSensoryForm({ ...emptySensory }); toast.success('检查项已添加'); fetchStandard(); }
  };

  const handleDeleteItem = async (itemId: string) => {
    await fetch(`/api/standard-items/${itemId}`, { method: 'DELETE' });
    toast.success('已删除'); fetchStandard();
  };

  const handleSaveEdit = async (itemId: string) => {
    const res = await fetch(`/api/standard-items/${itemId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editForm) });
    if ((await res.json()).code === 0) { setEditingItemId(null); toast.success('已更新'); fetchStandard(); }
  };

  const startEdit = (item: StandardItem) => {
    setEditingItemId(item.id);
    if (category === '通用标准') setEditForm({ sensory_dimension: item.sensory_dimension || '', test_phase: item.test_phase || '', experience_flow: item.experience_flow || '', touch_point: item.touch_point || '', check_requirement: item.check_requirement || '', experience_standard: item.experience_standard || '', check_tool: item.check_tool || '', problem_level: item.problem_level || '一类' });
    else if (category === '品类标准') setEditForm({ sensory_dimension: item.sensory_dimension || '', check_dimension: item.check_dimension || '', sub_check_dimension: item.sub_check_dimension || '', check_item: item.check_item || '', check_requirement: item.check_requirement || '', check_standard: item.check_standard || '' });
    else if (category === '感官评价标准') setEditForm({ sensory_dimension: item.sensory_dimension || '', evaluation_prep: item.evaluation_prep || '', subjective_score: item.subjective_score?.toString() || '', subjective_rating: item.subjective_rating || '' });
  };

  // ── Render add dialog form based on category ───────────────────
  const renderAddForm = () => {
    if (category === '通用标准') return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>产品使用阶段</Label>
            <Select value={generalForm.test_phase} onValueChange={(v) => setGeneralForm({ ...generalForm, test_phase: v, experience_flow: '' })}>
              <SelectTrigger><SelectValue placeholder="选择" /></SelectTrigger>
              <SelectContent>{phaseOptions.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>体验流程</Label>
            <Select value={generalForm.experience_flow} onValueChange={(v) => setGeneralForm({ ...generalForm, experience_flow: v })}>
              <SelectTrigger><SelectValue placeholder="选择" /></SelectTrigger>
              <SelectContent>{(flowByPhase[generalForm.test_phase] || []).map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5"><Label>感官维度</Label>
          <Select value={generalForm.sensory_dimension} onValueChange={(v) => setGeneralForm({ ...generalForm, sensory_dimension: v })}>
            <SelectTrigger><SelectValue placeholder="选择" /></SelectTrigger>
            <SelectContent>{sensoryOptions.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5"><Label>触点 *</Label><Input placeholder="如：外箱手提把手" value={generalForm.touch_point} onChange={(e) => setGeneralForm({ ...generalForm, touch_point: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>检验范围及具体要求</Label><Textarea placeholder="具体检查内容和要求" value={generalForm.check_requirement} onChange={(e) => setGeneralForm({ ...generalForm, check_requirement: e.target.value })} rows={2} /></div>
        <div className="space-y-1.5"><Label>体验标准</Label><Input placeholder="如：间隙≤2mm" value={generalForm.experience_standard} onChange={(e) => setGeneralForm({ ...generalForm, experience_standard: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>测量工具</Label><Input placeholder="如：目视" value={generalForm.check_tool} onChange={(e) => setGeneralForm({ ...generalForm, check_tool: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>问题等级</Label>
            <Select value={generalForm.problem_level} onValueChange={(v) => setGeneralForm({ ...generalForm, problem_level: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{levelOptions.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <Button onClick={handleAddGeneral} className="w-full" disabled={!generalForm.touch_point}>添加</Button>
      </div>
    );

    if (category === '品类标准') return (
      <div className="space-y-3">
        <div className="space-y-1.5"><Label>感官维度</Label>
          <Select value={categoryForm.sensory_dimension} onValueChange={(v) => setCategoryForm({ ...categoryForm, sensory_dimension: v })}>
            <SelectTrigger><SelectValue placeholder="选择" /></SelectTrigger>
            <SelectContent>{sensoryOptions.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>检查维度</Label><Input placeholder="如：间隙段差" value={categoryForm.check_dimension} onChange={(e) => setCategoryForm({ ...categoryForm, check_dimension: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>细分检查维度</Label><Input placeholder="如：间隙" value={categoryForm.sub_check_dimension} onChange={(e) => setCategoryForm({ ...categoryForm, sub_check_dimension: e.target.value })} /></div>
        </div>
        <div className="space-y-1.5"><Label>具体检查条目 *</Label><Input placeholder="如：控制面板与外壳间隙段差" value={categoryForm.check_item} onChange={(e) => setCategoryForm({ ...categoryForm, check_item: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>检查要求及区域</Label><Textarea placeholder="检查要求和区域说明" value={categoryForm.check_requirement} onChange={(e) => setCategoryForm({ ...categoryForm, check_requirement: e.target.value })} rows={2} /></div>
        <div className="space-y-1.5"><Label>检查标准</Label><Input placeholder="如：间隙≤0.3mm" value={categoryForm.check_standard} onChange={(e) => setCategoryForm({ ...categoryForm, check_standard: e.target.value })} /></div>
        <Button onClick={handleAddCategory} className="w-full" disabled={!categoryForm.check_item}>添加</Button>
      </div>
    );

    if (category === '感官评价标准') return (
      <div className="space-y-3">
        <div className="space-y-1.5"><Label>感官维度</Label>
          <Select value={sensoryForm.sensory_dimension} onValueChange={(v) => setSensoryForm({ ...sensoryForm, sensory_dimension: v })}>
            <SelectTrigger><SelectValue placeholder="选择" /></SelectTrigger>
            <SelectContent>{sensoryOptions.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5"><Label>感官评价准备</Label><Textarea placeholder="测试环境、人员准备等" value={sensoryForm.evaluation_prep} onChange={(e) => setSensoryForm({ ...sensoryForm, evaluation_prep: e.target.value })} rows={2} /></div>
        <div className="space-y-1.5"><Label>主观满意度（分值 + 主观感受描述）</Label>
          <div className="grid grid-cols-[80px_1fr] gap-2">
            <Input type="number" min={1} max={5} placeholder="1-5分" value={sensoryForm.subjective_score} onChange={(e) => setSensoryForm({ ...sensoryForm, subjective_score: e.target.value })} />
            <Input placeholder="如：1分-十分不满意-描述..." value={sensoryForm.subjective_rating} onChange={(e) => setSensoryForm({ ...sensoryForm, subjective_rating: e.target.value })} />
          </div>
          <p className="text-[10px] text-muted-foreground">格式示例：1分-十分不满意-豆浆口感差，存在较多细小颗粒</p>
        </div>
        <Button onClick={handleAddSensory} className="w-full" disabled={!sensoryForm.sensory_dimension}>添加</Button>
      </div>
    );

    return <p className="text-sm text-muted-foreground text-center py-4">该标准类型暂未开放编辑</p>;
  };

  // ── Render item row ────────────────────────────────────────────
  const renderItem = (item: StandardItem) => {
    if (editingItemId === item.id && isAdmin) return renderEditRow(item);
    return (
      <div key={item.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors group">
        <div className="flex-1 min-w-0 space-y-1">
          {category === '通用标准' && (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                {item.sensory_dimension && <Badge className={cn('text-[10px]', sensoryColors[item.sensory_dimension] || 'bg-muted')}>{item.sensory_dimension}</Badge>}
                {item.test_phase && <span className="text-[10px] text-muted-foreground bg-background px-1.5 py-0.5 rounded">{item.test_phase}</span>}
                {item.experience_flow && <span className="text-[10px] text-muted-foreground bg-background px-1.5 py-0.5 rounded">{item.experience_flow}</span>}
                <span className="text-sm font-medium">{item.touch_point || item.check_item}</span>
              </div>
              {item.check_requirement && <p className="text-xs text-muted-foreground">{item.check_requirement}</p>}
              {item.experience_standard && <p className="text-xs text-muted-foreground">标准: {item.experience_standard}</p>}
              <div className="flex items-center gap-2">
                {item.check_tool && <span className="text-[10px] text-muted-foreground">工具: {item.check_tool}</span>}
                {item.problem_level && <Badge variant="secondary" className="text-[10px] h-4">{item.problem_level}</Badge>}
              </div>
            </>
          )}
          {category === '品类标准' && (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                {item.sensory_dimension && <Badge className={cn('text-[10px]', sensoryColors[item.sensory_dimension] || 'bg-muted')}>{item.sensory_dimension}</Badge>}
                {item.check_dimension && <span className="text-[10px] text-muted-foreground bg-background px-1.5 py-0.5 rounded">{item.check_dimension}</span>}
                {item.sub_check_dimension && <span className="text-[10px] text-muted-foreground bg-background px-1.5 py-0.5 rounded">{item.sub_check_dimension}</span>}
                <span className="text-sm font-medium">{item.check_item}</span>
              </div>
              {item.check_requirement && <p className="text-xs text-muted-foreground">{item.check_requirement}</p>}
              {item.check_standard && <p className="text-xs text-muted-foreground">标准: {item.check_standard}</p>}
            </>
          )}
          {category === '感官评价标准' && (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                {item.sensory_dimension && <Badge className={cn('text-[10px]', sensoryColors[item.sensory_dimension] || 'bg-muted')}>{item.sensory_dimension}</Badge>}
                <span className="text-sm font-medium">主观满意度</span>
              </div>
              {item.evaluation_prep && <p className="text-xs text-muted-foreground">准备: {item.evaluation_prep}</p>}
              {item.subjective_rating && <p className="text-xs text-muted-foreground">{item.subjective_rating}</p>}
            </>
          )}
        </div>
        {isAdmin && (
          <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(item)}><Edit2 className="h-3.5 w-3.5" /></Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDeleteItem(item.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
          </div>
        )}
      </div>
    );
  };

  const renderEditRow = (item: StandardItem) => (
    <div className="flex-1 space-y-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
      {category === '通用标准' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Select value={editForm.test_phase as string} onValueChange={(v) => setEditForm({ ...editForm, test_phase: v })}>
              <SelectTrigger><SelectValue placeholder="产品使用阶段" /></SelectTrigger>
              <SelectContent>{phaseOptions.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={editForm.experience_flow as string} onValueChange={(v) => setEditForm({ ...editForm, experience_flow: v })}>
              <SelectTrigger><SelectValue placeholder="体验流程" /></SelectTrigger>
              <SelectContent>{(flowByPhase[(editForm.test_phase as string)] || []).map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Select value={editForm.sensory_dimension as string} onValueChange={(v) => setEditForm({ ...editForm, sensory_dimension: v })}>
            <SelectTrigger><SelectValue placeholder="感官维度" /></SelectTrigger>
            <SelectContent>{sensoryOptions.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
          <Input placeholder="触点" value={editForm.touch_point as string} onChange={(e) => setEditForm({ ...editForm, touch_point: e.target.value })} />
          <Textarea placeholder="检验范围及具体要求" value={editForm.check_requirement as string} onChange={(e) => setEditForm({ ...editForm, check_requirement: e.target.value })} rows={2} />
          <Input placeholder="体验标准" value={editForm.experience_standard as string} onChange={(e) => setEditForm({ ...editForm, experience_standard: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <Input placeholder="测量工具" value={editForm.check_tool as string} onChange={(e) => setEditForm({ ...editForm, check_tool: e.target.value })} />
            <Select value={editForm.problem_level as string} onValueChange={(v) => setEditForm({ ...editForm, problem_level: v })}>
              <SelectTrigger><SelectValue placeholder="问题等级" /></SelectTrigger>
              <SelectContent>{levelOptions.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
      )}
      {category === '品类标准' && (
        <div className="space-y-3">
          <Select value={editForm.sensory_dimension as string} onValueChange={(v) => setEditForm({ ...editForm, sensory_dimension: v })}>
            <SelectTrigger><SelectValue placeholder="感官维度" /></SelectTrigger>
            <SelectContent>{sensoryOptions.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
          <div className="grid grid-cols-2 gap-3">
            <Input placeholder="检查维度" value={editForm.check_dimension as string} onChange={(e) => setEditForm({ ...editForm, check_dimension: e.target.value })} />
            <Input placeholder="细分检查维度" value={editForm.sub_check_dimension as string} onChange={(e) => setEditForm({ ...editForm, sub_check_dimension: e.target.value })} />
          </div>
          <Input placeholder="具体检查条目" value={editForm.check_item as string} onChange={(e) => setEditForm({ ...editForm, check_item: e.target.value })} />
          <Textarea placeholder="检查要求及区域" value={editForm.check_requirement as string} onChange={(e) => setEditForm({ ...editForm, check_requirement: e.target.value })} rows={2} />
          <Input placeholder="检查标准" value={editForm.check_standard as string} onChange={(e) => setEditForm({ ...editForm, check_standard: e.target.value })} />
        </div>
      )}
      {category === '感官评价标准' && (
        <div className="space-y-3">
          <Select value={editForm.sensory_dimension as string} onValueChange={(v) => setEditForm({ ...editForm, sensory_dimension: v })}>
            <SelectTrigger><SelectValue placeholder="感官维度" /></SelectTrigger>
            <SelectContent>{sensoryOptions.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
          <Textarea placeholder="感官评价准备" value={editForm.evaluation_prep as string} onChange={(e) => setEditForm({ ...editForm, evaluation_prep: e.target.value })} rows={2} />
          <div className="grid grid-cols-[80px_1fr] gap-2">
            <Input type="number" placeholder="分值" value={editForm.subjective_score as string} onChange={(e) => setEditForm({ ...editForm, subjective_score: e.target.value })} />
            <Input placeholder="主观感受" value={editForm.subjective_rating as string} onChange={(e) => setEditForm({ ...editForm, subjective_rating: e.target.value })} />
          </div>
        </div>
      )}
      <div className="flex gap-2">
        <Button size="sm" onClick={() => handleSaveEdit(item.id)}><Save className="h-3.5 w-3.5 mr-1" />保存</Button>
        <Button size="sm" variant="outline" onClick={() => setEditingItemId(null)}>取消</Button>
      </div>
    </div>
  );

  // ── Group items ────────────────────────────────────────────────
  const grouped = (standard.standard_items || []).reduce<Record<string, StandardItem[]>>((acc, item) => {
    let key = '未分类';
    if (category === '通用标准') key = item.test_phase || '未分类';
    else if (category === '品类标准') key = item.check_dimension || '未分类';
    else if (category === '感官评价标准') key = item.sensory_dimension || '未分类';
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <PreviewComponent />
      {/* Header */}
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" className="shrink-0" onClick={() => router.back()}><ArrowLeft className="h-4 w-4" /></Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">{standard.standard_name}</h1>
            {!isAdmin && <Lock className="h-3.5 w-3.5 text-muted-foreground" />}
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <Badge variant="secondary">{category}</Badge>
            <span className="text-xs text-muted-foreground">{standard.standard_items?.length || 0} 检查项</span>
            {!isAdmin && <span className="text-xs text-muted-foreground flex items-center gap-1"><Shield className="h-3 w-3" />只读</span>}
          </div>
        </div>
        {isAdmin && category !== '食谱功能标准' && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <Button size="sm" onClick={() => setDialogOpen(true)}><Plus className="h-4 w-4 mr-1.5" />添加检查项</Button>
            <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
              <DialogHeader><DialogTitle>添加检查项 - {category}</DialogTitle></DialogHeader>
              <div className="mt-2">{renderAddForm()}</div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Items grouped */}
      {Object.entries(grouped).map(([group, items]) => (
        <Card key={group}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Badge className="text-[10px] bg-muted">{group}</Badge>
              <span className="text-muted-foreground">{items.length} 项</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {items.map(item => renderItem(item))}
          </CardContent>
        </Card>
      ))}
      {Object.keys(grouped).length === 0 && (
        <Card><CardContent className="flex flex-col items-center py-12 text-center">
          <p className="text-sm text-muted-foreground">暂无检查项</p>
          {isAdmin && category !== '食谱功能标准' && <p className="text-xs text-muted-foreground mt-1">点击&ldquo;添加检查项&rdquo;开始定义标准</p>}
          {category === '食谱功能标准' && <p className="text-xs text-muted-foreground mt-1">食谱功能标准开发中</p>}
        </CardContent></Card>
      )}
    </div>
  );
}
