'use client';

import { useState, useEffect } from 'react';
import { Pencil } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { TaskDetail, CategoryWithProducts } from '../types';
import { statusConfig } from '../types';

export function BasicInfoTab({ task, onRefresh }: { task: TaskDetail; onRefresh: () => void }) {
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
