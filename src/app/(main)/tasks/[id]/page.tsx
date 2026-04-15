'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, FileText, Eye, Wrench, Package, Plus, Camera, Video, Pencil, Trash2, Check, Upload } from 'lucide-react';
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
interface TaskDetail {
  id: string; task_name: string; product_category: string; product_model: string;
  project_phase: string | null; test_date: string | null; organizer: string | null;
  target_user: string | null; test_purpose: string | null; test_method: string | null;
  status: string; assigned_to: string | null; created_at: string;
  records: CheckRecord[]; issues: Issue[];
}

interface CheckRecord {
  id: string; sensory_dimension: string | null; check_dimension: string | null;
  check_item: string; check_requirement: string | null; evaluation_result: string;
  problem_description: string | null; measurement_value: string | null;
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

interface RecipeStep {
  id: string; step_number: number; operation: string; problem_point: string | null;
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
          <p className="text-sm text-muted-foreground mt-1">{task.product_model} | {task.product_category}</p>
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
      {activeTab === 'info' && <BasicInfoTab task={task} />}
      {activeTab === 'materials' && <MaterialsTab taskId={id} />}
      {activeTab === 'senses' && <SensesTab taskId={id} records={task.records || []} taskProductCategory={task.product_category} onRefresh={fetchTask} />}
      {activeTab === 'functions' && <FunctionsTab taskId={id} />}
    </div>
  );
}

