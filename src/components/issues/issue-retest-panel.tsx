'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, Loader2, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { MaterialPicker, type Material } from '@/components/material-picker';
import { PresignedImage, PresignedVideo } from '@/components/presigned-media';
import { evaluationStatusLabel, type EvaluationStatus } from '@/lib/evaluation-status';
import { cn } from '@/lib/utils';

type RetestRecord = {
  id: string;
  issue_id: string;
  description: string | null;
  result: EvaluationStatus;
  created_at: string;
  created_by: string | null;
  created_by_name: string | null;
  materials?: Material[];
};

type IssueRetestPanelProps = {
  issueId: string;
  taskId: string;
  defaultCollapsed?: boolean;
  onIssueUpdated?: (issue: Record<string, unknown>) => void;
};

type MutationHandle = {
  controller: AbortController;
  generation: number;
  targetIdentity: string;
  issueId: string;
};

const OPTIONS: Array<{ value: EvaluationStatus; label: string }> = [
  { value: 'qualified', label: '合格' },
  { value: 'unqualified', label: '不合格' },
  { value: 'pending', label: '待定' },
];

function ResultControl({ value, onChange, disabled = false }: {
  value: EvaluationStatus;
  onChange: (value: EvaluationStatus) => void;
  disabled?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label="复测结果" className="grid grid-cols-3 gap-1">
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          value={option.value}
          aria-checked={value === option.value}
          disabled={disabled}
          onClick={() => onChange(option.value)}
          className={cn(
            'min-h-9 rounded-md border px-2 text-xs font-medium transition-colors disabled:opacity-50',
            value === option.value
              ? option.value === 'qualified'
                ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30'
                : option.value === 'unqualified'
                  ? 'border-red-500 bg-red-50 text-red-700 dark:bg-red-950/30'
                  : 'border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-950/30'
              : 'border-border bg-background hover:bg-muted/50',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function IssueRetestPanel({ issueId, taskId, defaultCollapsed = false, onIssueUpdated }: IssueRetestPanelProps) {
  const [records, setRecords] = useState<RetestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [description, setDescription] = useState('');
  const [result, setResult] = useState<EvaluationStatus>('pending');
  const [materialIds, setMaterialIds] = useState<string[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [saving, setSaving] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDescription, setEditDescription] = useState('');
  const [editResult, setEditResult] = useState<EvaluationStatus>('pending');
  const [editMaterialIds, setEditMaterialIds] = useState<string[]>([]);
  const [editMaterials, setEditMaterials] = useState<Material[]>([]);
  const [mutatingId, setMutatingId] = useState<string | null>(null);
  const requestVersion = useRef(0);
  const aiRequestVersion = useRef(0);
  const aiAbortController = useRef<AbortController | null>(null);
  const aiTargetIdentity = useRef<string | null>(null);
  const mutationAbortController = useRef<AbortController | null>(null);
  const mutationGeneration = useRef(0);
  const mutationTargetIdentity = useRef<string | null>(null);
  const currentIssueIdentity = useRef(issueId);
  currentIssueIdentity.current = issueId;

  const abortAiRequest = useCallback((updateState = true) => {
    aiAbortController.current?.abort();
    aiAbortController.current = null;
    aiTargetIdentity.current = null;
    aiRequestVersion.current += 1;
    if (updateState) setEvaluating(false);
  }, []);

  const abortMutation = useCallback((updateState = true) => {
    mutationAbortController.current?.abort();
    mutationAbortController.current = null;
    mutationTargetIdentity.current = null;
    mutationGeneration.current += 1;
    if (updateState) {
      setSaving(false);
      setMutatingId(null);
    }
  }, []);

  const beginMutation = useCallback((target: string): MutationHandle => {
    abortMutation();
    const controller = new AbortController();
    const generation = ++mutationGeneration.current;
    const targetIdentity = `${issueId}:${target}`;
    mutationAbortController.current = controller;
    mutationTargetIdentity.current = targetIdentity;
    return { controller, generation, targetIdentity, issueId };
  }, [abortMutation, issueId]);

  const isCurrentMutation = useCallback((mutation: MutationHandle) => (
    !mutation.controller.signal.aborted
    && currentIssueIdentity.current === mutation.issueId
    && mutationGeneration.current === mutation.generation
    && mutationTargetIdentity.current === mutation.targetIdentity
    && mutationAbortController.current === mutation.controller
  ), []);

  const load = useCallback(async (signal?: AbortSignal) => {
    const version = ++requestVersion.current;
    setLoading(true);
    try {
      const response = await fetch(`/api/issue-re-evaluations?issue_id=${encodeURIComponent(issueId)}`, { signal });
      const payload = await response.json();
      if (version !== requestVersion.current || signal?.aborted) return;
      if (!response.ok || payload.code !== 0) throw new Error(payload.message || '加载复测记录失败');
      setRecords(payload.data || []);
    } catch (error) {
      if (signal?.aborted) return;
      toast.error(error instanceof Error ? error.message : '加载复测记录失败');
    } finally {
      if (version === requestVersion.current && !signal?.aborted) setLoading(false);
    }
  }, [issueId]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    setCollapsed(defaultCollapsed);
    abortAiRequest();
    abortMutation();
    setDescription('');
    setResult('pending');
    setMaterialIds([]);
    setMaterials([]);
    setEditingId(null);
    return () => {
      controller.abort();
      requestVersion.current += 1;
      abortAiRequest(false);
      abortMutation(false);
    };
  }, [abortAiRequest, abortMutation, defaultCollapsed, load]);

  const fillAiSummary = async (target: 'new' | 'edit', recordId?: string) => {
    const currentDescription = target === 'new' ? description : editDescription;
    const currentMaterialIds = target === 'new' ? materialIds : editMaterialIds;
    if (!currentDescription.trim() && currentMaterialIds.length === 0) {
      toast.error('请先填写复测描述或选择素材');
      return;
    }
    abortAiRequest(false);
    const controller = new AbortController();
    const targetIdentity = target === 'edit' ? `edit:${recordId || ''}` : `new:${issueId}`;
    const request = ++aiRequestVersion.current;
    aiAbortController.current = controller;
    aiTargetIdentity.current = targetIdentity;
    setEvaluating(true);
    try {
      const endpointId = recordId || issueId;
      const response = await fetch(`/api/issue-re-evaluations/${endpointId}/ai-evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          mode: recordId ? 'record' : 'draft',
          description: currentDescription,
          material_ids: currentMaterialIds,
        }),
      });
      const payload = await response.json();
      if (request !== aiRequestVersion.current || controller.signal.aborted || aiTargetIdentity.current !== targetIdentity) return;
      if (!response.ok || payload.code !== 0) throw new Error(payload.message || 'AI评价失败');
      const summary = String(payload.data?.summary || '').trim();
      if (!summary) throw new Error('AI未返回评价文字');
      if (target === 'new') setDescription(summary);
      else if (editingId === recordId) setEditDescription(summary);
    } catch (error) {
      if (controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) return;
      toast.error(error instanceof Error ? error.message : 'AI评价失败');
    } finally {
      if (request === aiRequestVersion.current && aiTargetIdentity.current === targetIdentity) {
        aiAbortController.current = null;
        aiTargetIdentity.current = null;
        setEvaluating(false);
      }
    }
  };

  const saveNew = async () => {
    if (!description.trim()) {
      toast.error('请填写复测评价描述');
      return;
    }
    const mutation = beginMutation('create');
    setSaving(true);
    try {
      const response = await fetch('/api/issue-re-evaluations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: mutation.controller.signal,
        body: JSON.stringify({ issue_id: issueId, description, result, material_ids: materialIds }),
      });
      const payload = await response.json();
      if (!isCurrentMutation(mutation)) return;
      if (!response.ok || payload.code !== 0) throw new Error(payload.message || '保存复测失败');
      if (!isCurrentMutation(mutation)) return;
      onIssueUpdated?.(payload.data.issue);
      if (!isCurrentMutation(mutation)) return;
      setDescription('');
      setResult('pending');
      setMaterialIds([]);
      setMaterials([]);
      if (!isCurrentMutation(mutation)) return;
      await load(mutation.controller.signal);
      if (!isCurrentMutation(mutation)) return;
      toast.success('复测已保存');
    } catch (error) {
      if (mutation.controller.signal.aborted || !isCurrentMutation(mutation) || (error instanceof DOMException && error.name === 'AbortError')) return;
      toast.error(error instanceof Error ? error.message : '保存复测失败');
    } finally {
      if (isCurrentMutation(mutation)) {
        mutationAbortController.current = null;
        mutationTargetIdentity.current = null;
        setSaving(false);
      }
    }
  };

  const startEdit = (record: RetestRecord) => {
    abortAiRequest();
    setEditingId(record.id);
    setEditDescription(record.description || '');
    setEditResult(record.result || 'pending');
    setEditMaterials(record.materials || []);
    setEditMaterialIds((record.materials || []).map((material) => material.id));
  };

  const cancelEdit = () => {
    abortAiRequest();
    setEditingId(null);
  };

  const saveEdit = async (recordId: string) => {
    if (!editDescription.trim()) {
      toast.error('请填写复测评价描述');
      return;
    }
    const mutation = beginMutation(`update:${recordId}`);
    setMutatingId(recordId);
    try {
      const response = await fetch(`/api/issue-re-evaluations/${recordId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        signal: mutation.controller.signal,
        body: JSON.stringify({ description: editDescription, result: editResult, material_ids: editMaterialIds }),
      });
      const payload = await response.json();
      if (!isCurrentMutation(mutation)) return;
      if (!response.ok || payload.code !== 0) throw new Error(payload.message || '保存修改失败');
      if (!isCurrentMutation(mutation)) return;
      onIssueUpdated?.(payload.data.issue);
      if (!isCurrentMutation(mutation)) return;
      setEditingId(null);
      if (!isCurrentMutation(mutation)) return;
      await load(mutation.controller.signal);
      if (!isCurrentMutation(mutation)) return;
      toast.success('复测已更新');
    } catch (error) {
      if (mutation.controller.signal.aborted || !isCurrentMutation(mutation) || (error instanceof DOMException && error.name === 'AbortError')) return;
      toast.error(error instanceof Error ? error.message : '保存修改失败');
    } finally {
      if (isCurrentMutation(mutation)) {
        mutationAbortController.current = null;
        mutationTargetIdentity.current = null;
        setMutatingId(null);
      }
    }
  };

  const remove = async (recordId: string) => {
    if (!window.confirm('确认删除这条复测记录？素材原文件会保留。')) return;
    const mutation = beginMutation(`delete:${recordId}`);
    setMutatingId(recordId);
    try {
      const response = await fetch(`/api/issue-re-evaluations/${recordId}`, {
        method: 'DELETE',
        signal: mutation.controller.signal,
      });
      const payload = await response.json();
      if (!isCurrentMutation(mutation)) return;
      if (!response.ok || payload.code !== 0) throw new Error(payload.message || '删除复测失败');
      if (!isCurrentMutation(mutation)) return;
      onIssueUpdated?.(payload.data.issue);
      if (!isCurrentMutation(mutation)) return;
      if (editingId === recordId) setEditingId(null);
      if (!isCurrentMutation(mutation)) return;
      await load(mutation.controller.signal);
      if (!isCurrentMutation(mutation)) return;
      toast.success('复测记录已删除');
    } catch (error) {
      if (mutation.controller.signal.aborted || !isCurrentMutation(mutation) || (error instanceof DOMException && error.name === 'AbortError')) return;
      toast.error(error instanceof Error ? error.message : '删除复测失败');
    } finally {
      if (isCurrentMutation(mutation)) {
        mutationAbortController.current = null;
        mutationTargetIdentity.current = null;
        setMutatingId(null);
      }
    }
  };

  const renderRecord = (record: RetestRecord, latest: boolean) => {
    const editing = editingId === record.id;
    const busy = mutatingId === record.id;
    return (
      <div key={record.id} className={cn('rounded-lg border p-3 space-y-2', latest && 'border-primary/40 bg-primary/5')}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium">{latest ? '最新复测' : '历史复测'}</span>
            <Badge variant="outline" className="text-xs">{evaluationStatusLabel(record.result)}</Badge>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">
              {new Date(record.created_at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}
            </span>
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label="编辑复测" disabled={busy} onClick={() => startEdit(record)}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" aria-label="删除复测" disabled={busy} onClick={() => void remove(record.id)}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">录入人：{record.created_by_name || record.created_by || '未知'}</p>
        {editing ? (
          <div className="space-y-3">
            <ResultControl value={editResult} onChange={setEditResult} disabled={busy} />
            <div className="relative">
              <Textarea value={editDescription} onChange={(event) => setEditDescription(event.target.value)} rows={3} className="pr-10" />
              <Button type="button" variant="ghost" size="icon" aria-label="AI生成评价" className="absolute bottom-1.5 right-1.5 h-7 w-7" disabled={evaluating || busy} onClick={() => void fillAiSummary('edit', record.id)}>
                {evaluating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              </Button>
            </div>
            <MaterialPicker taskId={taskId} selectedIds={editMaterialIds} initialMaterials={editMaterials} onSelectionChange={(ids, selected) => { setEditMaterialIds(ids); setEditMaterials(selected); }} selectedPreviewSize="sm" />
            <div className="flex gap-2">
              <Button type="button" size="sm" disabled={busy} onClick={() => void saveEdit(record.id)}>保存</Button>
              <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={cancelEdit}>取消</Button>
            </div>
          </div>
        ) : (
          <>
            <p className="whitespace-pre-wrap break-words text-sm">{record.description || '暂无评价描述'}</p>
            {record.materials && record.materials.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {record.materials.map((material) => material.material_type === 'video' ? (
                  <PresignedVideo key={material.id} filePath={material.file_path || material.file_url} className="h-16 w-16 rounded border object-cover" preload="metadata" />
                ) : (
                  <PresignedImage key={material.id} filePath={material.file_path || material.file_url} alt={material.file_name} className="h-16 w-16 rounded border object-cover" />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <section className="border-t pt-3 space-y-3" aria-label="整改复测">
      <button
        type="button"
        className="flex w-full items-center justify-between text-left"
        aria-expanded={!collapsed}
        aria-label={collapsed ? '展开整改复测' : '收起整改复测'}
        onClick={() => setCollapsed((current) => !current)}
      >
        <span className="text-sm font-medium">整改复测</span>
        <span className="flex items-center gap-1.5"><Badge variant="secondary" className="text-xs">{records.length} 次</Badge><ChevronDown className={cn('h-4 w-4 transition-transform', !collapsed && 'rotate-180')} /></span>
      </button>

      {!collapsed && (
        <>
          <div className="rounded-lg border bg-primary/5 p-3 space-y-3">
        <div className="flex items-center gap-2"><Plus className="h-4 w-4 text-primary" /><span className="text-sm font-medium">新增复测</span></div>
        <ResultControl value={result} onChange={setResult} disabled={saving} />
        <div className="space-y-1.5">
          <Label className="text-xs">评价描述</Label>
          <div className="relative">
            <Textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} placeholder="输入复测效果描述..." className="pr-10" />
            <Button type="button" variant="ghost" size="icon" aria-label="AI生成评价" className="absolute bottom-1.5 right-1.5 h-7 w-7" disabled={evaluating || saving} onClick={() => void fillAiSummary('new')}>
              {evaluating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>
        <MaterialPicker taskId={taskId} selectedIds={materialIds} initialMaterials={materials} onSelectionChange={(ids, selected) => { setMaterialIds(ids); setMaterials(selected); }} selectedPreviewSize="sm" />
        <Button type="button" size="sm" disabled={saving || !description.trim()} onClick={() => void saveNew()}>
          {saving && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}保存复测
        </Button>
      </div>

          {loading ? <div className="flex justify-center py-3"><Loader2 className="h-4 w-4 animate-spin" /></div> : records.length > 0 ? (
        <div className="space-y-3">
          {renderRecord(records[0], true)}
          {records.length > 1 && (
            <details className="group rounded-lg border p-2">
              <summary className="flex cursor-pointer list-none items-center justify-between px-1 text-xs font-medium text-muted-foreground">
                查看全部 {records.length - 1} 条历史复测
                <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
              </summary>
              <div className="mt-2 space-y-3">{records.slice(1).map((record) => renderRecord(record, false))}</div>
            </details>
          )}
        </div>
          ) : <p className="text-xs text-muted-foreground">暂无复测记录</p>}
        </>
      )}
    </section>
  );
}
