'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, FileText, Eye, Wrench, Package, Plus, Camera, Video, Pencil, Trash2, Check, Link2, X, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useImagePreview } from '@/components/image-preview';
import { MaterialPicker } from '@/components/material-picker';

/* ─── Types ─── */
interface CategoryWithProducts {
  id: string; name: string; sort_order: number;
  products: Array<{ id: string; name: string; category_id: string; sort_order: number }>;
}

interface TaskDetail {
  id: string; task_name: string; product_category: string; product: string | null; product_model: string;
  project_type: string | null; project_phase: string | null; test_date: string | null; organizer: string | null;
  target_user: string | null; test_purpose: string | null; test_method: string | null;
  status: string; assigned_to: string | null; created_at: string;
  records: CheckRecord[]; issues: Issue[];
}

interface CheckRecord {
  id: string; sensory_dimension: string | null; check_dimension: string | null;
  sub_check_dimension: string | null; check_standard: string | null;
  check_item: string; check_requirement: string | null; evaluation_result: string;
  problem_description: string | null; measurement_value: string | null;
  standard_category: string | null; test_phase: string | null;
  experience_flow: string | null; touch_point: string | null;
  experience_standard: string | null;
  materials?: Material[];
}

interface Issue {
  id: string; title: string; severity: string; status: string;
}

interface Material {
  id: string; material_type: string; file_name: string; file_url: string; file_size: number;
}

interface Recipe {
  id: string; name: string; ingredients: string | null; recipe_type: string;
  problem_count: number; recipe_steps: RecipeStep[];
}

interface ProblemPoint {
  text: string;
  material_ids?: string[];
}

interface RecipeStep {
  id: string; step_number: number; operation: string; problem_point: string | null;
  problem_points?: ProblemPoint[];
  materials?: Material[];
}

const sensoryColors: Record<string, string> = {
  '视觉': 'bg-blue-100 text-blue-700', '听觉': 'bg-purple-100 text-purple-700',
  '触觉': 'bg-amber-100 text-amber-700', '嗅觉': 'bg-emerald-100 text-emerald-700',
  '味觉': 'bg-rose-100 text-rose-700',
};

const statusConfig: Record<string, { label: string; color: string }> = {
  '待执行': { label: '待执行', color: 'bg-muted text-muted-foreground' },
  '进行中': { label: '进行中', color: 'bg-primary/10 text-primary' },
  '待审核': { label: '待审核', color: 'bg-amber-100 text-amber-700' },
  '已完成': { label: '已完成', color: 'bg-emerald-100 text-emerald-700' },
  '已驳回': { label: '已驳回', color: 'bg-destructive/10 text-destructive' },
};

