'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Camera, Video, ChevronLeft, ChevronRight, Check, X, Minus, Upload, Plus, Save, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface CheckRecord {
  id: string;
  standard_item_id: string | null;
  sensory_dimension: string | null;
  test_phase: string | null;
  check_dimension: string | null;
  check_item: string;
  check_requirement: string | null;
  evaluation_result: string;
  problem_description: string | null;
  measurement_value: string | null;
  materials?: Material[];
}

interface Material {
  id: string;
  material_type: string;
  file_name: string;
  file_url: string;
  file_size: number;
}

interface StandardItem {
  id: string;
  sensory_dimension: string | null;
  test_phase: string | null;
  check_dimension: string | null;
  check_item: string;
  check_requirement: string | null;
  check_tool: string | null;
  standard_a: string | null;
  standard_b: string | null;
  standard_c: string | null;
  problem_level: string | null;
}

const sensoryColors: Record<string, string> = {
  '视觉': 'bg-blue-100 text-blue-700',
  '听觉': 'bg-purple-100 text-purple-700',
  '触觉': 'bg-amber-100 text-amber-700',
  '嗅觉': 'bg-emerald-100 text-emerald-700',
  '味觉': 'bg-rose-100 text-rose-700',
};

export default function WalkthroughPage() {
  const params = useParams();
  const router = useRouter();
  const taskId = params.id as string;
  const [records, setRecords] = useState<CheckRecord[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [addStepOpen, setAddStepOpen] = useState(false);
  const [newStep, setNewStep] = useState({ check_item: '', sensory_dimension: '', check_requirement: '' });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  // Debounce save
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingChangesRef = useRef<Map<string, Partial<CheckRecord>>>(new Map());

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/records?task_id=${taskId}`);
    const data = await res.json();
    if (data.code === 0) setRecords(data.data || []);
    setLoading(false);
  }, [taskId]);

  // Load standards and create records if none exist
  const loadFromStandards = useCallback(async () => {
    const taskRes = await fetch(`/api/tasks/${taskId}`);
    const taskData = await taskRes.json();
    if (taskData.code !== 0) return;

    const task = taskData.data;
    const selectedStandards = task.selected_standards || [];

    if (selectedStandards.length === 0) return;

    // Fetch standard items for selected standards
    const allItems: StandardItem[] = [];
    for (const stdId of selectedStandards) {
      const res = await fetch(`/api/standard-items?standard_id=${stdId}`);
      const data = await res.json();
      if (data.code === 0) allItems.push(...(data.data || []));
    }

    if (allItems.length === 0) return;

    // Create check records from standard items
    const newRecords = allItems.map((item, idx) => ({
      task_id: taskId,
      standard_item_id: item.id,
      sensory_dimension: item.sensory_dimension,
      test_phase: item.test_phase,
      check_dimension: item.check_dimension,
      check_item: item.check_item,
      check_requirement: item.check_requirement,
      evaluation_result: '待定',
      sort_order: idx,
    }));

    const res = await fetch('/api/records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newRecords),
    });
    const data = await res.json();
    if (data.code === 0) {
      fetchRecords();
      toast.success(`已从标准加载 ${newRecords.length} 个检查项`);
    }
  }, [taskId, fetchRecords]);

  useEffect(() => {
    fetchRecords().then(() => {
      // If no records, try loading from standards
    });
  }, [fetchRecords]);

  useEffect(() => {
    if (records.length === 0 && !loading) {
      loadFromStandards();
    }
  }, [records.length, loading, loadFromStandards]);

  // Auto-save with debounce on beforeunload
  const savePendingChanges = useCallback(async () => {
    if (pendingChangesRef.current.size === 0) return;
    setSaving(true);
    const changes = new Map(pendingChangesRef.current);
    pendingChangesRef.current.clear();

    for (const [recordId, updates] of changes) {
      await fetch(`/api/records/${recordId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
    }
    setSaving(false);
  }, []);

  // Save on leave
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (pendingChangesRef.current.size > 0) {
        e.preventDefault();
        // Try to save
        savePendingChanges();
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [savePendingChanges]);

  const debouncedSave = useCallback((recordId: string, updates: Partial<CheckRecord>) => {
    // Update local state
    setRecords(prev => prev.map(r => r.id === recordId ? { ...r, ...updates } : r));

    // Queue for save
    const existing = pendingChangesRef.current.get(recordId) || {};
    pendingChangesRef.current.set(recordId, { ...existing, ...updates });

    // Debounce
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => savePendingChanges(), 300);
  }, [savePendingChanges]);

  const handleFileUpload = async (files: FileList | null, type: 'image' | 'video') => {
    if (!files || files.length === 0) return;
    const currentRecord = records[currentIndex];
    if (!currentRecord) return;

    for (const file of Array.from(files)) {
      // Validate
      if (file.size > 100 * 1024 * 1024) {
        toast.error(`${file.name} 超过100MB限制`);
        continue;
      }
      if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
        toast.error(`${file.name} 格式不支持`);
        continue;
      }

      const formData = new FormData();
      formData.append('file', file);
      formData.append('record_id', currentRecord.id);
      formData.append('task_id', taskId);

      try {
        const res = await fetch('/api/materials/upload', { method: 'POST', body: formData });
        const data = await res.json();
        if (data.code === 0) {
          // Update local record with new material
          setRecords(prev => prev.map(r =>
            r.id === currentRecord.id
              ? { ...r, materials: [...(r.materials || []), data.data] }
              : r
          ));
          toast.success('上传成功');
        } else {
          toast.error(data.message || '上传失败');
        }
      } catch {
        toast.error('上传失败，请重试');
      }
    }
  };

  const handleAddStep = async () => {
    const res = await fetch('/api/records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task_id: taskId,
        ...newStep,
        evaluation_result: '待定',
        sort_order: records.length,
      }),
    });
    const data = await res.json();
    if (data.code === 0) {
      setAddStepOpen(false);
      setNewStep({ check_item: '', sensory_dimension: '', check_requirement: '' });
      fetchRecords();
      toast.success('步骤已添加');
    }
  };

  const goToRecord = (index: number) => {
    if (index >= 0 && index < records.length) setCurrentIndex(index);
  };

  if (loading) {
    return <div className="p-6 animate-pulse space-y-4"><div className="h-8 bg-muted rounded w-64" /><div className="h-96 bg-muted rounded" /></div>;
  }

  const currentRecord = records[currentIndex];

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] lg:h-screen">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => { savePendingChanges(); router.back(); }}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium truncate">现场走查</span>
          <span className="text-xs text-muted-foreground">{currentIndex + 1}/{records.length}</span>
        </div>
        <div className="flex items-center gap-2">
          {saving && <span className="text-xs text-muted-foreground">保存中...</span>}
          <Button variant="outline" size="sm" onClick={() => setAddStepOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> 添加步骤
          </Button>
        </div>
      </div>

      {records.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <p className="text-muted-foreground">暂无检查项</p>
          <p className="text-xs text-muted-foreground mt-1">点击&quot;添加步骤&quot;或从标准加载检查项</p>
          <Button className="mt-4" onClick={() => setAddStepOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> 添加步骤
          </Button>
        </div>
      ) : currentRecord ? (
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
          {/* Left: Check items list (desktop) */}
          <div className="hidden lg:block w-64 border-r border-border overflow-y-auto bg-card/50">
            <div className="p-2 space-y-0.5">
              {records.map((record, idx) => (
                <button
                  key={record.id}
                  onClick={() => goToRecord(idx)}
                  className={cn(
                    'w-full text-left px-3 py-2 rounded-lg text-xs transition-colors',
                    idx === currentIndex ? 'bg-primary/10 text-primary' : 'hover:bg-muted text-muted-foreground'
                  )}
                >
                  <div className="flex items-center gap-2">
                    {record.evaluation_result === '合格' && <Check className="h-3 w-3 text-emerald-500 shrink-0" />}
                    {record.evaluation_result === '不合格' && <X className="h-3 w-3 text-destructive shrink-0" />}
                    {record.evaluation_result === '待定' && <Minus className="h-3 w-3 text-amber-500 shrink-0" />}
                    <span className="truncate">{record.check_item}</span>
                  </div>
                  {record.sensory_dimension && (
                    <span className={cn('text-[10px] ml-5 px-1.5 py-0.5 rounded', sensoryColors[record.sensory_dimension] || 'bg-muted')}>
                      {record.sensory_dimension}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Center: Detail */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Current item info */}
            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-base font-semibold">{currentRecord.check_item}</h2>
                  {currentRecord.sensory_dimension && (
                    <Badge className={cn('text-[10px]', sensoryColors[currentRecord.sensory_dimension] || '')}>
                      {currentRecord.sensory_dimension}
                    </Badge>
                  )}
                  {currentRecord.test_phase && (
                    <Badge variant="secondary" className="text-[10px]">{currentRecord.test_phase}</Badge>
                  )}
                </div>
                {currentRecord.check_requirement && (
                  <p className="text-sm text-muted-foreground bg-muted/30 p-2.5 rounded-lg">
                    {currentRecord.check_requirement}
                  </p>
                )}
                {currentRecord.check_dimension && (
                  <p className="text-xs text-muted-foreground">检查维度: {currentRecord.check_dimension}</p>
                )}
              </CardContent>
            </Card>

            {/* Evaluation */}
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground">评价结果</Label>
              <div className="grid grid-cols-3 gap-2">
                {['合格', '不合格', '待定'].map((result) => (
                  <Button
                    key={result}
                    variant={currentRecord.evaluation_result === result ? 'default' : 'outline'}
                    size="sm"
                    className={cn(
                      currentRecord.evaluation_result === result && result === '合格' && 'bg-emerald-600 hover:bg-emerald-700',
                      currentRecord.evaluation_result === result && result === '不合格' && 'bg-destructive hover:bg-destructive/90',
                      currentRecord.evaluation_result === result && result === '待定' && 'bg-amber-500 hover:bg-amber-600',
                    )}
                    onClick={() => debouncedSave(currentRecord.id, { evaluation_result: result })}
                  >
                    {result === '合格' && <Check className="h-3.5 w-3.5 mr-1" />}
                    {result === '不合格' && <X className="h-3.5 w-3.5 mr-1" />}
                    {result === '待定' && <Minus className="h-3.5 w-3.5 mr-1" />}
                    {result}
                  </Button>
                ))}
              </div>
            </div>

            {/* Problem description */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">问题描述</Label>
              <Textarea
                placeholder="记录发现的问题..."
                value={currentRecord.problem_description || ''}
                onChange={(e) => debouncedSave(currentRecord.id, { problem_description: e.target.value })}
                rows={3}
              />
            </div>

            {/* Measurement value */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">测量值</Label>
              <Input
                placeholder="如：0.5mm"
                value={currentRecord.measurement_value || ''}
                onChange={(e) => debouncedSave(currentRecord.id, { measurement_value: e.target.value })}
              />
            </div>

            {/* Materials Preview */}
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground">素材 ({currentRecord.materials?.length || 0})</Label>
              {currentRecord.materials && currentRecord.materials.length > 0 && (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {currentRecord.materials.map((mat) => (
                    <div
                      key={mat.id}
                      className="aspect-square rounded-lg overflow-hidden bg-muted relative group cursor-pointer"
                      onClick={() => mat.material_type === 'image' && setPreviewImage(mat.file_url)}
                    >
                      {mat.material_type === 'image' ? (
                        <img src={mat.file_url} alt={mat.file_name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center">
                          <Video className="h-6 w-6 text-muted-foreground" />
                          <span className="text-[10px] text-muted-foreground mt-1">视频</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right: Upload area (desktop) */}
          <div className="hidden lg:block w-72 border-l border-border p-4 overflow-y-auto bg-card/50">
            <div className="space-y-3">
              <h3 className="text-sm font-medium">素材上传</h3>
              <p className="text-xs text-muted-foreground">支持图片/视频，单文件最大100MB</p>
              <div className="space-y-2">
                <Button
                  variant="outline"
                  className="w-full h-20 flex-col gap-1"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Camera className="h-5 w-5" />
                  <span className="text-xs">上传图片</span>
                </Button>
                <Button
                  variant="outline"
                  className="w-full h-20 flex-col gap-1"
                  onClick={() => videoInputRef.current?.click()}
                >
                  <Video className="h-5 w-5" />
                  <span className="text-xs">上传视频</span>
                </Button>
              </div>
              {/* Material thumbnails */}
              {currentRecord.materials && currentRecord.materials.length > 0 && (
                <div className="space-y-2 mt-4">
                  <p className="text-xs font-medium">已上传素材</p>
                  {currentRecord.materials.map((mat) => (
                    <div key={mat.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/30">
                      {mat.material_type === 'image' ? (
                        <ImageIcon className="h-4 w-4 text-blue-500 shrink-0" />
                      ) : (
                        <Video className="h-4 w-4 text-purple-500 shrink-0" />
                      )}
                      <span className="text-xs truncate flex-1">{mat.file_name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* Bottom Navigation */}
      {records.length > 0 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-card shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => goToRecord(currentIndex - 1)}
            disabled={currentIndex === 0}
          >
            <ChevronLeft className="h-4 w-4 mr-1" /> 上一项
          </Button>

          {/* Mobile: Upload buttons */}
          <div className="flex gap-2 lg:hidden">
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
              <Camera className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => videoInputRef.current?.click()}>
              <Video className="h-4 w-4" />
            </Button>
          </div>

          {/* Progress dots (mobile) */}
          <div className="hidden sm:flex gap-1 overflow-x-auto max-w-[200px]">
            {records.map((_, idx) => (
              <button
                key={idx}
                onClick={() => goToRecord(idx)}
                className={cn(
                  'w-1.5 h-1.5 rounded-full shrink-0 transition-colors',
                  idx === currentIndex ? 'bg-primary' : 'bg-muted-foreground/30'
                )}
              />
            ))}
          </div>

          <Button
            variant={currentIndex === records.length - 1 ? 'default' : 'outline'}
            size="sm"
            onClick={() => {
              if (currentIndex === records.length - 1) {
                savePendingChanges();
                router.push(`/tasks/${taskId}`);
              } else {
                goToRecord(currentIndex + 1);
              }
            }}
          >
            {currentIndex === records.length - 1 ? (
              <><Save className="h-4 w-4 mr-1" /> 完成</>
            ) : (
              <>下一项 <ChevronRight className="h-4 w-4 ml-1" /></>
            )}
          </Button>
        </div>
      )}

      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handleFileUpload(e.target.files, 'image')}
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => handleFileUpload(e.target.files, 'video')}
      />

      {/* Image Preview Dialog */}
      <Dialog open={!!previewImage} onOpenChange={() => setPreviewImage(null)}>
        <DialogContent className="max-w-lg p-0 overflow-hidden">
          <DialogHeader className="sr-only">
            <DialogTitle>图片预览</DialogTitle>
          </DialogHeader>
          {previewImage && (
            <img src={previewImage} alt="预览" className="w-full h-auto" />
          )}
        </DialogContent>
      </Dialog>

      {/* Add Step Dialog */}
      <Dialog open={addStepOpen} onOpenChange={setAddStepOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>添加检查步骤</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="space-y-1.5">
              <Label>检查条目 *</Label>
              <Input
                placeholder="输入检查内容"
                value={newStep.check_item}
                onChange={(e) => setNewStep({ ...newStep, check_item: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>感官维度</Label>
              <Select value={newStep.sensory_dimension} onValueChange={(v) => setNewStep({ ...newStep, sensory_dimension: v })}>
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
              <Label>检查要求</Label>
              <Textarea
                placeholder="合格标准"
                value={newStep.check_requirement}
                onChange={(e) => setNewStep({ ...newStep, check_requirement: e.target.value })}
                rows={2}
              />
            </div>
            <Button onClick={handleAddStep} className="w-full" disabled={!newStep.check_item}>
              添加步骤
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