/* ─── Tab: 基本信息 ─── */
function BasicInfoTab({ task }: { task: TaskDetail }) {
  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        {[
          { label: '任务名称', value: task.task_name },
          { label: '产品品类', value: task.product_category },
          { label: '产品型号', value: task.product_model },
          { label: '项目阶段', value: task.project_phase },
          { label: '体验时间', value: task.test_date },
          { label: '组织人', value: task.organizer },
          { label: '目标人群', value: task.target_user },
          { label: '体验目的', value: task.test_purpose },
          { label: '体验方法', value: task.test_method },
          { label: '状态', value: task.status },
          { label: '负责人', value: task.assigned_to },
        ].map((item) => (
          <div key={item.label} className="flex gap-4">
            <span className="text-xs text-muted-foreground w-20 shrink-0">{item.label}</span>
            <span className="text-sm">{item.value || '-'}</span>
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
        <div className="grid grid-cols-3 gap-2">{[1,2,3].map(i => <div key={i} className="aspect-square bg-muted animate-pulse rounded-lg" />)}</div>
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
  check_dimension: string | null;
  check_item: string;
  check_requirement: string | null;
  measurement_position: string | null;
  check_tool: string | null;
  standard_a: string | null;
  standard_b: string | null;
  standard_c: string | null;
  problem_level: string | null;
  standard: { id: string; standard_name: string; category: string; product_category: string | null } | null;
}

function SensesTab({ taskId, records, taskProductCategory, onRefresh }: { taskId: string; records: CheckRecord[]; taskProductCategory?: string; onRefresh: () => void }) {
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [form, setForm] = useState({ sensory_dimension: '', check_dimension: '', check_item: '', problem_description: '' });
  const [selectedMaterialIds, setSelectedMaterialIds] = useState<string[]>([]);
  const [, setSelectedMaterials] = useState<Material[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<CheckRecord | null>(null);
  const [recordMaterials, setRecordMaterials] = useState<Record<string, Material[]>>({});
  const { previewUrl: _, open, close: __, PreviewComponent } = useImagePreview();

  // Standard items search state
  const [standardItems, setStandardItems] = useState<StandardItem[]>([]);
  const [filterSensory, setFilterSensory] = useState<string>('');
  const [filterPhase, setFilterPhase] = useState<string>('');
  const [filterDimension, setFilterDimension] = useState<string>('');
  const [selectedStandardItem, setSelectedStandardItem] = useState<StandardItem | null>(null);
  const [showStandardItemPanel, setShowStandardItemPanel] = useState(false);

  // Fetch standard items when filters change
  useEffect(() => {
    const fetchItems = async () => {
      const params = new URLSearchParams();
      if (filterSensory) params.set('sensory_dimension', filterSensory);
      if (filterPhase) params.set('test_phase', filterPhase);
      if (filterDimension) params.set('check_dimension', filterDimension);
      if (taskProductCategory) params.set('product_category', taskProductCategory);
      const res = await fetch(`/api/standard-items/search?${params}`);
      const data = await res.json();
      if (data.code === 0) setStandardItems(data.data || []);
      else setStandardItems([]);
    };
    fetchItems();
  }, [filterSensory, filterPhase, filterDimension, taskProductCategory]);

  // When a standard item is selected, populate the form
  const handleSelectStandardItem = (item: StandardItem) => {
    setSelectedStandardItem(item);
    setForm({
      sensory_dimension: item.sensory_dimension || '',
      check_dimension: item.check_dimension || '',
      check_item: item.check_item || '',
      problem_description: item.check_requirement || '',
    });
  };

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

  const handleAdd = async () => {
    const res = await fetch('/api/records', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task_id: taskId,
        standard_item_id: selectedStandardItem?.id || null,
        ...form,
        evaluation_result: '待定',
        sort_order: records.length,
      }),
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
      setForm({ sensory_dimension: '', check_dimension: '', check_item: '', problem_description: '' });
      setSelectedMaterialIds([]);
      setSelectedMaterials([]);
      setSelectedStandardItem(null);
      setShowStandardItemPanel(false);
      onRefresh();
      toast.success('问题点已添加');
    }
  };

  // Group by sensory dimension
  const grouped = records.reduce<Record<string, CheckRecord[]>>((acc, r) => {
    const key = r.sensory_dimension || '未分类';
    if (!acc[key]) acc[key] = [];
    acc[key].push(r);
    return acc;
  }, {});

  // Get unique values from standard items for filter options
  const uniqueSensory = [...new Set(standardItems.map(i => i.sensory_dimension).filter(Boolean))] as string[];
  const uniquePhases = [...new Set(standardItems.map(i => i.test_phase).filter(Boolean))] as string[];
  const uniqueDimensions = [...new Set(standardItems.map(i => i.check_dimension).filter(Boolean))] as string[];

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
        Object.entries(grouped).map(([dimension, items]) => (
          <Card key={dimension}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Badge className={cn('text-[10px]', sensoryColors[dimension] || 'bg-muted')}>{dimension}</Badge>
                <span className="text-muted-foreground text-xs">{items.length} 项</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {items.map((record) => {
                const mats = recordMaterials[record.id] || [];
                const matImages = mats.filter(m => m.material_type === 'image');
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
                      <span className={cn('text-xs font-medium shrink-0',
                        record.evaluation_result === '合格' ? 'text-emerald-600' :
                        record.evaluation_result === '不合格' ? 'text-destructive' : 'text-amber-600'
                      )}>{record.evaluation_result}</span>
                    </div>
                    {/* Thumbnails per problem point */}
                    {matImages.length > 0 && (
                      <div className="flex gap-1.5 ml-5 mt-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
                        {matImages.map((mat) => (
                          <div key={mat.id} className="w-14 h-14 rounded-md overflow-hidden border border-border cursor-pointer"
                            onClick={() => open(mat.file_url)}>
                            <img src={mat.file_url} alt={mat.file_name} className="w-full h-full object-cover" />
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

      {/* Record detail expand */}
      {selectedRecord && (
        <RecordDetailCard record={selectedRecord} taskId={taskId} onRefresh={onRefresh} onImageClick={open} />
      )}

      {/* Add button */}
      <div className="sticky bottom-4">
        <Button className="w-full" onClick={() => setAddDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" /> 新增问题点
        </Button>
      </div>

      {/* Add dialog */}
      <Dialog open={addDialogOpen} onOpenChange={(open) => { setAddDialogOpen(open); if (!open) { setSelectedMaterialIds([]); setSelectedMaterials([]); setSelectedStandardItem(null); setShowStandardItemPanel(false); } }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>新增问题点</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            {/* Standard item reference section */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">从标准库引用（可选）</Label>
                <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setShowStandardItemPanel(!showStandardItemPanel)}>
                  {showStandardItemPanel ? '收起' : '展开筛选'}
                </Button>
              </div>
              {showStandardItemPanel && (
                <div className="space-y-2 p-3 rounded-lg bg-muted/30 border border-border">
                  <div className="grid grid-cols-3 gap-2">
                    <Select value={filterSensory} onValueChange={(v) => setFilterSensory(v === 'all' ? '' : v)}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="感官维度" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">全部</SelectItem>
                        <SelectItem value="视觉">视觉</SelectItem>
                        <SelectItem value="听觉">听觉</SelectItem>
                        <SelectItem value="触觉">触觉</SelectItem>
                        <SelectItem value="嗅觉">嗅觉</SelectItem>
                        <SelectItem value="味觉">味觉</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={filterPhase} onValueChange={(v) => setFilterPhase(v === 'all' ? '' : v)}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="体验阶段" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">全部</SelectItem>
                        {uniquePhases.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                        <SelectItem value="开箱">开箱</SelectItem>
                        <SelectItem value="使用">使用</SelectItem>
                        <SelectItem value="清洁">清洁</SelectItem>
                        <SelectItem value="收纳">收纳</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={filterDimension} onValueChange={(v) => setFilterDimension(v === 'all' ? '' : v)}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="检查维度" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">全部</SelectItem>
                        <SelectItem value="间隙">间隙</SelectItem>
                        <SelectItem value="段差">段差</SelectItem>
                        <SelectItem value="表面质量">表面质量</SelectItem>
                        <SelectItem value="色差">色差</SelectItem>
                        <SelectItem value="结构强度">结构强度</SelectItem>
                        {uniqueDimensions.map(d => (
                          !['间隙','段差','表面质量','色差','结构强度'].includes(d) && <SelectItem key={d} value={d}>{d}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {/* Standard items list */}
                  {standardItems.length > 0 ? (
                    <div className="max-h-40 overflow-y-auto space-y-1">
                      {standardItems.slice(0, 30).map((item) => (
                        <div
                          key={item.id}
                          className={cn(
                            'p-2 rounded-md cursor-pointer text-xs transition-colors border',
                            selectedStandardItem?.id === item.id
                              ? 'border-primary bg-primary/5'
                              : 'border-transparent hover:bg-muted/50'
                          )}
                          onClick={() => handleSelectStandardItem(item)}
                        >
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {item.sensory_dimension && (
                              <Badge className={cn('text-[9px] h-4', sensoryColors[item.sensory_dimension] || 'bg-muted')}>{item.sensory_dimension}</Badge>
                            )}
                            <span className="font-medium">{item.check_item}</span>
                            {item.check_dimension && (
                              <span className="text-muted-foreground">{item.check_dimension}</span>
                            )}
                          </div>
                          {item.check_requirement && (
                            <p className="text-muted-foreground mt-0.5 line-clamp-1">{item.check_requirement}</p>
                          )}
                          {item.standard && (
                            <p className="text-muted-foreground mt-0.5 text-[10px]">来源: {item.standard.standard_name}</p>
                          )}
                        </div>
                      ))}
                      {standardItems.length > 30 && (
                        <p className="text-[10px] text-muted-foreground text-center py-1">还有 {standardItems.length - 30} 项...</p>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground text-center py-2">暂无匹配的标准检查项</p>
                  )}
                </div>
              )}
              {selectedStandardItem && (
                <div className="flex items-center gap-2 px-2 py-1.5 bg-primary/5 rounded-md border border-primary/20">
                  <Badge className="text-[9px] h-4">已引用</Badge>
                  <span className="text-xs font-medium truncate">{selectedStandardItem.check_item}</span>
                  <Button variant="ghost" size="sm" className="h-5 w-5 p-0 ml-auto" onClick={() => { setSelectedStandardItem(null); setForm({ sensory_dimension: '', check_dimension: '', check_item: '', problem_description: '' }); }}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>

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
              <Label>检查维度</Label>
              <Select value={form.check_dimension} onValueChange={(v) => setForm({ ...form, check_dimension: v })}>
                <SelectTrigger><SelectValue placeholder="选择检查维度" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="间隙">间隙</SelectItem>
                  <SelectItem value="段差">段差</SelectItem>
                  <SelectItem value="表面质量">表面质量</SelectItem>
                  <SelectItem value="色差">色差</SelectItem>
                  <SelectItem value="结构强度">结构强度</SelectItem>
                  <SelectItem value="装配精度">装配精度</SelectItem>
                  <SelectItem value="其他">其他</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>问题描述 *</Label>
              <Textarea placeholder="描述发现的问题..." value={form.check_item} onChange={(e) => setForm({ ...form, check_item: e.target.value })} rows={3} />
            </div>
            <MaterialPicker
              taskId={taskId}
              selectedIds={selectedMaterialIds}
              onSelectionChange={(ids, mats) => { setSelectedMaterialIds(ids); setSelectedMaterials(mats); }}
            />
            <Button onClick={handleAdd} className="w-full" disabled={!form.check_item}>
              添加
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ─── Record Detail Expand ─── */
function RecordDetailCard({ record, taskId, onRefresh, onImageClick }: {
  record: CheckRecord; taskId: string; onRefresh: () => void; onImageClick: (url: string) => void;
}) {
  const [evaluation, setEvaluation] = useState(record.evaluation_result);
  const [description, setDescription] = useState(record.problem_description || '');
  const [referenceIds, setReferenceIds] = useState<string[]>([]);
  const [, setReferenceMats] = useState<Material[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSave = async () => {
    await fetch(`/api/records/${record.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ evaluation_result: evaluation, problem_description: description }),
    });
    // Link referenced materials to this record
    if (referenceIds.length > 0) {
      for (const matId of referenceIds) {
        await fetch('/api/materials', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: matId, record_id: record.id }),
        });
      }
      setReferenceIds([]);
      setReferenceMats([]);
    }
    onRefresh();
    toast.success('已保存');
  };

  const handleUpload = async (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('task_id', taskId);
      formData.append('record_id', record.id);
      await fetch('/api/materials/upload', { method: 'POST', body: formData });
    }
    onRefresh();
    toast.success('素材已上传');
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{record.check_item}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          {['合格', '不合格', '待定'].map((r) => (
            <Button key={r} size="sm" variant={evaluation === r ? 'default' : 'outline'}
              className={cn(
                evaluation === r && r === '合格' && 'bg-emerald-600 hover:bg-emerald-700',
                evaluation === r && r === '不合格' && 'bg-destructive hover:bg-destructive/90',
                evaluation === r && r === '待定' && 'bg-amber-500 hover:bg-amber-600',
              )}
              onClick={() => setEvaluation(r)}>{r}</Button>
          ))}
        </div>
        <Textarea placeholder="问题描述..." value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        {/* Materials */}
        {record.materials && record.materials.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {record.materials.map((mat) => (
              <div key={mat.id} className="aspect-square rounded-lg overflow-hidden bg-muted cursor-pointer"
                onClick={() => mat.material_type === 'image' && onImageClick(mat.file_url)}>
                {mat.material_type === 'image' ? (
                  <img src={mat.file_url} alt={mat.file_name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center"><Video className="h-6 w-6 text-muted-foreground" /></div>
                )}
              </div>
            ))}
          </div>
        )}
        {/* Reference material picker */}
        <MaterialPicker
          taskId={taskId}
          selectedIds={referenceIds}
          onSelectionChange={(ids, mats) => { setReferenceIds(ids); setReferenceMats(mats); }}
        />
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-3.5 w-3.5 mr-1" /> 上传图片
          </Button>
          <Button size="sm" onClick={handleSave}><Check className="h-3.5 w-3.5 mr-1" /> 保存</Button>
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleUpload(e.target.files)} />
      </CardContent>
    </Card>
  );
}

/* ─── Tab: 功能效果 ─── */
function FunctionsTab({ taskId }: { taskId: string }) {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addStepDialogOpen, setAddStepDialogOpen] = useState(false);
  const [editStepDialogOpen, setEditStepDialogOpen] = useState(false);
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [editingStep, setEditingStep] = useState<RecipeStep | null>(null);
  const [newRecipe, setNewRecipe] = useState({ name: '', ingredients: '', recipe_type: '食谱' });
  const [newStep, setNewStep] = useState({ operation: '', problem_point: '' });
  const [stepMaterialIds, setStepMaterialIds] = useState<string[]>([]);
  const [, setStepMaterials] = useState<Material[]>([]);
  const [editStepForm, setEditStepForm] = useState({ operation: '', problem_point: '' });
  const [editStepMaterialIds, setEditStepMaterialIds] = useState<string[]>([]);
  const [, setEditStepMaterials] = useState<Material[]>([]);
  const { previewUrl: _, open, close: __, PreviewComponent } = useImagePreview();

  const fetchRecipes = useCallback(async () => {
    const res = await fetch(`/api/recipes?task_id=${taskId}`);
    const data = await res.json();
    if (data.code === 0) {
      // For each recipe, fetch step materials
      const recipesData = data.data || [];
      const enriched = await Promise.all(
        recipesData.map(async (recipe: Recipe) => {
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

  const handleAddRecipe = async () => {
    const res = await fetch('/api/recipes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_id: taskId, ...newRecipe }),
    });
    const data = await res.json();
    if (data.code === 0) {
      setAddDialogOpen(false);
      setNewRecipe({ name: '', ingredients: '', recipe_type: '食谱' });
      fetchRecipes();
      toast.success('食谱/功能已添加');
    }
  };

  const handleAddStep = async () => {
    if (!selectedRecipe) return;
    // Query current step count from DB to avoid stale client state
    const countRes = await fetch(`/api/recipe-steps?recipe_id=${selectedRecipe.id}`);
    const countData = await countRes.json();
    const currentSteps = countData.data || [];
    const stepNum = currentSteps.length + 1;
    const res = await fetch('/api/recipe-steps', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipe_id: selectedRecipe.id, step_number: stepNum, ...newStep }),
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
      setAddStepDialogOpen(false);
      setNewStep({ operation: '', problem_point: '' });
      setStepMaterialIds([]);
      setStepMaterials([]);
      fetchRecipes();
      toast.success('步骤已添加');
    }
  };

  const handleEditStep = (step: RecipeStep) => {
    setEditingStep(step);
    setEditStepForm({ operation: step.operation, problem_point: step.problem_point || '' });
    setEditStepMaterialIds([]);
    setEditStepMaterialIds([]);
    setEditStepDialogOpen(true);
  };

  const handleSaveEditStep = async () => {
    if (!editingStep) return;
    const res = await fetch(`/api/recipe-steps/${editingStep.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operation: editStepForm.operation,
        problem_point: editStepForm.problem_point || null,
      }),
    });
    const data = await res.json();
    if (data.code === 0) {
      // Link new materials
      if (editStepMaterialIds.length > 0) {
        for (const matId of editStepMaterialIds) {
          await fetch('/api/materials', {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: matId, recipe_step_id: editingStep.id }),
          });
        }
      }
      setEditStepDialogOpen(false);
      setEditingStep(null);
      setEditStepMaterialIds([]);
      setEditStepMaterials([]);
      fetchRecipes();
      toast.success('步骤已更新');
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
                        <span className="text-sm flex-1">{step.operation}</span>
                        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={(e) => { e.stopPropagation(); handleDeleteStep(step); }}>
                          <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                        </Button>
                        <Pencil className="h-3 w-3 text-muted-foreground shrink-0" />
                      </div>
                      {step.problem_point && (
                        <p className="text-xs text-amber-600 ml-7">问题: {step.problem_point}</p>
                      )}
                      {step.materials && step.materials.length > 0 && (
                        <div className="flex gap-1.5 ml-7 flex-wrap">
                          {step.materials.map((mat) => (
                            <div key={mat.id} className="w-14 h-14 rounded-md overflow-hidden border border-border cursor-pointer"
                              onClick={(e) => { e.stopPropagation(); mat.material_type === 'image' && open(mat.file_url); }}>
                              {mat.material_type === 'image' ? (
                                <img src={mat.file_url} alt={mat.file_name} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center bg-muted"><Video className="h-4 w-4 text-muted-foreground" /></div>
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
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>新增食谱/功能</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
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
            <Button onClick={handleAddRecipe} className="w-full" disabled={!newRecipe.name}>保存</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add step dialog */}
      <Dialog open={addStepDialogOpen} onOpenChange={(open) => { setAddStepDialogOpen(open); if (!open) { setStepMaterialIds([]); setStepMaterials([]); } }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>新增步骤 - {selectedRecipe?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="space-y-1.5">
              <Label>具体操作 *</Label>
              <Textarea placeholder="描述该步骤的操作" value={newStep.operation}
                onChange={(e) => setNewStep({ ...newStep, operation: e.target.value })} rows={3} />
            </div>
            <div className="space-y-1.5">
              <Label>问题点</Label>
              <Textarea placeholder="发现的问题（可选）" value={newStep.problem_point}
                onChange={(e) => setNewStep({ ...newStep, problem_point: e.target.value })} rows={2} />
            </div>
            <MaterialPicker
              taskId={taskId}
              selectedIds={stepMaterialIds}
              onSelectionChange={(ids, mats) => { setStepMaterialIds(ids); setStepMaterials(mats); }}
            />
            <Button onClick={handleAddStep} className="w-full" disabled={!newStep.operation}>保存步骤</Button>
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
              <Label>问题点</Label>
              <Textarea placeholder="发现的问题（可选）" value={editStepForm.problem_point}
                onChange={(e) => setEditStepForm({ ...editStepForm, problem_point: e.target.value })} rows={2} />
            </div>
            {/* Existing materials preview */}
            {editingStep?.materials && editingStep.materials.length > 0 && (
              <div className="space-y-1.5">
                <Label>当前关联素材</Label>
                <div className="flex gap-1.5 flex-wrap">
                  {editingStep.materials.map((mat) => (
                    <div key={mat.id} className="w-14 h-14 rounded-md overflow-hidden border border-border cursor-pointer"
                      onClick={() => mat.material_type === 'image' && open(mat.file_url)}>
                      {mat.material_type === 'image' ? (
                        <img src={mat.file_url} alt={mat.file_name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-muted"><Video className="h-4 w-4 text-muted-foreground" /></div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <MaterialPicker
              taskId={taskId}
              selectedIds={editStepMaterialIds}
              onSelectionChange={(ids, mats) => { setEditStepMaterialIds(ids); setEditStepMaterials(mats); }}
            />
            <Button onClick={handleSaveEditStep} className="w-full" disabled={!editStepForm.operation}>保存修改</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