/* ─── Main Page ─── */
export default function TaskDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'info' | 'materials' | 'senses' | 'functions'>('info');

  const fetchTask = useCallback(async () => {
    const res = await fetch(`/api/tasks/${id}`);
    const data = await res.json();
    if (data.code === 0) setTask(data.data);
  }, [id]);

  useEffect(() => { fetchTask().finally(() => setLoading(false)); }, [fetchTask]);

  const handleGenerateReport = async () => {
    const res = await fetch('/api/reports', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_id: id }),
    });
    const data = await res.json();
    if (data.code === 0) {
      // Update task status to 已完成
      await fetch(`/api/tasks/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: '已完成' }),
      });
      toast.success('报告生成成功，任务已标记为已完成');
      router.push('/reports');
    } else {
      toast.error(data.message || '报告生成失败');
    }
  };

  if (loading) return <div className="p-6 animate-pulse space-y-4"><div className="h-8 bg-muted rounded w-64" /></div>;
  if (!task) return <div className="p-6">任务不存在</div>;

  return (
    <div className="p-4 lg:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" className="shrink-0" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-semibold truncate">{task.task_name}</h1>
            <Badge variant="secondary" className={cn('text-[10px]', statusConfig[task.status]?.color)}>
              {statusConfig[task.status]?.label || task.status}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">{task.product_model} | {task.product_category}{task.product ? ` - ${task.product}` : ''}{task.project_type ? ` | ${task.project_type}` : ''}{task.project_phase ? ` | ${task.project_phase}` : ''}</p>
        </div>
        <Button size="sm" onClick={handleGenerateReport}>
          <FileText className="h-4 w-4 mr-1.5" /> 报告生成
        </Button>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {[
          { key: 'info' as const, label: '基本信息', icon: null },
          { key: 'materials' as const, label: '素材仓库', icon: Package },
          { key: 'senses' as const, label: '五感体验', icon: Eye },
          { key: 'functions' as const, label: '功能效果', icon: Wrench },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors',
              activeTab === tab.key
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            )}
          >
            {tab.icon && <tab.icon className="h-4 w-4" />}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'info' && <BasicInfoTab task={task} onRefresh={fetchTask} />}
      {activeTab === 'materials' && <MaterialsTab taskId={id} />}
      {activeTab === 'senses' && <SensesTab taskId={id} records={task.records || []} taskProductCategory={task.product_category} taskProduct={task.product} onRefresh={fetchTask} />}
      {activeTab === 'functions' && <FunctionsTab taskId={id} />}
    </div>
  );
}

/* ─── Tab: 基本信息 ─── */
function BasicInfoTab({ task, onRefresh }: { task: TaskDetail; onRefresh: () => void }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    task_name: task.task_name || '',
    product_category: task.product_category || '',
    product: task.product || '',
    product_model: task.product_model || '',
    project_type: task.project_type || '',
    project_phase: task.project_phase || '',
    test_date: task.test_date || '',
    organizer: task.organizer || '',
    target_user: task.target_user || '',
    test_purpose: task.test_purpose || '',
    test_method: task.test_method || '',
    status: task.status || '',
  });
  const [categories, setCategories] = useState<CategoryWithProducts[]>([]);

  useEffect(() => {
    if (editing) {
      fetch('/api/categories').then(r => r.json()).then(d => { if (d.code === 0) setCategories(d.data || []); }).catch(() => {});
    }
  }, [editing]);

  const selectedCategoryData = categories.find(c => c.name === form.product_category);
  const availableProducts = selectedCategoryData?.products || [];
  const projectTypes = ['ODM', 'OEM', '竞品研究', '自研', '前期研究', '改型降本优化', '海外产品'];
  const projectPhases = ['手板研究', '试制阶段', '试产阶段', '量产阶段'];

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.code === 0) {
        toast.success('已更新');
        setEditing(false);
        onRefresh();
      } else toast.error(data.message);
    } finally { setSaving(false); }
  };

  const fields = [
    { label: '任务名称', key: 'task_name' as const, type: 'text' },
    { label: '产品品类', key: 'product_category' as const, type: 'category' },
    { label: '产品', key: 'product' as const, type: 'product' },
    { label: '产品型号', key: 'product_model' as const, type: 'text' },
    { label: '项目类型', key: 'project_type' as const, type: 'project_type' },
    { label: '项目阶段', key: 'project_phase' as const, type: 'project_phase' },
    { label: '体验时间', key: 'test_date' as const, type: 'date' },
    { label: '组织人', key: 'organizer' as const, type: 'text' },
    { label: '目标人群', key: 'target_user' as const, type: 'text' },
    { label: '体验目的', key: 'test_purpose' as const, type: 'textarea' },
    { label: '体验方法', key: 'test_method' as const, type: 'textarea' },
    { label: '状态', key: 'status' as const, type: 'status' },
  ];

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex justify-end">
          {!editing ? (
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => { setForm({ task_name: task.task_name || '', product_category: task.product_category || '', product: task.product || '', product_model: task.product_model || '', project_type: task.project_type || '', project_phase: task.project_phase || '', test_date: task.test_date || '', organizer: task.organizer || '', target_user: task.target_user || '', test_purpose: task.test_purpose || '', test_method: task.test_method || '', status: task.status || '' }); setEditing(true); }}>
              <Pencil className="h-3 w-3" /> 编辑
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button size="sm" className="h-7 text-xs" onClick={handleSave} disabled={saving}>{saving ? '保存中...' : '保存'}</Button>
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setEditing(false)}>取消</Button>
            </div>
          )}
        </div>
        {fields.map((field) => (
          <div key={field.key} className="flex gap-4">
            <span className="text-xs text-muted-foreground w-20 shrink-0">{field.label}</span>
            {editing ? (
              <div className="flex-1 min-w-0">
                {field.type === 'text' && <Input value={form[field.key]} onChange={(e) => setForm({ ...form, [field.key]: e.target.value })} className="h-7 text-sm" />}
                {field.type === 'textarea' && <Textarea value={form[field.key]} onChange={(e) => setForm({ ...form, [field.key]: e.target.value })} rows={2} className="text-sm" />}
                {field.type === 'date' && <Input type="date" value={form[field.key]} onChange={(e) => setForm({ ...form, [field.key]: e.target.value })} className="h-7 text-sm" />}
                {field.type === 'category' && (
                  <Select value={form.product_category} onValueChange={(v) => setForm({ ...form, product_category: v, product: '' })}>
                    <SelectTrigger className="h-7 text-sm"><SelectValue placeholder="选择品类" /></SelectTrigger>
                    <SelectContent>{categories.map(c => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                )}
                {field.type === 'product' && (
                  <Select value={form.product} onValueChange={(v) => setForm({ ...form, product: v })}>
                    <SelectTrigger className="h-7 text-sm"><SelectValue placeholder={form.product_category ? '选择产品' : '请先选择品类'} /></SelectTrigger>
                    <SelectContent>{availableProducts.map(p => <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>)}</SelectContent>
                  </Select>
                )}
                {field.type === 'project_type' && (
                  <div className="flex flex-wrap gap-1.5">{projectTypes.map(t => (
                    <button key={t} type="button" onClick={() => setForm({ ...form, project_type: t, project_phase: t === '自研' ? form.project_phase : '' })}
                      className={cn('px-2 py-1 rounded text-[11px] border transition-colors', form.project_type === t ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border hover:bg-muted/50')}>
                      {t}
                    </button>
                  ))}</div>
                )}
                {field.type === 'project_phase' && form.project_type === '自研' && (
                  <div className="flex flex-wrap gap-1.5">{projectPhases.map(p => (
                    <button key={p} type="button" onClick={() => setForm({ ...form, project_phase: p })}
                      className={cn('px-2 py-1 rounded text-[11px] border transition-colors', form.project_phase === p ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border hover:bg-muted/50')}>
                      {p}
                    </button>
                  ))}</div>
                )}
                {field.type === 'status' && (
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                    <SelectTrigger className="h-7 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(statusConfig).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
                  </Select>
                )}
              </div>
            ) : (
              <span className="text-sm break-all">{field.key === 'project_phase' && task.project_type !== '自研' ? '-' : (String(task[field.key as keyof TaskDetail] ?? '-') )}</span>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/* ─── Tab: 素材仓库 ─── */
function MaterialsTab({ taskId }: { taskId: string }) {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const { previewUrl: _, open, close: __, PreviewComponent } = useImagePreview();

  const fetchMaterials = useCallback(async () => {
    const res = await fetch(`/api/materials?task_id=${taskId}`);
    const data = await res.json();
    if (data.code === 0) setMaterials(data.data || []);
    setLoading(false);
  }, [taskId]);

  useEffect(() => { fetchMaterials(); }, [fetchMaterials]);

  const handleUpload = async (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      if (file.size > 100 * 1024 * 1024) { toast.error(`${file.name} 超过100MB`); continue; }
      const formData = new FormData();
      formData.append('file', file);
      formData.append('task_id', taskId);
      try {
        const res = await fetch('/api/materials/upload', { method: 'POST', body: formData });
        const data = await res.json();
        if (data.code === 0) toast.success('上传成功');
        else toast.error(data.message);
      } catch { toast.error('上传失败'); }
    }
    fetchMaterials();
  };

  const handleRename = async (id: string) => {
    const res = await fetch('/api/materials', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, file_name: editName }),
    });
    const data = await res.json();
    if (data.code === 0) {
      toast.success('重命名成功');
      setEditingId(null);
      fetchMaterials();
    }
  };

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/materials?id=${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.code === 0) { toast.success('已删除'); fetchMaterials(); }
  };

  const images = materials.filter(m => m.material_type === 'image');
  const videos = materials.filter(m => m.material_type === 'video');

  return (
    <div className="space-y-4">
      <PreviewComponent />
      {/* Upload buttons */}
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
          <Camera className="h-4 w-4 mr-1.5" /> 上传图片
        </Button>
        <Button variant="outline" size="sm" onClick={() => videoInputRef.current?.click()}>
          <Video className="h-4 w-4 mr-1.5" /> 上传视频
        </Button>
      </div>
      <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleUpload(e.target.files)} />
      <input ref={videoInputRef} type="file" accept="video/*" multiple className="hidden" onChange={(e) => handleUpload(e.target.files)} />

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{[1,2,3].map(i => <div key={i} className="aspect-square bg-muted animate-pulse rounded-lg" />)}</div>
      ) : materials.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center py-12 text-center">
          <Package className="h-10 w-10 text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground">素材仓库为空</p>
          <p className="text-xs text-muted-foreground mt-1">上传图片或视频开始使用</p>
        </CardContent></Card>
      ) : (
        <>
          {images.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">图片 ({images.length})</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {images.map((mat) => (
                  <div key={mat.id} className="group relative rounded-lg overflow-hidden bg-muted border border-border">
                    <div className="aspect-square cursor-pointer" onClick={() => open(mat.file_url)}>
                      <img src={mat.file_url} alt={mat.file_name} className="w-full h-full object-cover" />
                    </div>
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                      {editingId === mat.id ? (
                        <div className="flex gap-1">
                          <Input
                            className="h-6 text-xs bg-white/90 border-0"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleRename(mat.id)}
                            autoFocus
                          />
                          <Button size="icon" variant="ghost" className="h-6 w-6 text-white" onClick={() => handleRename(mat.id)}>
                            <Check className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] text-white truncate flex-1">{mat.file_name}</p>
                          <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => { setEditingId(mat.id); setEditName(mat.file_name); }} className="p-0.5 text-white/70 hover:text-white">
                              <Pencil className="h-3 w-3" />
                            </button>
                            <button onClick={() => handleDelete(mat.id)} className="p-0.5 text-white/70 hover:text-white">
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {videos.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">视频 ({videos.length})</p>
              <div className="space-y-2">
                {videos.map((mat) => (
                  <div key={mat.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border group">
                    <div className="w-10 h-10 rounded bg-muted flex items-center justify-center shrink-0">
                      <Video className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      {editingId === mat.id ? (
                        <div className="flex gap-1">
                          <Input className="h-6 text-xs" value={editName} onChange={(e) => setEditName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleRename(mat.id)} autoFocus />
                          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => handleRename(mat.id)}>
                            <Check className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <p className="text-sm truncate">{mat.file_name}</p>
                      )}
                      <p className="text-[10px] text-muted-foreground">{(mat.file_size / 1024 / 1024).toFixed(1)} MB</p>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditingId(mat.id); setEditName(mat.file_name); }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleDelete(mat.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ─── Tab: 五感体验 ─── */
interface StandardItem {
  id: string;
  standard_id: string;
  sensory_dimension: string | null;
  test_phase: string | null;
  experience_flow: string | null;
  touch_point: string | null;
  check_dimension: string | null;
  sub_check_dimension: string | null;
  check_item: string;
  check_requirement: string | null;
  check_standard: string | null;
  experience_standard: string | null;
  check_tool: string | null;
  problem_level: string | null;
  evaluation_prep: string | null;
  subjective_score: number | null;
  subjective_rating: string | null;
  standard: { id: string; standard_name: string; category: string; product_category: string | null } | null;
}

const phaseOptions = ['开箱', '首次安装', '产品使用', '清洁收纳', '其他'];
const sensoryOptions = ['视觉', '听觉', '触觉', '嗅觉', '味觉'];
const flowByPhase: Record<string, string[]> = {
  '开箱': ['拿取外包装', '拆开内包装'],
  '首次安装': ['配件梳理', '外观美观', '外观缺陷', '标识文字', '首次安装'],
  '产品使用': ['放置及组装', '操作交互', '产品运行'],
  '清洁收纳': ['冲水', '擦拭', '晾干', '收纳'],
  '其他': ['其他'],
};
const standardCategoryOptions = ['通用标准', '品类标准', '感官评价标准', '非标准'];

function SensesTab({ taskId, records, taskProductCategory, taskProduct, onRefresh }: { taskId: string; records: CheckRecord[]; taskProductCategory?: string; taskProduct?: string | null; onRefresh: () => void }) {
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [savingRecord, setSavingRecord] = useState(false);
  const [selectedMaterialIds, setSelectedMaterialIds] = useState<string[]>([]);
  const [, setSelectedMaterials] = useState<Material[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<CheckRecord | null>(null);
  const [recordMaterials, setRecordMaterials] = useState<Record<string, Material[]>>({});
  const { previewUrl: _, open, close: __, PreviewComponent } = useImagePreview();

  // Standard type selection
  const [formCategory, setFormCategory] = useState('通用标准');

  // ── 通用标准 form ──
  const [generalForm, setGeneralForm] = useState({ test_phase: '', experience_flow: '', sensory_dimension: '', selectedItemId: '', problem_description: '' });
  const [generalItems, setGeneralItems] = useState<StandardItem[]>([]);

  // ── 品类标准 form ──
  const [categoryForm, setCategoryForm] = useState({ sensory_dimension: '', check_dimension: '', sub_check_dimension: '', selectedItemId: '', problem_description: '' });
  const [categoryDimensions, setCategoryDimensions] = useState<string[]>([]);
  const [categorySubDimensions, setCategorySubDimensions] = useState<string[]>([]);
  const [categoryItems, setCategoryItems] = useState<StandardItem[]>([]);

  // ── 感官评价标准 form ──
  const [sensoryForm, setSensoryForm] = useState({ sensory_dimension: '', score: '', result_description: '' });
  const [sensoryRefItems, setSensoryRefItems] = useState<StandardItem[]>([]);
  const [evaluationResult, setEvaluationResult] = useState('待定');

  // ── 非标准 form ──
  const [nonStandardForm, setNonStandardForm] = useState({ description: '', problem_description: '' });

  // ── Fuzzy search ──
  const [fuzzyKeyword, setFuzzyKeyword] = useState('');
  const [fuzzyResults, setFuzzyResults] = useState<StandardItem[]>([]);
  const [fuzzyLoading, setFuzzyLoading] = useState(false);

  // ── Record status edit dialog ──
  const [statusEditOpen, setStatusEditOpen] = useState(false);
  const [statusEditRecord, setStatusEditRecord] = useState<CheckRecord | null>(null);
  const [statusEditValue, setStatusEditValue] = useState('待定');

  // ── 通用标准: fetch matching items when 3 selects are chosen ──
  useEffect(() => {
    if (formCategory !== '通用标准') return;
    if (!generalForm.test_phase || !generalForm.experience_flow || !generalForm.sensory_dimension) {
      setGeneralItems([]);
      return;
    }
    const fetchItems = async () => {
      const params = new URLSearchParams();
      params.set('category', '通用标准');
      params.set('sensory_dimension', generalForm.sensory_dimension);
      params.set('test_phase', generalForm.test_phase);
      params.set('experience_flow', generalForm.experience_flow);
      if (taskProductCategory) params.set('product_category', taskProductCategory);
      const res = await fetch(`/api/standard-items/search?${params}`);
      const data = await res.json();
      if (data.code === 0) setGeneralItems(data.data || []);
      else setGeneralItems([]);
    };
    fetchItems();
  }, [formCategory, generalForm.test_phase, generalForm.experience_flow, generalForm.sensory_dimension, taskProductCategory]);

  // ── 品类标准 form ──
  const [categoryLoading, setCategoryLoading] = useState(false);
  const [categoryAllItems, setCategoryAllItems] = useState<StandardItem[]>([]);

  // ── 品类标准: fetch ALL items when category is active ──
  useEffect(() => {
    if (formCategory !== '品类标准') return;
    setCategoryLoading(true);
    const fetchDimensions = async () => {
      const params = new URLSearchParams();
      params.set('category', '品类标准');
      if (categoryForm.sensory_dimension && categoryForm.sensory_dimension !== 'all') params.set('sensory_dimension', categoryForm.sensory_dimension);
      if (taskProductCategory) params.set('product_category', taskProductCategory);
      if (taskProduct) params.set('product', taskProduct);
      try {
        const res = await fetch(`/api/standard-items/search?${params}`);
        const data = await res.json();
        if (data.code === 0) {
          const items: StandardItem[] = data.data || [];
          setCategoryAllItems(items);
          const dims = [...new Set(items.map(i => i.check_dimension).filter(Boolean) as string[])];
          setCategoryDimensions(dims);
        } else {
          setCategoryAllItems([]);
          setCategoryDimensions([]);
        }
      } catch {
        setCategoryAllItems([]);
        setCategoryDimensions([]);
      }
      setCategoryLoading(false);
    };
    fetchDimensions();
  }, [formCategory, categoryForm.sensory_dimension, taskProductCategory, taskProduct]);

  // ── 品类标准: derive sub-dimensions and items when check_dimension changes ──
  useEffect(() => {
    if (formCategory !== '品类标准') return;
    if (!categoryForm.check_dimension) {
      setCategorySubDimensions([]);
      setCategoryItems([]);
      return;
    }
    const filtered = categoryAllItems.filter(i => i.check_dimension === categoryForm.check_dimension);
    const subDims = [...new Set(filtered.map(i => i.sub_check_dimension).filter(Boolean) as string[])];
    setCategorySubDimensions(subDims);
    const matched = filtered.filter(i => !categoryForm.sub_check_dimension || categoryForm.sub_check_dimension === 'all' || i.sub_check_dimension === categoryForm.sub_check_dimension);
    setCategoryItems(matched);
  }, [formCategory, categoryForm.check_dimension, categoryForm.sub_check_dimension, categoryAllItems]);

  // ── 感官评价标准: fetch reference items when sensory dimension selected ──
  useEffect(() => {
    if (formCategory !== '感官评价标准') return;
    if (!sensoryForm.sensory_dimension) {
      setSensoryRefItems([]);
      return;
    }
    const fetchItems = async () => {
      const params = new URLSearchParams();
      params.set('category', '感官评价标准');
      params.set('sensory_dimension', sensoryForm.sensory_dimension);
      if (taskProductCategory) params.set('product_category', taskProductCategory);
      const res = await fetch(`/api/standard-items/search?${params}`);
      const data = await res.json();
      if (data.code === 0) setSensoryRefItems(data.data || []);
      else setSensoryRefItems([]);
    };
    fetchItems();
  }, [formCategory, sensoryForm.sensory_dimension, taskProductCategory]);

  // ── Fuzzy search: keyword-based search across all standard items ──
  useEffect(() => {
    if (!fuzzyKeyword.trim()) { setFuzzyResults([]); return; }
    setFuzzyLoading(true);
    const timer = setTimeout(async () => {
      const params = new URLSearchParams();
      params.set('keyword', fuzzyKeyword.trim());
      if (taskProductCategory) params.set('product_category', taskProductCategory);
      if (taskProduct) params.set('product', taskProduct);
      try {
        const res = await fetch(`/api/standard-items/search?${params}`);
        const data = await res.json();
        if (data.code === 0) setFuzzyResults(data.data || []);
        else setFuzzyResults([]);
      } catch { setFuzzyResults([]); }
      setFuzzyLoading(false);
    }, 300);
    return () => { clearTimeout(timer); setFuzzyLoading(false); };
  }, [fuzzyKeyword, taskProductCategory, taskProduct]);

  // Fetch materials for each record
  useEffect(() => {
    const fetchRecordMaterials = async () => {
      const map: Record<string, Material[]> = {};
      for (const record of records) {
        try {
          const res = await fetch(`/api/materials?record_id=${record.id}`);
          const data = await res.json();
          if (data.code === 0) map[record.id] = data.data || [];
        } catch { /* ignore */ }
      }
      setRecordMaterials(map);
    };
    if (records.length > 0) fetchRecordMaterials();
  }, [records]);

  const resetForms = () => {
    setFormCategory('通用标准');
    setGeneralForm({ test_phase: '', experience_flow: '', sensory_dimension: '', selectedItemId: '', problem_description: '' });
    setGeneralItems([]);
    setCategoryForm({ sensory_dimension: '', check_dimension: '', sub_check_dimension: '', selectedItemId: '', problem_description: '' });
    setCategoryDimensions([]);
    setCategorySubDimensions([]);
    setCategoryItems([]);
    setCategoryLoading(false);
    setCategoryAllItems([]);
    setSensoryForm({ sensory_dimension: '', score: '', result_description: '' });
    setSensoryRefItems([]);
    setEvaluationResult('待定');
    setNonStandardForm({ description: '', problem_description: '' });
    setFuzzyKeyword('');
    setFuzzyResults([]);
    setSelectedMaterialIds([]);
    setSelectedMaterials([]);
  };

  const handleAdd = async () => {
    if (savingRecord) return;
    setSavingRecord(true);
    try {
      let body: Record<string, unknown> = { task_id: taskId, evaluation_result: evaluationResult, sort_order: records.length };

      if (formCategory === '通用标准') {
        const selectedItem = generalItems.find(i => i.id === generalForm.selectedItemId);
        body = {
          ...body,
          standard_category: '通用标准',
          sensory_dimension: generalForm.sensory_dimension || null,
          test_phase: generalForm.test_phase || null,
          experience_flow: generalForm.experience_flow || null,
          touch_point: selectedItem?.touch_point || null,
          check_item: selectedItem?.touch_point || selectedItem?.check_item || generalForm.experience_flow || '',
          check_requirement: selectedItem?.check_requirement || null,
          experience_standard: selectedItem?.experience_standard || null,
          problem_description: generalForm.problem_description || null,
        };
      } else if (formCategory === '品类标准') {
        const selectedItem = categoryItems.find(i => i.id === categoryForm.selectedItemId);
        body = {
          ...body,
          standard_category: '品类标准',
          sensory_dimension: categoryForm.sensory_dimension || null,
          check_dimension: categoryForm.check_dimension || null,
          sub_check_dimension: selectedItem?.sub_check_dimension || categoryForm.sub_check_dimension || null,
          check_item: selectedItem?.check_item || '',
          check_requirement: selectedItem?.check_requirement || null,
          check_standard: selectedItem?.check_standard || null,
          problem_description: categoryForm.problem_description || null,
        };
      } else if (formCategory === '感官评价标准') {
        const refItem = sensoryRefItems[0];
        body = {
          ...body,
          standard_category: '感官评价标准',
          sensory_dimension: sensoryForm.sensory_dimension || null,
          check_item: `${sensoryForm.sensory_dimension}评价`,
          check_requirement: refItem?.evaluation_prep || null,
          check_standard: refItem?.subjective_rating || null,
          problem_description: sensoryForm.result_description || null,
          measurement_value: sensoryForm.score || null,
        };
      } else if (formCategory === '非标准') {
        body = {
          ...body,
          standard_category: '非标准',
          check_item: nonStandardForm.description || '',
          problem_description: nonStandardForm.problem_description || null,
        };
      }

      const res = await fetch('/api/records', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.code === 0) {
        const recordId = data.data?.id;
        if (recordId && selectedMaterialIds.length > 0) {
          for (const matId of selectedMaterialIds) {
            await fetch('/api/materials', {
              method: 'PUT', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: matId, record_id: recordId }),
            });
          }
        }
        setAddDialogOpen(false);
        resetForms();
        onRefresh();
        toast.success('问题点已添加');
      }
    } finally {
      setSavingRecord(false);
    }
  };

  // Check if form is valid for submission
  const isFormValid = () => {
    if (formCategory === '通用标准') return !!(generalForm.test_phase && generalForm.experience_flow && generalForm.sensory_dimension && generalForm.selectedItemId);
    if (formCategory === '品类标准') return !!(categoryForm.check_dimension && categoryForm.selectedItemId);
    if (formCategory === '感官评价标准') return !!(sensoryForm.sensory_dimension && sensoryForm.score);
    if (formCategory === '非标准') return !!nonStandardForm.description;
    return false;
  };

  // Group records by standard_category then sensory_dimension
  const grouped = records.reduce<Record<string, CheckRecord[]>>((acc, r) => {
    const cat = r.standard_category || '未分类';
    const key = `${cat} · ${r.sensory_dimension || '未分类'}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(r);
    return acc;
  }, {});

  // Get selected item for general standard
  const selectedGeneralItem = generalItems.find(i => i.id === generalForm.selectedItemId);
  // Get selected item for category standard
  const selectedCategoryItem = categoryItems.find(i => i.id === categoryForm.selectedItemId);

  // Handle fuzzy search selection: auto-fill form based on matched standard item
  const handleFuzzySelect = (item: StandardItem) => {
    const stdCat = item.standard?.category as string || '通用标准';
    setFormCategory(stdCat);
    setFuzzyKeyword('');
    setFuzzyResults([]);

    if (stdCat === '通用标准') {
      // Auto-fill test_phase, experience_flow, sensory_dimension
      const itemAny = item as unknown as Record<string, unknown>;
      const phase = itemAny.test_phase as string || '';
      const flow = itemAny.experience_flow as string || '';
      const dim = itemAny.sensory_dimension as string || '';
      setGeneralForm(prev => ({ ...prev, test_phase: phase, experience_flow: flow, sensory_dimension: dim, selectedItemId: item.id }));
      // Items will be fetched via useEffect once the form state updates
    } else if (stdCat === '品类标准') {
      const itemAny = item as unknown as Record<string, unknown>;
      const dim = itemAny.sensory_dimension as string || '';
      const checkDim = itemAny.check_dimension as string || '';
      setCategoryForm(prev => ({ ...prev, sensory_dimension: dim, check_dimension: checkDim, selectedItemId: item.id }));
    } else if (stdCat === '感官评价标准') {
      const itemAny = item as unknown as Record<string, unknown>;
      const dim = itemAny.sensory_dimension as string || '';
      setSensoryForm(prev => ({ ...prev, sensory_dimension: dim }));
    }
  };

  // Fuzzy search input component (shown for 通用标准/品类标准/感官评价标准)
  const renderFuzzySearch = () => (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">描述结果快速匹配</Label>
      <Input placeholder="输入关键词搜索标准库..." value={fuzzyKeyword}
        onChange={(e) => setFuzzyKeyword(e.target.value)} />
      {fuzzyLoading && <p className="text-[11px] text-muted-foreground animate-pulse">搜索中...</p>}
      {fuzzyResults.length > 0 && (
        <div className="max-h-48 overflow-y-auto space-y-1 border rounded-lg p-2">
          {fuzzyResults.slice(0, 20).map((item) => {
            const stdCat = item.standard?.category || '通用标准';
            return (
              <div key={item.id}
                className="p-2 rounded-md cursor-pointer text-xs transition-colors border border-transparent hover:bg-muted/50"
                onClick={() => handleFuzzySelect(item)}>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-[9px] h-4 shrink-0">{stdCat}</Badge>
                  <span className="font-medium truncate">{item.touch_point || item.check_item}</span>
                </div>
                {item.check_requirement && <p className="text-muted-foreground mt-0.5 line-clamp-1">{item.check_requirement}</p>}
                <div className="flex gap-2 mt-0.5 text-[10px] text-muted-foreground">
                  {(() => { const it = item as unknown as Record<string, unknown>; return (<>
                    {it.test_phase && <span>阶段: {it.test_phase as string}</span>}
                    {it.experience_flow && <span>流程: {it.experience_flow as string}</span>}
                    {it.sensory_dimension && <span>维度: {it.sensory_dimension as string}</span>}
                  </>); })()}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {fuzzyKeyword.trim() && !fuzzyLoading && fuzzyResults.length === 0 && (
        <p className="text-[11px] text-muted-foreground">未找到匹配的标准项</p>
      )}
    </div>
  );

  // Render the add form based on category
  const renderAddForm = () => {
    // Standard type selector
    const categorySelector = (
      <div className="space-y-1.5">
        <Label>标准类型</Label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {standardCategoryOptions.map((cat) => (
            <button
              key={cat}
              type="button"
              className={cn(
                'px-2 py-2 rounded-md text-xs font-medium border-2 transition-colors text-center',
                formCategory === cat ? 'border-primary bg-primary/5 text-primary' : 'border-border text-muted-foreground hover:border-primary/30'
              )}
              onClick={() => { setFormCategory(cat); setGeneralItems([]); setCategoryDimensions([]); setCategorySubDimensions([]); setCategoryItems([]); setSensoryRefItems([]); }}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>
    );

    // ── 通用标准 form ──
    if (formCategory === '通用标准') return (
      <div className="space-y-3">
        {categorySelector}
        {renderFuzzySearch()}
        <Separator />
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>产品使用阶段 *</Label>
            <Select value={generalForm.test_phase} onValueChange={(v) => setGeneralForm({ ...generalForm, test_phase: v, experience_flow: '', selectedItemId: '' })}>
              <SelectTrigger><SelectValue placeholder="选择" /></SelectTrigger>
              <SelectContent>{phaseOptions.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>体验流程 *</Label>
            <Select value={generalForm.experience_flow} onValueChange={(v) => setGeneralForm({ ...generalForm, experience_flow: v, selectedItemId: '' })}>
              <SelectTrigger><SelectValue placeholder="选择" /></SelectTrigger>
              <SelectContent>{(flowByPhase[generalForm.test_phase] || []).map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>感官维度 *</Label>
          <Select value={generalForm.sensory_dimension} onValueChange={(v) => setGeneralForm({ ...generalForm, sensory_dimension: v, selectedItemId: '' })}>
            <SelectTrigger><SelectValue placeholder="选择" /></SelectTrigger>
            <SelectContent>{sensoryOptions.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
        </div>

        {/* Matched standard items - user selects one */}
        {generalItems.length > 0 && (
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">从标准库选择检查项 * ({generalItems.length}项匹配)</Label>
            <div className="max-h-60 overflow-y-auto space-y-1 border rounded-lg p-2">
              {generalItems.map((item) => (
                <div
                  key={item.id}
                  className={cn(
                    'p-2.5 rounded-md cursor-pointer text-xs transition-colors border',
                    generalForm.selectedItemId === item.id
                      ? 'border-primary bg-primary/5'
                      : 'border-transparent hover:bg-muted/50'
                  )}
                  onClick={() => setGeneralForm({ ...generalForm, selectedItemId: item.id })}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{item.touch_point || item.check_item}</span>
                    {item.problem_level && <Badge variant="secondary" className="text-[9px] h-4">{item.problem_level}</Badge>}
                  </div>
                  {item.check_requirement && <p className="text-muted-foreground mt-0.5 line-clamp-2">{item.check_requirement}</p>}
                  {item.experience_standard && <p className="text-primary/70 mt-0.5">标准: {item.experience_standard}</p>}
                  {item.check_tool && <p className="text-muted-foreground mt-0.5 text-[10px]">工具: {item.check_tool}</p>}
                </div>
              ))}
            </div>
          </div>
        )}
        {generalForm.test_phase && generalForm.experience_flow && generalForm.sensory_dimension && generalItems.length === 0 && (
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-950/20 dark:border-amber-800">
            <p className="text-xs text-amber-700 dark:text-amber-400">未找到匹配的标准检查项，请确认筛选条件</p>
          </div>
        )}

        {/* Auto-filled fields preview from selected item */}
        {selectedGeneralItem && (
          <div className="space-y-1.5 p-3 rounded-lg bg-muted/30 border border-border">
            <Label className="text-xs text-muted-foreground">自动引用（来自标准库）</Label>
            {selectedGeneralItem.touch_point && (
              <div className="flex gap-2 text-xs"><span className="text-muted-foreground w-24 shrink-0">触点</span><span className="font-medium">{selectedGeneralItem.touch_point}</span></div>
            )}
            {selectedGeneralItem.check_requirement && (
              <div className="flex gap-2 text-xs"><span className="text-muted-foreground w-24 shrink-0">检验范围及具体要求</span><span>{selectedGeneralItem.check_requirement}</span></div>
            )}
            {selectedGeneralItem.experience_standard && (
              <div className="flex gap-2 text-xs"><span className="text-muted-foreground w-24 shrink-0">体验标准</span><span>{selectedGeneralItem.experience_standard}</span></div>
            )}
            {selectedGeneralItem.check_tool && (
              <div className="flex gap-2 text-xs"><span className="text-muted-foreground w-24 shrink-0">测量工具</span><span>{selectedGeneralItem.check_tool}</span></div>
            )}
            {selectedGeneralItem.problem_level && (
              <div className="flex gap-2 text-xs"><span className="text-muted-foreground w-24 shrink-0">问题等级</span><Badge variant="secondary" className="text-[9px] h-4">{selectedGeneralItem.problem_level}</Badge></div>
            )}
          </div>
        )}

        <div className="space-y-1.5">
          <Label>检查结果</Label>
          <Textarea placeholder="描述检查结果" value={generalForm.problem_description} onChange={(e) => setGeneralForm({ ...generalForm, problem_description: e.target.value })} rows={2} />
        </div>
        <MaterialPicker taskId={taskId} selectedIds={selectedMaterialIds} onSelectionChange={(ids, mats) => { setSelectedMaterialIds(ids); setSelectedMaterials(mats); }} />
        <div className="space-y-1.5">
          <Label>检查结果 *</Label>
          <div className="flex gap-2">
            {['合格', '不合格', '待定'].map(r => (
              <button key={r} type="button" onClick={() => setEvaluationResult(r)}
                className={cn('flex-1 px-2 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                  evaluationResult === r
                    ? r === '合格' ? 'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800'
                      : r === '不合格' ? 'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800'
                      : 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800'
                    : 'bg-background border-border hover:bg-muted/50')}>
                {r}
              </button>
            ))}
          </div>
        </div>
        <Button onClick={handleAdd} className="w-full" disabled={!isFormValid() || savingRecord}>{savingRecord ? '添加中...' : '添加'}</Button>
      </div>
    );

    // ── 品类标准 form ──
    if (formCategory === '品类标准') return (
      <div className="space-y-3">
        {categorySelector}
        {renderFuzzySearch()}
        <Separator />
        {/* Show no-data warning if product has no 品类标准 */}
        {categoryDimensions.length === 0 && !categoryLoading && (
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-950/20 dark:border-amber-800">
            <p className="text-xs text-amber-700 dark:text-amber-400">当前产品品类「{taskProductCategory || '未指定'}」暂无品类标准数据，请先在标准管理中导入对应品类的标准</p>
          </div>
        )}
        {categoryLoading && (
          <div className="text-xs text-muted-foreground animate-pulse">正在加载品类标准...</div>
        )}
        <div className="space-y-1.5">
          <Label>感官维度</Label>
          <Select value={categoryForm.sensory_dimension} onValueChange={(v) => setCategoryForm({ ...categoryForm, sensory_dimension: v, check_dimension: '', sub_check_dimension: '', selectedItemId: '' })}>
            <SelectTrigger><SelectValue placeholder="选择（可选）" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部</SelectItem>
              {sensoryOptions.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>检查维度 * {categoryDimensions.length > 0 && `(${categoryDimensions.length}个)`}</Label>
          <Select value={categoryForm.check_dimension} onValueChange={(v) => setCategoryForm({ ...categoryForm, check_dimension: v, sub_check_dimension: '', selectedItemId: '' })}>
            <SelectTrigger><SelectValue placeholder={categoryDimensions.length > 0 ? "从标准库选择" : "暂无数据"} /></SelectTrigger>
            <SelectContent>
              {categoryDimensions.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {categorySubDimensions.length > 0 && (
          <div className="space-y-1.5">
            <Label>细分检查维度</Label>
            <Select value={categoryForm.sub_check_dimension} onValueChange={(v) => setCategoryForm({ ...categoryForm, sub_check_dimension: v, selectedItemId: '' })}>
              <SelectTrigger><SelectValue placeholder="选择（可选）" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部</SelectItem>
                {categorySubDimensions.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Matched items - user selects one */}
        {categoryItems.length > 0 && (
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">从标准库选择检查项 * ({categoryItems.length}项匹配)</Label>
            <div className="max-h-60 overflow-y-auto space-y-1 border rounded-lg p-2">
              {categoryItems.map((item) => (
                <div
                  key={item.id}
                  className={cn(
                    'p-2.5 rounded-md cursor-pointer text-xs transition-colors border',
                    categoryForm.selectedItemId === item.id
                      ? 'border-primary bg-primary/5'
                      : 'border-transparent hover:bg-muted/50'
                  )}
                  onClick={() => setCategoryForm({ ...categoryForm, selectedItemId: item.id })}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{item.check_item}</span>
                    {item.sub_check_dimension && <Badge variant="secondary" className="text-[9px] h-4">{item.sub_check_dimension}</Badge>}
                  </div>
                  {item.check_requirement && <p className="text-muted-foreground mt-0.5 line-clamp-2">{item.check_requirement}</p>}
                  {item.check_standard && <p className="text-primary/70 mt-0.5">标准: {item.check_standard}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Auto-filled fields preview from selected item */}
        {selectedCategoryItem && (
          <div className="space-y-1.5 p-3 rounded-lg bg-muted/30 border border-border">
            <Label className="text-xs text-muted-foreground">自动引用（来自标准库）</Label>
            {selectedCategoryItem.check_item && (
              <div className="flex gap-2 text-xs"><span className="text-muted-foreground w-24 shrink-0">具体检查条目</span><span className="font-medium">{selectedCategoryItem.check_item}</span></div>
            )}
            {selectedCategoryItem.check_requirement && (
              <div className="flex gap-2 text-xs"><span className="text-muted-foreground w-24 shrink-0">检查要求及区域</span><span>{selectedCategoryItem.check_requirement}</span></div>
            )}
            {selectedCategoryItem.check_standard && (
              <div className="flex gap-2 text-xs"><span className="text-muted-foreground w-24 shrink-0">检查标准</span><span>{selectedCategoryItem.check_standard}</span></div>
            )}
          </div>
        )}

        <div className="space-y-1.5">
          <Label>检查结果</Label>
          <Textarea placeholder="描述检查结果" value={categoryForm.problem_description} onChange={(e) => setCategoryForm({ ...categoryForm, problem_description: e.target.value })} rows={2} />
        </div>
        <MaterialPicker taskId={taskId} selectedIds={selectedMaterialIds} onSelectionChange={(ids, mats) => { setSelectedMaterialIds(ids); setSelectedMaterials(mats); }} />
        <div className="space-y-1.5">
          <Label>检查结果 *</Label>
          <div className="flex gap-2">
            {['合格', '不合格', '待定'].map(r => (
              <button key={r} type="button" onClick={() => setEvaluationResult(r)}
                className={cn('flex-1 px-2 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                  evaluationResult === r
                    ? r === '合格' ? 'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800'
                      : r === '不合格' ? 'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800'
                      : 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800'
                    : 'bg-background border-border hover:bg-muted/50')}>
                {r}
              </button>
            ))}
          </div>
        </div>
        <Button onClick={handleAdd} className="w-full" disabled={!isFormValid() || savingRecord}>{savingRecord ? '添加中...' : '添加'}</Button>
      </div>
    );

    // ── 感官评价标准 form ──
    if (formCategory === '感官评价标准') return (
      <div className="space-y-3">
        {categorySelector}
        {renderFuzzySearch()}
        <Separator />
        <div className="space-y-1.5">
          <Label>感官维度 *</Label>
          <Select value={sensoryForm.sensory_dimension} onValueChange={(v) => setSensoryForm({ ...sensoryForm, sensory_dimension: v, score: '', result_description: '' })}>
            <SelectTrigger><SelectValue placeholder="选择" /></SelectTrigger>
            <SelectContent>{sensoryOptions.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
        </div>

        {/* Auto-filled reference from standard */}
        {sensoryRefItems.length > 0 && (
          <div className="space-y-2 p-3 rounded-lg bg-muted/30 border border-border">
            <Label className="text-xs text-muted-foreground">引用标准（来自标准库）</Label>
            {sensoryRefItems[0].evaluation_prep && (
              <div className="flex gap-2 text-xs"><span className="text-muted-foreground w-24 shrink-0">感官评价准备</span><span>{sensoryRefItems[0].evaluation_prep}</span></div>
            )}
            {/* Show all subjective rating levels as reference */}
            {sensoryRefItems.length > 0 && (
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">主观满意度标准</span>
                {sensoryRefItems.map((item, idx) => (
                  <div key={idx} className="flex gap-2 text-xs">
                    <span className="w-8 shrink-0 font-medium">{item.subjective_score}分</span>
                    <span>{item.subjective_rating}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {sensoryForm.sensory_dimension && sensoryRefItems.length === 0 && (
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-950/20 dark:border-amber-800">
            <p className="text-xs text-amber-700 dark:text-amber-400">未找到匹配的感官评价标准</p>
          </div>
        )}

        <div className="space-y-1.5">
          <Label>评分 *</Label>
          <Input type="number" min={1} max={5} placeholder="输入1-5分" value={sensoryForm.score} onChange={(e) => setSensoryForm({ ...sensoryForm, score: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>结果描述</Label>
          <Textarea placeholder="描述评价结果" value={sensoryForm.result_description} onChange={(e) => setSensoryForm({ ...sensoryForm, result_description: e.target.value })} rows={2} />
        </div>
        <MaterialPicker taskId={taskId} selectedIds={selectedMaterialIds} onSelectionChange={(ids, mats) => { setSelectedMaterialIds(ids); setSelectedMaterials(mats); }} />
        <div className="space-y-1.5">
          <Label>检查结果 *</Label>
          <div className="flex gap-2">
            {['合格', '不合格', '待定'].map(r => (
              <button key={r} type="button" onClick={() => setEvaluationResult(r)}
                className={cn('flex-1 px-2 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                  evaluationResult === r
                    ? r === '合格' ? 'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800'
                      : r === '不合格' ? 'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800'
                      : 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800'
                    : 'bg-background border-border hover:bg-muted/50')}>
                {r}
              </button>
            ))}
          </div>
        </div>
        <Button onClick={handleAdd} className="w-full" disabled={!isFormValid() || savingRecord}>{savingRecord ? '添加中...' : '添加'}</Button>
      </div>
    );

    // ── 非标准 form ──
    if (formCategory === '非标准') return (
      <div className="space-y-3">
        {categorySelector}
        <div className="p-3 rounded-lg bg-muted/30 border border-border">
          <p className="text-xs text-muted-foreground">非标准检查项无需关联产品使用阶段、体验流程、感官维度，仅需描述检查内容和结果</p>
        </div>
        <div className="space-y-1.5">
          <Label>描述结果 *</Label>
          <Textarea placeholder="描述检查项内容" value={nonStandardForm.description}
            onChange={(e) => setNonStandardForm({ ...nonStandardForm, description: e.target.value })} rows={3} />
        </div>
        <div className="space-y-1.5">
          <Label>检查结果</Label>
          <Textarea placeholder="描述检查结果（可选）" value={nonStandardForm.problem_description}
            onChange={(e) => setNonStandardForm({ ...nonStandardForm, problem_description: e.target.value })} rows={2} />
        </div>
        <MaterialPicker taskId={taskId} selectedIds={selectedMaterialIds} onSelectionChange={(ids, mats) => { setSelectedMaterialIds(ids); setSelectedMaterials(mats); }} />
        <div className="space-y-1.5">
          <Label>检查结果 *</Label>
          <div className="flex gap-2">
            {['合格', '不合格', '待定'].map(r => (
              <button key={r} type="button" onClick={() => setEvaluationResult(r)}
                className={cn('flex-1 px-2 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                  evaluationResult === r
                    ? r === '合格' ? 'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800'
                      : r === '不合格' ? 'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800'
                      : 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800'
                    : 'bg-background border-border hover:bg-muted/50')}>
                {r}
              </button>
            ))}
          </div>
        </div>
        <Button onClick={handleAdd} className="w-full" disabled={!isFormValid() || savingRecord}>{savingRecord ? '添加中...' : '添加'}</Button>
      </div>
    );

    return <div className="space-y-3">{categorySelector}<p className="text-sm text-muted-foreground text-center py-4">请选择标准类型</p></div>;
  };

  const handleDeleteRecord = async (record: CheckRecord) => {
    const res = await fetch(`/api/records/${record.id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.code === 0) {
      if (selectedRecord?.id === record.id) setSelectedRecord(null);
      onRefresh();
      toast.success('问题点已删除');
    }
  };

  return (
    <div className="space-y-4">
      <PreviewComponent />

      {records.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center py-12 text-center">
          <Eye className="h-10 w-10 text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground">暂无问题点</p>
          <p className="text-xs text-muted-foreground mt-1">点击下方按钮新增</p>
        </CardContent></Card>
      ) : (
        Object.entries(grouped).map(([group, items]) => (
          <Card key={group}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                {(() => {
                  const [cat, dim] = group.split(' · ');
                  return (
                    <>
                      <Badge variant="secondary" className="text-[10px]">{cat}</Badge>
                      <Badge className={cn('text-[10px]', sensoryColors[dim] || 'bg-muted')}>{dim}</Badge>
                      <span className="text-muted-foreground text-xs">{items.length} 项</span>
                    </>
                  );
                })()}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {items.map((record) => {
                const mats = recordMaterials[record.id] || [];
                return (
                  <div
                    key={record.id}
                    className="p-3 rounded-lg bg-muted/30 hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => setSelectedRecord(selectedRecord?.id === record.id ? null : record)}
                  >
                    <div className="flex items-center gap-3">
                      <span className={cn(
                        'w-2 h-2 rounded-full shrink-0',
                        record.evaluation_result === '合格' ? 'bg-emerald-500' :
                        record.evaluation_result === '不合格' ? 'bg-red-500' : 'bg-amber-500'
                      )} />
                      <span className="text-sm flex-1 truncate">{record.check_item}</span>
                      {record.check_dimension && (
                        <span className="text-[10px] text-muted-foreground bg-background px-1.5 py-0.5 rounded">{record.check_dimension}</span>
                      )}
                      {record.sub_check_dimension && (
                        <span className="text-[10px] text-muted-foreground bg-background px-1.5 py-0.5 rounded">{record.sub_check_dimension}</span>
                      )}
                      {record.test_phase && (
                        <span className="text-[10px] text-muted-foreground bg-background px-1.5 py-0.5 rounded">{record.test_phase}</span>
                      )}
                      {record.experience_flow && (
                        <span className="text-[10px] text-muted-foreground bg-background px-1.5 py-0.5 rounded">{record.experience_flow}</span>
                      )}
                      {record.touch_point && (
                        <span className="text-[10px] text-muted-foreground bg-background px-1.5 py-0.5 rounded">{record.touch_point}</span>
                      )}
                      <span className={cn('text-xs font-medium shrink-0',
                        record.evaluation_result === '合格' ? 'text-emerald-600' :
                        record.evaluation_result === '不合格' ? 'text-destructive' : 'text-amber-600'
                      )}>{record.evaluation_result}</span>
                      <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={(e) => { e.stopPropagation(); handleDeleteRecord(record); }}>
                        <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                      </Button>
                    </div>
                    {/* Thumbnails per problem point */}
                    {mats.length > 0 && (
                      <div className="flex gap-1.5 ml-5 mt-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
                        {mats.map((mat) => (
                          <div key={mat.id} className="w-14 h-14 rounded-md overflow-hidden border border-border cursor-pointer relative"
                            onClick={() => open(mat.file_url)}>
                            {mat.material_type === 'image' ? (
                              <img src={mat.file_url} alt={mat.file_name} className="w-full h-full object-cover" />
                            ) : (
                              <>
                                <video src={mat.file_url} className="w-full h-full object-cover" muted preload="metadata" />
                                <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                                  <Play className="h-3.5 w-3.5 text-white fill-white" />
                                </div>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ))
      )}

      {/* Record detail dialog */}
      {selectedRecord && (
        <RecordDetailCard
          record={selectedRecord}
          taskId={taskId}
          existingMaterials={recordMaterials[selectedRecord.id] || []}
          onRefresh={onRefresh}
          onClose={() => setSelectedRecord(null)}
          onImageClick={open}
        />
      )}

      {/* Add button */}
      <div className="sticky bottom-4">
        <Button className="w-full" onClick={() => {
          resetForms();
          // Apply saved senses defaults
          try {
            const saved = localStorage.getItem('senses_defaults');
            if (saved) {
              const defaults = JSON.parse(saved);
              if (defaults.test_phase && defaults.test_phase !== 'clear') {
                setGeneralForm(prev => ({ ...prev, test_phase: defaults.test_phase, experience_flow: defaults.experience_flow && defaults.experience_flow !== 'clear' ? defaults.experience_flow : '' }));
              }
              if (defaults.sensory_dimension && defaults.sensory_dimension !== 'clear') {
                setGeneralForm(prev => ({ ...prev, sensory_dimension: defaults.sensory_dimension }));
                setCategoryForm(prev => ({ ...prev, sensory_dimension: defaults.sensory_dimension }));
                setSensoryForm(prev => ({ ...prev, sensory_dimension: defaults.sensory_dimension }));
              }
            }
          } catch {}
          setAddDialogOpen(true);
        }}>
          <Plus className="h-4 w-4 mr-1.5" /> 新增问题点
        </Button>
      </div>

      {/* Add dialog */}
      <Dialog open={addDialogOpen} onOpenChange={(open) => { setAddDialogOpen(open); if (!open) resetForms(); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>新增问题点</DialogTitle></DialogHeader>
          <div className="mt-2">{renderAddForm()}</div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ─── Record Detail Expand ─── */
function RecordDetailCard({ record, taskId, existingMaterials, onRefresh, onClose, onImageClick }: {
  record: CheckRecord; taskId: string; existingMaterials: Material[]; onRefresh: () => void; onClose: () => void; onImageClick: (url: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const [description, setDescription] = useState(record.problem_description || '');
  const [tempStatus, setTempStatus] = useState(record.evaluation_result);
  const [referenceIds, setReferenceIds] = useState<string[]>([]);
  const [localMaterials, setLocalMaterials] = useState<Material[]>(existingMaterials);
  const [saving, setSaving] = useState(false);

  // Sync localMaterials when existingMaterials changes (e.g. after onRefresh)
  useEffect(() => {
    setLocalMaterials(existingMaterials);
  }, [existingMaterials]);

  // Reset form when record changes
  useEffect(() => {
    setDescription(record.problem_description || '');
    setTempStatus(record.evaluation_result);
    setReferenceIds([]);
  }, [record.id, record.problem_description, record.evaluation_result]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch(`/api/records/${record.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          evaluation_result: tempStatus,
          problem_description: description,
        }),
      });
      // Link referenced materials
      if (referenceIds.length > 0) {
        for (const matId of referenceIds) {
          await fetch('/api/materials', {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: matId, record_id: record.id }),
          });
        }
        setReferenceIds([]);
      }
      onRefresh();
      onClose();
      toast.success('已保存');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setDescription(record.problem_description || '');
    setTempStatus(record.evaluation_result);
    setReferenceIds([]);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleCancel(); else setOpen(v); }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">{record.check_item}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Standard reference tags */}
          <div className="flex flex-wrap gap-1">
            {record.standard_category && <Badge variant="secondary" className="text-[10px]">{record.standard_category}</Badge>}
            {record.check_dimension && <Badge variant="outline" className="text-[10px]">{record.check_dimension}</Badge>}
            {record.sub_check_dimension && <Badge variant="outline" className="text-[10px]">{record.sub_check_dimension}</Badge>}
            {record.test_phase && <Badge variant="outline" className="text-[10px]">{record.test_phase}</Badge>}
            {record.experience_flow && <Badge variant="outline" className="text-[10px]">{record.experience_flow}</Badge>}
            {record.touch_point && <Badge variant="outline" className="text-[10px]">{record.touch_point}</Badge>}
          </div>

          {/* Check requirement & standard */}
          {(record.check_requirement || record.check_standard || record.experience_standard) && (
            <div className="space-y-1 text-xs bg-muted/40 rounded-md p-2">
              {record.check_requirement && <div><span className="text-muted-foreground">检查要求：</span>{record.check_requirement}</div>}
              {record.check_standard && <div><span className="text-muted-foreground">检查标准：</span>{record.check_standard}</div>}
              {record.experience_standard && <div><span className="text-muted-foreground">体验标准：</span>{record.experience_standard}</div>}
            </div>
          )}

          {/* Status */}
          <div className="space-y-2">
            <Label>检查结果</Label>
            <div className="flex gap-2">
              {['合格', '不合格', '待定'].map(r => (
                <button key={r} type="button" onClick={() => setTempStatus(r)}
                  className={cn('flex-1 px-3 py-2.5 rounded-lg text-sm font-medium border transition-colors',
                    tempStatus === r
                      ? r === '合格' ? 'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-400'
                        : r === '不合格' ? 'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400'
                        : 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400'
                      : 'bg-background border-border hover:bg-muted/50')}>
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label>问题描述</Label>
            <Textarea placeholder="填写问题描述..." value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>

          {/* Existing materials (includes both already-linked and newly uploaded) */}
          {localMaterials.length > 0 && (
            <div className="space-y-2">
              <Label>已有素材</Label>
              <div className="grid grid-cols-4 gap-2">
                {localMaterials.map((mat) => (
                  <div key={mat.id} className="aspect-square rounded-lg overflow-hidden bg-muted cursor-pointer border"
                    onClick={() => onImageClick(mat.file_url)}>
                    {mat.material_type === 'image' ? (
                      <img src={mat.file_url} alt={mat.file_name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center relative">
                        <video src={mat.file_url} className="w-full h-full object-cover" muted preload="metadata" />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                          <Play className="h-5 w-5 text-white fill-white" />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Upload & reference materials - use MaterialPicker only */}
          <div className="space-y-2">
            <Label>素材管理</Label>
            <MaterialPicker
              taskId={taskId}
              recordId={record.id}
              selectedIds={referenceIds}
              onSelectionChange={(ids, mats) => { setReferenceIds(ids); setLocalMaterials(mats); }}
            />
            {referenceIds.length > 0 && (
              <p className="text-xs text-muted-foreground">已选择 {referenceIds.length} 个素材，保存时将自动关联</p>
            )}
          </div>

          {/* Save / Cancel */}
          <div className="flex gap-2 justify-end pt-2 border-t">
            <Button variant="outline" onClick={handleCancel}>取消</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? '保存中...' : '保存'}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Tab: 功能效果 ─── */
function FunctionsTab({ taskId }: { taskId: string }) {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingRecipe, setSavingRecipe] = useState(false);
  const [savingStep, setSavingStep] = useState(false);
  const [savingEditStep, setSavingEditStep] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addStepDialogOpen, setAddStepDialogOpen] = useState(false);
  const [editStepDialogOpen, setEditStepDialogOpen] = useState(false);
  const [editRecipeDialogOpen, setEditRecipeDialogOpen] = useState(false);
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [editingStep, setEditingStep] = useState<RecipeStep | null>(null);
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);
  const [newRecipe, setNewRecipe] = useState({ name: '', ingredients: '', recipe_type: '食谱' });
  const [editRecipeForm, setEditRecipeForm] = useState({ name: '', ingredients: '', recipe_type: '食谱' });
  const [newStep, setNewStep] = useState({ operation: '', step_material_ids: [] as string[], problem_points: [{ text: '', material_ids: [] as string[] }] });
  const [stepMaterialIds, setStepMaterialIds] = useState<string[]>([]);
  const [, setStepMaterials] = useState<Material[]>([]);
  const [editStepForm, setEditStepForm] = useState({ operation: '', step_material_ids: [] as string[], problem_points: [{ text: '', material_ids: [] as string[] }] });
  const [editStepMaterialIds, setEditStepMaterialIds] = useState<string[]>([]);
  const [, setEditStepMaterials] = useState<Material[]>([]);
  const { previewUrl: _, open, close: __, PreviewComponent } = useImagePreview();

  // ── Recipe library search (Feature 7) ──
  const [recipeSearch, setRecipeSearch] = useState('');
  const [recipeSearchResults, setRecipeSearchResults] = useState<Recipe[]>([]);
  const [recipeSearchLoading, setRecipeSearchLoading] = useState(false);

  // ── Step reference search (Feature 7) ──
  const [stepRefSearch, setStepRefSearch] = useState('');
  const [stepRefResults, setStepRefResults] = useState<Recipe[]>([]);
  const [stepRefLoading, setStepRefLoading] = useState(false);

  const fetchRecipes = useCallback(async () => {
    const res = await fetch(`/api/recipes?task_id=${taskId}`);
    const data = await res.json();
    if (data.code === 0) {
      const recipesData: Recipe[] = (data.data || []);
      const seen = new Set<string>();
      const deduped = recipesData.filter(r => {
        if (seen.has(r.id)) return false;
        seen.add(r.id);
        return true;
      });
      const enriched = await Promise.all(
        deduped.map(async (recipe: Recipe) => {
          const stepsWithMats = await Promise.all(
            (recipe.recipe_steps || []).map(async (step) => {
              const matRes = await fetch(`/api/materials?recipe_step_id=${step.id}`);
              const matData = await matRes.json();
              return { ...step, materials: matData.data || [] };
            })
          );
          return { ...recipe, recipe_steps: stepsWithMats };
        })
      );
      setRecipes(enriched);
    }
    setLoading(false);
  }, [taskId]);

  useEffect(() => { fetchRecipes(); }, [fetchRecipes]);

  // ── Recipe library fuzzy search ──
  useEffect(() => {
    if (!recipeSearch.trim()) { setRecipeSearchResults([]); return; }
    setRecipeSearchLoading(true);
    const timer = setTimeout(async () => {
      const res = await fetch(`/api/recipes?library=1&keyword=${encodeURIComponent(recipeSearch.trim())}`);
      const data = await res.json();
      if (data.code === 0) setRecipeSearchResults(data.data || []);
      else setRecipeSearchResults([]);
      setRecipeSearchLoading(false);
    }, 300);
    return () => { clearTimeout(timer); setRecipeSearchLoading(false); };
  }, [recipeSearch]);

  // ── Step reference fuzzy search ──
  useEffect(() => {
    if (!stepRefSearch.trim()) { setStepRefResults([]); return; }
    setStepRefLoading(true);
    const timer = setTimeout(async () => {
      const res = await fetch(`/api/recipes?library=1&keyword=${encodeURIComponent(stepRefSearch.trim())}`);
      const data = await res.json();
      if (data.code === 0) setStepRefResults(data.data || []);
      else setStepRefResults([]);
      setStepRefLoading(false);
    }, 300);
    return () => { clearTimeout(timer); setStepRefLoading(false); };
  }, [stepRefSearch]);

  const handleAddRecipe = async () => {
    if (savingRecipe) return;
    setSavingRecipe(true);
    try {
      const res = await fetch('/api/recipes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: taskId, ...newRecipe }),
      });
      const data = await res.json();
      if (data.code === 0) {
        setAddDialogOpen(false);
        setNewRecipe({ name: '', ingredients: '', recipe_type: '食谱' });
        setRecipeSearch('');
        setRecipeSearchResults([]);
        fetchRecipes();
        toast.success('食谱/功能已添加');
      }
    } finally {
      setSavingRecipe(false);
    }
  };

  // ── Edit recipe (Feature 3) ──
  const handleEditRecipe = (recipe: Recipe) => {
    setEditingRecipe(recipe);
    setEditRecipeForm({ name: recipe.name, ingredients: recipe.ingredients || '', recipe_type: recipe.recipe_type || '食谱' });
    setEditRecipeDialogOpen(true);
  };

  const handleSaveEditRecipe = async () => {
    if (!editingRecipe || savingRecipe) return;
    setSavingRecipe(true);
    try {
      const res = await fetch(`/api/recipes/${editingRecipe.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editRecipeForm),
      });
      const data = await res.json();
      if (data.code === 0) {
        setEditRecipeDialogOpen(false);
        setEditingRecipe(null);
        fetchRecipes();
        toast.success('食谱/功能已更新');
      } else toast.error(data.message);
    } finally { setSavingRecipe(false); }
  };

  // ── Reference recipe from library (Feature 7) ──
  const handleReferenceRecipe = async (refRecipe: Recipe) => {
    if (savingRecipe) return;
    setSavingRecipe(true);
    try {
      const res = await fetch('/api/recipes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: taskId, name: refRecipe.name, ingredients: refRecipe.ingredients, recipe_type: refRecipe.recipe_type }),
      });
      const data = await res.json();
      if (data.code === 0) {
        const newRecipeId = data.data?.id;
        // Copy steps from referenced recipe
        if (refRecipe.recipe_steps && refRecipe.recipe_steps.length > 0 && newRecipeId) {
          for (let i = 0; i < refRecipe.recipe_steps.length; i++) {
            const srcStep = refRecipe.recipe_steps[i];
            await fetch('/api/recipe-steps', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                recipe_id: newRecipeId,
                step_number: i + 1,
                operation: srcStep.operation,
                problem_point: srcStep.problem_point,
                problem_points: srcStep.problem_points || [],
              }),
            });
          }
        }
        setAddDialogOpen(false);
        setNewRecipe({ name: '', ingredients: '', recipe_type: '食谱' });
        setRecipeSearch('');
        setRecipeSearchResults([]);
        fetchRecipes();
        toast.success('已引用食谱/功能');
      }
    } finally { setSavingRecipe(false); }
  };

  // ── Step reorder (Feature 6) ──
  const handleReorderStep = async (recipe: Recipe, stepIdx: number, direction: 'up' | 'down') => {
    const steps = recipe.recipe_steps || [];
    if (direction === 'up' && stepIdx === 0) return;
    if (direction === 'down' && stepIdx === steps.length - 1) return;
    const swapIdx = direction === 'up' ? stepIdx - 1 : stepIdx + 1;
    const newSteps = [...steps];
    [newSteps[stepIdx], newSteps[swapIdx]] = [newSteps[swapIdx], newSteps[stepIdx]];
    // Update local state optimistically
    const updatedRecipes = recipes.map(r => {
      if (r.id !== recipe.id) return r;
      return { ...r, recipe_steps: newSteps };
    });
    setRecipes(updatedRecipes);
    // Save to backend
    const reorderData = newSteps.map((s, i) => ({ id: s.id, step_number: i + 1 }));
    await fetch('/api/recipe-steps', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ steps: reorderData }),
    });
  };

  // ── Reference step from another recipe (Feature 7) ──
  const handleReferenceStep = (srcStep: RecipeStep) => {
    setNewStep(prev => ({
      ...prev,
      operation: prev.operation ? prev.operation + '\n' + srcStep.operation : srcStep.operation,
      problem_points: srcStep.problem_points && srcStep.problem_points.length > 0
        ? [...prev.problem_points, ...srcStep.problem_points.map(p => ({ text: p.text || '', material_ids: [] as string[] }))]
        : srcStep.problem_point
          ? [...prev.problem_points, { text: srcStep.problem_point, material_ids: [] as string[] }]
          : prev.problem_points,
    }));
    setStepRefSearch('');
    setStepRefResults([]);
  };

  const handleAddStep = async () => {
    if (!selectedRecipe || savingStep) return;
    setSavingStep(true);
    try {
      const countRes = await fetch(`/api/recipe-steps?recipe_id=${selectedRecipe.id}`);
      const countData = await countRes.json();
      const currentSteps = countData.data || [];
      const stepNum = currentSteps.length + 1;
      // Build legacy problem_point from first non-empty problem point
      const validPPs = newStep.problem_points.filter(p => p.text.trim());
      const legacyPP = validPPs.length > 0 ? validPPs.map(p => p.text).join('；') : null;
      const res = await fetch('/api/recipe-steps', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipe_id: selectedRecipe.id,
          step_number: stepNum,
          operation: newStep.operation,
          problem_point: legacyPP,
          problem_points: validPPs.map(p => ({ text: p.text, material_ids: p.material_ids || [] })),
          step_material_ids: newStep.step_material_ids || [],
        }),
      });
      const data = await res.json();
      if (data.code === 0) {
        const stepId = data.data?.id;
        if (stepId && stepMaterialIds.length > 0) {
          for (const matId of stepMaterialIds) {
            await fetch('/api/materials', {
              method: 'PUT', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: matId, recipe_step_id: stepId }),
            });
          }
        }
        // Link per-problem-point materials
        if (stepId) {
          // Link step-level materials
          for (const matId of (newStep.step_material_ids || [])) {
            await fetch('/api/materials', {
              method: 'PUT', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: matId, recipe_step_id: stepId }),
            });
          }
          // Link per-problem-point materials
          for (const pp of validPPs) {
            if (pp.material_ids && pp.material_ids.length > 0) {
              for (const matId of pp.material_ids) {
                await fetch('/api/materials', {
                  method: 'PUT', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ id: matId, recipe_step_id: stepId }),
                });
              }
            }
          }
        }
        setAddStepDialogOpen(false);
        setNewStep({ operation: '', step_material_ids: [], problem_points: [{ text: '', material_ids: [] }] });
        setStepMaterialIds([]);
        setStepMaterials([]);
        fetchRecipes();
        toast.success('步骤已添加');
      }
    } finally {
      setSavingStep(false);
    }
  };

  const handleEditStep = (step: RecipeStep) => {
    setEditingStep(step);
    // Convert problem_points to form state, or fallback from legacy problem_point
    const pps = step.problem_points && step.problem_points.length > 0
      ? step.problem_points.map(p => ({ text: p.text || '', material_ids: p.material_ids || [] }))
      : step.problem_point
        ? [{ text: step.problem_point, material_ids: [] as string[] }]
        : [{ text: '', material_ids: [] as string[] }];
    // Collect step-level material IDs (materials linked to this step but not to any problem_point)
    const ppMaterialIds = new Set(pps.flatMap(p => p.material_ids || []));
    const stepMats = (step as unknown as Record<string, unknown>).materials as Material[] | undefined;
    const stepMatIds = stepMats ? stepMats.filter(m => !ppMaterialIds.has(m.id)).map(m => m.id) : [];
    setEditStepForm({ operation: step.operation, step_material_ids: stepMatIds, problem_points: pps });
    setEditStepMaterialIds([]);
    setEditStepMaterials([]);
    setEditStepDialogOpen(true);
  };

  const handleSaveEditStep = async () => {
    if (!editingStep || savingEditStep) return;
    setSavingEditStep(true);
    try {
      const validPPs = editStepForm.problem_points.filter(p => p.text.trim());
      const legacyPP = validPPs.length > 0 ? validPPs.map(p => p.text).join('；') : null;
      const res = await fetch(`/api/recipe-steps/${editingStep.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: editStepForm.operation,
          problem_point: legacyPP,
          problem_points: validPPs.map(p => ({ text: p.text, material_ids: p.material_ids || [] })),
          step_material_ids: editStepForm.step_material_ids || [],
        }),
      });
      const data = await res.json();
      if (data.code === 0) {
        // Link step-level materials
        if (editStepForm.step_material_ids && editStepForm.step_material_ids.length > 0) {
          for (const matId of editStepForm.step_material_ids) {
            await fetch('/api/materials', {
              method: 'PUT', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: matId, recipe_step_id: editingStep.id }),
            });
          }
        }
        // Link per-problem-point materials
        for (const pp of validPPs) {
          if (pp.material_ids && pp.material_ids.length > 0) {
            for (const matId of pp.material_ids) {
              await fetch('/api/materials', {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: matId, recipe_step_id: editingStep.id }),
              });
            }
          }
        }
        setEditStepDialogOpen(false);
        setEditingStep(null);
        setEditStepMaterialIds([]);
        setEditStepMaterials([]);
        fetchRecipes();
        toast.success('步骤已更新');
      }
    } finally {
      setSavingEditStep(false);
    }
  };

  const handleDeleteStep = async (step: RecipeStep) => {
    const res = await fetch(`/api/recipe-steps/${step.id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.code === 0) {
      fetchRecipes();
      toast.success('步骤已删除');
    }
  };

  const handleDeleteRecipe = async (recipe: Recipe) => {
    // Delete all steps first
    for (const step of (recipe.recipe_steps || [])) {
      await fetch(`/api/recipe-steps/${step.id}`, { method: 'DELETE' });
    }
    const res = await fetch(`/api/recipes/${recipe.id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.code === 0) {
      if (selectedRecipe?.id === recipe.id) setSelectedRecipe(null);
      fetchRecipes();
      toast.success('食谱/功能已删除');
    }
  };

  return (
    <div className="space-y-4">
      <PreviewComponent />

      {loading ? (
        <div className="space-y-2">{[1,2].map(i => <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />)}</div>
      ) : recipes.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center py-12 text-center">
          <Wrench className="h-10 w-10 text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground">暂无食谱/功能</p>
          <p className="text-xs text-muted-foreground mt-1">点击下方按钮新增</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {recipes.map((recipe) => (
            <Card key={recipe.id} className="cursor-pointer hover:bg-muted/30 transition-colors"
              onClick={() => setSelectedRecipe(selectedRecipe?.id === recipe.id ? null : recipe)}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <Badge variant="secondary" className="text-[10px] shrink-0">{recipe.recipe_type}</Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{recipe.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{recipe.ingredients || '-'}</p>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                    <span>{recipe.recipe_steps?.length || 0} 步骤</span>
                    <span>{recipe.problem_count || 0} 问题</span>
                  </div>
                  <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={(e) => { e.stopPropagation(); handleEditRecipe(recipe); }}>
                    <Pencil className="h-3 w-3 text-muted-foreground" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={(e) => { e.stopPropagation(); handleDeleteRecipe(recipe); }}>
                    <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                  </Button>
                </div>
              </CardContent>

              {/* Expanded detail */}
              {selectedRecipe?.id === recipe.id && (
                <div className="px-4 pb-4 space-y-2 border-t border-border pt-3" onClick={(e) => e.stopPropagation()}>
                  {recipe.recipe_steps?.map((step, stepIdx) => (
                    <div key={step.id} className="p-3 rounded-lg bg-muted/30 space-y-1.5 cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => handleEditStep(step)}>
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] flex items-center justify-center font-medium">
                          {stepIdx + 1}
                        </span>
                        <span className="text-sm flex-1 min-w-0 break-all">{step.operation}</span>
                        <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-5 w-5" disabled={stepIdx === 0}
                            onClick={() => handleReorderStep(recipe, stepIdx, 'up')}>
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                          </Button>
                          <Button variant="ghost" size="icon" className="h-5 w-5" disabled={stepIdx === (recipe.recipe_steps?.length || 0) - 1}
                            onClick={() => handleReorderStep(recipe, stepIdx, 'down')}>
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                          </Button>
                        </div>
                        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={(e) => { e.stopPropagation(); handleDeleteStep(step); }}>
                          <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                        </Button>
                        <Pencil className="h-3 w-3 text-muted-foreground shrink-0" />
                      </div>
                      {/* Problem points display */}
                      {(() => {
                        const pps = step.problem_points && step.problem_points.length > 0
                          ? step.problem_points.filter(p => p.text && p.text.trim())
                          : step.problem_point
                            ? [{ text: step.problem_point, material_ids: [] as string[] }]
                            : [];
                        if (pps.length === 0) return null;
                        return (
                          <div className="ml-7 space-y-1">
                            {pps.map((pp, ppIdx) => (
                              <div key={ppIdx} className="flex items-start gap-1.5">
                                {pps.length > 1 && <span className="text-[10px] text-amber-600 font-medium shrink-0">问题{ppIdx + 1}:</span>}
                                <p className="text-xs text-amber-600">{pp.text}</p>
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                      {step.materials && step.materials.length > 0 && (
                        <div className="flex gap-1.5 ml-7 flex-wrap">
                          {step.materials.map((mat) => (
                            <div key={mat.id} className="w-14 h-14 rounded-md overflow-hidden border border-border cursor-pointer"
                              onClick={(e) => { e.stopPropagation(); open(mat.file_url); }}>
                              {mat.material_type === 'image' ? (
                                <img src={mat.file_url} alt={mat.file_name} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center bg-muted relative">
                                  <video src={mat.file_url} className="w-full h-full object-cover" muted preload="metadata" />
                                  <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                                    <Play className="h-4 w-4 text-white fill-white" />
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  <Button variant="outline" size="sm" className="w-full"
                    onClick={() => { setSelectedRecipe(recipe); setAddStepDialogOpen(true); }}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> 新增步骤
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <div className="sticky bottom-4">
        <Button className="w-full" onClick={() => setAddDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" /> 新增食谱/功能
        </Button>
      </div>

      {/* Add recipe dialog */}
      <Dialog open={addDialogOpen} onOpenChange={(open) => { setAddDialogOpen(open); if (!open) { setRecipeSearch(''); setRecipeSearchResults([]); } }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>新增食谱/功能</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            {/* Recipe library search (Feature 7) */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">从食谱库引用</Label>
              <Input placeholder="搜索已有食谱名称..." value={recipeSearch}
                onChange={(e) => setRecipeSearch(e.target.value)} />
              {recipeSearchLoading && <p className="text-[11px] text-muted-foreground animate-pulse">搜索中...</p>}
              {recipeSearchResults.length > 0 && (
                <div className="max-h-40 overflow-y-auto space-y-1 border rounded-lg p-2">
                  {recipeSearchResults.map((refRecipe) => (
                    <div key={refRecipe.id} className="p-2 rounded-md cursor-pointer text-xs transition-colors border border-transparent hover:bg-muted/50"
                      onClick={() => handleReferenceRecipe(refRecipe)}>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-[9px] h-4 shrink-0">{refRecipe.recipe_type}</Badge>
                        <span className="font-medium">{refRecipe.name}</span>
                        <span className="text-muted-foreground">{refRecipe.recipe_steps?.length || 0}步</span>
                      </div>
                      {refRecipe.ingredients && <p className="text-muted-foreground mt-0.5 line-clamp-1">{refRecipe.ingredients}</p>}
                    </div>
                  ))}
                </div>
              )}
              {recipeSearch.trim() && !recipeSearchLoading && recipeSearchResults.length === 0 && (
                <p className="text-[11px] text-muted-foreground">未找到匹配的食谱</p>
              )}
            </div>

            <Separator />

            <div className="space-y-1.5">
              <Label>类型</Label>
              <Select value={newRecipe.recipe_type} onValueChange={(v) => setNewRecipe({ ...newRecipe, recipe_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="食谱">食谱</SelectItem>
                  <SelectItem value="功能">功能</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{newRecipe.recipe_type === '食谱' ? '食谱名称' : '功能名称'} *</Label>
              <Input placeholder={newRecipe.recipe_type === '食谱' ? '如：豆浆食谱' : '如：搅拌功能'}
                value={newRecipe.name} onChange={(e) => setNewRecipe({ ...newRecipe, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>食材/参数</Label>
              <Textarea placeholder={newRecipe.recipe_type === '食谱' ? '填写食材' : '填写功能参数'}
                value={newRecipe.ingredients} onChange={(e) => setNewRecipe({ ...newRecipe, ingredients: e.target.value })} rows={2} />
            </div>
            <Button onClick={handleAddRecipe} className="w-full" disabled={!newRecipe.name || savingRecipe}>{savingRecipe ? '保存中...' : '保存'}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add step dialog */}
      <Dialog open={addStepDialogOpen} onOpenChange={(open) => { setAddStepDialogOpen(open); if (!open) { setStepMaterialIds([]); setStepMaterials([]); setNewStep({ operation: '', step_material_ids: [], problem_points: [{ text: '', material_ids: [] }] }); setStepRefSearch(''); setStepRefResults([]); } }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>新增步骤 - {selectedRecipe?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            {/* Step reference search (Feature 7) */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">引用已有步骤</Label>
              <Input placeholder="搜索食谱名称以引用步骤..." value={stepRefSearch}
                onChange={(e) => setStepRefSearch(e.target.value)} />
              {stepRefLoading && <p className="text-[11px] text-muted-foreground animate-pulse">搜索中...</p>}
              {stepRefResults.length > 0 && (
                <div className="max-h-40 overflow-y-auto space-y-1 border rounded-lg p-2">
                  {stepRefResults.map((refRecipe) => (
                    <div key={refRecipe.id} className="space-y-1">
                      <div className="text-xs font-medium text-primary">{refRecipe.name}</div>
                      {(refRecipe.recipe_steps || []).map((s) => (
                        <div key={s.id} className="p-1.5 rounded cursor-pointer text-xs hover:bg-muted/50 border border-transparent"
                          onClick={() => handleReferenceStep(s)}>
                          <span className="text-muted-foreground">步骤{s.step_number}:</span> <span className="line-clamp-1">{s.operation}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
              {stepRefSearch.trim() && !stepRefLoading && stepRefResults.length === 0 && (
                <p className="text-[11px] text-muted-foreground">未找到匹配的食谱</p>
              )}
            </div>

            <Separator />

            <div className="space-y-1.5">
              <Label>具体操作 *</Label>
              <Textarea placeholder="描述该步骤的操作" value={newStep.operation}
                onChange={(e) => setNewStep({ ...newStep, operation: e.target.value })} rows={3} />
            </div>
            <div className="space-y-1.5">
              <Label>步骤素材</Label>
              <p className="text-[11px] text-muted-foreground">附录该步骤的效果图片或视频（如食物成品效果），与问题点素材独立</p>
              <MaterialPicker
                taskId={taskId}
                selectedIds={newStep.step_material_ids || []}
                onSelectionChange={(ids, mats) => {
                  setNewStep({ ...newStep, step_material_ids: ids });
                  setStepMaterialIds(prev => [...new Set([...prev, ...ids])]);
                  setStepMaterials(mats);
                }}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>问题点</Label>
                <Button type="button" variant="ghost" size="sm" className="h-6 text-xs text-primary"
                  onClick={() => setNewStep({ ...newStep, problem_points: [...newStep.problem_points, { text: '', material_ids: [] }] })}>
                  <Plus className="h-3 w-3 mr-1" /> 添加问题点
                </Button>
              </div>
              {newStep.problem_points.map((pp, idx) => (
                <div key={idx} className="p-2 rounded-lg border bg-muted/20 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground font-medium shrink-0">问题{idx + 1}</span>
                    {newStep.problem_points.length > 1 && (
                      <Button type="button" variant="ghost" size="icon" className="h-5 w-5 ml-auto"
                        onClick={() => setNewStep({ ...newStep, problem_points: newStep.problem_points.filter((_, i) => i !== idx) })}>
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                  <Textarea placeholder="描述问题点..." value={pp.text}
                    onChange={(e) => {
                      const updated = [...newStep.problem_points];
                      updated[idx] = { ...updated[idx], text: e.target.value };
                      setNewStep({ ...newStep, problem_points: updated });
                    }} rows={2} />
                  <MaterialPicker
                    taskId={taskId}
                    selectedIds={pp.material_ids || []}
                    onSelectionChange={(ids, mats) => {
                      const updated = [...newStep.problem_points];
                      updated[idx] = { ...updated[idx], material_ids: ids };
                      setNewStep({ ...newStep, problem_points: updated });
                      // Also update global step materials
                      const allIds = newStep.problem_points.flatMap((p, i) => i === idx ? ids : (p.material_ids || []));
                      setStepMaterialIds(allIds);
                      setStepMaterials(mats);
                    }}
                  />
                </div>
              ))}
            </div>
            <Button onClick={handleAddStep} className="w-full" disabled={!newStep.operation || savingStep}>{savingStep ? '保存中...' : '保存步骤'}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit step dialog */}
      <Dialog open={editStepDialogOpen} onOpenChange={(open) => { setEditStepDialogOpen(open); if (!open) { setEditingStep(null); setEditStepMaterialIds([]); setEditStepMaterials([]); } }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>编辑步骤</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="space-y-1.5">
              <Label>具体操作 *</Label>
              <Textarea placeholder="描述该步骤的操作" value={editStepForm.operation}
                onChange={(e) => setEditStepForm({ ...editStepForm, operation: e.target.value })} rows={3} />
            </div>
            <div className="space-y-1.5">
              <Label>步骤素材</Label>
              <p className="text-[11px] text-muted-foreground">附录该步骤的效果图片或视频（如食物成品效果），与问题点素材独立</p>
              <MaterialPicker
                taskId={taskId}
                selectedIds={editStepForm.step_material_ids || []}
                onSelectionChange={(ids, mats) => {
                  setEditStepForm({ ...editStepForm, step_material_ids: ids });
                  setEditStepMaterialIds(ids);
                  setEditStepMaterials(mats);
                }}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>问题点</Label>
                <Button type="button" variant="ghost" size="sm" className="h-6 text-xs text-primary"
                  onClick={() => setEditStepForm({ ...editStepForm, problem_points: [...editStepForm.problem_points, { text: '', material_ids: [] }] })}>
                  <Plus className="h-3 w-3 mr-1" /> 添加问题点
                </Button>
              </div>
              {editStepForm.problem_points.map((pp, idx) => (
                <div key={idx} className="p-2 rounded-lg border bg-muted/20 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground font-medium shrink-0">问题{idx + 1}</span>
                    {editStepForm.problem_points.length > 1 && (
                      <Button type="button" variant="ghost" size="icon" className="h-5 w-5 ml-auto"
                        onClick={() => setEditStepForm({ ...editStepForm, problem_points: editStepForm.problem_points.filter((_, i) => i !== idx) })}>
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                  <Textarea placeholder="描述问题点..." value={pp.text}
                    onChange={(e) => {
                      const updated = [...editStepForm.problem_points];
                      updated[idx] = { ...updated[idx], text: e.target.value };
                      setEditStepForm({ ...editStepForm, problem_points: updated });
                    }} rows={2} />
                  <MaterialPicker
                    taskId={taskId}
                    selectedIds={pp.material_ids || []}
                    onSelectionChange={(ids, mats) => {
                      const updated = [...editStepForm.problem_points];
                      updated[idx] = { ...updated[idx], material_ids: ids };
                      setEditStepForm({ ...editStepForm, problem_points: updated });
                      setEditStepMaterialIds(ids);
                      setEditStepMaterials(mats);
                    }}
                  />
                </div>
              ))}
            </div>
            {/* Existing materials preview */}
            {editingStep?.materials && editingStep.materials.length > 0 && (
              <div className="space-y-1.5">
                <Label>当前关联素材</Label>
                <div className="flex gap-1.5 flex-wrap">
                  {editingStep.materials.map((mat) => (
                    <div key={mat.id} className="w-14 h-14 rounded-md overflow-hidden border border-border cursor-pointer"
                      onClick={() => open(mat.file_url)}>
                      {mat.material_type === 'image' ? (
                        <img src={mat.file_url} alt={mat.file_name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-muted relative">
                          <video src={mat.file_url} className="w-full h-full object-cover" muted preload="metadata" />
                          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                            <Play className="h-4 w-4 text-white fill-white" />
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <Button onClick={handleSaveEditStep} className="w-full" disabled={!editStepForm.operation || savingEditStep}>{savingEditStep ? '保存中...' : '保存修改'}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit recipe dialog (Feature 3) */}
      <Dialog open={editRecipeDialogOpen} onOpenChange={setEditRecipeDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>编辑食谱/功能</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="space-y-1.5">
              <Label>类型</Label>
              <Select value={editRecipeForm.recipe_type} onValueChange={(v) => setEditRecipeForm({ ...editRecipeForm, recipe_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="食谱">食谱</SelectItem>
                  <SelectItem value="功能">功能</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{editRecipeForm.recipe_type === '食谱' ? '食谱名称' : '功能名称'} *</Label>
              <Input value={editRecipeForm.name} onChange={(e) => setEditRecipeForm({ ...editRecipeForm, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>食材/参数</Label>
              <Textarea value={editRecipeForm.ingredients} onChange={(e) => setEditRecipeForm({ ...editRecipeForm, ingredients: e.target.value })} rows={2} />
            </div>
            <Button onClick={handleSaveEditRecipe} className="w-full" disabled={!editRecipeForm.name || savingRecipe}>{savingRecipe ? '保存中...' : '保存修改'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
